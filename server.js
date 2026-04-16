const express = require('express');
const path = require('path');
const { readData, writeData } = require('./src/utils/storage');
const { log, EventType } = require('./src/utils/logger');
const { authMiddleware } = require('./src/middleware/auth');
const processMonitor = require('./src/monitor/processMonitor');
const cloudSync = require('./src/monitor/cloudSync');
const downloadWatcher = require('./src/monitor/downloadWatcher');

const app = express();
const PORT = 3847;

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static files (no auth required)
app.use(express.static(path.join(__dirname, 'public')));

// API auth middleware (applied to /api/* except login)
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
app.use('/api/sync', require('./src/api/syncRoutes'));
app.use('/api/scanner', require('./src/api/scannerRoutes'));
app.use('/api/websites', require('./src/api/websiteRoutes'));

// SPA fallback - serve login or dashboard
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Initialize data files
function initializeData() {
  // Initialize settings if not exists
  const settings = readData('settings.json', null);
  if (!settings) {
    writeData('settings.json', {
      monitoringEnabled: true,
      showNotification: true,
      scanInterval: 3,
      autoStart: false
    });
  }

  // Initialize blocked games with defaults if empty
  const games = readData('blocked-games.json', null);
  if (!games) {
    const defaults = require('./config/default-games.json');
    const initialGames = defaults.map((g, i) => ({
      ...g,
      id: `default_${i}_${Date.now().toString(36)}`,
      enabled: true,
      addedAt: new Date().toISOString(),
      isCustom: false
    }));
    writeData('blocked-games.json', initialGames);
    console.log(`\x1b[32m[Init]\x1b[0m Loaded ${initialGames.length} default games`);
  }

  // Initialize other data files
  readData('schedules.json', []);
  readData('logs.json', []);
}

// Start server
app.listen(PORT, () => {
  console.log('');
  console.log('\x1b[36m╔══════════════════════════════════════════╗\x1b[0m');
  console.log('\x1b[36m║\x1b[0m   🛡️  \x1b[1mPC Guardian\x1b[0m - Parental Control      \x1b[36m║\x1b[0m');
  console.log('\x1b[36m╠══════════════════════════════════════════╣\x1b[0m');
  console.log(`\x1b[36m║\x1b[0m   Dashboard: \x1b[32mhttp://localhost:${PORT}\x1b[0m      \x1b[36m║\x1b[0m`);
  console.log('\x1b[36m║\x1b[0m   Status:    \x1b[33mĐang chạy...\x1b[0m               \x1b[36m║\x1b[0m');
  console.log('\x1b[36m╚══════════════════════════════════════════╝\x1b[0m');
  console.log('');

  // Initialize data
  initializeData();

  // Start process monitor
  const settings = readData('settings.json', {});
  if (settings.monitoringEnabled !== false) {
    processMonitor.start();
  }

  log(EventType.SYSTEM, `PC Guardian khởi động trên port ${PORT}`);

  // Start cloud sync (every 5 minutes)
  cloudSync.startAutoSync(5);

  // Start download watcher - auto-block new .exe files
  downloadWatcher.start();

  // Apply blocked websites to Windows hosts file
  const websiteRoutes = require('./src/api/websiteRoutes');
  websiteRoutes.applyBackgroundBlocks();
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n\x1b[35m[PC Guardian]\x1b[0m Đang tắt...');
  processMonitor.stop();
  process.exit(0);
});

process.on('SIGTERM', () => {
  processMonitor.stop();
  process.exit(0);
});
