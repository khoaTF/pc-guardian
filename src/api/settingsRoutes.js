const express = require('express');
const { readData, writeData } = require('../utils/storage');
const { log, EventType } = require('../utils/logger');
const processMonitor = require('../monitor/processMonitor');
const selfProtection = require('../monitor/selfProtection');

const router = express.Router();

let protectionInterval = null;

/**
 * Get all settings
 */
router.get('/', (req, res) => {
  const settings = readData('settings.json', {});
  // Don't send password hash to frontend
  const { passwordHash, ...safeSettings } = settings;
  res.json(safeSettings);
});

/**
 * Update settings
 */
router.put('/', (req, res) => {
  const settings = readData('settings.json', {});
  const updates = req.body;

  // Prevent overwriting password hash through settings
  delete updates.passwordHash;

  const newSettings = { ...settings, ...updates };
  writeData('settings.json', newSettings);

  // Apply scan interval change
  if (updates.scanInterval) {
    processMonitor.updateScanInterval(updates.scanInterval);
  }

  // Apply protection settings if changed
  if (updates.blockTaskManager !== undefined || 
      updates.blockRegedit !== undefined || 
      updates.blockCMD !== undefined ||
      updates.hideFolder !== undefined) {
    if (protectionInterval) clearInterval(protectionInterval);
    protectionInterval = selfProtection.applyProtection(newSettings);
    log(EventType.SETTINGS_CHANGED, 'Cập nhật bảo vệ hệ thống', {
      blockTaskManager: newSettings.blockTaskManager,
      blockRegedit: newSettings.blockRegedit,
      blockCMD: newSettings.blockCMD,
      hideFolder: newSettings.hideFolder
    });
  }

  log(EventType.SETTINGS_CHANGED, 'Đã cập nhật cài đặt', { changes: Object.keys(updates) });

  const { passwordHash, ...safeSettings } = newSettings;
  res.json(safeSettings);
});

/**
 * Toggle monitoring on/off
 */
router.post('/toggle-monitor', (req, res) => {
  const settings = readData('settings.json', {});
  settings.monitoringEnabled = !settings.monitoringEnabled;
  writeData('settings.json', settings);

  if (settings.monitoringEnabled) {
    processMonitor.start();
  } else {
    processMonitor.stop();
  }

  res.json({ monitoringEnabled: settings.monitoringEnabled });
});

/**
 * Get monitor status
 */
router.get('/monitor-status', (req, res) => {
  res.json(processMonitor.getStatus());
});

/**
 * Install as Windows Service
 */
router.post('/install-service', async (req, res) => {
  try {
    const { installService } = require('../../service-manager');
    await installService();
    log(EventType.SYSTEM, 'Đã cài đặt Windows Service');
    res.json({ success: true, message: 'Service đã được cài đặt' });
  } catch (err) {
    res.status(500).json({ error: 'Cần chạy với quyền Administrator', detail: err.message });
  }
});

/**
 * Uninstall Windows Service
 */
router.post('/uninstall-service', async (req, res) => {
  try {
    const { uninstallService } = require('../../service-manager');
    await uninstallService();
    log(EventType.SYSTEM, 'Đã gỡ bỏ Windows Service');
    res.json({ success: true, message: 'Service đã được gỡ bỏ' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * Remove all protection (for uninstall)
 */
router.post('/remove-protection', async (req, res) => {
  try {
    await selfProtection.removeProtection();
    if (protectionInterval) clearInterval(protectionInterval);
    
    const settings = readData('settings.json', {});
    settings.blockTaskManager = false;
    settings.blockRegedit = false;
    settings.blockCMD = false;
    settings.hideFolder = false;
    writeData('settings.json', settings);
    
    log(EventType.SYSTEM, 'Đã gỡ bỏ tất cả bảo vệ');
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Apply protection on startup
function initProtection() {
  const settings = readData('settings.json', {});
  if (settings.blockTaskManager || settings.blockRegedit || settings.blockCMD || settings.hideFolder) {
    protectionInterval = selfProtection.applyProtection(settings);
  }
}
initProtection();

module.exports = router;

