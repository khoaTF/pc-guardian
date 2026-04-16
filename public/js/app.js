// ===========================
// PC Guardian - Dashboard App
// ===========================

const API_BASE = '/api';
let authToken = localStorage.getItem('pcg_token');
let currentSection = 'overview';
let currentLogPage = 1;
let allGames = [];

// =====================
// AUTH & API HELPERS
// =====================

async function api(path, options = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'x-auth-token': authToken,
      ...(options.headers || {})
    }
  });

  if (res.status === 401) {
    localStorage.removeItem('pcg_token');
    window.location.href = '/login.html';
    return null;
  }

  if (res.status === 403) {
    window.location.href = '/activate.html';
    return null;
  }

  return res;
}

// Check auth on load
(async function init() {
  if (!authToken) {
    window.location.href = '/login.html';
    return;
  }

  try {
    const res = await api('/auth/status');
    if (!res || !res.ok) {
      window.location.href = '/login.html';
      return;
    }
    
    // Check License Status
    const licRes = await fetch(`${API_BASE}/auth/license`);
    const licData = await licRes.json();
    if (licData.isExpired) {
      window.location.href = '/activate.html';
      return;
    }
  } catch {
    window.location.href = '/login.html';
    return;
  }

  // Load dashboard
  loadDashboard();
  loadSettings();

  // Auto-refresh every 10 seconds
  setInterval(() => {
    if (currentSection === 'overview') loadDashboard();
  }, 10000);
})();

// =====================
// NAVIGATION
// =====================

document.querySelectorAll('.nav-item[data-section]').forEach(btn => {
  btn.addEventListener('click', () => {
    const section = btn.dataset.section;
    switchSection(section);
  });
});

function switchSection(section) {
  currentSection = section;

  // Update nav
  document.querySelectorAll('.nav-item[data-section]').forEach(n => n.classList.remove('active'));
  document.querySelector(`[data-section="${section}"]`)?.classList.add('active');

  // Show section
  document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
  document.getElementById(`section${capitalize(section)}`)?.classList.add('active');

  // Load data
  switch(section) {
    case 'overview': loadDashboard(); break;
    case 'games': loadGames(); break;
    case 'websites': loadWebsites(); break;
    case 'schedule': loadSchedules(); break;
    case 'logs': loadLogs(); break;
    case 'settings': loadSettings(); break;
  }
}

function capitalize(s) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// =====================
// OVERVIEW / DASHBOARD
// =====================

async function loadDashboard() {
  await Promise.all([loadStats(), loadMonitorStatus()]);
}

async function refreshDashboard() {
  showToast('Đang làm mới...', 'info');
  await loadDashboard();
}

async function loadStats() {
  try {
    const res = await api('/logs/stats');
    const stats = await res.json();

    document.getElementById('statBlocked').textContent = stats.blockedToday;

    const gamesRes = await api('/games');
    const games = await gamesRes.json();
    allGames = games;
    document.getElementById('statGames').textContent = games.length;
    document.getElementById('gameCount').textContent = games.filter(g => g.enabled).length;

    // Weekly chart
    renderWeeklyChart(stats.last7Days);

    // Top blocked
    renderTopBlocked(stats.topBlocked);

    // Recent blocks
    renderRecentBlocks(stats.recentBlocks);

  } catch (err) {
    console.error('Error loading stats:', err);
  }
}

async function loadMonitorStatus() {
  try {
    const res = await api('/settings/monitor-status');
    const status = await res.json();

    const dot = document.getElementById('statusDot');
    const label = document.getElementById('monitorLabel');
    const statStatus = document.getElementById('statStatus');
    const statUptime = document.getElementById('statUptime');

    if (status.isRunning) {
      dot.className = 'status-dot active';
      label.textContent = 'Đang giám sát';
      statStatus.textContent = 'Bật';
      statStatus.style.color = 'var(--accent-green)';

      // Calculate uptime
      const uptimeMs = status.uptime;
      const hours = Math.floor(uptimeMs / 3600000);
      const mins = Math.floor((uptimeMs % 3600000) / 60000);
      statUptime.textContent = `${hours}h ${mins}m`;
    } else {
      dot.className = 'status-dot inactive';
      label.textContent = 'Đã dừng';
      statStatus.textContent = 'Tắt';
      statStatus.style.color = 'var(--accent-red)';
      statUptime.textContent = '--';
    }

    // Update settings toggle
    const settingToggle = document.getElementById('settingMonitoring');
    if (settingToggle) settingToggle.checked = status.isRunning;
  } catch (err) {
    console.error('Error loading monitor status:', err);
  }
}

function renderWeeklyChart(days) {
  const container = document.getElementById('weeklyChart');
  if (!days || !days.length) return;

  const maxVal = Math.max(...days.map(d => d.blocked), 1);

  container.innerHTML = days.map(d => {
    const height = Math.max((d.blocked / maxVal) * 100, 5);
    return `
      <div class="bar-item">
        <span class="bar-value">${d.blocked}</span>
        <div class="bar" style="height: ${height}%" title="${d.blocked} lần chặn"></div>
        <span class="bar-label">${d.dayName}</span>
      </div>
    `;
  }).join('');
}

function renderTopBlocked(items) {
  const container = document.getElementById('topBlockedList');
  if (!items || !items.length) {
    container.innerHTML = '<div class="empty-state"><p>Chưa có dữ liệu</p></div>';
    return;
  }

  container.innerHTML = items.map((item, i) => `
    <div class="top-item">
      <div class="top-rank">${i + 1}</div>
      <div class="name">${item.name}</div>
      <div class="count">${item.count} lần</div>
    </div>
  `).join('');
}

function renderRecentBlocks(blocks) {
  const container = document.getElementById('recentBlocks');
  if (!blocks || !blocks.length) {
    container.innerHTML = '<div class="empty-state"><p>Chưa có vi phạm nào hôm nay 🎉</p></div>';
    return;
  }

  container.innerHTML = blocks.map(b => {
    const time = new Date(b.timestamp).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
    return `
      <div class="recent-block-item">
        <span class="time">${time}</span>
        <span>🚫</span>
        <span class="name">${b.message}</span>
      </div>
    `;
  }).join('');
}

// =====================
// GAMES
// =====================

async function loadGames() {
  try {
    const res = await api('/games');
    allGames = await res.json();
    renderGames(allGames);
    renderCategoryFilters(allGames);
  } catch (err) {
    console.error('Error loading games:', err);
  }
}

function renderGames(games) {
  const container = document.getElementById('gameList');
  const search = document.getElementById('gameSearch').value.toLowerCase();

  let filtered = games;
  if (search) {
    filtered = games.filter(g =>
      g.name.toLowerCase().includes(search) ||
      g.processNames.some(p => p.toLowerCase().includes(search))
    );
  }

  if (!filtered.length) {
    container.innerHTML = `
      <div class="empty-state" style="grid-column:1/-1">
        <div class="icon">🎮</div>
        <h3>Không tìm thấy game</h3>
        <p>Thử tìm kiếm khác hoặc thêm game mới</p>
      </div>
    `;
    return;
  }

  container.innerHTML = filtered.map(game => `
    <div class="game-card ${!game.enabled ? 'disabled' : ''}" data-id="${game.id}">
      <span class="game-icon">${game.icon || '🎮'}</span>
      <div class="game-info">
        <div class="name">${game.name}</div>
        <div class="process">${game.processNames.join(', ')}</div>
        <span class="category">${game.category}</span>
      </div>
      <div class="game-actions">
        <label class="toggle" title="${game.enabled ? 'Đang chặn' : 'Đã tắt'}">
          <input type="checkbox" ${game.enabled ? 'checked' : ''} onchange="toggleGame('${game.id}')">
          <span class="toggle-slider"></span>
        </label>
        <button class="btn-icon" onclick="deleteGame('${game.id}', '${game.name}')" title="Xóa">🗑️</button>
      </div>
    </div>
  `).join('');
}

function renderCategoryFilters(games) {
  const container = document.getElementById('categoryFilters');
  const categories = [...new Set(games.map(g => g.category))].sort();

  container.innerHTML = `
    <button class="btn btn-sm btn-ghost active-filter" onclick="filterByCategory(null, this)">Tất cả (${games.length})</button>
    ${categories.map(cat => {
      const count = games.filter(g => g.category === cat).length;
      return `<button class="btn btn-sm btn-ghost" onclick="filterByCategory('${cat}', this)">${cat} (${count})</button>`;
    }).join('')}
  `;
}

function filterByCategory(category, btn) {
  // Update active filter
  document.querySelectorAll('#categoryFilters .btn').forEach(b => b.classList.remove('active-filter'));
  if (btn) btn.classList.add('active-filter');

  if (!category) {
    renderGames(allGames);
  } else {
    renderGames(allGames.filter(g => g.category === category));
  }
}

// Search
document.getElementById('gameSearch')?.addEventListener('input', () => renderGames(allGames));

async function toggleGame(id) {
  try {
    await api(`/games/${id}/toggle`, { method: 'PUT' });
    await loadGames();
    showToast('Đã cập nhật trạng thái', 'success');
  } catch (err) {
    showToast('Lỗi khi cập nhật', 'error');
  }
}

async function deleteGame(id, name) {
  if (!confirm(`Xóa "${name}" khỏi danh sách chặn?`)) return;

  try {
    await api(`/games/${id}`, { method: 'DELETE' });
    await loadGames();
    showToast(`Đã xóa ${name}`, 'success');
  } catch (err) {
    showToast('Lỗi khi xóa', 'error');
  }
}

function openAddGameModal() {
  document.getElementById('newGameName').value = '';
  document.getElementById('newGameProcess').value = '';
  openModal('addGameModal');
}

async function addGame() {
  const name = document.getElementById('newGameName').value.trim();
  const process = document.getElementById('newGameProcess').value.trim();
  const category = document.getElementById('newGameCategory').value;

  if (!name || !process) {
    showToast('Vui lòng nhập tên game và process', 'error');
    return;
  }

  const processNames = process.split(',').map(p => p.trim()).filter(Boolean);

  try {
    await api('/games', {
      method: 'POST',
      body: JSON.stringify({ name, processNames, category, icon: '🎮' })
    });
    closeModal('addGameModal');
    await loadGames();
    showToast(`Đã thêm ${name}`, 'success');
  } catch (err) {
    showToast('Lỗi khi thêm game', 'error');
  }
}

async function openRunningProcessModal() {
  openModal('processModal');
  document.getElementById('processList').innerHTML = '<p style="color:var(--text-muted)">Đang quét process...</p>';

  try {
    const res = await api('/games/running');
    const processes = await res.json();

    document.getElementById('processList').innerHTML = processes.map(p => `
      <div class="game-card" style="margin-bottom:0.5rem;cursor:pointer" onclick="addFromProcess('${p.name}')">
        <span class="game-icon">📄</span>
        <div class="game-info">
          <div class="name">${p.name}</div>
          <div class="process">PID: ${p.pid} | Memory: ${p.memory} ${p.count > 1 ? `| ${p.count} instances` : ''}</div>
        </div>
        <button class="btn btn-sm btn-primary">Thêm</button>
      </div>
    `).join('');
  } catch (err) {
    document.getElementById('processList').innerHTML = '<p style="color:var(--accent-red)">Không thể tải danh sách process</p>';
  }
}

async function addFromProcess(processName) {
  const name = processName.replace('.exe', '');
  try {
    await api('/games', {
      method: 'POST',
      body: JSON.stringify({
        name,
        processNames: [processName],
        category: 'Khác',
        icon: '🎮'
      })
    });
    showToast(`Đã thêm ${name}`, 'success');
    closeModal('processModal');
    await loadGames();
  } catch (err) {
    showToast('Lỗi khi thêm', 'error');
  }
}

// =====================
// SCHEDULES
// =====================

const DAY_NAMES = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];

async function loadSchedules() {
  try {
    const [schedRes, tempRes] = await Promise.all([
      api('/schedules'),
      api('/schedules/temp-allow')
    ]);

    const schedules = await schedRes.json();
    const temps = await tempRes.json();

    renderSchedules(schedules);
    renderTempAllowances(temps);
    populateGameSelectors();
  } catch (err) {
    console.error('Error loading schedules:', err);
  }
}

function renderSchedules(schedules) {
  const container = document.getElementById('scheduleList');

  if (!schedules.length) {
    container.innerHTML = `
      <div class="empty-state" style="grid-column:1/-1">
        <div class="icon">⏰</div>
        <h3>Chưa có lịch trình</h3>
        <p>Tạo lịch trình để cho phép game trong khung giờ nhất định</p>
      </div>
    `;
    return;
  }

  container.innerHTML = schedules.map(s => {
    const gameName = s.gameId === '__all__' ? 'Tất cả game' :
      (allGames.find(g => g.id === s.gameId)?.name || s.gameId);

    return `
      <div class="schedule-card ${!s.enabled ? 'disabled' : ''}">
        <div class="schedule-header">
          <span class="schedule-time">${s.startTime} - ${s.endTime}</span>
          <label class="toggle">
            <input type="checkbox" ${s.enabled ? 'checked' : ''} onchange="toggleSchedule('${s.id}')">
            <span class="toggle-slider"></span>
          </label>
        </div>
        <div style="color:var(--text-secondary);font-size:0.85rem;margin-bottom:0.5rem">
          🎮 ${gameName}
        </div>
        <div class="schedule-days">
          ${[1,2,3,4,5,6,0].map(d => `
            <div class="day-badge ${s.days.includes(d) ? 'active' : ''}">${DAY_NAMES[d]}</div>
          `).join('')}
        </div>
        ${s.label ? `<p style="color:var(--text-muted);font-size:0.8rem">${s.label}</p>` : ''}
        <div class="schedule-actions">
          <button class="btn btn-sm btn-danger" onclick="deleteSchedule('${s.id}')">🗑️ Xóa</button>
        </div>
      </div>
    `;
  }).join('');
}

function renderTempAllowances(temps) {
  const container = document.getElementById('tempAllowances');
  if (!temps.length) {
    container.innerHTML = '';
    return;
  }

  container.innerHTML = `
    <div class="card" style="background:rgba(245,158,11,0.05);border-color:rgba(245,158,11,0.2)">
      <h3 style="color:var(--accent-orange);margin-bottom:0.8rem">⏳ Đang tạm cho phép</h3>
      ${temps.map(t => {
        const expiry = new Date(t.expiry);
        const remaining = Math.max(0, Math.ceil((expiry - Date.now()) / 60000));
        const gameName = t.gameId === '__all__' ? 'Tất cả game' :
          (allGames.find(g => g.id === t.gameId)?.name || t.gameId);
        return `
          <div style="display:flex;align-items:center;justify-content:space-between;padding:0.5rem 0">
            <span>${gameName} - Còn ${remaining} phút</span>
            <button class="btn btn-sm btn-danger" onclick="removeTempAllow('${t.gameId}')">Hủy</button>
          </div>
        `;
      }).join('')}
    </div>
  `;
}

function populateGameSelectors() {
  const selectors = ['scheduleGame', 'tempAllowGame'];
  selectors.forEach(id => {
    const select = document.getElementById(id);
    if (!select) return;
    select.innerHTML = '<option value="__all__">Tất cả game</option>' +
      allGames.filter(g => g.enabled).map(g =>
        `<option value="${g.id}">${g.icon} ${g.name}</option>`
      ).join('');
  });
}

function openAddScheduleModal() {
  // Reset day selector
  document.querySelectorAll('#daySelector label').forEach(l => l.classList.remove('selected'));
  openModal('addScheduleModal');
}

async function addSchedule() {
  const gameId = document.getElementById('scheduleGame').value;
  const startTime = document.getElementById('scheduleStart').value;
  const endTime = document.getElementById('scheduleEnd').value;
  const label = document.getElementById('scheduleLabel').value;

  const selectedDays = [];
  document.querySelectorAll('#daySelector label.selected').forEach(l => {
    selectedDays.push(parseInt(l.dataset.day));
  });

  if (!selectedDays.length) {
    showToast('Vui lòng chọn ít nhất 1 ngày', 'error');
    return;
  }

  try {
    await api('/schedules', {
      method: 'POST',
      body: JSON.stringify({ gameId, days: selectedDays, startTime, endTime, label })
    });
    closeModal('addScheduleModal');
    await loadSchedules();
    showToast('Đã tạo lịch trình', 'success');
  } catch (err) {
    showToast('Lỗi khi tạo lịch trình', 'error');
  }
}

async function toggleSchedule(id) {
  try {
    await api(`/schedules/${id}/toggle`, { method: 'PUT' });
    await loadSchedules();
  } catch (err) {
    showToast('Lỗi', 'error');
  }
}

async function deleteSchedule(id) {
  if (!confirm('Xóa lịch trình này?')) return;
  try {
    await api(`/schedules/${id}`, { method: 'DELETE' });
    await loadSchedules();
    showToast('Đã xóa lịch trình', 'success');
  } catch (err) {
    showToast('Lỗi', 'error');
  }
}

function openTempAllowModal() {
  openModal('tempAllowModal');
}

async function setTempAllow() {
  const gameId = document.getElementById('tempAllowGame').value;
  const minutes = parseInt(document.getElementById('tempAllowDuration').value);

  try {
    await api('/schedules/temp-allow', {
      method: 'POST',
      body: JSON.stringify({ gameId, minutes })
    });
    closeModal('tempAllowModal');
    await loadSchedules();
    showToast(`Đã tạm cho phép ${minutes} phút`, 'success');
  } catch (err) {
    showToast('Lỗi', 'error');
  }
}

async function removeTempAllow(gameId) {
  try {
    await api(`/schedules/temp-allow/${gameId}`, { method: 'DELETE' });
    await loadSchedules();
    showToast('Đã hủy tạm cho phép', 'success');
  } catch (err) {
    showToast('Lỗi', 'error');
  }
}

// =====================
// LOGS
// =====================

async function loadLogs() {
  const type = document.getElementById('logTypeFilter')?.value || '';
  const dateFrom = document.getElementById('logDateFrom')?.value || '';
  const dateTo = document.getElementById('logDateTo')?.value || '';
  const search = document.getElementById('logSearch')?.value || '';

  const params = new URLSearchParams({
    page: currentLogPage,
    limit: 30,
    ...(type && { type }),
    ...(dateFrom && { dateFrom }),
    ...(dateTo && { dateTo }),
    ...(search && { search })
  });

  try {
    const res = await api(`/logs?${params}`);
    const data = await res.json();

    renderLogTable(data.logs);
    renderPagination(data.page, data.totalPages);
  } catch (err) {
    console.error('Error loading logs:', err);
  }
}

const LOG_TYPE_LABELS = {
  game_blocked: { label: 'Chặn game', class: 'blocked', icon: '🚫' },
  game_allowed: { label: 'Cho phép', class: 'allowed', icon: '✅' },
  game_detected: { label: 'Phát hiện', class: 'system', icon: '👁️' },
  monitor_start: { label: 'Bắt đầu', class: 'system', icon: '▶️' },
  monitor_stop: { label: 'Dừng', class: 'system', icon: '⏹️' },
  login: { label: 'Đăng nhập', class: 'login', icon: '🔑' },
  settings_changed: { label: 'Cài đặt', class: 'settings', icon: '⚙️' },
  game_list_changed: { label: 'Danh sách', class: 'settings', icon: '📋' },
  temp_allow: { label: 'Tạm phép', class: 'allowed', icon: '⏳' },
  system: { label: 'Hệ thống', class: 'system', icon: '💻' }
};

function renderLogTable(logs) {
  const body = document.getElementById('logBody');

  if (!logs.length) {
    body.innerHTML = `
      <tr><td colspan="3" style="text-align:center;padding:2rem;color:var(--text-muted)">
        Không có dữ liệu nhật ký
      </td></tr>
    `;
    return;
  }

  body.innerHTML = logs.map(l => {
    const time = new Date(l.timestamp).toLocaleString('vi-VN', {
      day: '2-digit', month: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit'
    });
    const typeInfo = LOG_TYPE_LABELS[l.type] || { label: l.type, class: 'system', icon: '📌' };

    return `
      <tr>
        <td style="white-space:nowrap;color:var(--text-muted)">${time}</td>
        <td><span class="log-type ${typeInfo.class}">${typeInfo.icon} ${typeInfo.label}</span></td>
        <td>${l.message}</td>
      </tr>
    `;
  }).join('');
}

function renderPagination(page, totalPages) {
  const container = document.getElementById('logPagination');
  if (totalPages <= 1) {
    container.innerHTML = '';
    return;
  }

  let html = `<button ${page <= 1 ? 'disabled' : ''} onclick="goToLogPage(${page - 1})">◀</button>`;

  for (let i = 1; i <= Math.min(totalPages, 7); i++) {
    html += `<button class="${i === page ? 'active' : ''}" onclick="goToLogPage(${i})">${i}</button>`;
  }

  if (totalPages > 7) {
    html += `<button disabled>...</button>`;
    html += `<button class="${totalPages === page ? 'active' : ''}" onclick="goToLogPage(${totalPages})">${totalPages}</button>`;
  }

  html += `<button ${page >= totalPages ? 'disabled' : ''} onclick="goToLogPage(${page + 1})">▶</button>`;

  container.innerHTML = html;
}

function goToLogPage(page) {
  currentLogPage = page;
  loadLogs();
}

// =====================
// SETTINGS
// =====================

async function loadSettings() {
  try {
    const res = await api('/settings');
    const settings = await res.json();

    document.getElementById('settingMonitoring').checked = settings.monitoringEnabled;
    document.getElementById('settingScanInterval').value = settings.scanInterval || 3;
    document.getElementById('settingNotification').checked = settings.showNotification !== false;
    
    // Protection settings
    const blockTaskMgr = document.getElementById('settingBlockTaskMgr');
    const blockRegedit = document.getElementById('settingBlockRegedit');
    const blockCMD = document.getElementById('settingBlockCMD');
    const hideFolder = document.getElementById('settingHideFolder');
    
    if (blockTaskMgr) blockTaskMgr.checked = settings.blockTaskManager || false;
    if (blockRegedit) blockRegedit.checked = settings.blockRegedit || false;
    if (blockCMD) blockCMD.checked = settings.blockCMD || false;
    if (hideFolder) hideFolder.checked = settings.hideFolder || false;
  } catch (err) {
    console.error('Error loading settings:', err);
  }
}

async function saveProtectionSettings() {
  const blockTaskManager = document.getElementById('settingBlockTaskMgr')?.checked || false;
  const blockRegedit = document.getElementById('settingBlockRegedit')?.checked || false;
  const blockCMD = document.getElementById('settingBlockCMD')?.checked || false;
  const hideFolder = document.getElementById('settingHideFolder')?.checked || false;

  try {
    await api('/settings', {
      method: 'PUT',
      body: JSON.stringify({ blockTaskManager, blockRegedit, blockCMD, hideFolder })
    });
    showToast('Đã cập nhật bảo vệ hệ thống', 'success');
  } catch (err) {
    showToast('Lỗi: Cần quyền Administrator', 'error');
  }
}

async function installService() {
  if (!confirm('Cài đặt PC Guardian như Windows Service?\n\nService sẽ:\n- Tự khởi động cùng Windows\n- Tự restart khi bị tắt\n- Chạy ngầm trong nền\n\nCần quyền Administrator!')) return;

  showToast('Đang cài đặt service...', 'info');
  try {
    const res = await api('/settings/install-service', { method: 'POST' });
    const data = await res.json();
    if (res.ok) {
      showToast('✅ Service đã được cài đặt thành công!', 'success');
    } else {
      showToast(data.error || 'Lỗi cài đặt service', 'error');
    }
  } catch (err) {
    showToast('Lỗi: Cần chạy app với quyền Administrator', 'error');
  }
}

async function uninstallService() {
  if (!confirm('Gỡ bỏ Windows Service?\nApp sẽ không tự chạy khi bật máy nữa.')) return;

  try {
    const res = await api('/settings/uninstall-service', { method: 'POST' });
    if (res.ok) {
      showToast('Đã gỡ bỏ service', 'success');
    } else {
      showToast('Lỗi khi gỡ service', 'error');
    }
  } catch (err) {
    showToast('Lỗi', 'error');
  }
}

async function removeAllProtection() {
  if (!confirm('⚠️ Gỡ tất cả bảo vệ?\n\nSẽ mở lại:\n- Task Manager\n- Registry Editor\n- CMD / PowerShell\n- Bỏ ẩn thư mục')) return;

  try {
    const res = await api('/settings/remove-protection', { method: 'POST' });
    if (res.ok) {
      showToast('Đã gỡ tất cả bảo vệ', 'success');
      loadSettings();
    }
  } catch (err) {
    showToast('Lỗi', 'error');
  }
}

async function toggleMonitoring() {
  try {
    const res = await api('/settings/toggle-monitor', { method: 'POST' });
    const data = await res.json();

    showToast(
      data.monitoringEnabled ? 'Đã bật giám sát' : 'Đã tắt giám sát',
      data.monitoringEnabled ? 'success' : 'info'
    );

    loadMonitorStatus();
  } catch (err) {
    showToast('Lỗi khi chuyển đổi giám sát', 'error');
  }
}

async function saveScanInterval() {
  const interval = parseInt(document.getElementById('settingScanInterval').value);
  if (interval < 1 || interval > 30) {
    showToast('Tần suất quét phải từ 1-30 giây', 'error');
    return;
  }

  try {
    await api('/settings', {
      method: 'PUT',
      body: JSON.stringify({ scanInterval: interval })
    });
    showToast('Đã cập nhật tần suất quét', 'success');
  } catch (err) {
    showToast('Lỗi', 'error');
  }
}

async function saveSettings() {
  const showNotification = document.getElementById('settingNotification').checked;

  try {
    await api('/settings', {
      method: 'PUT',
      body: JSON.stringify({ showNotification })
    });
    showToast('Đã lưu cài đặt', 'success');
  } catch (err) {
    showToast('Lỗi khi lưu', 'error');
  }
}

async function changePassword() {
  const currentPassword = document.getElementById('currentPassword').value;
  const newPassword = document.getElementById('newPassword').value;

  if (!currentPassword || !newPassword) {
    showToast('Vui lòng nhập đầy đủ thông tin', 'error');
    return;
  }

  if (newPassword.length < 4) {
    showToast('Mật khẩu mới phải có ít nhất 4 ký tự', 'error');
    return;
  }

  try {
    const res = await api('/auth/change-password', {
      method: 'POST',
      body: JSON.stringify({ currentPassword, newPassword })
    });

    const data = await res.json();
    if (res.ok) {
      showToast('Đã đổi mật khẩu thành công', 'success');
      document.getElementById('currentPassword').value = '';
      document.getElementById('newPassword').value = '';
    } else {
      showToast(data.error, 'error');
    }
  } catch (err) {
    showToast('Lỗi khi đổi mật khẩu', 'error');
  }
}

// Logout
document.getElementById('logoutBtn')?.addEventListener('click', async () => {
  await api('/auth/logout', { method: 'POST' });
  localStorage.removeItem('pcg_token');
  window.location.href = '/login.html';
});

// Monitor toggle from sidebar
document.getElementById('monitorToggle')?.addEventListener('click', toggleMonitoring);

// =====================
// MODAL HELPERS
// =====================

function openModal(id) {
  document.getElementById(id)?.classList.add('show');
}

function closeModal(id) {
  document.getElementById(id)?.classList.remove('show');
}

// Close modal on overlay click
document.querySelectorAll('.modal-overlay').forEach(overlay => {
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) {
      overlay.classList.remove('show');
    }
  });
});

// Close modal on Escape
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    document.querySelectorAll('.modal-overlay.show').forEach(m => m.classList.remove('show'));
  }
});

// =====================
// TOAST NOTIFICATIONS
// =====================

function showToast(message, type = 'info') {
  const container = document.getElementById('toastContainer');
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;

  const icons = { success: '✅', error: '❌', info: 'ℹ️' };
  toast.innerHTML = `<span>${icons[type] || 'ℹ️'}</span> ${message}`;

  container.appendChild(toast);

  setTimeout(() => {
    toast.classList.add('removing');
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

// ==========================================
// CLOUD SYNC
// ==========================================
async function cloudSyncPull() {
  const btn = document.getElementById('syncBtn');
  if (btn) btn.textContent = '⏳ Đang đồng bộ...';
  
  try {
    const res = await api('/sync/pull', { method: 'POST' });
    const data = await res.json();
    
    if (data.synced) {
      showToast(`☁️ Đồng bộ: ${data.total} games (${data.added} mới, ${data.updated} cập nhật)`, 'success');
      loadGames(); // Refresh game list
    } else {
      showToast(`⚠️ Không thể đồng bộ: ${data.reason === 'offline' ? 'Không có mạng' : data.reason}`, 'info');
    }
  } catch (err) {
    showToast('❌ Lỗi kết nối cloud', 'error');
  }
  
  if (btn) btn.textContent = '☁️ Đồng bộ';
  updateSyncStatus();
}

async function updateSyncStatus() {
  try {
    const res = await api('/sync/status');
    const data = await res.json();
    const statusEl = document.getElementById('syncStatus');
    if (statusEl && data.lastSync) {
      const t = new Date(data.lastSync);
      statusEl.innerHTML = `☁️ Đồng bộ lần cuối: <strong>${t.toLocaleString('vi-VN')}</strong> · Cloud: ${data.cloudGamesCount} games`;
    }
  } catch {}
}

// Load sync status when opening games section
const origSwitchSection = window.switchSection;
window.switchSection = function(section) {
  origSwitchSection(section);
  if (section === 'games') updateSyncStatus();
};

// ==========================================
// GAME SCANNER
// ==========================================
async function fullScanGames() {
  await runScan('/scanner/full', 'fullScanBtn', '🔍 Quét toàn bộ');
}

async function quickScanGames() {
  await runScan('/scanner/quick', 'quickScanBtn', '⚡ Quét nhanh');
}

async function runScan(endpoint, btnId, btnText) {
  const btn = document.getElementById(btnId);
  const statusEl = document.getElementById('scanStatus');
  
  btn.disabled = true;
  btn.textContent = '⏳ Đang quét...';
  statusEl.style.display = 'block';
  statusEl.innerHTML = '⏳ Đang quét máy tính... Vui lòng đợi, quá trình này có thể mất 10-30 giây.';

  try {
    const res = await api(endpoint, { method: 'POST' });
    const data = await res.json();
    
    if (data.error) {
      showToast(data.error, 'error');
      statusEl.innerHTML = `❌ ${data.error}`;
    } else {
      const count = data.discovered ? data.discovered.length : 0;
      statusEl.innerHTML = `✅ Quét xong trong ${data.elapsedSeconds}s · Phát hiện <strong>${count}</strong> game/ứng dụng mới`;
      renderScanResults(data);
      
      if (count > 0) {
        showToast(`🔍 Phát hiện ${count} game mới trên máy!`, 'info');
      } else {
        showToast('✅ Không phát hiện game mới nào', 'success');
      }
    }
  } catch (err) {
    statusEl.innerHTML = '❌ Lỗi khi quét';
    showToast('Lỗi quét máy', 'error');
  }

  btn.disabled = false;
  btn.textContent = btnText;
}

function renderScanResults(data) {
  const container = document.getElementById('scanResults');
  const discoveries = data.discovered || [];
  
  if (!discoveries.length) {
    container.innerHTML = '<div style="text-align:center;padding:1.5rem;color:var(--text-muted)">✅ Không phát hiện game mới nào chưa có trong danh sách chặn</div>';
    return;
  }

  let html = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:0.75rem">
      <span style="font-size:0.85rem;color:var(--text-muted)">Phát hiện ${discoveries.length} game/ứng dụng</span>
      <button class="btn btn-red" onclick="blockAllDiscovered()" style="font-size:0.8rem;padding:0.4rem 0.8rem">🚫 Chặn tất cả</button>
    </div>
  `;

  html += discoveries.map(d => {
    const confidenceColor = d.confidence >= 70 ? '#ef4444' : d.confidence >= 50 ? '#f59e0b' : '#6b7280';
    const confidenceText = d.confidence >= 70 ? 'Rất cao' : d.confidence >= 50 ? 'Cao' : 'Trung bình';
    
    return `
    <div class="game-item" style="margin-bottom:0.5rem" data-process="${d.processName}">
      <span class="game-icon">🔍</span>
      <div class="game-info">
        <div class="name">${d.name}</div>
        <div class="process">${d.processName}</div>
        <div style="display:flex;gap:0.5rem;align-items:center;margin-top:2px">
          <span class="category" style="background:rgba(239,68,68,0.15);color:${confidenceColor}">
            ${confidenceText} (${d.confidence}%)
          </span>
          <span style="font-size:0.7rem;color:var(--text-muted)">${d.reasons ? d.reasons.join(' · ') : ''}</span>
          ${d.sizeMB ? `<span style="font-size:0.7rem;color:var(--text-muted)">${d.sizeMB}MB</span>` : ''}
        </div>
      </div>
      <div class="game-actions">
        <button class="btn btn-red" style="font-size:0.75rem;padding:0.3rem 0.6rem" 
          onclick="blockDiscovered('${d.name.replace(/'/g, "\\'")}', '${d.processName}', '${(d.path || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'")}')">🚫 Chặn</button>
      </div>
    </div>`;
  }).join('');

  container.innerHTML = html;
}

async function blockDiscovered(name, processName, gamePath) {
  try {
    const res = await api('/scanner/block', {
      method: 'POST',
      body: JSON.stringify({ name, processName, path: gamePath })
    });
    const data = await res.json();
    
    if (data.added) {
      showToast(`🚫 Đã thêm "${name}" vào danh sách chặn`, 'success');
      // Remove from scan results UI
      const items = document.querySelectorAll(`[data-process="${processName}"]`);
      items.forEach(el => el.remove());
      loadGames();
    } else {
      showToast(data.reason || 'Đã có trong danh sách', 'info');
    }
  } catch (err) {
    showToast('Lỗi khi thêm game', 'error');
  }
}

async function blockAllDiscovered() {
  const items = document.querySelectorAll('#scanResults .game-item');
  if (!items.length) return;
  
  if (!confirm(`Chặn tất cả ${items.length} game đã phát hiện?`)) return;

  const discoveries = [];
  items.forEach(item => {
    const name = item.querySelector('.name')?.textContent;
    const processName = item.dataset.process;
    if (name && processName) {
      discoveries.push({ name, processName });
    }
  });

  try {
    const res = await api('/scanner/block-all', {
      method: 'POST',
      body: JSON.stringify({ discoveries })
    });
    const data = await res.json();
    showToast(`🚫 Đã chặn ${data.added} game · Tổng: ${data.total}`, 'success');
    document.getElementById('scanResults').innerHTML = 
      '<div style="text-align:center;padding:1rem;color:var(--green)">✅ Đã chặn tất cả!</div>';
    loadGames();
  } catch (err) {
    showToast('Lỗi', 'error');
  }
}

// =====================
// WEBSITES
// =====================
let allWebsites = [];

async function loadWebsites() {
  try {
    const res = await api('/websites');
    allWebsites = await res.json();
    renderWebsites(allWebsites);
    
    // Update badge Count
    const activeCount = allWebsites.filter(w => w.enabled).length;
    const badge = document.getElementById('websiteCount');
    if (badge) badge.textContent = activeCount;
    
  } catch (err) {
    console.error('Error loading websites:', err);
  }
}

function renderWebsites(websites) {
  const container = document.getElementById('websiteList');
  const searchInput = document.getElementById('websiteSearch');
  const search = searchInput ? searchInput.value.toLowerCase() : '';

  let filtered = websites;
  if (search) {
    filtered = websites.filter(w => w.domain.toLowerCase().includes(search));
  }

  if (!filtered.length) {
    container.innerHTML = `
      <div class="empty-state" style="grid-column:1/-1">
        <div class="icon">🌐</div>
        <h3>Không tìm thấy website</h3>
        <p>Thử tìm kiếm khác hoặc thêm trang web mới</p>
      </div>
    `;
    return;
  }

  container.innerHTML = filtered.map(site => `
    <div class="game-card ${!site.enabled ? 'disabled' : ''}" data-id="${site.id}">
      <span class="game-icon">🌍</span>
      <div class="game-info">
        <div class="name">${site.domain}</div>
        <span class="category" style="background:rgba(239, 68, 68, 0.1); color:var(--accent-red)">Toàn bộ tên miền</span>
      </div>
      <div class="game-actions">
        <label class="toggle" title="${site.enabled ? 'Đang chặn' : 'Đã tắt'}">
          <input type="checkbox" ${site.enabled ? 'checked' : ''} onchange="toggleWebsite('${site.id}')">
          <span class="toggle-slider"></span>
        </label>
        <button class="btn-icon" onclick="deleteWebsite('${site.id}', '${site.domain}')" title="Xóa">🗑️</button>
      </div>
    </div>
  `).join('');
}

document.getElementById('websiteSearch')?.addEventListener('input', () => renderWebsites(allWebsites));

async function toggleWebsite(id) {
  try {
    await api(`/websites/${id}/toggle`, { method: 'PUT' });
    await loadWebsites();
    showToast('Đã cập nhật trạng thái chặn web', 'success');
  } catch (err) {
    showToast('Lỗi khi cập nhật chặn web', 'error');
  }
}

async function deleteWebsite(id, domain) {
  if (!confirm(`Xóa chặn "${domain}" khỏi danh sách?`)) return;

  try {
    await api(`/websites/${id}`, { method: 'DELETE' });
    await loadWebsites();
    showToast(`Đã xóa ${domain}`, 'success');
  } catch (err) {
    showToast('Lỗi khi xóa web', 'error');
  }
}

function openAddWebsiteModal() {
  const input = document.getElementById('newWebsiteDomain');
  if (input) input.value = '';
  openModal('addWebsiteModal');
}

async function addWebsite() {
  const input = document.getElementById('newWebsiteDomain');
  const domain = input.value.trim();

  if (!domain) {
    showToast('Vui lòng nhập tên miền', 'error');
    return;
  }

  try {
    const res = await api('/websites', {
      method: 'POST',
      body: JSON.stringify({ domain })
    });
    
    if (res && !res.ok) {
       const body = await res.json();
       showToast(body.error || 'Lỗi thêm website', 'error');
       return;
    }

    closeModal('addWebsiteModal');
    await loadWebsites();
    showToast(`Đã thêm ${domain}`, 'success');
  } catch (err) {
    showToast('Lỗi hệ thống', 'error');
  }
}
