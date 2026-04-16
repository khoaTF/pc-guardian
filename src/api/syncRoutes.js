const express = require('express');
const cloudSync = require('../monitor/cloudSync');

const router = express.Router();

/**
 * Get sync status
 */
router.get('/status', (req, res) => {
  res.json(cloudSync.getSyncStatus());
});

/**
 * Manual sync from cloud
 */
router.post('/pull', async (req, res) => {
  try {
    const result = await cloudSync.syncFromCloud();
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * Push local to cloud
 */
router.post('/push', async (req, res) => {
  try {
    const result = await cloudSync.pushToCloud();
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * Check internet connection
 */
router.get('/internet', async (req, res) => {
  const online = await cloudSync.checkInternet();
  res.json({ online });
});

module.exports = router;
