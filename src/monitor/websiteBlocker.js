const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const { log, EventType } = require('../utils/logger');

const HOSTS_FILE_PATH = 'C:\\Windows\\System32\\drivers\\etc\\hosts';
const START_TAG = '# --- PC GUARDIAN BLOCKED WEBSITES START ---';
const END_TAG = '# --- PC GUARDIAN BLOCKED WEBSITES END ---';

class WebsiteBlocker {
  constructor() {
    this.isActive = false;
  }

  /**
   * Áp dụng danh sách các trang web bị chặn vào file hosts
   * @param {Array} blockedDomains - Mảng các domain (ví dụ: ['facebook.com', 'tiktok.com'])
   */
  applyBlocks(blockedDomains) {
    try {
      // 1. Đọc nội dung file hosts hiện tại
      let hostsContent = '';
      if (fs.existsSync(HOSTS_FILE_PATH)) {
        hostsContent = fs.readFileSync(HOSTS_FILE_PATH, 'utf-8');
      }

      // 2. Chuyển đổi danh sách domain thành chuỗi mappings
      const mappings = blockedDomains.map(domain => {
        return `0.0.0.0 ${domain}\n0.0.0.0 www.${domain}`;
      }).join('\n');

      const blockSection = `${START_TAG}\n${mappings}\n${END_TAG}`;

      // 3. Xóa section cũ nếu có
      const regex = new RegExp(`${START_TAG}[\\s\\S]*?${END_TAG}`);
      if (regex.test(hostsContent)) {
        hostsContent = hostsContent.replace(regex, blockSection);
      } else {
        // Nếu file hosts không kết thúc bằng newline thì thêm vào
        if (hostsContent && !hostsContent.endsWith('\n')) {
          hostsContent += '\n';
        }
        hostsContent += blockSection + '\n';
      }

      // 4. Ghi lại vào file hosts
      fs.writeFileSync(HOSTS_FILE_PATH, hostsContent, 'utf-8');
      
      // 5. Xóa DNS Cache để áp dụng ngay
      this.flushDns();

      log(EventType.SYSTEM, `Đã áp dụng chặn ${blockedDomains.length} trang web độc hại.`);
      this.isActive = true;

    } catch (err) {
      log(EventType.SYSTEM, `[WebsiteBlocker] Lỗi ghi file hosts: ${err.message}`);
      console.error('Không thể ghi vào file hosts. Có thể thiếu quyền Admin?', err);
    }
  }

  /**
   * Khôi phục toàn bộ các block web
   */
  removeBlocks() {
    try {
      if (!fs.existsSync(HOSTS_FILE_PATH)) return;

      let hostsContent = fs.readFileSync(HOSTS_FILE_PATH, 'utf-8');
      const regex = new RegExp(`${START_TAG}[\\s\\S]*?${END_TAG}\\n?`, 'g');
      
      if (regex.test(hostsContent)) {
        hostsContent = hostsContent.replace(regex, '');
        fs.writeFileSync(HOSTS_FILE_PATH, hostsContent, 'utf-8');
        this.flushDns();
        log(EventType.SYSTEM, `Đã gỡ bỏ toàn bộ danh sách chặn web.`);
      }
      
      this.isActive = false;
    } catch (err) {
      log(EventType.SYSTEM, `[WebsiteBlocker] Lỗi khôi phục file hosts: ${err.message}`);
    }
  }

  /**
   * Chạy lệnh flushdns để xoá bộ nhớ đệm (cache)
   */
  flushDns() {
    exec('ipconfig /flushdns', (error, stdout) => {
      // Ignored error (usually just means it couldn't flush, or already flushed)
    });
  }
}

module.exports = new WebsiteBlocker();
