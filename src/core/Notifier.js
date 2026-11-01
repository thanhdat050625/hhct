const { CONFIG } = require('../config/constants');

async function sendNotification(message) {
  try {
    const res = await fetch(CONFIG.NOTIFY_API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message })
    });
    if (!res.ok) {
      console.warn(`[Notifier] Gửi thông báo thất bại: HTTP ${res.status}`);
      return false;
    }
    return true;
  } catch (err) {
    console.error(`[Notifier] Lỗi gửi thông báo: ${err.message}`);
    return false;
  }
}

module.exports = {
  sendNotification
};
