require('dotenv').config();
const express = require('express');
const path = require('path');
const mysql = require('mysql2');
const session = require('express-session');
const multer = require('multer');
const fs = require('fs');
const bcrypt = require('bcrypt');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

// Security headers
app.use(helmet({ 
  contentSecurityPolicy: false,
  crossOriginResourcePolicy: { policy: "cross-origin" },
  crossOriginEmbedderPolicy: false
}));

// CORS
app.use(cors({
  origin: ['http://localhost:3001'],
  credentials: true
}));

// Rate limiting on auth routes
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { error: 'Too many attempts, please try again later.' }
});

// Database connection pool (supports cloud DATABASE_URL and local configurations)
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
console.log('Artist Dashboard connected to MySQL pool');

// Safe database migrations for profile, messaging, and sold flags
const safeMigrations = [
  "ALTER TABLE clients ADD COLUMN profile_pic text DEFAULT NULL",
  "ALTER TABLE clients ADD COLUMN bio text DEFAULT NULL",
  "ALTER TABLE artists ADD COLUMN profile_pic text DEFAULT NULL",
  "ALTER TABLE artists ADD COLUMN bio text DEFAULT NULL",
  "ALTER TABLE paintings ADD COLUMN is_sold tinyint(1) DEFAULT 0",
  "ALTER TABLE messages ADD COLUMN sender_type enum('client','artist') DEFAULT 'client'"
];
safeMigrations.forEach(sql => {
  db.query(sql, () => {});
});

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

const crypto = require('crypto');

// Session middleware
const IS_PROD = process.env.NODE_ENV === 'production';
app.use(session({
  secret: process.env.SESSION_SECRET || 'fallback_secret_change_me',
  resave: false,
  saveUninitialized: false,
  cookie: { 
    maxAge: 3600000, // 1 hour
    httpOnly: true,
    sameSite: 'lax',
    secure: IS_PROD
  }
}));

// Whitelist allowed image extensions and MIME types
const ALLOWED_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp']);
const ALLOWED_MIMETYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

// File upload configuration with cryptographically safe randomized filenames
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(__dirname, 'public', 'uploads');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const hash = crypto.randomBytes(12).toString('hex');
    cb(null, `${Date.now()}-${hash}${ext}`);
  }
});

const upload = multer({ 
  storage: storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (ALLOWED_MIMETYPES.has(file.mimetype) && ALLOWED_EXTENSIONS.has(ext)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only JPEG, PNG, and WebP images are permitted.'));
    }
  }
});

app.locals.upload = upload;
app.locals.db = db;

// Authentication middleware
const isAuthenticated = (req, res, next) => {
  if (req.session.artistId) {
    next();
  } else {
    res.redirect('/login.html');
  }
};

// Routes
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'views', 'auth', 'login.html'));
});

// Auth routes
app.post('/api/register', authLimiter, async (req, res) => {
  const { name, age, gender, phone, email, password } = req.body;
  
  if (!name || !email || !password || !phone || !age || !gender) {
    return res.status(400).json({ error: 'All fields are required' });
  }
  
  try {
    const password_hash = await bcrypt.hash(password, 12);
    
    const query = 'INSERT INTO artists (name, age, gender, phone, email, password_hash) VALUES (?, ?, ?, ?, ?, ?)';
    db.query(query, [name, age, gender, phone, email, password_hash], (err, result) => {
      if (err) {
        if (err.code === 'ER_DUP_ENTRY') {
          return res.status(409).json({ error: 'Email or phone already registered' });
        }
        console.error('Registration error:', err);
        return res.status(500).json({ error: 'Registration failed' });
      }
      res.status(201).json({ message: 'Artist registered successfully', artistId: result.insertId });
    });
  } catch (err) {
    console.error('Bcrypt error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

app.post('/api/login', authLimiter, async (req, res) => {
  const { email, password } = req.body;
  
  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required' });
  }
  
  const query = 'SELECT artist_id, name, password_hash FROM artists WHERE email = ?';
  db.query(query, [email], async (err, results) => {
    if (err) {
      console.error('Login error:', err);
      return res.status(500).json({ error: 'Login failed' });
    }
    
    if (results.length === 0) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    
    const artist = results[0];
    
    try {
      const match = await bcrypt.compare(password, artist.password_hash);
      if (!match) {
        return res.status(401).json({ error: 'Invalid credentials' });
      }
      
      req.session.artistId = artist.artist_id;
      req.session.artistName = artist.name;
      
      res.status(200).json({ 
        message: 'Login successful',
        artist: { id: artist.artist_id, name: artist.name }
      });
    } catch (bcryptErr) {
      console.error('Password compare error:', bcryptErr);
      res.status(500).json({ error: 'Server error' });
    }
  });
});

app.get('/api/logout', (req, res) => {
  req.session.destroy();
  res.status(200).json({ message: 'Logged out successfully' });
});

// Dashboard data
app.get('/api/dashboard', isAuthenticated, (req, res) => {
  const artistId = req.session.artistId;
  
  const paintingsQuery = 'SELECT COUNT(*) as totalPaintings FROM paintings WHERE artist_id = ?';
  const ordersQuery = 'SELECT COUNT(*) as totalOrders FROM orders WHERE artist_id = ?';
  const salesQuery = 'SELECT SUM(amount) as totalSales FROM earnings WHERE artist_id = ?';
  const recentOrdersQuery = `
    SELECT o.order_id, o.amount, o.status, o.order_date, c.name as client_name, p.title as painting_title
    FROM orders o
    JOIN clients c ON o.client_id = c.client_id
    JOIN paintings p ON o.painting_id = p.painting_id
    WHERE o.artist_id = ?
    ORDER BY o.order_date DESC
    LIMIT 5
  `;
  
  db.query(paintingsQuery, [artistId], (err, paintingsResult) => {
    if (err) return res.status(500).json({ error: 'Failed to fetch dashboard data' });
    
    db.query(ordersQuery, [artistId], (err, ordersResult) => {
      if (err) return res.status(500).json({ error: 'Failed to fetch dashboard data' });
      
      db.query(salesQuery, [artistId], (err, salesResult) => {
        if (err) return res.status(500).json({ error: 'Failed to fetch dashboard data' });
        
        db.query(recentOrdersQuery, [artistId], (err, recentOrdersResult) => {
          if (err) return res.status(500).json({ error: 'Failed to fetch dashboard data' });
          
          res.status(200).json({
            totalPaintings: paintingsResult[0].totalPaintings,
            totalOrders: ordersResult[0].totalOrders,
            totalSales: salesResult[0].totalSales || 0,
            recentOrders: recentOrdersResult
          });
        });
      });
    });
  });
});

// Paintings routes
app.get('/api/paintings', isAuthenticated, (req, res) => {
  const artistId = req.session.artistId;
  const query = 'SELECT * FROM paintings WHERE artist_id = ? ORDER BY created_at DESC';
  db.query(query, [artistId], (err, results) => {
    if (err) return res.status(500).json({ error: 'Failed to fetch paintings' });
    res.status(200).json(results);
  });
});

app.post('/api/paintings', isAuthenticated, upload.single('image'), (req, res) => {
  const artistId = req.session.artistId;
  const { title, description, price, category } = req.body;
  const image_url = req.file ? `/uploads/${req.file.filename}` : null;
  
  // Mirror upload to client dashboard uploads directory so client can serve it autonomously
  if (req.file) {
    const clientUploadDir = path.join(__dirname, '..', 'client-dashboard', 'public', 'uploads');
    if (fs.existsSync(clientUploadDir)) {
      try {
        fs.copyFileSync(req.file.path, path.join(clientUploadDir, req.file.filename));
      } catch (copyErr) {
        console.warn('Could not mirror upload to client dashboard:', copyErr.message);
      }
    }
  }

  const query = 'INSERT INTO paintings (artist_id, title, description, price, image_url, category) VALUES (?, ?, ?, ?, ?, ?)';
  db.query(query, [artistId, title, description, price, image_url, category], (err, result) => {
    if (err) return res.status(500).json({ error: 'Failed to add painting' });
    res.status(201).json({ 
      message: 'Painting added successfully',
      paintingId: result.insertId,
      painting: { painting_id: result.insertId, artist_id: artistId, title, description, price, image_url, category, created_at: new Date() }
    });
  });
});

app.put('/api/paintings/:id', isAuthenticated, upload.single('image'), (req, res) => {
  const artistId = req.session.artistId;
  const paintingId = req.params.id;
  const { title, description, price, category } = req.body;
  
  db.query('SELECT * FROM paintings WHERE painting_id = ? AND artist_id = ?', [paintingId, artistId], (err, results) => {
    if (err || results.length === 0) return res.status(403).json({ error: 'Unauthorized or painting not found' });
    
    let query, params;
    if (req.file) {
      const image_url = `/uploads/${req.file.filename}`;
      query = 'UPDATE paintings SET title = ?, description = ?, price = ?, image_url = ?, category = ? WHERE painting_id = ?';
      params = [title, description, price, image_url, category, paintingId];
    } else {
      query = 'UPDATE paintings SET title = ?, description = ?, price = ?, category = ? WHERE painting_id = ?';
      params = [title, description, price, category, paintingId];
    }
    
    db.query(query, params, (err) => {
      if (err) return res.status(500).json({ error: 'Failed to update painting' });
      res.status(200).json({ message: 'Painting updated successfully' });
    });
  });
});

app.delete('/api/paintings/:id', isAuthenticated, (req, res) => {
  const artistId = req.session.artistId;
  const paintingId = req.params.id;
  
  db.query('SELECT * FROM paintings WHERE painting_id = ? AND artist_id = ?', [paintingId, artistId], (err, results) => {
    if (err || results.length === 0) return res.status(403).json({ error: 'Unauthorized or painting not found' });
    
    db.query('DELETE FROM paintings WHERE painting_id = ?', [paintingId], (err) => {
      if (err) return res.status(500).json({ error: 'Failed to delete painting' });
      res.status(200).json({ message: 'Painting deleted successfully' });
    });
  });
});

// Auctions routes
app.get('/api/auctions', isAuthenticated, (req, res) => {
  const artistId = req.session.artistId;
  const query = `
    SELECT a.*, p.title, p.image_url, c.name as highest_bidder_name
    FROM auctions a
    JOIN paintings p ON a.painting_id = p.painting_id
    LEFT JOIN clients c ON a.highest_bidder = c.client_id
    WHERE a.artist_id = ?
    ORDER BY a.end_time DESC
  `;
  db.query(query, [artistId], (err, results) => {
    if (err) return res.status(500).json({ error: 'Failed to fetch auctions' });
    res.status(200).json(results);
  });
});

app.post('/api/auctions', isAuthenticated, (req, res) => {
  const artistId = req.session.artistId;
  const { painting_id, starting_price, end_time } = req.body;
  
  db.query('SELECT * FROM paintings WHERE painting_id = ? AND artist_id = ?', [painting_id, artistId], (err, results) => {
    if (err || results.length === 0) return res.status(403).json({ error: 'Unauthorized or painting not found' });
    
    db.query('SELECT * FROM auctions WHERE painting_id = ? AND status = "active"', [painting_id], (err, auctionResults) => {
      if (err) return res.status(500).json({ error: 'Failed to create auction' });
      if (auctionResults.length > 0) return res.status(400).json({ error: 'This painting is already in an active auction' });
      
      const query = 'INSERT INTO auctions (painting_id, artist_id, starting_price, current_bid, end_time, status) VALUES (?, ?, ?, ?, ?, "active")';
      db.query(query, [painting_id, artistId, starting_price, starting_price, end_time], (err, result) => {
        if (err) return res.status(500).json({ error: 'Failed to create auction' });
        res.status(201).json({ message: 'Auction created successfully', auctionId: result.insertId });
      });
    });
  });
});

app.delete('/api/auctions/:id', isAuthenticated, (req, res) => {
  const artistId = req.session.artistId;
  const auctionId = req.params.id;
  
  db.query('SELECT * FROM auctions WHERE auction_id = ? AND artist_id = ?', [auctionId, artistId], (err, results) => {
    if (err || results.length === 0) return res.status(403).json({ error: 'Unauthorized or auction not found' });
    
    db.query('UPDATE auctions SET status = "completed" WHERE auction_id = ?', [auctionId], (err) => {
      if (err) return res.status(500).json({ error: 'Failed to cancel auction' });
      res.status(200).json({ message: 'Auction canceled successfully' });
    });
  });
});

// Orders routes
app.get('/api/orders', isAuthenticated, (req, res) => {
  const artistId = req.session.artistId;
  const query = `
    SELECT o.*, p.title as painting_title, p.image_url, c.name as client_name
    FROM orders o
    JOIN paintings p ON o.painting_id = p.painting_id
    JOIN clients c ON o.client_id = c.client_id
    WHERE o.artist_id = ?
    ORDER BY o.order_date DESC
  `;
  db.query(query, [artistId], (err, results) => {
    if (err) return res.status(500).json({ error: 'Failed to fetch orders' });
    res.status(200).json(results);
  });
});

app.put('/api/orders/:id/status', isAuthenticated, (req, res) => {
  const artistId = req.session.artistId;
  const orderId = req.params.id;
  const { status } = req.body;
  
  const validStatuses = ['pending', 'shipped', 'delivered'];
  if (!validStatuses.includes(status)) return res.status(400).json({ error: 'Invalid status' });
  
  db.query('SELECT * FROM orders WHERE order_id = ? AND artist_id = ?', [orderId, artistId], (err, results) => {
    if (err || results.length === 0) return res.status(403).json({ error: 'Unauthorized or order not found' });
    
    db.query('UPDATE orders SET status = ? WHERE order_id = ?', [status, orderId], (err) => {
      if (err) return res.status(500).json({ error: 'Failed to update order status' });
      res.status(200).json({ message: 'Order status updated successfully' });
    });
  });
});

// Messages routes
app.get('/api/messages', isAuthenticated, (req, res) => {
  const artistId = req.session.artistId;
  const query = `
    SELECT m.*, c.name as client_name
    FROM messages m
    JOIN clients c ON m.client_id = c.client_id
    WHERE m.artist_id = ?
    ORDER BY m.sent_at ASC
  `;
  db.query(query, [artistId], (err, results) => {
    if (err) return res.status(500).json({ error: 'Failed to fetch messages' });
    
    const messagesByClient = {};
    results.forEach(message => {
      if (!messagesByClient[message.client_id]) {
        messagesByClient[message.client_id] = { client_id: message.client_id, client_name: message.client_name, messages: [] };
      }
      messagesByClient[message.client_id].messages.push({ 
        message_id: message.message_id, 
        message: message.message, 
        sent_at: message.sent_at,
        sender_type: message.sender_type || (message.message.startsWith('[Artist]') ? 'artist' : 'client')
      });
    });
    res.status(200).json(Object.values(messagesByClient));
  });
});

app.post('/api/messages', isAuthenticated, (req, res) => {
  const artistId = req.session.artistId;
  const { client_id, message } = req.body;
  
  db.query(
    'INSERT INTO messages (artist_id, client_id, message, sender_type) VALUES (?, ?, ?, ?)',
    [artistId, client_id, message, 'artist'],
    (err, result) => {
      if (err) return res.status(500).json({ error: 'Failed to send message' });
      res.status(201).json({ message: 'Message sent successfully', messageId: result.insertId });
    }
  );
});

// Profile Routes
app.get('/profile', isAuthenticated, (req, res) => res.sendFile(path.join(__dirname, 'views', 'dashboard', 'profile.html')));

app.get('/api/profile', isAuthenticated, (req, res) => {
  const artistId = req.session.artistId;
  db.query(
    'SELECT artist_id, name, age, gender, phone, email, bio, profile_pic FROM artists WHERE artist_id = ?',
    [artistId],
    (err, results) => {
      if (err || results.length === 0) return res.status(500).json({ error: 'Failed to fetch profile' });
      res.status(200).json(results[0]);
    }
  );
});

app.put('/api/profile', isAuthenticated, (req, res) => {
  const artistId = req.session.artistId;
  const { name, age, gender, phone, bio } = req.body;
  db.query(
    'UPDATE artists SET name = ?, age = ?, gender = ?, phone = ?, bio = ? WHERE artist_id = ?',
    [name, age, gender, phone, bio || null, artistId],
    (err) => {
      if (err) return res.status(500).json({ error: 'Failed to update profile' });
      req.session.artistName = name;
      res.status(200).json({ message: 'Profile updated successfully' });
    }
  );
});

app.post('/api/profile/picture', isAuthenticated, upload.single('profile_picture'), (req, res) => {
  const artistId = req.session.artistId;
  if (!req.file) return res.status(400).json({ error: 'No image uploaded' });
  const profile_pic = `/uploads/${req.file.filename}`;
  
  // Mirror to client-dashboard
  const clientUploadDir = path.join(__dirname, '..', 'client-dashboard', 'public', 'uploads');
  if (fs.existsSync(clientUploadDir)) {
    try {
      fs.copyFileSync(req.file.path, path.join(clientUploadDir, req.file.filename));
    } catch (e) {
      console.warn('Could not mirror profile picture to client:', e.message);
    }
  }

  db.query('UPDATE artists SET profile_pic = ? WHERE artist_id = ?', [profile_pic, artistId], (err) => {
    if (err) return res.status(500).json({ error: 'Failed to save profile picture' });
    res.status(200).json({ message: 'Profile picture updated', profile_pic });
  });
});

// Serve HTML files
app.get('/login.html', (req, res) => res.sendFile(path.join(__dirname, 'views', 'auth', 'login.html')));
app.get('/register.html', (req, res) => res.sendFile(path.join(__dirname, 'views', 'auth', 'register.html')));
app.get('/dashboard', isAuthenticated, (req, res) => res.sendFile(path.join(__dirname, 'views', 'dashboard', 'index.html')));
app.get('/paintings', isAuthenticated, (req, res) => res.sendFile(path.join(__dirname, 'views', 'dashboard', 'paintings.html')));
app.get('/auctions', isAuthenticated, (req, res) => res.sendFile(path.join(__dirname, 'views', 'dashboard', 'auctions.html')));
app.get('/orders', isAuthenticated, (req, res) => res.sendFile(path.join(__dirname, 'views', 'dashboard', 'orders.html')));
app.get('/messages', isAuthenticated, (req, res) => res.sendFile(path.join(__dirname, 'views', 'dashboard', 'messages.html')));

// Start server
app.listen(PORT, () => {
  console.log(`Artist dashboard running on port ${PORT}`);
});