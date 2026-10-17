# ARTiQ — Fine Art Marketplace & Live Auction Platform

ARTiQ is a full-stack art e-commerce and live auction platform built with Node.js, Express, and MySQL. It features a decoupled dual-service architecture designed for high availability, allowing the client storefront to operate independently even if the artist management portal is offline.

---

## Architecture Overview

```
                        ┌──────────────────────────────────────────────┐
                        │         Shared MySQL Database (artiqpc)      │
                        │    (Supports Cloud DATABASE_URL & Pooling)   │
                        └──────────────────────┬───────────────────────┘
                                               │
                       ┌───────────────────────┴───────────────────────┐
                       ▼                                               ▼
     ┌───────────────────────────────────┐           ┌───────────────────────────────────┐
     │         artist-dashboard          │           │         client-dashboard          │
     │            (Port 3000)            │           │            (Port 3001)            │
     ├───────────────────────────────────┤           ├───────────────────────────────────┤
     │ • Painting Catalog & Multer Upload │           │ • Autonomous Asset Delivery       │
     │ • Dynamic Live Auction Scheduler  │           │ • Live Bidding Engine             │
     │ • Order Dispatch & Sales Tracking │           │ • Cart & Checkout Pipeline        │
     │ • Client Inquiries & Messaging    │           │ • JWT Cookie Authentication       │
     └─────────────────┬─────────────────┘           └─────────────────▲─────────────────┘
                       │                                               │
                       └────────────── Synced Upload Pipeline ─────────┘
```

### High-Availability Asset Delivery
Unlike conventional decoupled apps where image URLs depend on an auxiliary service being active, ARTiQ implements an **autonomous fallback asset server**:
- Paintings uploaded in the artist portal are immediately mirrored and served directly by the client dashboard via relative `/uploads/:filename` routes.
- **The client dashboard continues serving all artwork images even if the artist service is stopped.**
- If an image file is missing from disk, the server dynamically synthesizes an inline SVG artwork fallback, preventing broken image placeholders.

---

## Core Capabilities

- **Dynamic Database Auto-Migration**: On startup, connection pools automatically verify and provision required tables (`clients`, `artists`, `paintings`, `auctions`, `bids`, `cart`, `favorites`, `orders`, `payments`, `earnings`, `messages`).
- **Rolling Live Auctions**: Expired auctions automatically transition to `completed`. If no active auctions are pending, the engine dynamically activates catalog paintings with rolling future expiration timers.
- **Transactional Order Execution**: Checkout flows run inside ACID MySQL transactions that simultaneously generate the client order, mark payment completion, and credit the artist's earnings.
- **Production-Grade Security**: Parameterized SQL queries, Bcrypt password hashing (cost factor 12), Helmet HTTP security headers, rate limiting on authentication routes, and authenticated token validation for bidding and cart operations.
- **Artistic Atelier UI**: Fine-art color system inspired by museum galleries, featuring high-contrast typography, acrylic glassmorphism, responsive live auction cards, and dynamic theme tokens.

---

## Technology Stack

| Layer | Technologies |
|---|---|
| **Client Frontend** | Vanilla HTML5, CSS3 (Atelier Theme), Modern JavaScript SPA, Font Awesome 6 |
| **Client Backend** | Node.js (ES Modules), Express 4, `mysql2/promise` Pool, JWT, Cookie-Parser, Helmet |
| **Artist Portal** | Node.js (CommonJS), Express 4, `mysql2` Pool, Multer, Express-Session, Bcrypt |
| **Database** | MySQL 8.0+ / Cloud MySQL (Railway, Render, Supabase, Aiven, PlanetScale) |

---

## Quickstart Options

### Option A: One-Command Docker Setup (Recommended)

Run the entire platform (MySQL, Artist Dashboard, Client Storefront, and shared uploads volume) with a single command:

```bash
docker compose up --build
```

That's it!
- **Client Storefront**: **http://localhost:3001**
- **Artist Portal**: **http://localhost:3000**
- **MySQL Database**: `localhost:3306` (database `artiqpc`, auto-seeded from `artiqpc.sql`)

To stop the containers:
```bash
docker compose down
```

To stop and reset persistent database & upload volumes:
```bash
docker compose down -v
```

---

### Option B: Local Node.js Development

#### 1. Prerequisites
- [Node.js](https://nodejs.org/) (v18.x or v20.x recommended)
- [MySQL Server](https://dev.mysql.com/) (v8.0+ running locally)

---

### 2. Database Provisioning

Log in to your local MySQL instance:
```sql
CREATE DATABASE artiqpc;
```

Import initial seed records (artists, clients, sample artwork):
```bash
mysql -u root -p artiqpc < artiqpc.sql
```
*(Note: If deploying to a fresh cloud database without CLI access, the server will automatically provision all tables on first boot).*

---

### 3. Environment Setup

Create `.env` files in both dashboard folders from the provided templates.

#### `artist-dashboard/.env`
```env
PORT=3000
NODE_ENV=development
DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASSWORD=your_mysql_password
DB_NAME=artiqpc
SESSION_SECRET=your_secure_session_secret_key
CORS_ORIGIN=http://localhost:3001
```

#### `client-dashboard/.env`
```env
PORT=3001
NODE_ENV=development
DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASSWORD=your_mysql_password
DB_NAME=artiqpc
JWT_SECRET=your_secure_jwt_secret_key
CORS_ORIGIN=http://localhost:3000,http://localhost:3001
ARTIST_SERVER_URL=http://localhost:3000
```

> **For Cloud Deployments**: You can supply a single `DATABASE_URL=mysql://user:pass@host:port/dbname` string instead of separate `DB_*` keys.

---

### 4. Install & Launch Services

Open two terminal sessions:

#### Terminal 1 — Artist Dashboard (:3000)
```bash
cd artist-dashboard
npm install
npm start
```
*Access:* **http://localhost:3000**

#### Terminal 2 — Client Storefront (:3001)
```bash
cd client-dashboard
npm install
npm start
```
*Access:* **http://localhost:3001**

> **Windows PowerShell Tip:** Always prefix with `node` or `npm` (`npm start` or `node server.js`). Invoking `server.js` directly is not recognized by PowerShell.

---

## Test Accounts

If you imported `artiqpc.sql`, use these test credentials to explore immediately:

| Role | Portal URL | Email | Password |
|---|---|---|---|
| **Artist** | `http://localhost:3000` | `ginger@gmail.com` | `ginger123` |
| **Client** | `http://localhost:3001` | `neha@gmail.com` | *(login via register or demo client)* |

You can also create new accounts via the registration forms on either portal.

---

## Project Structure

```
ARTiQ/
├── .gitignore                   # Excludes .env, node_modules, logs
├── README.md                    # Root project documentation
├── artiqpc.sql                  # Database schema and seed data
│
├── artist-dashboard/
│   ├── .env.example             # Configuration template
│   ├── package.json
│   ├── server.js                # Express app (Multer upload pipeline, session auth)
│   ├── public/
│   │   ├── css/                 # Dashboard styles
│   │   ├── js/                  # Portal logic (paintings, auctions, orders)
│   │   └── uploads/             # Primary artwork image directory
│   └── views/
│       ├── auth/                # Artist authentication views
│       └── dashboard/           # Management dashboard views
│
└── client-dashboard/
    ├── .env.example             # Configuration template
    ├── package.json
    ├── server.js                # Autonomous API & static server (connection pool, JWT)
    └── public/
        ├── index.html           # SPA entry point
        ├── css/
        │   └── styles.css       # Atelier design system & artistic palette
        ├── images/              # Static branding and hero backgrounds
        ├── js/
        │   └── app.js           # Client-side router, state management & API client
        └── uploads/             # Mirrored artwork asset directory
```

---

## Production Deployment Guide

Both services are ready for containerized or PaaS cloud deployment (e.g. Railway, Render, Fly.io, Heroku, or VPS with Nginx).

### Deploying on Railway / Render:

1. **Database**: Spin up a managed MySQL instance and copy the `DATABASE_URL`.
2. **Client Service**:
   - Root directory: `client-dashboard`
   - Build Command: `npm install`
   - Start Command: `npm start`
   - Set Environment Variables:
     - `NODE_ENV=production`
     - `DATABASE_URL=mysql://...`
     - `JWT_SECRET=<64-char-random-string>`
3. **Artist Service**:
   - Root directory: `artist-dashboard`
   - Build Command: `npm install`
   - Start Command: `npm start`
   - Set Environment Variables:
     - `NODE_ENV=production`
     - `DATABASE_URL=mysql://...`
     - `SESSION_SECRET=<64-char-random-string>`
     - `CORS_ORIGIN=https://<your-client-domain>`

### Health Monitoring
Both services expose health endpoints for container probes and uptime monitors:
- `GET /api/health` — returns JSON status, uptime, and database ping response.

---

## Security & Reliability Standards

- **SQL Injection Prevention**: Parameterized queries across all database drivers.
- **Sensitive Data Isolation**: `.env` and environment credentials are excluded from Git tracking via root `.gitignore`.
- **Credential Protection**: Passwords salted and hashed with Bcrypt (12 rounds); JWTs stored in `httpOnly` secure cookies.
- **Connection Resilience**: Connection pools automatically recover from idle socket drops and transient database latency.
