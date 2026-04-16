const fs = require('fs');
const crypto = require('crypto');

// Hàm tạo cấu trúc Key: PCG-XXXX-XXXX-XXXX
function generateKey() {
  return 'PCG-' + 
         crypto.randomBytes(2).toString('hex').toUpperCase() + '-' +
         crypto.randomBytes(2).toString('hex').toUpperCase() + '-' +
         crypto.randomBytes(2).toString('hex').toUpperCase();
}

// Hỗ trợ nhận thông số từ command line. VD: node generate-keys.js 50 365
const args = process.argv.slice(2);
const amount = parseInt(args[0]) || 50; // Mặc định tạo 50 keys
const durationStr = args[1] || '365'; 

let durationDays;
let durationExpr;

if (durationStr.toLowerCase() === 'lifetime' || durationStr.toLowerCase() === 'vv') {
  durationDays = 'Vĩnh viễn';
  durationExpr = 'NULL';
} else {
  const days = parseInt(durationStr);
  durationDays = `${days} ngày`;
  durationExpr = `NOW() + INTERVAL '${days} days'`;
}

console.log(`[PC Guardian] Đang khởi tạo ${amount} Key bản quyền (Hạn sử dụng: ${durationDays})...`);

let sql = `-- Script tự động thêm Key Bản Quyền vào Supabase\n`;
sql += `-- Sinh ra vào lúc: ${new Date().toLocaleString()}\n`;
sql += `-- Hạn sử dụng của lứa Key này: ${durationDays}\n\n`;
sql += `INSERT INTO public.licenses (key, expires_at) VALUES\n`;

let values = [];
let generatedKeys = [];

for (let i = 0; i < amount; i++) {
  const key = generateKey();
  generatedKeys.push(key);
  values.push(`('${key}', ${durationExpr})`);
}

sql += values.join(',\n') + '\nON CONFLICT (key) DO NOTHING;\n';

// Lưu câu lệnh SQL
const filename = `supabase_insert_keys_${Date.now()}.sql`;
fs.writeFileSync(filename, sql);

console.log(`\n✅ THÀNH CÔNG!`);
console.log(`Đã xuất câu lệnh SQL ra file: ${filename}`);
console.log(`\n👉 Hướng dẫn: Mở file ${filename}, copy toàn bộ nội dung trong đó và dán vào phần SQL Editor trên trang Supabase của bạn và chạy (Run).`);
console.log(`\nDưới đây là danh sách 5 Key mẫu trong đợt này để bạn lưu cho khách hàng:`);
for(let i=0; i<Math.min(5, amount); i++) {
  console.log(` - ${generatedKeys[i]}`);
}
