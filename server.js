require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');

const healthRouter = require('./src/routes/health');
const reelsRouter = require('./src/routes/reels');
const searchRouter = require('./src/routes/search');
const categoriesRouter = require('./src/routes/categories');
const clustersRouter = require('./src/routes/clusters');
const { requireAuth } = require('./src/middleware/auth');

const app = express();

// Security & parsing middleware
app.use(helmet());
app.use(cors());
app.use(express.json());
app.use(morgan('combined'));

// Public routes
app.use('/api/v1/health', healthRouter);

// Protected routes
app.use('/api/v1/reels', requireAuth, reelsRouter);
app.use('/api/v1/search', requireAuth, searchRouter);
app.use('/api/v1/categories', requireAuth, categoriesRouter);
app.use('/api/v1/clusters', requireAuth, clustersRouter);

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'not found' });
});

// Global error handler
app.use((err, req, res, next) => {
  console.error('[ERROR]', err);
  res.status(err.status || 500).json({
    error: err.message || 'internal server error',
  });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`re:lore backend running on port ${PORT}`);
  // Start worker in same process for Render free tier (single dyno)
  require('./src/queue/worker');
});

module.exports = app;
