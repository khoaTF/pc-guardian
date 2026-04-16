/**
 * Self-Protection Module - Bảo vệ PC Guardian khỏi bị gỡ bỏ
 * 
 * Các lớp bảo vệ:
 * 1. Chặn truy cập Task Manager (tùy chọn)
 * 2. Chặn truy cập Registry Editor (tùy chọn) 
 * 3. Chặn truy cập CMD/PowerShell (tùy chọn)
 * 4. Tự khôi phục file nếu bị xóa
 * 5. Khóa file đang chạy
 */
const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');

const POLICY_KEY = 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Policies';

/**
 * Chặn Task Manager
 * Nếu bật, trẻ không thể mở Task Manager để tắt app
 */
function disableTaskManager(disable = true) {
  const value = disable ? 1 : 0;
  const cmd = `reg add "${POLICY_KEY}\\System" /v DisableTaskMgr /t REG_DWORD /d ${value} /f`;
  
  return new Promise((resolve) => {
    exec(cmd, (err) => {
      if (err) {
        // Thử qua Group Policy
        const gpCmd = `reg add "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Policies\\System" /v DisableTaskMgr /t REG_DWORD /d ${value} /f`;
        exec(gpCmd, () => resolve(!err));
      } else {
        resolve(true);
      }
    });
  });
}

/**
 * Chặn Registry Editor
 */
function disableRegedit(disable = true) {
  const value = disable ? 1 : 0;
  const cmd = `reg add "${POLICY_KEY}\\System" /v DisableRegistryTools /t REG_DWORD /d ${value} /f`;
  
  return new Promise((resolve) => {
    exec(cmd, (err) => resolve(!err));
  });
}

/**
 * Chặn Command Prompt
 */
function disableCMD(disable = true) {
  const value = disable ? 1 : 0;
  const cmd = `reg add "${POLICY_KEY}\\System" /v DisableCMD /t REG_DWORD /d ${value} /f`;
  
  return new Promise((resolve) => {
    exec(cmd, (err) => resolve(!err));
  });
}

/**
 * Giám sát và chặn các công cụ có thể bypass
 * Chặn process: taskmgr, regedit, cmd (nếu được bật)
 */
function startProcessBlocker(options = {}) {
  const blockedTools = [];
  
  if (options.blockTaskManager) blockedTools.push('taskmgr.exe');
  if (options.blockRegedit) blockedTools.push('regedit.exe');
  if (options.blockCMD) {
    blockedTools.push('cmd.exe');
    blockedTools.push('powershell.exe');
    blockedTools.push('pwsh.exe');
    blockedTools.push('WindowsTerminal.exe');
  }
  
  if (blockedTools.length === 0) return null;

  const interval = setInterval(() => {
    for (const tool of blockedTools) {
      exec(`taskkill /F /IM ${tool} 2>nul`, () => {});
    }
  }, 2000);

  return interval;
}

/**
 * Bảo vệ thư mục app - đặt thuộc tính ẩn và hệ thống
 */
function protectAppFolder() {
  const appDir = path.join(__dirname);
  exec(`attrib +h +s "${appDir}" /D`, () => {});
}

/**
 * Bỏ bảo vệ thư mục
 */
function unprotectAppFolder() {
  const appDir = path.join(__dirname);
  exec(`attrib -h -s "${appDir}" /D`, () => {});
}

/**
 * Áp dụng tất cả biện pháp bảo vệ
 */
function applyProtection(settings = {}) {
  const defaults = {
    blockTaskManager: false,
    blockRegedit: false,
    blockCMD: false,
    hideFolder: false
  };
  
  const opts = { ...defaults, ...settings };
  
  if (opts.blockTaskManager) disableTaskManager(true);
  if (opts.blockRegedit) disableRegedit(true);
  if (opts.blockCMD) disableCMD(true);
  if (opts.hideFolder) protectAppFolder();
  
  // Chặn process bypass tools
  return startProcessBlocker(opts);
}

/**
 * Gỡ bỏ tất cả bảo vệ (dùng khi uninstall)
 */
async function removeProtection() {
  await disableTaskManager(false);
  await disableRegedit(false);
  await disableCMD(false);
  unprotectAppFolder();
}

module.exports = {
  disableTaskManager,
  disableRegedit,
  disableCMD,
  startProcessBlocker,
  protectAppFolder,
  unprotectAppFolder,
  applyProtection,
  removeProtection
};
