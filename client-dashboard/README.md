# ARTiQ — Client Dashboard

The buyer-facing storefront and SPA for browsing artwork, shopping, and participating in live auctions.

## Quickstart

### 1. Configure Environment
Ensure `.env` exists in this folder:
```env
PORT=3001
DB_HOST=localhost
DB_USER=root
DB_PASSWORD=your_mysql_password
DB_NAME=artiqpc
JWT_SECRET=your_jwt_secret
ARTIST_SERVER_URL=http://localhost:3000
ARTIST_UPLOADS_PATH=../artist-dashboard/public/uploads
```

### 2. Install & Run
```bash
npm install
npm start
```
Runs at: **http://localhost:3001**

For dev mode with auto-reload:
```bash
npm run dev
```

> **Note**: For painting images to load, the `artist-dashboard` service must also be running concurrently on port 3000. Refer to the root [README.md](../README.md) for full project setup and database instructions.
