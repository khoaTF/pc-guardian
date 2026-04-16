const express = require('express');
const { readData, writeData } = require('../utils/storage');
const { log, EventType } = require('../utils/logger');
const processMonitor = require('../monitor/processMonitor');

const router = express.Router();

/**
 * Get all blocked games
 */
router.get('/', (req, res) => {
  const games = readData('blocked-games.json', []);
  res.json(games);
});

/**
 * Add a new game to blocked list
 */
router.post('/', (req, res) => {
  const { name, processNames, category, icon } = req.body;

  if (!name || !processNames || !processNames.length) {
    return res.status(400).json({ error: 'Cần tên game và tên process' });
  }

  const games = readData('blocked-games.json', []);

  const newGame = {
    id: Date.now().toString(36) + Math.random().toString(36).substr(2, 5),
    name,
    processNames: Array.isArray(processNames) ? processNames : [processNames],
    category: category || 'Khác',
    icon: icon || '🎮',
    enabled: true,
    addedAt: new Date().toISOString(),
    isCustom: true
  };

  games.push(newGame);
  writeData('blocked-games.json', games);

  log(EventType.GAME_LIST_CHANGED, `Đã thêm game: ${name}`, { gameName: name });

  res.json(newGame);
});

/**
 * Update a game
 */
router.put('/:id', (req, res) => {
  const { id } = req.params;
  const updates = req.body;
  const games = readData('blocked-games.json', []);
  const index = games.findIndex(g => g.id === id);

  if (index === -1) {
    return res.status(404).json({ error: 'Không tìm thấy game' });
  }

  games[index] = { ...games[index], ...updates, id };
  writeData('blocked-games.json', games);

  res.json(games[index]);
});

/**
 * Toggle game enabled/disabled
 */
router.put('/:id/toggle', (req, res) => {
  const { id } = req.params;
  const games = readData('blocked-games.json', []);
  const game = games.find(g => g.id === id);

  if (!game) {
    return res.status(404).json({ error: 'Không tìm thấy game' });
  }

  game.enabled = !game.enabled;
  writeData('blocked-games.json', games);

  log(EventType.GAME_LIST_CHANGED,
    `${game.enabled ? 'Bật' : 'Tắt'} chặn: ${game.name}`,
    { gameName: game.name, enabled: game.enabled }
  );

  res.json(game);
});

/**
 * Delete a game from blocked list
 */
router.delete('/:id', (req, res) => {
  const { id } = req.params;
  const games = readData('blocked-games.json', []);
  const game = games.find(g => g.id === id);

  if (!game) {
    return res.status(404).json({ error: 'Không tìm thấy game' });
  }

  const filtered = games.filter(g => g.id !== id);
  writeData('blocked-games.json', filtered);

  log(EventType.GAME_LIST_CHANGED, `Đã xóa game: ${game.name}`, { gameName: game.name });

  res.json({ success: true });
});

/**
 * Get running processes (for "Add from running" feature)
 */
router.get('/running', async (req, res) => {
  try {
    const processes = await processMonitor.getDetailedProcesses();
    res.json(processes);
  } catch (err) {
    res.status(500).json({ error: 'Không thể lấy danh sách process' });
  }
});

/**
 * Initialize default games (called once on first setup)
 */
router.post('/init-defaults', (req, res) => {
  const existing = readData('blocked-games.json', null);
  if (existing && existing.length > 0) {
    return res.json({ message: 'Danh sách game đã tồn tại', games: existing });
  }

  const defaults = require('../../config/default-games.json');
  const games = defaults.map((g, i) => ({
    ...g,
    id: `default_${i}_${Date.now().toString(36)}`,
    enabled: true,
    addedAt: new Date().toISOString(),
    isCustom: false
  }));

  writeData('blocked-games.json', games);
  log(EventType.GAME_LIST_CHANGED, `Đã khởi tạo ${games.length} game mặc định`);

  res.json({ message: `Đã thêm ${games.length} game mặc định`, games });
});

module.exports = router;
