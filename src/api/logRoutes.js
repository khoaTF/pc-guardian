const express = require('express');
const { getLogs, getStats } = require('../utils/logger');

const router = express.Router();

/**
 * Get logs with filtering and pagination
 */
router.get('/', (req, res) => {
  const { page, limit, type, dateFrom, dateTo, search } = req.query;

  const result = getLogs({
    page: parseInt(page) || 1,
    limit: parseInt(limit) || 50,
    type: type || null,
    dateFrom: dateFrom || null,
    dateTo: dateTo || null,
    search: search || null
  });

  res.json(result);
});

/**
 * Get statistics for dashboard
 */
router.get('/stats', (req, res) => {
  const stats = getStats();
  res.json(stats);
});

module.exports = router;
