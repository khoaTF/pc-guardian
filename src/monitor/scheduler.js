const { readData, writeData } = require('../utils/storage');

const SCHEDULE_FILE = 'schedules.json';

class Scheduler {
  constructor() {
    this.tempAllowances = new Map(); // gameId -> expiry Date
  }

  /**
   * Check if a game is allowed to run right now
   * @param {string} gameId - Game ID to check
   * @returns {boolean} true if game is allowed
   */
  isGameAllowed(gameId) {
    // Check temporary allowance first
    if (this.tempAllowances.has(gameId)) {
      const expiry = this.tempAllowances.get(gameId);
      if (new Date() < expiry) {
        return true;
      } else {
        this.tempAllowances.delete(gameId);
      }
    }

    // Check "all games" temp allowance
    if (this.tempAllowances.has('__all__')) {
      const expiry = this.tempAllowances.get('__all__');
      if (new Date() < expiry) {
        return true;
      } else {
        this.tempAllowances.delete('__all__');
      }
    }

    const schedules = readData(SCHEDULE_FILE, []);
    const now = new Date();
    const currentDay = now.getDay(); // 0 = Sunday
    const currentTime = now.getHours() * 60 + now.getMinutes(); // Minutes since midnight

    for (const schedule of schedules) {
      if (!schedule.enabled) continue;

      // Check if schedule applies to this game (or all games)
      if (schedule.gameId !== '__all__' && schedule.gameId !== gameId) continue;

      // Check if today is in the schedule's days
      if (!schedule.days.includes(currentDay)) continue;

      // Check time range
      const [startHour, startMin] = schedule.startTime.split(':').map(Number);
      const [endHour, endMin] = schedule.endTime.split(':').map(Number);
      const start = startHour * 60 + startMin;
      const end = endHour * 60 + endMin;

      if (currentTime >= start && currentTime <= end) {
        return true; // Within allowed time
      }
    }

    return false;
  }

  /**
   * Set temporary allowance for a game
   * @param {string} gameId - Game ID (or '__all__' for all games)
   * @param {number} minutes - Duration in minutes
   */
  setTempAllow(gameId, minutes) {
    const expiry = new Date(Date.now() + minutes * 60 * 1000);
    this.tempAllowances.set(gameId, expiry);
    return expiry;
  }

  /**
   * Remove temporary allowance
   * @param {string} gameId
   */
  removeTempAllow(gameId) {
    this.tempAllowances.delete(gameId);
  }

  /**
   * Get all temporary allowances
   */
  getTempAllowances() {
    const result = [];
    for (const [gameId, expiry] of this.tempAllowances) {
      if (new Date() < expiry) {
        result.push({ gameId, expiry: expiry.toISOString() });
      }
    }
    return result;
  }

  /**
   * CRUD operations for schedules
   */
  getSchedules() {
    return readData(SCHEDULE_FILE, []);
  }

  addSchedule(schedule) {
    const schedules = this.getSchedules();
    schedule.id = Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
    schedule.createdAt = new Date().toISOString();
    schedules.push(schedule);
    writeData(SCHEDULE_FILE, schedules);
    return schedule;
  }

  updateSchedule(id, updates) {
    const schedules = this.getSchedules();
    const index = schedules.findIndex(s => s.id === id);
    if (index === -1) return null;
    schedules[index] = { ...schedules[index], ...updates, id };
    writeData(SCHEDULE_FILE, schedules);
    return schedules[index];
  }

  deleteSchedule(id) {
    const schedules = this.getSchedules();
    const filtered = schedules.filter(s => s.id !== id);
    writeData(SCHEDULE_FILE, filtered);
    return filtered.length < schedules.length;
  }

  toggleSchedule(id) {
    const schedules = this.getSchedules();
    const schedule = schedules.find(s => s.id === id);
    if (!schedule) return null;
    schedule.enabled = !schedule.enabled;
    writeData(SCHEDULE_FILE, schedules);
    return schedule;
  }
}

module.exports = new Scheduler();
