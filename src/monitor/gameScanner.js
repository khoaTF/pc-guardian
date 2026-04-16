/**
 * Game Scanner - Quét máy tính tìm game đã cài đặt
 * 
 * Phương pháp quét:
 * 1. Quét thư mục phổ biến (Desktop, Downloads, Program Files...)
 * 2. Phát hiện game engine (Unity, Unreal, Godot...)
 * 3. Quét registry tìm apps đã cài
 * 4. Quét process đang chạy
 * 5. Phát hiện file .exe lớn (>50MB) - khả năng cao là game
 */
const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

// Keywords cho biết đây là game hoặc launcher
const GAME_KEYWORDS = [
  'game', 'play', 'launcher', 'steam', 'epic', 'origin', 'uplay', 'ubisoft',
  'riot', 'blizzard', 'battle.net', 'garena', 'minecraft', 'fortnite',
  'valorant', 'roblox', 'genshin', 'pubg', 'apex', 'dota', 'league',
  'overwatch', 'gta', 'fifa', 'nba', 'pes', 'call of duty', 'cod',
  'csgo', 'counter-strike', 'diablo', 'warcraft', 'starcraft',
  'honkai', 'wuthering', 'zenless', 'arknights', 'tower of fantasy',
  'ragnarok', 'lineage', 'mu online', 'crossfire', 'point blank',
  'left 4 dead', 'half-life', 'portal', 'skyrim', 'fallout',
  'cyberpunk', 'witcher', 'assassin', 'far cry', 'watch dogs',
  'need for speed', 'nfs', 'racing', 'simulator', 'tycoon',
  'emulator', 'bluestacks', 'nox', 'ldplayer', 'memu', 'gameloop',
  'ppsspp', 'dolphin', 'cemu', 'yuzu', 'ryujinx', 'pcsx2', 'rpcs3',
  'cheat', 'hack', 'trainer', 'mod', 'crack'
];

// File patterns indicating game engines
const GAME_ENGINE_FILES = [
  'UnityPlayer.dll',        // Unity games
  'UnityCrashHandler64.exe',
  'UE4-Win64-Shipping.exe', // Unreal Engine 4
  'UE4Prereqs-Win64.exe',
  'Engine.dll',             // Various engines
  'steam_api.dll',          // Steam games
  'steam_api64.dll',
  'steamclient.dll',
  'GameAssembly.dll',       // Unity IL2CPP
  'libEGL.dll',             // Chromium-based (Electron game launchers)
  'GameOverlayRenderer.dll', // Steam overlay
  'dxgi.dll',               // DirectX (common in games)
  'xinput1_3.dll',          // XInput (gamepad)
  'PhysX3_x64.dll',        // PhysX physics engine
  'fmodex.dll',             // FMOD audio (common in games)
  'bink2w64.dll',           // Bink video (common in AAA games)
];

// Common game install paths
function getGameScanPaths() {
  const home = os.homedir();
  const drives = ['C:', 'D:', 'E:', 'F:', 'G:'];
  
  const paths = [
    path.join(home, 'Desktop'),
    path.join(home, 'Downloads'),
    path.join(home, 'Documents'),
    path.join(home, 'AppData', 'Local'),
    path.join(home, 'AppData', 'Local', 'Programs'),
  ];

  drives.forEach(d => {
    paths.push(
      path.join(d, '\\Program Files'),
      path.join(d, '\\Program Files (x86)'),
      path.join(d, '\\Games'),
      path.join(d, '\\Game'),
      path.join(d, '\\SteamLibrary'),
      path.join(d, '\\Steam'),
      path.join(d, '\\EpicGames'),
      path.join(d, '\\Riot Games'),
      path.join(d, '\\Garena'),
      path.join(d, '\\Origin Games'),
      path.join(d, '\\Ubisoft'),
      path.join(d, '\\GOG Games'),
      path.join(d, '\\Battle.net'),
    );
  });

  return paths.filter(p => {
    try { return fs.existsSync(p); } catch { return false; }
  });
}

// Ignore list - system and known non-game apps
const IGNORE_PATTERNS = [
  'windows', 'microsoft', 'system32', 'syswow64', 'winsxs',
  'node_modules', '.git', 'npm', 'chrome', 'firefox', 'edge',
  'office', 'adobe', 'java', 'python', '7-zip', 'winrar',
  'notepad', 'vscode', 'visual studio', 'android', 'sdk',
  'driver', 'intel', 'nvidia', 'amd', 'realtek',
  'pc guardian', 'pc-guardian',
  'common files', 'internet explorer', 'windows defender',
  'windows mail', 'windows media', 'windows nt', 'windowsapps',
];

function shouldIgnore(filePath) {
  const lower = filePath.toLowerCase();
  return IGNORE_PATTERNS.some(p => lower.includes(p));
}

/**
 * Quét thư mục tìm .exe files nghi ngờ là game
 */
function scanDirectory(dirPath, maxDepth = 3, currentDepth = 0) {
  const results = [];
  if (currentDepth >= maxDepth || shouldIgnore(dirPath)) return results;

  try {
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });
    
    let hasGameEngine = false;
    const exeFiles = [];

    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);
      
      if (entry.isDirectory()) {
        // Recurse into subdirectories
        results.push(...scanDirectory(fullPath, maxDepth, currentDepth + 1));
      } else if (entry.isFile()) {
        const name = entry.name.toLowerCase();
        
        // Check for game engine indicators
        if (GAME_ENGINE_FILES.some(gf => name === gf.toLowerCase())) {
          hasGameEngine = true;
        }

        // Collect .exe files
        if (name.endsWith('.exe')) {
          try {
            const stats = fs.statSync(fullPath);
            exeFiles.push({
              name: entry.name,
              path: fullPath,
              size: stats.size,
              modified: stats.mtime
            });
          } catch {}
        }
      }
    }

    // Analyze exe files
    for (const exe of exeFiles) {
      const nameLC = exe.name.toLowerCase().replace('.exe', '');
      const dirName = path.basename(dirPath).toLowerCase();
      const sizeMB = exe.size / (1024 * 1024);

      let confidence = 0;
      let reasons = [];

      // Check game keywords in filename or directory
      if (GAME_KEYWORDS.some(k => nameLC.includes(k) || dirName.includes(k))) {
        confidence += 40;
        reasons.push('Tên chứa keyword game');
      }

      // Game engine detected in same folder
      if (hasGameEngine) {
        confidence += 50;
        reasons.push('Phát hiện game engine');
      }

      // Large exe file (>50MB likely game, >200MB very likely)
      if (sizeMB > 200) {
        confidence += 30;
        reasons.push(`File lớn (${sizeMB.toFixed(0)}MB)`);
      } else if (sizeMB > 50) {
        confidence += 15;
        reasons.push(`File khá lớn (${sizeMB.toFixed(0)}MB)`);
      }

      // Shipping/Client in name (common game pattern)
      if (nameLC.includes('shipping') || nameLC.includes('client') || nameLC.includes('launcher')) {
        confidence += 20;
        reasons.push('Pattern tên game');
      }

      // Only report if confidence is meaningful
      if (confidence >= 30) {
        results.push({
          name: exe.name.replace('.exe', ''),
          processName: exe.name,
          path: exe.path,
          directory: dirPath,
          folderName: path.basename(dirPath),
          sizeMB: Math.round(sizeMB),
          confidence: Math.min(confidence, 100),
          reasons,
          modified: exe.modified
        });
      }
    }
  } catch (err) {
    // Access denied or other errors - skip
  }

  return results;
}

/**
 * Quét registry tìm apps đã cài đặt
 */
function scanRegistry() {
  return new Promise((resolve) => {
    const regKeys = [
      'HKLM\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall',
      'HKLM\\SOFTWARE\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall',
      'HKCU\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall'
    ];

    let allApps = [];
    let completed = 0;

    regKeys.forEach(key => {
      exec(`reg query "${key}" /s /v DisplayName 2>nul`, { maxBuffer: 10 * 1024 * 1024 }, (err, stdout) => {
        if (!err && stdout) {
          const lines = stdout.split('\n');
          for (const line of lines) {
            const match = line.match(/DisplayName\s+REG_SZ\s+(.+)/i);
            if (match) {
              const appName = match[1].trim();
              const appLC = appName.toLowerCase();
              if (GAME_KEYWORDS.some(k => appLC.includes(k)) && !shouldIgnore(appLC)) {
                allApps.push({ name: appName, source: 'registry' });
              }
            }
          }
        }
        completed++;
        if (completed === regKeys.length) {
          // Deduplicate
          const unique = [...new Map(allApps.map(a => [a.name, a])).values()];
          resolve(unique);
        }
      });
    });
  });
}

/**
 * Quét tất cả process đang chạy, phát hiện game
 */
function scanRunningProcesses() {
  return new Promise((resolve) => {
    exec('wmic process get ProcessId,Name,ExecutablePath /format:csv 2>nul', 
      { maxBuffer: 5 * 1024 * 1024 }, (err, stdout) => {
      if (err) return resolve([]);

      const processes = [];
      const lines = stdout.trim().split('\n').slice(1); // skip header

      for (const line of lines) {
        const parts = line.trim().split(',');
        if (parts.length < 4) continue;
        
        const exePath = parts[1] || '';
        const name = parts[2] || '';
        
        if (!name || !exePath || shouldIgnore(exePath)) continue;
        
        const nameLC = name.toLowerCase().replace('.exe', '');
        const pathLC = exePath.toLowerCase();

        if (GAME_KEYWORDS.some(k => nameLC.includes(k) || pathLC.includes(k))) {
          processes.push({
            name: name.replace('.exe', ''),
            processName: name,
            path: exePath,
            source: 'running',
            confidence: 60,
            reasons: ['Đang chạy, tên nghi ngờ là game']
          });
        }
      }

      // Deduplicate by process name
      const unique = [...new Map(processes.map(p => [p.processName, p])).values()];
      resolve(unique);
    });
  });
}

/**
 * Quét toàn bộ máy tính - tìm tất cả game
 */
async function fullScan(existingProcessNames = []) {
  console.log('[GameScanner] 🔍 Bắt đầu quét máy tính...');
  const startTime = Date.now();

  // 1. Scan directories
  const scanPaths = getGameScanPaths();
  console.log(`[GameScanner] Quét ${scanPaths.length} thư mục...`);
  
  let allExeResults = [];
  for (const scanPath of scanPaths) {
    const results = scanDirectory(scanPath, 4);
    allExeResults.push(...results);
  }

  // 2. Scan registry
  console.log('[GameScanner] Quét Registry...');
  const registryApps = await scanRegistry();

  // 3. Scan running processes
  console.log('[GameScanner] Quét process đang chạy...');
  const runningGames = await scanRunningProcesses();

  // Merge all results
  const allResults = [...allExeResults, ...runningGames];

  // Deduplicate by process name
  const seen = new Set();
  const deduped = allResults.filter(r => {
    const key = r.processName.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  // Sort by confidence descending
  deduped.sort((a, b) => b.confidence - a.confidence);

  // Filter out already-blocked games
  const existingSet = new Set(existingProcessNames.map(p => p.toLowerCase()));
  const newDiscoveries = deduped.filter(r => !existingSet.has(r.processName.toLowerCase()));

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`[GameScanner] ✅ Quét xong trong ${elapsed}s - Tìm thấy ${newDiscoveries.length} game mới`);

  return {
    discovered: newDiscoveries,
    registryApps,
    totalScanned: scanPaths.length,
    elapsedSeconds: parseFloat(elapsed),
    timestamp: new Date().toISOString()
  };
}

/**
 * Quick scan - chỉ quét process đang chạy + Desktop/Downloads
 */
async function quickScan(existingProcessNames = []) {
  console.log('[GameScanner] ⚡ Quick scan...');
  const startTime = Date.now();
  const home = os.homedir();

  const quickPaths = [
    path.join(home, 'Desktop'),
    path.join(home, 'Downloads'),
  ].filter(p => { try { return fs.existsSync(p); } catch { return false; } });

  let results = [];
  for (const p of quickPaths) {
    results.push(...scanDirectory(p, 2));
  }

  const running = await scanRunningProcesses();
  results.push(...running);

  // Deduplicate
  const seen = new Set();
  results = results.filter(r => {
    const key = r.processName.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  const existingSet = new Set(existingProcessNames.map(p => p.toLowerCase()));
  const newDiscoveries = results.filter(r => !existingSet.has(r.processName.toLowerCase()));

  newDiscoveries.sort((a, b) => b.confidence - a.confidence);

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`[GameScanner] ⚡ Quick scan xong: ${newDiscoveries.length} phát hiện mới`);

  return {
    discovered: newDiscoveries,
    registryApps: [],
    totalScanned: quickPaths.length,
    elapsedSeconds: parseFloat(elapsed),
    timestamp: new Date().toISOString()
  };
}

module.exports = { fullScan, quickScan, scanRunningProcesses };
