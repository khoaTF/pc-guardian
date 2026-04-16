/**
 * PC Guardian - Uninstaller Script
 * 
 * Chạy script này để gỡ bỏ HOÀN TOÀN PC Guardian:
 *   node uninstall.js
 * 
 * Script sẽ:
 * 1. Mở lại Task Manager, Registry Editor, CMD
 * 2. Xóa khỏi Windows Startup
 * 3. Gỡ Windows Service
 * 4. Bỏ ẩn thư mục app
 * 5. Dừng tất cả process PC Guardian
 */

const { exec } = require('child_process');
const path = require('path');

const POLICY_KEY = 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Policies\\System';
const STARTUP_KEY = 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run';
const APP_NAME = 'WindowsDisplayService';

function run(cmd) {
  return new Promise((resolve) => {
    exec(cmd, (err, stdout) => resolve({ err, stdout }));
  });
}

async function uninstall() {
  console.log('');
  console.log('╔══════════════════════════════════════════╗');
  console.log('║   🛡️  PC Guardian - Gỡ cài đặt            ║');
  console.log('╠══════════════════════════════════════════╣');
  console.log('║   Đang gỡ bỏ tất cả bảo vệ...          ║');
  console.log('╚══════════════════════════════════════════╝');
  console.log('');

  // 1. Mở lại Task Manager
  console.log('[1/7] Mở lại Task Manager...');
  await run(`reg add "${POLICY_KEY}" /v DisableTaskMgr /t REG_DWORD /d 0 /f`);
  await run(`reg delete "${POLICY_KEY}" /v DisableTaskMgr /f`);
  console.log('  ✅ Task Manager đã được mở lại');

  // 2. Mở lại Registry Editor
  console.log('[2/7] Mở lại Registry Editor...');
  await run(`reg add "${POLICY_KEY}" /v DisableRegistryTools /t REG_DWORD /d 0 /f`);
  await run(`reg delete "${POLICY_KEY}" /v DisableRegistryTools /f`);
  console.log('  ✅ Registry Editor đã được mở lại');

  // 3. Mở lại CMD
  console.log('[3/7] Mở lại CMD / PowerShell...');
  await run(`reg add "${POLICY_KEY}" /v DisableCMD /t REG_DWORD /d 0 /f`);
  await run(`reg delete "${POLICY_KEY}" /v DisableCMD /f`);
  console.log('  ✅ CMD / PowerShell đã được mở lại');

  // 4. Xóa khỏi Windows Startup
  console.log('[4/7] Xóa khỏi Windows Startup...');
  await run(`reg delete "${STARTUP_KEY}" /v "${APP_NAME}" /f`);
  console.log('  ✅ Đã xóa khỏi Startup');

  // 5. Xóa VBS startup file
  console.log('[5/7] Xóa file startup...');
  const startupPath = path.join(
    process.env.APPDATA,
    'Microsoft', 'Windows', 'Start Menu', 'Programs', 'Startup',
    `${APP_NAME}.vbs`
  );
  await run(`del "${startupPath}" 2>nul`);
  console.log('  ✅ Đã xóa file startup');

  // 6. Gỡ Windows Service
  console.log('[6/7] Gỡ Windows Service...');
  await run(`sc stop "${APP_NAME}" 2>nul`);
  await run(`sc stop "Windows Display Service" 2>nul`);
  await run(`sc delete "${APP_NAME}" 2>nul`);
  await run(`sc delete "Windows Display Service" 2>nul`);
  console.log('  ✅ Windows Service đã được gỡ bỏ');

  // 7. Bỏ ẩn thư mục
  console.log('[7/7] Bỏ ẩn thư mục app...');
  await run(`attrib -h -s "${__dirname}" /D`);
  console.log('  ✅ Thư mục đã hiển thị lại');

  console.log('');
  console.log('════════════════════════════════════════════');
  console.log('  ✅ GỠ CÀI ĐẶT HOÀN TẤT!');
  console.log('');
  console.log('  Bạn có thể xóa thư mục PC Guardian.');
  console.log('  Khởi động lại máy để áp dụng.');
  console.log('════════════════════════════════════════════');
  console.log('');
}

uninstall().catch(console.error);
