require('dotenv').config();

function getRequiredEnv(key) {
  const val = process.env[key];
  if (typeof val !== 'string' || val.trim().length === 0) {
    throw new Error(`[CONFIG ERROR] Biến môi trường '${key}' bắt buộc phải được khai báo trong .env!`);
  }
  return val.trim();
}

const CONFIG = {
  PASSPORT_URL: getRequiredEnv('GAME_PASSPORT_URL'),
  CHECK_AUTH_URL: getRequiredEnv('GAME_CHECK_AUTH_URL'),
  GATEWAY_WS_URL: getRequiredEnv('GAME_GATEWAY_WS_URL'),
  ORIGIN_CDN: getRequiredEnv('GAME_ORIGIN_CDN'),
  GAME_ID: getRequiredEnv('GAME_ID'),
  SIMPLE_NAME: getRequiredEnv('GAME_SIMPLE_NAME'),
  SDK_SIMPLE_NAME: getRequiredEnv('GAME_SDK_SIMPLE_NAME'),
  SDK_VERSION_CODE: getRequiredEnv('GAME_SDK_VERSION_CODE'),
  CHANNEL: getRequiredEnv('GAME_CHANNEL'),
  CLIENT_VERSION: parseInt(getRequiredEnv('GAME_CLIENT_VERSION'), 10),
  APP_KEY: getRequiredEnv('GAME_APP_KEY'),

  PORT: parseInt(getRequiredEnv('PORT'), 10),

  NOTE_URL: getRequiredEnv('NOTE_URL'),
  NOTE_LOGIN_URL: getRequiredEnv('NOTE_LOGIN_URL'),
  NOTE_SAVE_URL: getRequiredEnv('NOTE_SAVE_URL'),
  NOTE_PASSWORD: getRequiredEnv('NOTE_PASSWORD'),
  NOTE_ID: getRequiredEnv('NOTE_ID'),
  NOTE_TITLE: getRequiredEnv('NOTE_TITLE'),
  NOTIFY_API_URL: getRequiredEnv('NOTIFY_API_URL')
};

function isInBlackoutWindow(dateInput = new Date()) {
  const d = dateInput instanceof Date ? dateInput : new Date(dateInput);
  const vnMs = d.getTime() + (7 * 3600 * 1000);
  const vnDate = new Date(vnMs);
  const totalMin = vnDate.getUTCHours() * 60 + vnDate.getUTCMinutes();
  return totalMin >= 1109 && totalMin <= 1260;
}

function getBlackoutResumeTime(dateInput = new Date()) {
  const d = dateInput instanceof Date ? dateInput : new Date(dateInput);
  const vnMs = d.getTime() + (7 * 3600 * 1000);
  const vnDate = new Date(vnMs);
  vnDate.setUTCHours(21, 1, 0, 0);
  return new Date(vnDate.getTime() - (7 * 3600 * 1000));
}

module.exports = {
  CONFIG,
  isInBlackoutWindow,
  getBlackoutResumeTime
};
