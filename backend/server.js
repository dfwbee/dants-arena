require('dotenv').config();

const express  = require('express');
const cors     = require('cors');

const app  = express();
const PORT = process.env.PORT || 5000;
const allowedOrigins = [
  'http://127.0.0.1:5500',
  'http://localhost:5500',
  'http://127.0.0.1:3000',
  'http://localhost:3000',
  'http://127.0.0.1:3001',
  'http://localhost:3001'
];

app.use(cors({
  origin(origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
      return;
    }
    callback(new Error(`CORS blocked for origin: ${origin}`));
  },
  credentials: true
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use((req, _res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  next();
});

app.get('/api', (_req, res) => {
  res.json({ success: true, message: '🏟️ Dants Arena API is live!', version: '1.0.0' });
});

app.use('/api/auth',       require('./routes/auth'));
app.use('/api/bookings',   require('./routes/bookings'));
app.use('/api/membership', require('./routes/membership'));
app.use('/api/events',     require('./routes/events'));

app.use((_req, res) => {
  res.status(404).json({ success: false, message: 'Route not found.' });
});

app.use((err, _req, res, _next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ success: false, message: 'Internal server error.' });
});

app.listen(PORT, () => {
  console.log(`\n🏟️  Dants Arena backend running on http://localhost:${PORT}`);
  console.log(`📡  Health check: http://localhost:${PORT}/api\n`);
});


