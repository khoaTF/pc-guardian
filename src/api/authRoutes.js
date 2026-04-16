const express = require('express');
const bcrypt = require('bcryptjs');
const { readData, writeData } = require('../utils/storage');
const { createSession, destroySession, isSetup } = require('../middleware/auth');
const { log, EventType } = require('../utils/logger');
const { getLicenseInfo, activateKey } = require('../utils/license');

const router = express.Router();

/**
 * Check if initial setup is done
 */
router.get('/setup-check', (req, res) => {
  res.json({ isSetup: isSetup() });
});

/**
 * Login with password
 */
router.post('/login', async (req, res) => {
  const { password } = req.body;

  if (!password) {
    return res.status(400).json({ error: 'Vui lòng nhập mật khẩu' });
  }

  const settings = readData('settings.json', {});

  // First time setup - create password
  if (!settings.passwordHash) {
    const hash = await bcrypt.hash(password, 10);
    settings.passwordHash = hash;
    settings.monitoringEnabled = true;
    settings.showNotification = true;
    settings.scanInterval = 3;
    settings.autoStart = false;
    writeData('settings.json', settings);

    const token = createSession();
    log(EventType.SYSTEM, 'Thiết lập mật khẩu lần đầu');
    log(EventType.LOGIN, 'Đăng nhập thành công');

    return res.json({
      success: true,
      token,
      message: 'Đã thiết lập mật khẩu thành công!',
      isFirstSetup: true
    });
  }

  // Verify password
  const isValid = await bcrypt.compare(password, settings.passwordHash);

  if (!isValid) {
    log(EventType.SYSTEM, 'Đăng nhập thất bại - sai mật khẩu');
    return res.status(401).json({ error: 'Mật khẩu không chính xác' });
  }

  const token = createSession();
  log(EventType.LOGIN, 'Đăng nhập thành công');

  res.json({ success: true, token });
});

/**
 * Logout
 */
router.post('/logout', (req, res) => {
  const token = req.headers['x-auth-token'];
  if (token) destroySession(token);
  res.json({ success: true });
});

/**
 * Change password
 */
router.post('/change-password', async (req, res) => {
  const { currentPassword, newPassword } = req.body;

  if (!currentPassword || !newPassword) {
    return res.status(400).json({ error: 'Vui lòng nhập đầy đủ thông tin' });
  }

  if (newPassword.length < 4) {
    return res.status(400).json({ error: 'Mật khẩu mới phải có ít nhất 4 ký tự' });
  }

  const settings = readData('settings.json', {});
  const isValid = await bcrypt.compare(currentPassword, settings.passwordHash);

  if (!isValid) {
    return res.status(401).json({ error: 'Mật khẩu hiện tại không chính xác' });
  }

  settings.passwordHash = await bcrypt.hash(newPassword, 10);
  writeData('settings.json', settings);

  log(EventType.SETTINGS_CHANGED, 'Đã thay đổi mật khẩu');

  res.json({ success: true, message: 'Đã đổi mật khẩu thành công' });
});

/**
 * Get auth status
 */
router.get('/status', (req, res) => {
  res.json({ authenticated: true });
});

/**
 * Get license status
 */
router.get('/license', (req, res) => {
  res.json(getLicenseInfo());
});

/**
 * Activate license
 */
router.post('/activate', async (req, res) => {
  const { key } = req.body;
  if (!key) {
    return res.status(400).json({ error: 'Vui lòng nhập Key Bản Quyền' });
  }
  
  const result = await activateKey(key);
  if (result.success) {
    res.json(result);
  } else {
    res.status(400).json({ error: result.message });
  }
});

module.exports = router;
