/**
 * Cloud Sync Module - Đồng bộ danh sách game từ Supabase Cloud
 * 
 * Hoạt động:
 * - App chạy OFFLINE hoàn toàn bình thường
 * - Khi có mạng, tự động đồng bộ danh sách game từ cloud
 * - Phụ huynh quản lý từ xa qua trang web
 */
const https = require('https');
const { readData, writeData } = require('../utils/storage');
const { log, EventType } = require('../utils/logger');

// Supabase config
const SUPABASE_URL = 'https://wmdudwrlceisphoopeed.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndtZHVkd3JsY2Vpc3Bob29wZWVkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYzMDEyNjEsImV4cCI6MjA5MTg3NzI2MX0.es6KmwmTpoPQI1e67TPO4ISQpkTRwmydqC26nn0Tcq8';

let syncInterval = null;
let lastSyncTime = null;

/**
 * Gọi Supabase REST API
 */
function supabaseRequest(endpoint, options = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(`/rest/v1/${endpoint}`, SUPABASE_URL);
    
    const reqOptions = {
      hostname: url.hostname,
      path: url.pathname + url.search,
      method: options.method || 'GET',
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': options.prefer || 'return=representation',
        ...options.headers
      },
      timeout: 10000
    };

    const req = https.request(reqOptions, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(data) });
        } catch {
          resolve({ status: res.statusCode, data });
        }
      });
    });

    req.on('error', (err) => reject(err));
    req.on('timeout', () => { req.destroy(); reject(new Error('Timeout')); });

    if (options.body) {
      req.write(JSON.stringify(options.body));
    }
    req.end();
  });
}

/**
 * Kiểm tra kết nối internet
 */
function checkInternet() {
  return new Promise((resolve) => {
    const req = https.get('https://www.google.com', { timeout: 5000 }, (res) => {
      resolve(res.statusCode === 200 || res.statusCode === 301);
    });
    req.on('error', () => resolve(false));
    req.on('timeout', () => { req.destroy(); resolve(false); });
  });
}

/**
 * Tải danh sách game từ cloud
 */
async function fetchCloudGames() {
  try {
    const res = await supabaseRequest('blocked_games?select=*&order=name');
    if (res.status === 200 && Array.isArray(res.data)) {
      return res.data.map(g => ({
        id: g.id,
        name: g.name,
        processNames: g.process_names,
        category: g.category || 'Khác',
        icon: g.icon || '🎮',
        enabled: g.enabled !== false
      }));
    }
    return null;
  } catch (err) {
    console.log('[CloudSync] Không thể tải từ cloud:', err.message);
    return null;
  }
}

/**
 * Đồng bộ: Cloud → Local
 * Merge danh sách cloud vào local (ưu tiên cloud)
 */
async function syncFromCloud() {
  const online = await checkInternet();
  if (!online) {
    console.log('[CloudSync] Offline - bỏ qua đồng bộ');
    return { synced: false, reason: 'offline' };
  }

  try {
    const cloudGames = await fetchCloudGames();
    if (!cloudGames) {
      return { synced: false, reason: 'fetch_failed' };
    }

    const localGames = readData('games.json', []);
    
    // Tạo map từ cloud games theo tên (tránh trùng)
    const cloudMap = new Map();
    cloudGames.forEach(g => cloudMap.set(g.name.toLowerCase(), g));

    // Merge: giữ local games không có trên cloud, cập nhật/thêm từ cloud
    const mergedGames = [];
    const addedGames = [];
    const updatedGames = [];

    // Thêm tất cả game từ cloud
    cloudGames.forEach(cg => {
      const localMatch = localGames.find(lg => 
        lg.name.toLowerCase() === cg.name.toLowerCase()
      );
      
      if (localMatch) {
        // Game tồn tại - cập nhật từ cloud
        mergedGames.push({
          ...localMatch,
          name: cg.name,
          processNames: cg.processNames,
          category: cg.category,
          icon: cg.icon,
          enabled: cg.enabled
        });
        if (JSON.stringify(localMatch.processNames) !== JSON.stringify(cg.processNames)) {
          updatedGames.push(cg.name);
        }
      } else {
        // Game mới từ cloud
        mergedGames.push(cg);
        addedGames.push(cg.name);
      }
    });

    // Giữ local games unique (không có trên cloud)
    localGames.forEach(lg => {
      if (!cloudMap.has(lg.name.toLowerCase())) {
        mergedGames.push(lg);
      }
    });

    // Lưu danh sách merged
    writeData('games.json', mergedGames);
    
    // Lưu thời gian sync
    lastSyncTime = new Date().toISOString();
    const syncInfo = readData('sync-info.json', {});
    syncInfo.lastSync = lastSyncTime;
    syncInfo.cloudGamesCount = cloudGames.length;
    syncInfo.localGamesCount = mergedGames.length;
    writeData('sync-info.json', syncInfo);

    // Log
    if (addedGames.length > 0 || updatedGames.length > 0) {
      log(EventType.SYSTEM, `Cloud sync: +${addedGames.length} mới, ~${updatedGames.length} cập nhật`, {
        added: addedGames,
        updated: updatedGames
      });
    }

    console.log(`[CloudSync] ✅ Đồng bộ thành công: ${mergedGames.length} games (${addedGames.length} mới)`);
    
    return {
      synced: true,
      total: mergedGames.length,
      added: addedGames.length,
      updated: updatedGames.length
    };
  } catch (err) {
    console.log('[CloudSync] Lỗi đồng bộ:', err.message);
    return { synced: false, reason: err.message };
  }
}

/**
 * Upload local games → Cloud
 */
async function pushToCloud() {
  const online = await checkInternet();
  if (!online) return { pushed: false, reason: 'offline' };

  try {
    const localGames = readData('games.json', []);
    
    // Xóa tất cả games trên cloud
    await supabaseRequest('blocked_games?id=not.is.null', { 
      method: 'DELETE',
      headers: { 'Prefer': 'return=minimal' }
    });

    // Upload local games
    const cloudData = localGames.map(g => ({
      name: g.name,
      process_names: g.processNames,
      category: g.category || 'Khác',
      icon: g.icon || '🎮',
      enabled: g.enabled !== false
    }));

    if (cloudData.length > 0) {
      await supabaseRequest('blocked_games', {
        method: 'POST',
        body: cloudData
      });
    }

    log(EventType.SYSTEM, `Đã upload ${cloudData.length} games lên cloud`);
    console.log(`[CloudSync] ✅ Upload thành công: ${cloudData.length} games`);
    
    return { pushed: true, count: cloudData.length };
  } catch (err) {
    console.log('[CloudSync] Lỗi upload:', err.message);
    return { pushed: false, reason: err.message };
  }
}

/**
 * Bắt đầu đồng bộ tự động
 */
function startAutoSync(intervalMinutes = 5) {
  // Sync ngay lập tức
  syncFromCloud();

  // Sync định kỳ
  if (syncInterval) clearInterval(syncInterval);
  syncInterval = setInterval(() => {
    syncFromCloud();
  }, intervalMinutes * 60 * 1000);

  console.log(`[CloudSync] Auto-sync mỗi ${intervalMinutes} phút`);
}

/**
 * Dừng đồng bộ tự động
 */
function stopAutoSync() {
  if (syncInterval) {
    clearInterval(syncInterval);
    syncInterval = null;
  }
}

/**
 * Lấy trạng thái sync
 */
function getSyncStatus() {
  const syncInfo = readData('sync-info.json', {});
  return {
    lastSync: syncInfo.lastSync || null,
    cloudGamesCount: syncInfo.cloudGamesCount || 0,
    localGamesCount: syncInfo.localGamesCount || 0,
    autoSyncActive: !!syncInterval,
    supabaseUrl: SUPABASE_URL
  };
}

module.exports = {
  syncFromCloud,
  pushToCloud,
  startAutoSync,
  stopAutoSync,
  getSyncStatus,
  checkInternet
};
