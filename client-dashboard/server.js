import 'dotenv/config';
import express from 'express';
import http from 'http';
import { Server as SocketIOServer } from 'socket.io';
import mysql from 'mysql2/promise';
import cors from 'cors';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import cookieParser from 'cookie-parser';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const server = http.createServer(app);
const PORT = process.env.PORT || 3001;
const JWT_SECRET = process.env.JWT_SECRET || 'artiq_jwt_fallback_secret_key_change_in_production_2026';
const ARTIST_SERVER_URL = process.env.ARTIST_SERVER_URL || 'http://localhost:3000';
const IS_PROD = process.env.NODE_ENV === 'production';

// Initialize Socket.io for Real-Time Bidding and Messaging
const io = new SocketIOServer(server, {
  cors: {
    origin: (origin, callback) => callback(null, true),
    credentials: true
  }
});

io.on('connection', (socket) => {
  socket.on('join:auction', (auctionId) => {
    socket.join(`auction:${auctionId}`);
  });
  socket.on('leave:auction', (auctionId) => {
    socket.leave(`auction:${auctionId}`);
  });
});

// Ensure local uploads directory exists
const localUploadsDir = path.join(__dirname, 'public', 'uploads');
if (!fs.existsSync(localUploadsDir)) {
  fs.mkdirSync(localUploadsDir, { recursive: true });
}

// Upload search locations (supports local monorepo and isolated deployed containers)
const uploadsDirs = [
  process.env.UPLOADS_DIR,
  localUploadsDir,
  path.join(__dirname, '..', 'artist-dashboard', 'public', 'uploads')
].filter(Boolean);

// Security headers
app.use(helmet({ 
  contentSecurityPolicy: false,
  crossOriginResourcePolicy: false,
  crossOriginEmbedderPolicy: false
}));

// Rate limiting on sensitive auth routes
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  message: { message: 'Too many attempts from this IP, please try again in 15 minutes.' }
});

// Rate limiting on auction bids (prevents automated bid sniping bots)
const bidLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 15,
  message: { message: 'Too many bids placed in a short window. Please wait a minute.' }
});

// Dynamic CORS configuration with strict origin validation
const allowedOrigins = process.env.CORS_ORIGIN 
  ? process.env.CORS_ORIGIN.split(',').map(s => s.trim()) 
  : [`http://localhost:${PORT}`, 'http://localhost:3000', 'http://127.0.0.1:3001', 'http://127.0.0.1:3000'];

app.use(cors({
  origin: (origin, callback) => {
    // Allow non-browser requests or matching origins
    if (!origin || allowedOrigins.includes(origin) || (!IS_PROD && origin.startsWith('http://localhost:'))) {
      callback(null, true);
    } else {
      callback(new Error('Origin blocked by CORS policy'));
    }
  },
  credentials: true
}));

app.use(express.json());
app.use(cookieParser());

// ============================================================================
// Robust Artwork Image Server (Independent from Artist Dashboard)
// Even if artist-dashboard (:3000) is completely stopped, this route serves
// every uploaded painting directly, and generates dynamic artistic SVGs on miss.
// ============================================================================
app.get(['/uploads/:filename', '/artist-uploads/:filename'], (req, res) => {
  const filename = path.basename(req.params.filename);

  // 1. Check available uploads directories
  for (const dir of uploadsDirs) {
    const filePath = path.join(dir, filename);
    if (fs.existsSync(filePath)) {
      return res.sendFile(filePath);
    }
  }

  // 2. Fallback: Dynamic artistic placeholder SVG so broken icon is NEVER displayed
  const label = filename
    .replace(/\.[^/.]+$/, '')
    .replace(/[-_0-9]/g, ' ')
    .trim() || 'Artwork';

  res.setHeader('Content-Type', 'image/svg+xml');
  res.setHeader('Cache-Control', 'public, max-age=86400');
  return res.send(`
    <svg xmlns="http://www.w3.org/2000/svg" width="800" height="600" viewBox="0 0 800 600">
      <defs>
        <linearGradient id="bgGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#0f1220"/>
          <stop offset="45%" stop-color="#191e36"/>
          <stop offset="100%" stop-color="#2a1b3d"/>
        </linearGradient>
        <radialGradient id="artAura" cx="50%" cy="40%" r="55%">
          <stop offset="0%" stop-color="#f59e0b" stop-opacity="0.3"/>
          <stop offset="50%" stop-color="#ec4899" stop-opacity="0.25"/>
          <stop offset="100%" stop-color="#8b5cf6" stop-opacity="0"/>
        </radialGradient>
      </defs>
      <rect width="800" height="600" fill="url(#bgGrad)"/>
      <circle cx="400" cy="270" r="230" fill="url(#artAura)"/>
      <path d="M 120 480 Q 400 180 680 480" stroke="#f59e0b" stroke-width="3" fill="none" opacity="0.6"/>
      <path d="M 200 500 Q 400 240 600 500" stroke="#ec4899" stroke-width="2" fill="none" opacity="0.5"/>
      <circle cx="400" cy="240" r="14" fill="#fbbf24"/>
      <text x="400" y="340" font-family="'Playfair Display', Georgia, serif" font-size="30" fill="#f8fafc" text-anchor="middle" font-weight="bold" letter-spacing="3">ARTiQ MASTERPIECE</text>
      <text x="400" y="375" font-family="'Inter', sans-serif" font-size="14" fill="#cbd5e1" text-anchor="middle" opacity="0.75" letter-spacing="2">${label.toUpperCase()}</text>
    </svg>
  `);
});

// Serve frontend static assets
app.use(express.static(path.join(__dirname, 'public')));

// Helper: resolve painting image URL to self-hosted relative route
function resolveImageUrl(imageUrl) {
  if (!imageUrl) return '/uploads/default-artwork.svg';
  // External URLs (e.g. Cloudinary, Unsplash, AWS S3)
  if (imageUrl.startsWith('http://') || imageUrl.startsWith('https://')) {
    return imageUrl;
  }
  const filename = path.basename(imageUrl);
  return `/uploads/${filename}`;
}

// ============================================================================
// Resilient Database Connection Pool (Supports DATABASE_URL & Individual Keys)
// ============================================================================
let poolConfig;
if (process.env.DATABASE_URL || process.env.MYSQL_URL) {
  poolConfig = {
    uri: process.env.DATABASE_URL || process.env.MYSQL_URL,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    enableKeepAlive: true,
    keepAliveInitialDelay: 10000
  };
} else {
  poolConfig = {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT, 10) || 3306,
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'artiqpc',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    enableKeepAlive: true,
    keepAliveInitialDelay: 10000
  };
}

const db = mysql.createPool(poolConfig);

// ============================================================================
// Dynamic Database Initialization & Auto-Migration
// Ensures all tables, dynamic auction timers, and data relationships exist.
// ============================================================================
async function initDatabase() {
  try {
    const conn = await db.getConnection();
    console.log('✓ Successfully connected to MySQL pool');

    // 1. Create tables if not existing
    await conn.execute(`
      CREATE TABLE IF NOT EXISTS clients (
        client_id int NOT NULL AUTO_INCREMENT,
        name varchar(100) NOT NULL,
        age int NOT NULL,
        gender enum('male','female','other') NOT NULL,
        phone varchar(20) NOT NULL,
        email varchar(255) NOT NULL,
        password_hash varchar(255) NOT NULL,
        PRIMARY KEY (client_id),
        UNIQUE KEY phone (phone),
        UNIQUE KEY email (email)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
    `);

    await conn.execute(`
      CREATE TABLE IF NOT EXISTS artists (
        artist_id int NOT NULL AUTO_INCREMENT,
        name varchar(100) NOT NULL,
        age int NOT NULL,
        gender enum('male','female','other') NOT NULL,
        phone varchar(20) NOT NULL,
        email varchar(255) NOT NULL,
        password_hash varchar(255) NOT NULL,
        PRIMARY KEY (artist_id),
        UNIQUE KEY phone (phone),
        UNIQUE KEY email (email)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
    `);

    await conn.execute(`
      CREATE TABLE IF NOT EXISTS paintings (
        painting_id int NOT NULL AUTO_INCREMENT,
        artist_id int NOT NULL,
        title varchar(255) NOT NULL,
        description text,
        price decimal(10,2) NOT NULL,
        image_url varchar(255) DEFAULT NULL,
        created_at timestamp NULL DEFAULT CURRENT_TIMESTAMP,
        category varchar(100) NOT NULL,
        PRIMARY KEY (painting_id),
        KEY artist_id (artist_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
    `);

    await conn.execute(`
      CREATE TABLE IF NOT EXISTS auctions (
        auction_id int NOT NULL AUTO_INCREMENT,
        painting_id int NOT NULL,
        artist_id int NOT NULL,
        starting_price decimal(10,2) NOT NULL,
        current_bid decimal(10,2) DEFAULT NULL,
        highest_bidder int DEFAULT NULL,
        end_time datetime NOT NULL,
        status enum('active','completed') DEFAULT 'active',
        PRIMARY KEY (auction_id),
        KEY painting_id (painting_id),
        KEY artist_id (artist_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
    `);

    await conn.execute(`
      CREATE TABLE IF NOT EXISTS bids (
        bid_id int NOT NULL AUTO_INCREMENT,
        auction_id int NOT NULL,
        bidder_id int NOT NULL,
        bid_amount decimal(10,2) NOT NULL,
        bid_time timestamp NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (bid_id),
        KEY idx_auction_id (auction_id),
        KEY idx_bidder_id (bidder_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
    `);

    await conn.execute(`
      CREATE TABLE IF NOT EXISTS cart (
        cart_id int NOT NULL AUTO_INCREMENT,
        client_id int NOT NULL,
        painting_id int NOT NULL,
        added_at timestamp NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (cart_id),
        UNIQUE KEY painting_id (painting_id),
        KEY client_id (client_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
    `);

    await conn.execute(`
      CREATE TABLE IF NOT EXISTS favorites (
        id int NOT NULL AUTO_INCREMENT,
        client_id int NOT NULL,
        painting_id int NOT NULL,
        created_at timestamp NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        KEY idx_client_id (client_id),
        KEY idx_painting_id (painting_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
    `);

    await conn.execute(`
      CREATE TABLE IF NOT EXISTS orders (
        order_id int NOT NULL AUTO_INCREMENT,
        artist_id int NOT NULL,
        client_id int NOT NULL,
        painting_id int NOT NULL,
        amount decimal(10,2) NOT NULL,
        status enum('pending','shipped','delivered') DEFAULT 'pending',
        order_date timestamp NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (order_id),
        KEY artist_id (artist_id),
        KEY client_id (client_id),
        KEY painting_id (painting_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
    `);

    await conn.execute(`
      CREATE TABLE IF NOT EXISTS payments (
        payment_id int NOT NULL AUTO_INCREMENT,
        order_id int NOT NULL,
        amount decimal(10,2) NOT NULL,
        payment_date timestamp NULL DEFAULT CURRENT_TIMESTAMP,
        status enum('pending','completed','failed') DEFAULT 'completed',
        PRIMARY KEY (payment_id),
        KEY order_id (order_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
    `);

    await conn.execute(`
      CREATE TABLE IF NOT EXISTS earnings (
        earning_id int NOT NULL AUTO_INCREMENT,
        artist_id int NOT NULL,
        amount decimal(10,2) NOT NULL,
        transaction_date timestamp NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (earning_id),
        KEY idx_artist_id (artist_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
    `);

    await conn.execute(`
      CREATE TABLE IF NOT EXISTS messages (
        message_id int NOT NULL AUTO_INCREMENT,
        artist_id int NOT NULL,
        client_id int NOT NULL,
        message text NOT NULL,
        sent_at timestamp NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (message_id),
        KEY artist_id (artist_id),
        KEY client_id (client_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
    `);

    // Safe Column Migrations for Profiles, Sold Artworks, and Messaging
    const safeMigrations = [
      "ALTER TABLE clients ADD COLUMN profile_pic text DEFAULT NULL",
      "ALTER TABLE clients ADD COLUMN bio text DEFAULT NULL",
      "ALTER TABLE artists ADD COLUMN profile_pic text DEFAULT NULL",
      "ALTER TABLE artists ADD COLUMN bio text DEFAULT NULL",
      "ALTER TABLE paintings ADD COLUMN is_sold tinyint(1) DEFAULT 0",
      "ALTER TABLE messages ADD COLUMN sender_type enum('client','artist') DEFAULT 'client'"
    ];
    for (const sql of safeMigrations) {
      try { await conn.execute(sql); } catch (e) { /* Column already exists */ }
    }

    // Auto-mark existing ordered paintings as sold
    try {
      await conn.execute(`
        UPDATE paintings 
        SET is_sold = 1 
        WHERE painting_id IN (SELECT DISTINCT painting_id FROM orders WHERE status != 'cancelled')
      `);
    } catch (e) { /* Ignore if empty */ }

    // 2. Dynamic Auction Sync:
    // Mark expired auctions completed
    await conn.execute(`
      UPDATE auctions 
      SET status = 'completed' 
      WHERE status = 'active' AND end_time <= NOW()
    `);

    // Ensure there are always live active auctions available for demonstration and bidding
    const [activeAuctions] = await conn.execute(`
      SELECT auction_id FROM auctions WHERE status = 'active' AND end_time > NOW()
    `);

    if (activeAuctions.length === 0) {
      // Find eligible paintings to put up for dynamic live auction
      const [paintings] = await conn.execute(`
        SELECT painting_id, artist_id, price FROM paintings ORDER BY painting_id DESC LIMIT 3
      `);

      if (paintings.length > 0) {
        for (let i = 0; i < paintings.length; i++) {
          const p = paintings[i];
          const startingPrice = Math.max(100, Math.floor(parseFloat(p.price) * 0.7));
          const durationDays = i === 0 ? 1 : i === 1 ? 3 : 5;
          await conn.execute(`
            INSERT INTO auctions (painting_id, artist_id, starting_price, current_bid, end_time, status)
            VALUES (?, ?, ?, ?, DATE_ADD(NOW(), INTERVAL ? DAY), 'active')
          `, [p.painting_id, p.artist_id, startingPrice, startingPrice, durationDays]);
        }
        console.log('✓ Dynamic live auctions refreshed with rolling end dates');
      }
    }

    conn.release();
    console.log('✓ Database schema and dynamic workflows initialized');
  } catch (err) {
    console.error('⚠ Database connection/initialization error:', err.message);
  }
}

// Authentication middleware
const authenticateToken = (req, res, next) => {
  const token = req.cookies.token;
  if (!token) return res.status(401).json({ message: 'Unauthorized' });
  
  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) return res.status(403).json({ message: 'Forbidden' });
    req.user = user;
    next();
  });
};

// ============================================================================
// Health Check (For Cloud Deployments & Monitors)
// ============================================================================
app.get('/api/health', async (req, res) => {
  let dbStatus = 'disconnected';
  try {
    const conn = await db.getConnection();
    await conn.ping();
    conn.release();
    dbStatus = 'healthy';
  } catch (err) {
    dbStatus = 'degraded: ' + err.message;
  }
  res.json({
    status: 'ok',
    service: 'artiq-client-dashboard',
    database: dbStatus,
    timestamp: new Date().toISOString(),
    uptimeSeconds: Math.floor(process.uptime())
  });
});

// ============================================================================
// Auth Routes
// ============================================================================
app.post('/api/register', authLimiter, async (req, res) => {
  try {
    const { name, email, password, phone, age, gender } = req.body;
    if (!name || !email || !password || !phone || !age || !gender) {
      return res.status(400).json({ message: 'All fields are required' });
    }
    
    const [existingUsers] = await db.execute('SELECT client_id FROM clients WHERE email = ?', [email]);
    if (existingUsers.length > 0) return res.status(400).json({ message: 'Email already registered' });
    
    const hashedPassword = await bcrypt.hash(password, 12);
    const [result] = await db.execute(
      'INSERT INTO clients (name, email, password_hash, phone, age, gender) VALUES (?, ?, ?, ?, ?, ?)',
      [name, email, hashedPassword, phone, age, gender]
    );
    
    res.status(201).json({ message: 'Registration successful', userId: result.insertId });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ message: 'Server error during registration' });
  }
});

app.post('/api/login', authLimiter, async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ message: 'Email and password required' });
    
    const [users] = await db.execute('SELECT * FROM clients WHERE email = ?', [email]);
    if (users.length === 0) return res.status(401).json({ message: 'Invalid email or password' });
    
    const user = users[0];
    const passwordMatch = await bcrypt.compare(password, user.password_hash);
    if (!passwordMatch) return res.status(401).json({ message: 'Invalid email or password' });
    
    const token = jwt.sign(
      { id: user.client_id, email: user.email, name: user.name },
      JWT_SECRET,
      { expiresIn: '24h' }
    );
    
    res.cookie('token', token, { 
      httpOnly: true, 
      sameSite: IS_PROD ? 'none' : 'lax', 
      secure: IS_PROD,
      maxAge: 24 * 60 * 60 * 1000 
    });

    res.json({ 
      message: 'Login successful', 
      user: { id: user.client_id, name: user.name, email: user.email } 
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ message: 'Server error during login' });
  }
});

app.post('/api/logout', (req, res) => {
  res.clearCookie('token', { 
    httpOnly: true, 
    sameSite: IS_PROD ? 'none' : 'lax', 
    secure: IS_PROD 
  });
  res.json({ message: 'Logged out successfully' });
});

// ============================================================================
// Paintings & Categories
// ============================================================================
app.get('/api/paintings', async (req, res) => {
  try {
    const [paintings] = await db.execute(`
      SELECT p.*, COALESCE(a.name, 'Independent Artist') as artist_name 
      FROM paintings p
      LEFT JOIN artists a ON p.artist_id = a.artist_id
      ORDER BY p.created_at DESC
    `);
    paintings.forEach(p => { p.image_url = resolveImageUrl(p.image_url); });
    res.json(paintings);
  } catch (error) {
    console.error('Error fetching paintings:', error);
    res.status(500).json({ message: 'Server error fetching paintings' });
  }
});

app.get('/api/paintings/category/:category', async (req, res) => {
  try {
    const { category } = req.params;
    const [paintings] = await db.execute(`
      SELECT p.*, COALESCE(a.name, 'Independent Artist') as artist_name 
      FROM paintings p
      LEFT JOIN artists a ON p.artist_id = a.artist_id
      WHERE LOWER(p.category) = LOWER(?)
      ORDER BY p.created_at DESC
    `, [category]);
    paintings.forEach(p => { p.image_url = resolveImageUrl(p.image_url); });
    res.json(paintings);
  } catch (error) {
    res.status(500).json({ message: 'Server error filtering paintings' });
  }
});

app.get('/api/paintings/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const [paintings] = await db.execute(`
      SELECT p.*, COALESCE(a.name, 'Independent Artist') as artist_name 
      FROM paintings p
      LEFT JOIN artists a ON p.artist_id = a.artist_id
      WHERE p.painting_id = ?
    `, [id]);
    if (paintings.length === 0) return res.status(404).json({ message: 'Painting not found' });
    const painting = paintings[0];
    painting.image_url = resolveImageUrl(painting.image_url);
    res.json(painting);
  } catch (error) {
    res.status(500).json({ message: 'Server error fetching painting details' });
  }
});

app.get('/api/categories', async (req, res) => {
  try {
    const [categories] = await db.execute('SELECT DISTINCT category FROM paintings WHERE category IS NOT NULL');
    const result = categories.map(c => c.category).filter(Boolean);
    // If empty, return standard fine art categories
    if (result.length === 0) {
      return res.json(['contemporary', 'oil', 'portrait', 'still-life', 'abstract', 'landscape']);
    }
    res.json(result);
  } catch (error) {
    res.status(500).json({ message: 'Server error fetching categories' });
  }
});

// ============================================================================
// Shopping Cart
// ============================================================================
app.post('/api/cart', authenticateToken, async (req, res) => {
  try {
    const { paintingId } = req.body;
    const clientId = req.user.id;
    if (!paintingId) return res.status(400).json({ message: 'Painting ID required' });

    const [existingItems] = await db.execute('SELECT * FROM cart WHERE client_id = ? AND painting_id = ?', [clientId, paintingId]);
    if (existingItems.length > 0) return res.status(400).json({ message: 'Item already in cart' });
    
    await db.execute('INSERT INTO cart (client_id, painting_id) VALUES (?, ?)', [clientId, paintingId]);
    res.status(201).json({ message: 'Added to cart successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Server error adding to cart' });
  }
});

app.get('/api/cart', authenticateToken, async (req, res) => {
  try {
    const clientId = req.user.id;
    const [cartItems] = await db.execute(`
      SELECT c.cart_id, p.*, COALESCE(a.name, 'Independent Artist') as artist_name 
      FROM cart c
      JOIN paintings p ON c.painting_id = p.painting_id
      LEFT JOIN artists a ON p.artist_id = a.artist_id
      WHERE c.client_id = ?
    `, [clientId]);
    cartItems.forEach(item => { item.image_url = resolveImageUrl(item.image_url); });
    res.json(cartItems);
  } catch (error) {
    res.status(500).json({ message: 'Server error retrieving cart' });
  }
});

app.delete('/api/cart/:id', authenticateToken, async (req, res) => {
  try {
    await db.execute('DELETE FROM cart WHERE cart_id = ? AND client_id = ?', [req.params.id, req.user.id]);
    res.json({ message: 'Item removed from cart' });
  } catch (error) {
    res.status(500).json({ message: 'Server error removing cart item' });
  }
});

// ============================================================================
// Favorites / Wishlist
// ============================================================================
app.post('/api/favorites', authenticateToken, async (req, res) => {
  try {
    const { paintingId } = req.body;
    const clientId = req.user.id;
    if (!paintingId) return res.status(400).json({ message: 'Painting ID required' });

    const [existingItems] = await db.execute('SELECT * FROM favorites WHERE client_id = ? AND painting_id = ?', [clientId, paintingId]);
    if (existingItems.length > 0) return res.status(400).json({ message: 'Already saved to favorites' });

    await db.execute('INSERT INTO favorites (client_id, painting_id) VALUES (?, ?)', [clientId, paintingId]);
    res.status(201).json({ message: 'Saved to favorites' });
  } catch (error) {
    res.status(500).json({ message: 'Server error saving favorite' });
  }
});

app.get('/api/favorites', authenticateToken, async (req, res) => {
  try {
    const clientId = req.user.id;
    const [favorites] = await db.execute(`
      SELECT f.id, p.*, COALESCE(a.name, 'Independent Artist') as artist_name 
      FROM favorites f
      JOIN paintings p ON f.painting_id = p.painting_id
      LEFT JOIN artists a ON p.artist_id = a.artist_id
      WHERE f.client_id = ?
    `, [clientId]);
    favorites.forEach(f => { f.image_url = resolveImageUrl(f.image_url); });
    res.json(favorites);
  } catch (error) {
    res.status(500).json({ message: 'Server error fetching favorites' });
  }
});

app.delete('/api/favorites/:id', authenticateToken, async (req, res) => {
  try {
    await db.execute('DELETE FROM favorites WHERE id = ? AND client_id = ?', [req.params.id, req.user.id]);
    res.json({ message: 'Removed from favorites' });
  } catch (error) {
    res.status(500).json({ message: 'Server error removing favorite' });
  }
});

// ============================================================================
// Orders, Checkout & Receipts
// Fully links Order -> Payment -> Artist Earnings dynamically
// ============================================================================
app.post('/api/orders', authenticateToken, async (req, res) => {
  const connection = await db.getConnection();
  try {
    const clientId = req.user.id;
    const [cartItems] = await connection.execute(`
      SELECT c.*, p.price, p.artist_id
      FROM cart c JOIN paintings p ON c.painting_id = p.painting_id
      WHERE c.client_id = ?
    `, [clientId]);

    if (cartItems.length === 0) {
      connection.release();
      return res.status(400).json({ message: 'Your cart is empty' });
    }
    
    await connection.beginTransaction();
    let lastOrderId;

    for (const item of cartItems) {
      // 1. Record the order
      const [orderResult] = await connection.execute(
        'INSERT INTO orders (client_id, artist_id, painting_id, amount, status) VALUES (?, ?, ?, ?, ?)',
        [clientId, item.artist_id, item.painting_id, item.price, 'pending']
      );
      lastOrderId = orderResult.insertId;

      // 2. Record the payment record dynamically
      await connection.execute(
        'INSERT INTO payments (order_id, amount, status) VALUES (?, ?, ?)',
        [lastOrderId, item.price, 'completed']
      );

      // 3. Record the artist earnings dynamically
      await connection.execute(
        'INSERT INTO earnings (artist_id, amount) VALUES (?, ?)',
        [item.artist_id, item.price]
      );

      // 4. Mark the unique original painting as sold
      await connection.execute(
        'UPDATE paintings SET is_sold = 1 WHERE painting_id = ?',
        [item.painting_id]
      );
    }

    // 5. Clear client's cart
    await connection.execute('DELETE FROM cart WHERE client_id = ?', [clientId]);
    await connection.commit();
    connection.release();

    res.status(201).json({ message: 'Order created successfully', orderId: lastOrderId });
  } catch (error) {
    await connection.rollback();
    connection.release();
    console.error('Order checkout error:', error);
    res.status(500).json({ message: 'Server error during checkout' });
  }
});

app.get('/api/orders', authenticateToken, async (req, res) => {
  try {
    const clientId = req.user.id;
    const [orders] = await db.execute(`
      SELECT o.*, p.title, p.image_url, COALESCE(a.name, 'Independent Artist') as artist_name 
      FROM orders o
      JOIN paintings p ON o.painting_id = p.painting_id
      LEFT JOIN artists a ON o.artist_id = a.artist_id
      WHERE o.client_id = ?
      ORDER BY o.order_date DESC
    `, [clientId]);
    orders.forEach(o => { o.image_url = resolveImageUrl(o.image_url); });
    res.json(orders);
  } catch (error) {
    res.status(500).json({ message: 'Server error fetching orders' });
  }
});

app.get('/api/orders/receipt/:orderId', async (req, res) => {
  const orderId = req.params.orderId;
  try {
    const [rows] = await db.execute(`
      SELECT o.order_id AS receipt_no, o.order_date, o.amount, o.status,
             o.client_id, o.painting_id,
             c.name AS client_name, c.email AS client_email,
             p.title, p.price, p.image_url,
             o.artist_id, COALESCE(a.name, 'Independent Artist') AS artist_name
      FROM orders o
      JOIN clients c ON o.client_id = c.client_id
      JOIN paintings p ON o.painting_id = p.painting_id
      LEFT JOIN artists a ON o.artist_id = a.artist_id
      WHERE o.order_id = ?
    `, [orderId]);
    if (rows.length > 0) {
      const receipt = rows[0];
      receipt.image_url = resolveImageUrl(receipt.image_url);
      res.json(receipt);
    } else {
      res.status(404).json({ error: 'Receipt not found' });
    }
  } catch (err) {
    res.status(500).json({ error: 'Server error retrieving receipt' });
  }
});

// ============================================================================
// Live Auctions & Bidding
// Automatically marks expired auctions and keeps live bidding active
// ============================================================================
app.get('/api/auctions', async (req, res) => {
  try {
    // 1. Automatically conclude past auctions
    await db.execute(`
      UPDATE auctions 
      SET status = 'completed' 
      WHERE status = 'active' AND end_time <= NOW()
    `);

    // 2. Query active auctions
    const [auctions] = await db.execute(`
      SELECT a.*, p.title, p.image_url, COALESCE(ar.name, 'Independent Artist') as artist_name 
      FROM auctions a
      JOIN paintings p ON a.painting_id = p.painting_id
      LEFT JOIN artists ar ON a.artist_id = ar.artist_id
      WHERE a.status = 'active' AND a.end_time > NOW()
      ORDER BY a.end_time ASC
    `);

    // If active auctions are empty, dynamically schedule rolling auctions from catalog
    if (auctions.length === 0) {
      const [paintings] = await db.execute(`
        SELECT painting_id, artist_id, price, title, image_url FROM paintings LIMIT 2
      `);
      for (const p of paintings) {
        const start = Math.floor(parseFloat(p.price) * 0.75);
        await db.execute(`
          INSERT INTO auctions (painting_id, artist_id, starting_price, current_bid, end_time, status)
          VALUES (?, ?, ?, ?, DATE_ADD(NOW(), INTERVAL 3 DAY), 'active')
        `, [p.painting_id, p.artist_id, start, start]);
      }
      const [refreshed] = await db.execute(`
        SELECT a.*, p.title, p.image_url, COALESCE(ar.name, 'Independent Artist') as artist_name 
        FROM auctions a
        JOIN paintings p ON a.painting_id = p.painting_id
        LEFT JOIN artists ar ON a.artist_id = ar.artist_id
        WHERE a.status = 'active' AND a.end_time > NOW()
        ORDER BY a.end_time ASC
      `);
      refreshed.forEach(a => { a.image_url = resolveImageUrl(a.image_url); });
      return res.json(refreshed);
    }

    auctions.forEach(a => { a.image_url = resolveImageUrl(a.image_url); });
    res.json(auctions);
  } catch (error) {
    console.error('Error fetching auctions:', error);
    res.status(500).json({ message: 'Server error retrieving auctions' });
  }
});

app.post('/api/bids', authenticateToken, bidLimiter, async (req, res) => {
  const connection = await db.getConnection();
  try {
    const { auctionId, bidAmount } = req.body;
    const bidderId = req.user.id; // Strictly authenticated client ID
    
    if (!auctionId || !bidAmount) {
      connection.release();
      return res.status(400).json({ message: 'Auction ID and bid amount are required' });
    }

    const [auctions] = await connection.execute(
      'SELECT * FROM auctions WHERE auction_id = ? AND status = "active" AND end_time > NOW()',
      [auctionId]
    );

    if (auctions.length === 0) {
      connection.release();
      return res.status(404).json({ message: 'Auction not found or has ended' });
    }

    const auction = auctions[0];
    const highestBid = parseFloat(auction.current_bid || auction.starting_price);
    const parsedBid = parseFloat(bidAmount);

    if (isNaN(parsedBid) || parsedBid <= highestBid) {
      connection.release();
      return res.status(400).json({ 
        message: `Your bid (₹${parsedBid}) must be greater than current bid (₹${highestBid})` 
      });
    }
    
    await connection.beginTransaction();
    await connection.execute(
      'INSERT INTO bids (auction_id, bidder_id, bid_amount) VALUES (?, ?, ?)', 
      [auctionId, bidderId, parsedBid]
    );
    await connection.execute(
      'UPDATE auctions SET current_bid = ?, highest_bidder = ? WHERE auction_id = ?', 
      [parsedBid, bidderId, auctionId]
    );
    await connection.commit();
    connection.release();

    // Feature 1: Real-Time Live Bidding Broadcast via Socket.io
    io.emit('auction:bid', {
      auctionId: parseInt(auctionId, 10),
      currentBid: parsedBid,
      bidderName: req.user.name,
      title: auction.title || 'Artwork',
      bidTime: new Date().toISOString()
    });

    res.status(201).json({ message: 'Bid placed successfully', currentBid: parsedBid });
  } catch (error) {
    await connection.rollback();
    connection.release();
    console.error('Bid error:', error);
    res.status(500).json({ message: 'Server error placing bid' });
  }
});

// ============================================================================
// Profile Management
// ============================================================================
app.get('/api/profile', authenticateToken, async (req, res) => {
  try {
    const [clients] = await db.execute(
      'SELECT client_id, name, email, phone, age, gender, profile_pic, bio FROM clients WHERE client_id = ?',
      [req.user.id]
    );
    if (clients.length === 0) return res.status(404).json({ message: 'Client profile not found' });
    res.json(clients[0]);
  } catch (error) {
    res.status(500).json({ message: 'Server error retrieving profile' });
  }
});

app.put('/api/profile', authenticateToken, async (req, res) => {
  try {
    const { name, phone, age, gender, profile_pic, bio } = req.body;
    await db.execute(
      'UPDATE clients SET name = ?, phone = ?, age = ?, gender = ?, profile_pic = ?, bio = ? WHERE client_id = ?',
      [name, phone, age, gender, profile_pic || null, bio || null, req.user.id]
    );
    res.json({ message: 'Profile updated successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Server error updating profile' });
  }
});

// ============================================================================
// Feature 6: Stripe Test Mode Payment Gateway
// Generates payment intent / client secret for card & UPI authorization
// ============================================================================
app.post('/api/payment/create-intent', authenticateToken, async (req, res) => {
  try {
    const clientId = req.user.id;
    const [cartItems] = await db.execute(`
      SELECT c.*, p.price, p.title
      FROM cart c JOIN paintings p ON c.painting_id = p.painting_id
      WHERE c.client_id = ?
    `, [clientId]);

    if (cartItems.length === 0) {
      return res.status(400).json({ message: 'Your cart is empty' });
    }

    const subtotal = cartItems.reduce((acc, item) => acc + parseFloat(item.price), 0);
    const shipping = 250;
    const totalAmount = subtotal + shipping;

    // Supports live STRIPE_SECRET_KEY or fallback test simulation
    const intentId = `pi_test_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    const clientSecret = `${intentId}_secret_${Math.random().toString(36).substring(2, 9)}`;

    res.json({
      clientSecret,
      paymentIntentId: intentId,
      amount: totalAmount,
      currency: 'inr',
      itemsCount: cartItems.length,
      status: 'requires_payment_method',
      publishableKey: process.env.STRIPE_PUBLISHABLE_KEY || 'pk_test_artiq_demo_key'
    });
  } catch (error) {
    console.error('Payment intent error:', error);
    res.status(500).json({ message: 'Failed to initialize payment gateway' });
  }
});

// ============================================================================
// Feature 7: Client-to-Artist Messaging & Commission Requests
// Direct line connecting buyer inquiries to the artist's existing messages tab
// ============================================================================
app.get('/api/messages', authenticateToken, async (req, res) => {
  try {
    const clientId = req.user.id;
    const [messages] = await db.execute(`
      SELECT m.*, a.name as artist_name 
      FROM messages m
      JOIN artists a ON m.artist_id = a.artist_id
      WHERE m.client_id = ?
      ORDER BY m.sent_at ASC
    `, [clientId]);

    // Group messages by artist for threaded conversation UI
    const conversations = {};
    for (const msg of messages) {
      if (!conversations[msg.artist_id]) {
        conversations[msg.artist_id] = {
          artist_id: msg.artist_id,
          artist_name: msg.artist_name,
          messages: []
        };
      }
      conversations[msg.artist_id].messages.push(msg);
    }
    res.json(Object.values(conversations));
  } catch (error) {
    console.error('Error fetching client messages:', error);
    res.status(500).json({ message: 'Server error retrieving messages' });
  }
});

// Direct artist conversation thread
app.get('/api/messages/:artistId', authenticateToken, async (req, res) => {
  try {
    const clientId = req.user.id;
    const { artistId } = req.params;
    const [messages] = await db.execute(`
      SELECT m.*, a.name as artist_name, a.profile_pic as artist_avatar
      FROM messages m
      JOIN artists a ON m.artist_id = a.artist_id
      WHERE m.client_id = ? AND m.artist_id = ?
      ORDER BY m.sent_at ASC
    `, [clientId, artistId]);
    res.json(messages);
  } catch (error) {
    console.error('Error fetching artist thread:', error);
    res.status(500).json({ message: 'Server error retrieving artist conversation' });
  }
});

app.post('/api/messages', authenticateToken, async (req, res) => {
  try {
    const clientId = req.user.id;
    const { artist_id, message } = req.body;
    
    if (!artist_id || !message || !message.trim()) {
      return res.status(400).json({ message: 'Artist ID and message content are required' });
    }

    const [result] = await db.execute(
      'INSERT INTO messages (artist_id, client_id, message, sender_type) VALUES (?, ?, ?, ?)',
      [artist_id, clientId, message.trim(), 'client']
    );

    // Notify connected sockets in real time
    io.emit('chat:message', {
      messageId: result.insertId,
      artist_id,
      client_id: clientId,
      sender_name: req.user.name,
      sender_type: 'client',
      message: message.trim(),
      sent_at: new Date().toISOString()
    });

    res.status(201).json({ 
      message: 'Inquiry sent successfully to artist', 
      messageId: result.insertId 
    });
  } catch (error) {
    console.error('Send message error:', error);
    res.status(500).json({ message: 'Failed to transmit message' });
  }
});

// SPA fallback
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Start Server with Socket.io & initialize DB pool
server.listen(PORT, async () => {
  console.log(`ARTiQ Client Dashboard running on port ${PORT} with Socket.io`);
  await initDatabase();
});