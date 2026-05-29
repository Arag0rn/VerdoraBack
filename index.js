require('dotenv').config();
const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const fs = require('fs');
const https = require('https');
const db = require('./db');
const authRoutes = require('./routes/auth');

const app = express();
const PORT = process.env.PORT || 4000;

// FRONTEND_ORIGIN may be a comma-separated list of allowed origins.
const allowedOrigins = (process.env.FRONTEND_ORIGIN || 'http://localhost:5173')
  .split(',')
  .map(o => o.trim())
  .filter(Boolean);

// Behind Render/Heroku-style proxies so secure cookies and req.secure work.
app.set('trust proxy', 1);

app.use(express.json());
app.use(cookieParser());
app.use(
  cors({
    origin(origin, callback) {
      // Allow non-browser clients (no Origin header) and whitelisted origins.
      // Reject disallowed origins cleanly (no CORS headers) instead of throwing,
      // which would otherwise surface as a 500 on the preflight request.
      if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
      return callback(null, false);
    },
    credentials: true,
  })
);

app.use('/', authRoutes);

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ timestamp: new Date().toISOString(), status: 500, message: 'Internal server error' });
});

function startServer() {
  const USE_HTTPS = process.env.USE_HTTPS === 'true';
  const CERT_PATH = process.env.SSL_CERT_PATH || './certs/server.crt';
  const KEY_PATH = process.env.SSL_KEY_PATH || './certs/server.key';

  if (USE_HTTPS) {
    try {
      const key = fs.readFileSync(KEY_PATH);
      const cert = fs.readFileSync(CERT_PATH);
      https.createServer({ key, cert }, app).listen(PORT, () => {
        console.log(`Verdora backend listening on https://localhost:${PORT}`);
      });
      return;
    } catch (err) {
      console.error('Failed to start HTTPS server, falling back to HTTP:', err.message || err);
    }
  }

  app.listen(PORT, () => {
    console.log(`Verdora backend listening on http://localhost:${PORT}`);
  });
}

// A MongoDB connection is required — fail fast if it cannot be established.
db.connect(process.env.MONGO_URI)
  .then(startServer)
  .catch(err => {
    console.error('Failed to connect to MongoDB:', err.message || err);
    process.exit(1);
  });
