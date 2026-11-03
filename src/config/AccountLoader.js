const fs = require('fs');
const path = require('path');

function parseAccountArray(data) {
  if (!Array.isArray(data)) {
    throw new Error('[AccountLoader] Định dạng cấu hình tài khoản không hợp lệ, yêu cầu một mảng!');
  }

  const accounts = [];
  for (const item of data) {
    if (Array.isArray(item)) {
      const email = typeof item[0] === 'string' ? item[0].trim() : '';
      const password = typeof item[1] === 'string' ? item[1].trim() : '';
      const status = typeof item[2] === 'string' ? item[2].trim().toLowerCase() : 'on';
      const serverId = typeof item[3] === 'number' ? item[3] : parseInt(item[3], 10);

      if (email.length > 0 && password.length > 0 && !isNaN(serverId)) {
        accounts.push({
          email,
          password,
          status,
          enabled: status === 'on',
          serverId,
          accKey: `${email.toLowerCase()}:${serverId}`
        });
      }
    }
  }

  return accounts;
}

function loadAccounts() {
  const envAccounts = process.env.ACCOUNTS_JSON;
  if (typeof envAccounts === 'string' && envAccounts.trim().length > 0) {
    try {
      const parsed = JSON.parse(envAccounts.trim());
      return parseAccountArray(parsed);
    } catch (err) {
      throw new Error(`[AccountLoader] Lỗi phân tích cú pháp ACCOUNTS_JSON từ biến môi trường: ${err.message}`);
    }
  }

  const configPath = path.resolve(__dirname, '../../config.json');
  if (fs.existsSync(configPath)) {
    const raw = fs.readFileSync(configPath, 'utf8').trim();
    try {
      const parsed = JSON.parse(raw);
      return parseAccountArray(parsed);
    } catch (err) {
      throw new Error(`[AccountLoader] Lỗi phân tích cú pháp config.json: ${err.message}`);
    }
  }

  throw new Error(`[AccountLoader] Không tìm thấy cấu hình tài khoản (thiếu cả config.json và biến môi trường ACCOUNTS_JSON)!`);
}

module.exports = {
  loadAccounts
};
