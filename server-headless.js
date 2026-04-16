/**
 * Headless server for Electron - same as server.js but without listen() blocking
 * and with support for custom data directory
 */
const express = require('express');
const path = require('path');
const fs = require('fs');

// Override data directory if running in Electron
const customDataDir = process.env.PCG_DATA_DIR;
if (customDataDir && !fs.existsSync(customDataDir)) {
  fs.mkdirSync(customDataDir, { recursive: true });
}

// Patch storage to use custom data dir
if (customDataDir) {
  const storage = require('./src/utils/storage');
  const originalDataDir = storage.DATA_DIR;
  
  // Copy default data files if they don't exist in custom dir
  const dataFiles = ['settings.json', 'blocked-games.json', 'schedules.json', 'logs.json'];
  for (const file of dataFiles) {
    const customFile = path.join(customDataDir, file);
    const originalFile = path.join(originalDataDir, file);
    if (!fs.existsSync(customFile) && fs.existsSync(originalFile)) {
      fs.copyFileSync(originalFile, customFile);
    }
  }
}

const { readData, writeData } = require('./src/utils/storage');
const { log, EventType } = require('./src/utils/logger');
const { authMiddleware } = require('./src/middleware/auth');
const processMonitor = require('./src/monitor/processMonitor');

const app = express();
const PORT = 3847;

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));

// API auth middleware
app.use('/api', (req, res, next) => {
  if (req.path === '/auth/login' || req.path === '/auth/setup-check') {
    return next();
  }
  authMiddleware(req, res, next);
});

// API Routes
app.use('/api/auth', require('./src/api/authRoutes'));
app.use('/api/games', require('./src/api/gameRoutes'));
app.use('/api/schedules', require('./src/api/scheduleRoutes'));
app.use('/api/logs', require('./src/api/logRoutes'));
app.use('/api/settings', require('./src/api/settingsRoutes'));
app.use('/api/websites', require('./src/api/websiteRoutes'));

// SPA fallback
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Initialize data
function initializeData() {
  const settings = readData('settings.json', null);
  if (!settings) {
    writeData('settings.json', {
      monitoringEnabled: true,
      showNotification: true,
      scanInterval: 3,
      autoStart: false
    });
  }

  const games = readData('blocked-games.json', null);
  if (!games) {
    try {
      const defaults = require('./config/default-games.json');
      const initialGames = defaults.map((g, i) => ({
        ...g,
        id: `default_${i}_${Date.now().toString(36)}`,
        enabled: true,
        addedAt: new Date().toISOString(),
        isCustom: false
      }));
      writeData('blocked-games.json', initialGames);
    } catch (err) {
      console.error('Could not load default games:', err.message);
    }
  }

  readData('schedules.json', []);
  readData('logs.json', []);
}

// Start
initializeData();

const serverInstance = app.listen(PORT, () => {
  console.log(`[PC Guardian] Server running on port ${PORT}`);
  
  const settings = readData('settings.json', {});
  if (settings.monitoringEnabled !== false) {
    processMonitor.start();
  }
  
  // Apply blocked websites to Windows hosts file
  const websiteRoutes = require('./src/api/websiteRoutes');
  websiteRoutes.applyBackgroundBlocks();

  log(EventType.SYSTEM, `PC Guardian khởi động (Electron mode)`);
});

module.exports = serverInstance;
