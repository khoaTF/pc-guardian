const { appendToArray, readData } = require('./storage');

const LOG_FILE = 'logs.json';
const MAX_LOGS = 5000;

/**
 * Log event types
 */
const EventType = {
  GAME_BLOCKED: 'game_blocked',
  GAME_DETECTED: 'game_detected',
  GAME_ALLOWED: 'game_allowed',
  SCHEDULE_ACTIVE: 'schedule_active',
  SCHEDULE_EXPIRED: 'schedule_expired',
  MONITOR_START: 'monitor_start',
  MONITOR_STOP: 'monitor_stop',
  LOGIN: 'login',
  SETTINGS_CHANGED: 'settings_changed',
  GAME_LIST_CHANGED: 'game_list_changed',
  TEMP_ALLOW: 'temp_allow',
  SYSTEM: 'system'
};

/**
 * Add a log entry
 * @param {string} type - Event type from EventType
 * @param {string} message - Human readable message
 * @param {object} details - Additional details
 */
function log(type, message, details = {}) {
  const entry = {
    id: Date.now().toString(36) + Math.random().toString(36).substr(2, 5),
    timestamp: new Date().toISOString(),
    type,
    message,
    details
  };

  appendToArray(LOG_FILE, entry, MAX_LOGS);

  // Console output with color coding
  const colors = {
    game_blocked: '\x1b[31m',    // Red
    game_detected: '\x1b[33m',   // Yellow
    game_allowed: '\x1b[32m',    // Green
    monitor_start: '\x1b[36m',   // Cyan
    monitor_stop: '\x1b[35m',    // Magenta
    system: '\x1b[90m',          // Gray
  };
  const color = colors[type] || '\x1b[0m';
  console.log(`${color}[${type.toUpperCase()}]\x1b[0m ${message}`);

  return entry;
}

/**
 * Get logs with filtering and pagination
 * @param {object} options - Filter options
 * @returns {object} { logs, total, page, totalPages }
 */
function getLogs(options = {}) {
  const {
    page = 1,
    limit = 50,
    type = null,
    dateFrom = null,
    dateTo = null,
    search = null
  } = options;

  let logs = readData(LOG_FILE, []);

  // Filter by type
  if (type) {
    logs = logs.filter(l => l.type === type);
  }

  // Filter by date range
  if (dateFrom) {
    const from = new Date(dateFrom);
    logs = logs.filter(l => new Date(l.timestamp) >= from);
  }
  if (dateTo) {
    const to = new Date(dateTo);
    to.setHours(23, 59, 59, 999);
    logs = logs.filter(l => new Date(l.timestamp) <= to);
  }

  // Filter by search term
  if (search) {
    const term = search.toLowerCase();
    logs = logs.filter(l =>
      l.message.toLowerCase().includes(term) ||
      (l.details && JSON.stringify(l.details).toLowerCase().includes(term))
    );
  }

  const total = logs.length;
  const totalPages = Math.ceil(total / limit);
  const start = (page - 1) * limit;
  const paginatedLogs = logs.slice(start, start + limit);

  return {
    logs: paginatedLogs,
    total,
    page,
    totalPages
  };
}

/**
 * Get statistics for dashboard
 */
function getStats() {
  const logs = readData(LOG_FILE, []);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  const todayLogs = logs.filter(l => new Date(l.timestamp) >= today);
  const blockedToday = todayLogs.filter(l => l.type === EventType.GAME_BLOCKED).length;

  // Last 7 days stats
  const last7Days = [];
  for (let i = 6; i >= 0; i--) {
    const day = new Date(today);
    day.setDate(day.getDate() - i);
    const nextDay = new Date(day);
    nextDay.setDate(nextDay.getDate() + 1);

    const dayLogs = logs.filter(l => {
      const ts = new Date(l.timestamp);
      return ts >= day && ts < nextDay;
    });

    last7Days.push({
      date: day.toISOString().split('T')[0],
      dayName: day.toLocaleDateString('vi-VN', { weekday: 'short' }),
      blocked: dayLogs.filter(l => l.type === EventType.GAME_BLOCKED).length,
      detected: dayLogs.filter(l => l.type === EventType.GAME_DETECTED).length,
      total: dayLogs.length
    });
  }

  // Most blocked games
  const blockedGames = {};
  logs
    .filter(l => l.type === EventType.GAME_BLOCKED && l.details.gameName)
    .forEach(l => {
      const name = l.details.gameName;
      blockedGames[name] = (blockedGames[name] || 0) + 1;
    });

  const topBlocked = Object.entries(blockedGames)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([name, count]) => ({ name, count }));

  return {
    blockedToday,
    totalLogs: logs.length,
    recentBlocks: todayLogs.filter(l => l.type === EventType.GAME_BLOCKED).slice(0, 10),
    last7Days,
    topBlocked
  };
}

module.exports = { log, getLogs, getStats, EventType };
