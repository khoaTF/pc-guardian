const { exec } = require('child_process');
const { readData } = require('../utils/storage');
const { log, EventType } = require('../utils/logger');
const scheduler = require('./scheduler');
const { getLicenseInfo } = require('../utils/license');

class ProcessMonitor {
  constructor() {
    this.isRunning = false;
    this.interval = null;
    this.scanIntervalMs = 3000; // 3 seconds
    this.blockedCount = 0;
    this.startTime = null;
    this.lastScan = null;
    this.recentlyBlocked = new Set(); // Avoid duplicate logs for same process within short time
  }

  /**
   * Start the process monitor
   */
  start() {
    if (this.isRunning) return;

    this.isRunning = true;
    this.startTime = new Date();
    this.blockedCount = 0;

    const settings = readData('settings.json', {});
    this.scanIntervalMs = (settings.scanInterval || 3) * 1000;

    log(EventType.MONITOR_START, 'Bắt đầu giám sát process');

    this.scan(); // Run immediately
    this.interval = setInterval(() => this.scan(), this.scanIntervalMs);

    console.log(`\x1b[36m[PC Guardian]\x1b[0m Process monitor started (scan every ${this.scanIntervalMs / 1000}s)`);
  }

  /**
   * Stop the process monitor
   */
  stop() {
    if (!this.isRunning) return;

    this.isRunning = false;
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }

    log(EventType.MONITOR_STOP, 'Dừng giám sát process');
    console.log('\x1b[35m[PC Guardian]\x1b[0m Process monitor stopped');
  }

  /**
   * Get current status
   */
  getStatus() {
    return {
      isRunning: this.isRunning,
      startTime: this.startTime,
      blockedCount: this.blockedCount,
      lastScan: this.lastScan,
      uptime: this.startTime ? Date.now() - this.startTime.getTime() : 0
    };
  }

  /**
   * Scan running processes and block games
   */
  async scan() {
    try {
      const settings = readData('settings.json', {});

      // Check if monitoring is enabled
      if (!settings.monitoringEnabled) return;

      // Check if license is active/trialing
      const license = getLicenseInfo();
      if (license.isExpired) return;

      const runningProcesses = await this.getRunningProcesses();
      const blockedGames = readData('blocked-games.json', []);
      this.lastScan = new Date();

      // Clear recently blocked cache every 30 seconds
      if (this.recentlyBlocked.size > 100) {
        this.recentlyBlocked.clear();
      }

      for (const game of blockedGames) {
        if (!game.enabled) continue;

        for (const processName of game.processNames) {
          const found = runningProcesses.find(
            p => p.toLowerCase() === processName.toLowerCase()
          );

          if (found) {
            // Check scheduler - is this time allowed?
            const isAllowed = scheduler.isGameAllowed(game.id);

            if (isAllowed) {
              const key = `allowed_${found}`;
              if (!this.recentlyBlocked.has(key)) {
                this.recentlyBlocked.add(key);
                log(EventType.GAME_ALLOWED, `Cho phép ${game.name} (trong khung giờ)`, {
                  gameName: game.name,
                  processName: found
                });
                setTimeout(() => this.recentlyBlocked.delete(key), 60000);
              }
              continue;
            }

            // Block the game
            const key = `blocked_${found}`;
            if (!this.recentlyBlocked.has(key)) {
              await this.killProcess(found);
              this.blockedCount++;

              log(EventType.GAME_BLOCKED, `Đã chặn: ${game.name} (${found})`, {
                gameName: game.name,
                processName: found,
                category: game.category
              });

              this.recentlyBlocked.add(key);
              // Allow re-logging after 10 seconds
              setTimeout(() => this.recentlyBlocked.delete(key), 10000);

              // Show notification if enabled
              if (settings.showNotification !== false) {
                this.showNotification(game.name);
              }
            } else {
              // Still kill silently even if recently logged
              await this.killProcess(found);
            }
          }
        }
      }
    } catch (err) {
      console.error('[Monitor] Scan error:', err.message);
    }
  }

  /**
   * Get list of running process names
   * @returns {Promise<string[]>}
   */
  getRunningProcesses() {
    return new Promise((resolve, reject) => {
      exec('tasklist /FO CSV /NH', { encoding: 'utf-8', maxBuffer: 1024 * 1024 * 5 }, (err, stdout) => {
        if (err) {
          reject(err);
          return;
        }

        const processes = [];
        const lines = stdout.trim().split('\n');
        for (const line of lines) {
          const match = line.match(/^"([^"]+)"/);
          if (match) {
            processes.push(match[1]);
          }
        }
        resolve([...new Set(processes)]); // Remove duplicates
      });
    });
  }

  /**
   * Kill a process by name
   * @param {string} processName
   */
  killProcess(processName) {
    return new Promise((resolve) => {
      exec(`taskkill /F /IM "${processName}" /T`, { encoding: 'utf-8' }, (err) => {
        if (err) {
          // Process may have already exited
          resolve(false);
        } else {
          resolve(true);
        }
      });
    });
  }

  /**
   * Get all currently running processes (for admin UI)
   * @returns {Promise<Array>}
   */
  async getDetailedProcesses() {
    return new Promise((resolve, reject) => {
      exec('tasklist /FO CSV /NH', { encoding: 'utf-8', maxBuffer: 1024 * 1024 * 5 }, (err, stdout) => {
        if (err) {
          reject(err);
          return;
        }

        const processMap = new Map();
        const lines = stdout.trim().split('\n');

        for (const line of lines) {
          const parts = line.match(/"([^"]+)"/g);
          if (parts && parts.length >= 5) {
            const name = parts[0].replace(/"/g, '');
            const pid = parts[1].replace(/"/g, '');
            const mem = parts[4].replace(/"/g, '');

            if (!processMap.has(name)) {
              processMap.set(name, { name, pid, memory: mem, count: 1 });
            } else {
              processMap.get(name).count++;
            }
          }
        }

        // Filter out system processes for cleaner display
        const systemProcs = new Set([
          'System Idle Process', 'System', 'Registry', 'smss.exe',
          'csrss.exe', 'wininit.exe', 'services.exe', 'lsass.exe',
          'svchost.exe', 'fontdrvhost.exe', 'dwm.exe', 'Memory Compression',
          'conhost.exe', 'WmiPrvSE.exe', 'dllhost.exe', 'sihost.exe',
          'taskhostw.exe', 'ctfmon.exe', 'SearchIndexer.exe',
          'SecurityHealthService.exe', 'SecurityHealthSystray.exe',
          'spoolsv.exe', 'winlogon.exe', 'RuntimeBroker.exe',
          'TextInputHost.exe', 'ShellExperienceHost.exe',
          'StartMenuExperienceHost.exe', 'SearchHost.exe',
          'WidgetService.exe', 'Widgets.exe'
        ]);

        const userProcesses = [...processMap.values()]
          .filter(p => !systemProcs.has(p.name))
          .sort((a, b) => a.name.localeCompare(b.name));

        resolve(userProcesses);
      });
    });
  }

  /**
   * Show a desktop notification
   * @param {string} gameName
   */
  showNotification(gameName) {
    // Use PowerShell to show a toast notification on Windows
    const message = `"${gameName}" đã bị chặn bởi PC Guardian. Hãy tập trung học tập!`;
    const ps = `
      [Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime] | Out-Null
      [Windows.Data.Xml.Dom.XmlDocument, Windows.Data.Xml.Dom, ContentType = WindowsRuntime] | Out-Null
      $template = @"
      <toast>
        <visual>
          <binding template="ToastGeneric">
            <text>🛡️ PC Guardian</text>
            <text>${message}</text>
          </binding>
        </visual>
      </toast>
"@
      $xml = New-Object Windows.Data.Xml.Dom.XmlDocument
      $xml.LoadXml($template)
      $toast = [Windows.UI.Notifications.ToastNotification]::new($xml)
      [Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier("PC Guardian").Show($toast)
    `;

    exec(`powershell -ExecutionPolicy Bypass -Command "${ps.replace(/\n/g, ' ')}"`, { encoding: 'utf-8' }, () => {
      // Silent - notification is best-effort
    });
  }

  /**
   * Update scan interval
   * @param {number} seconds
   */
  updateScanInterval(seconds) {
    this.scanIntervalMs = seconds * 1000;
    if (this.isRunning) {
      clearInterval(this.interval);
      this.interval = setInterval(() => this.scan(), this.scanIntervalMs);
    }
  }
}

// Singleton
module.exports = new ProcessMonitor();
