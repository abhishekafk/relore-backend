const express = require('express');
const router = express.Router();

/**
 * GET /api/v1/health
 * Public endpoint — no auth required.
 * Used by Render for health checks and manual verification.
 */
router.get('/', (req, res) => {
  res.status(200).json({
    status: 'ok',
    service: 're:lore backend',
    timestamp: new Date().toISOString(),
    version: '1.0.0',
  });
});

module.exports = router;
