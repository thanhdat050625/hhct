const { CONFIG } = require('../config/constants');

async function sendNotification(message, maxRetries = 3) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const res = await fetch(CONFIG.NOTIFY_API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message }),
        signal: AbortSignal.timeout(15000)
      });
      if (res.ok) {
        return true;
      }
      console.warn(`[Notifier] Gửi thông báo lần ${attempt}/${maxRetries} thất bại: HTTP ${res.status}`);
    } catch (err) {
      console.error(`[Notifier] Lỗi gửi thông báo lần ${attempt}/${maxRetries}: ${err.message}`);
    }
    if (attempt < maxRetries) {
      await new Promise(r => setTimeout(r, 3000));
    }
  }
  return false;
}

module.exports = {
  sendNotification
};
