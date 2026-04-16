const express = require('express');
const scheduler = require('../monitor/scheduler');
const { log, EventType } = require('../utils/logger');

const router = express.Router();

const DAY_NAMES = ['Chủ nhật', 'Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7'];

/**
 * Get all schedules
 */
router.get('/', (req, res) => {
  const schedules = scheduler.getSchedules();
  res.json(schedules);
});

/**
 * Create a new schedule
 */
router.post('/', (req, res) => {
  const { gameId, days, startTime, endTime, label } = req.body;

  if (!gameId || !days || !startTime || !endTime) {
    return res.status(400).json({ error: 'Thiếu thông tin lịch trình' });
  }

  const schedule = scheduler.addSchedule({
    gameId,
    days, // Array of day numbers (0-6)
    startTime, // "HH:MM"
    endTime, // "HH:MM"
    label: label || `Lịch cho phép ${startTime}-${endTime}`,
    enabled: true
  });

  const dayStr = days.map(d => DAY_NAMES[d]).join(', ');
  log(EventType.SCHEDULE_ACTIVE, `Tạo lịch: ${startTime}-${endTime} (${dayStr})`, {
    scheduleId: schedule.id
  });

  res.json(schedule);
});

/**
 * Update a schedule
 */
router.put('/:id', (req, res) => {
  const updated = scheduler.updateSchedule(req.params.id, req.body);
  if (!updated) {
    return res.status(404).json({ error: 'Không tìm thấy lịch trình' });
  }
  res.json(updated);
});

/**
 * Toggle schedule enabled/disabled
 */
router.put('/:id/toggle', (req, res) => {
  const schedule = scheduler.toggleSchedule(req.params.id);
  if (!schedule) {
    return res.status(404).json({ error: 'Không tìm thấy lịch trình' });
  }
  res.json(schedule);
});

/**
 * Delete a schedule
 */
router.delete('/:id', (req, res) => {
  const deleted = scheduler.deleteSchedule(req.params.id);
  if (!deleted) {
    return res.status(404).json({ error: 'Không tìm thấy lịch trình' });
  }
  res.json({ success: true });
});

/**
 * Temporarily allow a game
 */
router.post('/temp-allow', (req, res) => {
  const { gameId, minutes } = req.body;

  if (!gameId || !minutes) {
    return res.status(400).json({ error: 'Cần gameId và thời gian (phút)' });
  }

  const expiry = scheduler.setTempAllow(gameId, minutes);

  log(EventType.TEMP_ALLOW, `Tạm cho phép ${gameId === '__all__' ? 'tất cả game' : gameId} trong ${minutes} phút`, {
    gameId, minutes, expiry: expiry.toISOString()
  });

  res.json({ success: true, expiry: expiry.toISOString() });
});

/**
 * Remove temporary allowance
 */
router.delete('/temp-allow/:gameId', (req, res) => {
  scheduler.removeTempAllow(req.params.gameId);
  res.json({ success: true });
});

/**
 * Get active temporary allowances
 */
router.get('/temp-allow', (req, res) => {
  res.json(scheduler.getTempAllowances());
});

module.exports = router;
