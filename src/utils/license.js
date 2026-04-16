const { machineIdSync } = require('node-machine-id');
const { readData, writeData } = require('./storage');
const https = require('https');
const { log, EventType } = require('./logger');

// Supabase config (Sử dụng chung với cloudSync)
// Trong thực tế, bạn nên để URL và KEY này vào file .env
const SUPABASE_URL = 'https://wmdudwrlceisphoopeed.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndtZHVkd3JsY2Vpc3Bob29wZWVkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYzMDEyNjEsImV4cCI6MjA5MTg3NzI2MX0.es6KmwmTpoPQI1e67TPO4ISQpkTRwmydqC26nn0Tcq8';

const TRIAL_DAYS = 3;

function getDeviceId() {
  try {
    return machineIdSync();
  } catch (e) {
    return 'UNKNOWN_DEVICE_ID';
  }
}

/**
 * Lấy thông tin bản quyền hiện tại
 */
function getLicenseInfo() {
  let licenseData = readData('license.json', null);
  
  if (!licenseData) {
    licenseData = {
      installedAt: Date.now(),
      status: 'expired',
      key: null
    };
    writeData('license.json', licenseData);
  }
  
  // Nếu máy cũ đang ở trạng thái dùng thử, tự động chuyển sang hết hạn
  if (licenseData.status === 'trial') {
    licenseData.status = 'expired';
    writeData('license.json', licenseData);
  }

  // Kiểm tra thời hạn key (nếu có expire date)
  if (licenseData.status === 'active' && licenseData.expiresAt) {
    if (Date.now() > new Date(licenseData.expiresAt).getTime()) {
      licenseData.status = 'expired';
      writeData('license.json', licenseData);
    }
  }
  
  return {
    ...licenseData,
    deviceId: getDeviceId(),
    remainingDays: 0,
    isExpired: licenseData.status === 'expired'
  };
}

/**
 * Giao tiếp với Supabase
 */
function supabaseRequest(endpoint, options = {}) {
  return new Promise((resolve) => {
    const url = new URL(`/rest/v1/${endpoint}`, SUPABASE_URL);
    
    const reqOptions = {
      hostname: url.hostname,
      path: url.pathname + url.search,
      method: options.method || 'GET',
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': options.prefer || 'return=representation',
        ...options.headers
      },
      timeout: 10000
    };

    const req = https.request(reqOptions, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(data) });
        } catch {
          resolve({ status: res.statusCode, data });
        }
      });
    });

    req.on('error', () => resolve({ status: 500 }));
    req.on('timeout', () => { req.destroy(); resolve({ status: 408 }); });

    if (options.body) {
      req.write(JSON.stringify(options.body));
    }
    req.end();
  });
}

/**
 * Kiểm tra và kích hoạt Key bản quyền trên Cloud
 */
async function activateKey(key) {
  const deviceId = getDeviceId();
  
  // 1. Tìm key trên database Supabase
  const res = await supabaseRequest(`licenses?key=eq.${key}&select=*`);
  
  if (res.status !== 200 || !res.data || res.data.length === 0) {
    return { success: false, message: 'Key bản quyền không hợp lệ hoặc không tồn tại.' };
  }
  
  const licenseRecord = res.data[0];
  
  // 2. Kiểm tra xem Key đã được kích hoạt cho máy khác chưa
  if (licenseRecord.device_id && licenseRecord.device_id !== deviceId) {
    return { success: false, message: 'Key này đã được kích hoạt trên một thiết bị khác.' };
  }

  // 3. Kiểm tra hạn sử dụng của Key
  if (licenseRecord.expires_at && Date.now() > new Date(licenseRecord.expires_at).getTime()) {
    return { success: false, message: 'Key bản quyền này đã hết hạn.' };
  }
  
  // 4. Nếu Key hợp lệ và chưa ai dùng, ta "khóa" key này vào deviceId hiện tại
  if (!licenseRecord.device_id) {
    const updateRes = await supabaseRequest(`licenses?id=eq.${licenseRecord.id}`, {
      method: 'PATCH',
      body: { device_id: deviceId }
    });
    
    if (updateRes.status >= 300) {
      return { success: false, message: 'Lỗi khi kích hoạt. Hãy thử lại (Mã lỗi: ' + updateRes.status + ')' };
    }
  }
  
  // 5. Lưu thông tin bản quyền vào Local
  const localLicense = readData('license.json', {});
  localLicense.key = key;
  localLicense.status = 'active';
  localLicense.expiresAt = licenseRecord.expires_at; // null if perpetual
  writeData('license.json', localLicense);
  
  log(EventType.SYSTEM, 'Đã kích hoạt bản quyền thành công');
  
  return { success: true, message: 'Kích hoạt bản quyền thành công!' };
}

module.exports = {
  getDeviceId,
  getLicenseInfo,
  activateKey
};
