const express = require('express');
const { readData, writeData } = require('../utils/storage');
const { log, EventType } = require('../utils/logger');
const websiteBlocker = require('../monitor/websiteBlocker');

const router = express.Router();

/**
 * Sync logic: Hàm hỗ trợ tái áp dụng toàn bộ website đang bật
 */
function rebuildHostsFile() {
  const websites = readData('blocked-websites.json', []);
  const activeDomains = websites.filter(w => w.enabled).map(w => w.domain);
  if (activeDomains.length > 0) {
    websiteBlocker.applyBlocks(activeDomains);
  } else {
    websiteBlocker.removeBlocks();
  }
}

/**
 * Lấy danh sách website đang bị chặn
 */
router.get('/', (req, res) => {
  const websites = readData('blocked-websites.json', []);
  res.json(websites);
});

/**
 * Thêm một website mới
 */
router.post('/', (req, res) => {
  let { domain } = req.body;

  if (!domain) {
    return res.status(400).json({ error: 'Cần nhập tên miền (domain)!' });
  }

  // Dọn dẹp URL, chỉ lấy tên miền, bỏ http/https
  domain = domain.replace(/^(?:https?:\/\/)?(?:www\.)?/i, "").split('/')[0];

  const websites = readData('blocked-websites.json', []);

  // Check trùng
  if (websites.some(w => w.domain === domain)) {
    return res.status(400).json({ error: 'Tên miền này đã tồn tại trong danh sách!' });
  }

  const newWebsite = {
    id: Date.now().toString(36) + Math.random().toString(36).substr(2, 5),
    domain,
    enabled: true,
    addedAt: new Date().toISOString()
  };

  websites.push(newWebsite);
  writeData('blocked-websites.json', websites);

  log(EventType.SYSTEM, `Đã thêm chặn website: ${domain}`);
  
  // Áp dụng lại
  rebuildHostsFile();

  res.json(newWebsite);
});

/**
 * Bật/Tắt chặn một website
 */
router.put('/:id/toggle', (req, res) => {
  const { id } = req.params;
  const websites = readData('blocked-websites.json', []);
  const site = websites.find(w => w.id === id);

  if (!site) {
    return res.status(404).json({ error: 'Không tìm thấy website' });
  }

  site.enabled = !site.enabled;
  writeData('blocked-websites.json', websites);

  log(EventType.SYSTEM, `${site.enabled ? 'Bật' : 'Tắt'} chặn web: ${site.domain}`);
  
  // Áp dụng lại
  rebuildHostsFile();

  res.json(site);
});

/**
 * Xóa một website
 */
router.delete('/:id', (req, res) => {
  const { id } = req.params;
  let websites = readData('blocked-websites.json', []);
  const site = websites.find(w => w.id === id);

  if (!site) {
    return res.status(404).json({ error: 'Không tìm thấy website' });
  }

  websites = websites.filter(w => w.id !== id);
  writeData('blocked-websites.json', websites);

  log(EventType.SYSTEM, `Đã xóa chặn web: ${site.domain}`);
  
  // Áp dụng lại
  rebuildHostsFile();

  res.json({ success: true });
});

/**
 * Áp dụng block list cho hệ thống (Khởi tạo chạy ở backend initialization)
 */
router.applyBackgroundBlocks = () => {
    rebuildHostsFile();
}

module.exports = router;
