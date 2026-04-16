/**
 * Download Watcher - Giám sát thư mục Downloads/Desktop
 * Tự động thêm .exe mới vào danh sách chặn
 * 
 * Khi trẻ tải game/app về → phát hiện ngay → tự động chặn
 */
const fs = require('fs');
const path = require('path');
const os = require('os');
const { readData, writeData } = require('../utils/storage');
const { log, EventType } = require('../utils/logger');

// Thư mục giám sát
const WATCH_DIRS = [
  path.join(os.homedir(), 'Downloads'),
  path.join(os.homedir(), 'Desktop'),
  path.join(os.homedir(), 'Documents'),
];

// Whitelist - không chặn những file này
const WHITELIST = [
  'pc guardian', 'pc-guardian', 'pcguardian',
  'chrome', 'firefox', 'edge', 'brave',
  'vscode', 'code', 'notepad', 'winrar', '7z',
  'node', 'npm', 'git', 'python', 'java',
  'zoom', 'teams', 'skype',
  'setup', 'install', 'unins', 'update',
  'driver', 'realtek', 'intel', 'nvidia', 'amd',
];

// Extensions that should auto-block (chỉ file thực thi)
const BLOCK_EXTENSIONS = ['.exe'];

// Debounce - tránh spam khi file đang tải
const recentlyProcessed = new Map();
const DEBOUNCE_MS = 5000;

let watchers = [];
let isRunning = false;
let autoBlockEnabled = true;
let blockedCount = 0;

/**
 * Kiểm tra file có nên bỏ qua không
 */
function shouldIgnore(filename) {
  const lower = filename.toLowerCase();
  
  // Bỏ qua file tạm
  if (lower.endsWith('.tmp') || lower.endsWith('.crdownload') || lower.endsWith('.part')) {
    return true;
  }
  
  // Bỏ qua whitelist
  if (WHITELIST.some(w => lower.includes(w))) {
    return true;
  }

  // Bỏ qua file quá nhỏ (<1MB) - thường là utility, không phải game
  return false;
}

/**
 * Xử lý file mới xuất hiện
 */
function handleNewFile(directory, filename) {
  const ext = path.extname(filename).toLowerCase();
  if (!BLOCK_EXTENSIONS.includes(ext)) return;
  if (shouldIgnore(filename)) return;

  // Debounce - tránh xử lý trùng
  const key = filename.toLowerCase();
  const now = Date.now();
  if (recentlyProcessed.has(key) && now - recentlyProcessed.get(key) < DEBOUNCE_MS) {
    return;
  }
  recentlyProcessed.set(key, now);

  // Đợi file tải xong (check kích thước ổn định)
  const filePath = path.join(directory, filename);
  waitForFileComplete(filePath, () => {
    if (!autoBlockEnabled) return;

    const gameName = filename.replace(/\.exe$/i, '').replace(/[_-]/g, ' ');
    const processName = filename;

    // Kiểm tra đã có trong danh sách chưa
    const games = readData('blocked-games.json', []);
    const exists = games.some(g =>
      g.processNames && g.processNames.some(p => p.toLowerCase() === processName.toLowerCase())
    );

    if (exists) return;

    // Kiểm tra kích thước file
    let sizeMB = 0;
    try {
      const stats = fs.statSync(filePath);
      sizeMB = stats.size / (1024 * 1024);
    } catch { return; }

    // File < 2MB thường không phải game
    if (sizeMB < 2) return;

    // Thêm vào danh sách chặn
    const newGame = {
      id: `auto_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
      name: `📥 ${gameName}`,
      processNames: [processName],
      category: 'Tải về',
      icon: '📥',
      enabled: true,
      addedAt: new Date().toISOString(),
      isCustom: true,
      autoDetected: true,
      detectedPath: filePath,
      sizeMB: Math.round(sizeMB)
    };

    games.push(newGame);
    writeData('blocked-games.json', games);
    blockedCount++;

    log(EventType.SYSTEM, `Tự động chặn file tải về: ${filename} (${Math.round(sizeMB)}MB)`, {
      path: filePath,
      sizeMB: Math.round(sizeMB)
    });

    console.log(`[DownloadWatcher] 🚫 Tự động chặn: ${filename} (${Math.round(sizeMB)}MB)`);
  });
}

/**
 * Đợi file tải xong (kích thước không thay đổi sau 2 giây)
 */
function waitForFileComplete(filePath, callback, attempts = 0) {
  if (attempts > 15) return; // Timeout 30 giây

  try {
    const size1 = fs.statSync(filePath).size;
    setTimeout(() => {
      try {
        const size2 = fs.statSync(filePath).size;
        if (size1 === size2 && size2 > 0) {
          callback(); // File ổn định
        } else {
          waitForFileComplete(filePath, callback, attempts + 1);
        }
      } catch {
        // File bị xóa hoặc di chuyển
      }
    }, 2000);
  } catch {
    // File chưa tồn tại
    if (attempts < 5) {
      setTimeout(() => waitForFileComplete(filePath, callback, attempts + 1), 2000);
    }
  }
}

/**
 * Quét thư mục hiện tại tìm .exe chưa chặn
 */
function scanExistingFiles(directory) {
  try {
    const files = fs.readdirSync(directory);
    const games = readData('blocked-games.json', []);
    const existingProcesses = new Set(
      games.flatMap(g => (g.processNames || []).map(p => p.toLowerCase()))
    );

    let added = 0;
    for (const filename of files) {
      const ext = path.extname(filename).toLowerCase();
      if (!BLOCK_EXTENSIONS.includes(ext)) continue;
      if (shouldIgnore(filename)) continue;
      if (existingProcesses.has(filename.toLowerCase())) continue;

      const filePath = path.join(directory, filename);
      let sizeMB = 0;
      try {
        sizeMB = fs.statSync(filePath).size / (1024 * 1024);
      } catch { continue; }

      if (sizeMB < 2) continue;

      const gameName = filename.replace(/\.exe$/i, '').replace(/[_-]/g, ' ');
      games.push({
        id: `auto_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}_${added}`,
        name: `📥 ${gameName}`,
        processNames: [filename],
        category: 'Tải về',
        icon: '📥',
        enabled: true,
        addedAt: new Date().toISOString(),
        isCustom: true,
        autoDetected: true,
        detectedPath: filePath,
        sizeMB: Math.round(sizeMB)
      });
      existingProcesses.add(filename.toLowerCase());
      added++;
    }

    if (added > 0) {
      writeData('blocked-games.json', games);
      console.log(`[DownloadWatcher] Quét ${directory}: thêm ${added} file .exe vào danh sách chặn`);
    }
    return added;
  } catch {
    return 0;
  }
}

/**
 * Bắt đầu giám sát
 */
function start() {
  if (isRunning) return;
  isRunning = true;
  blockedCount = 0;

  // Quét file hiện có trước
  let totalAdded = 0;
  for (const dir of WATCH_DIRS) {
    if (fs.existsSync(dir)) {
      totalAdded += scanExistingFiles(dir);
    }
  }
  if (totalAdded > 0) {
    console.log(`[DownloadWatcher] 🔍 Quét lần đầu: thêm ${totalAdded} file .exe`);
  }

  // Bắt đầu watch
  for (const dir of WATCH_DIRS) {
    if (!fs.existsSync(dir)) continue;

    try {
      const watcher = fs.watch(dir, { persistent: false }, (eventType, filename) => {
        if (!filename || eventType !== 'rename') return;
        // 'rename' fires when new file appears
        handleNewFile(dir, filename);
      });

      watcher.on('error', (err) => {
        console.log(`[DownloadWatcher] Lỗi watch ${dir}:`, err.message);
      });

      watchers.push(watcher);
      console.log(`[DownloadWatcher] 👁️ Giám sát: ${dir}`);
    } catch (err) {
      console.log(`[DownloadWatcher] Không thể watch ${dir}:`, err.message);
    }
  }

  console.log(`[DownloadWatcher] ✅ Đang giám sát ${watchers.length} thư mục`);
}

/**
 * Dừng giám sát
 */
function stop() {
  for (const w of watchers) {
    try { w.close(); } catch {}
  }
  watchers = [];
  isRunning = false;
  console.log('[DownloadWatcher] ⏹️ Đã dừng');
}

/**
 * Bật/tắt auto-block
 */
function setAutoBlock(enabled) {
  autoBlockEnabled = enabled;
}

/**
 * Lấy trạng thái
 */
function getStatus() {
  return {
    running: isRunning,
    autoBlockEnabled,
    watchedDirs: WATCH_DIRS.filter(d => { try { return fs.existsSync(d); } catch { return false; } }),
    blockedCount
  };
}

module.exports = { start, stop, setAutoBlock, getStatus };
