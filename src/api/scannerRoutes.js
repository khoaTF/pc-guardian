const express = require('express');
const gameScanner = require('../monitor/gameScanner');
const { readData, writeData } = require('../utils/storage');

const router = express.Router();

// Track scan status
let scanInProgress = false;
let lastScanResult = null;

/**
 * Full scan - quét toàn bộ máy tính
 */
router.post('/full', async (req, res) => {
  if (scanInProgress) {
    return res.status(409).json({ error: 'Đang quét, vui lòng đợi...' });
  }

  scanInProgress = true;
  try {
    const games = readData('blocked-games.json', []);
    const existingProcesses = games.flatMap(g => g.processNames || []);
    
    lastScanResult = await gameScanner.fullScan(existingProcesses);
    
    // Cache result
    writeData('last-scan.json', lastScanResult);
    
    res.json(lastScanResult);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
  scanInProgress = false;
});

/**
 * Quick scan - quét nhanh Desktop + Downloads + process đang chạy
 */
router.post('/quick', async (req, res) => {
  if (scanInProgress) {
    return res.status(409).json({ error: 'Đang quét, vui lòng đợi...' });
  }

  scanInProgress = true;
  try {
    const games = readData('blocked-games.json', []);
    const existingProcesses = games.flatMap(g => g.processNames || []);
    
    lastScanResult = await gameScanner.quickScan(existingProcesses);
    
    writeData('last-scan.json', lastScanResult);
    res.json(lastScanResult);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
  scanInProgress = false;
});

/**
 * Get last scan result
 */
router.get('/result', (req, res) => {
  const cached = readData('last-scan.json', null);
  res.json(cached || lastScanResult || { discovered: [], registryApps: [] });
});

/**
 * Add discovered game to blocklist
 */
router.post('/block', (req, res) => {
  const { name, processName, path: gamePath } = req.body;
  if (!name || !processName) {
    return res.status(400).json({ error: 'Thiếu tên hoặc process name' });
  }

  const games = readData('blocked-games.json', []);
  
  // Check if already exists
  const exists = games.some(g => 
    g.processNames && g.processNames.some(p => p.toLowerCase() === processName.toLowerCase())
  );
  if (exists) {
    return res.json({ added: false, reason: 'Đã có trong danh sách' });
  }

  const newGame = {
    id: `scan_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
    name,
    processNames: [processName],
    category: 'Phát hiện mới',
    icon: '🔍',
    enabled: true,
    addedAt: new Date().toISOString(),
    isCustom: true,
    detectedPath: gamePath || ''
  };

  games.push(newGame);
  writeData('blocked-games.json', games);

  res.json({ added: true, game: newGame });
});

/**
 * Block all discovered games at once
 */
router.post('/block-all', (req, res) => {
  const { discoveries } = req.body;
  if (!Array.isArray(discoveries) || !discoveries.length) {
    return res.status(400).json({ error: 'Không có game nào' });
  }

  const games = readData('blocked-games.json', []);
  const existingProcesses = new Set(
    games.flatMap(g => (g.processNames || []).map(p => p.toLowerCase()))
  );

  let addedCount = 0;
  for (const d of discoveries) {
    if (!existingProcesses.has(d.processName.toLowerCase())) {
      games.push({
        id: `scan_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
        name: d.name,
        processNames: [d.processName],
        category: 'Phát hiện mới',
        icon: '🔍',
        enabled: true,
        addedAt: new Date().toISOString(),
        isCustom: true,
        detectedPath: d.path || ''
      });
      existingProcesses.add(d.processName.toLowerCase());
      addedCount++;
    }
  }

  writeData('blocked-games.json', games);
  res.json({ added: addedCount, total: games.length });
});

/**
 * Get scan status
 */
router.get('/status', (req, res) => {
  const downloadWatcher = require('../monitor/downloadWatcher');
  res.json({
    scanning: scanInProgress,
    watcher: downloadWatcher.getStatus()
  });
});

/**
 * Toggle auto-block on/off
 */
router.post('/auto-block', (req, res) => {
  const downloadWatcher = require('../monitor/downloadWatcher');
  const { enabled } = req.body;
  downloadWatcher.setAutoBlock(enabled !== false);
  res.json({ autoBlockEnabled: enabled !== false });
});

module.exports = router;
