const fs = require('fs');
const path = require('path');

let itemNamesMap = null;
let workConfig = null;

function loadItemNames() {
  if (!itemNamesMap) {
    try {
      const p = path.join(__dirname, 'item_names.json');
      if (fs.existsSync(p)) {
        itemNamesMap = JSON.parse(fs.readFileSync(p, 'utf8'));
      }
    } catch (e) {
      itemNamesMap = {};
    }
  }
}

function getItemName(id, type = null) {
  if (type !== null && type !== undefined) {
    const t = Number(type);
    const i = Number(id);
    if (t === 2) {
      if (i === 1) return 'Cung Vận (EXP Tước Vị)';
      if (i === 2) return 'Bạc';
      if (i === 3) return 'Thảo Dược';
      if (i === 4) return 'Binh Lực';
      return `Tài nguyên #${i}`;
    }
  }
  loadItemNames();
  const idStr = String(id);
  if (itemNamesMap && itemNamesMap[idStr]) {
    return itemNamesMap[idStr];
  }
  return `Vật phẩm [${idStr}]`;
}

function loadWorkConfig() {
  if (!workConfig) {
    try {
      const p = path.join(__dirname, 'WorkConfig_json.json');
      if (fs.existsSync(p)) {
        workConfig = JSON.parse(fs.readFileSync(p, 'utf8'));
      }
    } catch (e) {
      workConfig = null;
    }
  }
}

function getWorkDetails(workId) {
  loadWorkConfig();
  const idStr = String(workId);
  if (workConfig && workConfig.list && workConfig.list[idStr]) {
    const row = workConfig.list[idStr];
    return {
      workId,
      description: row[1] || 'Sự vụ Triều đình',
      option1: row[2] || 'Lựa chọn 1',
      option2: row[3] || 'Lựa chọn 2'
    };
  }
  return {
    workId,
    description: 'Sự vụ Triều đình',
    option1: 'Lựa chọn 1',
    option2: 'Lựa chọn 2'
  };
}

function formatAwards(awardList) {
  if (!awardList || !Array.isArray(awardList) || awardList.length === 0) {
    return 'Không có vật phẩm';
  }
  const formatted = awardList.map(a => {
    const name = getItemName(a.id || a.propId || a.configId, a.type);
    let count = 1;
    if (typeof a.count === 'number') count = a.count;
    else if (typeof a.num === 'number') count = a.num;
    return `+${Number(count).toLocaleString('vi-VN')} ${name}`;
  });
  return formatted.join(', ');
}

function formatDuration(sec) {
  const s = Math.max(0, parseInt(sec, 10) || 0);
  if (s <= 0) return '0s';
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const remainS = s % 60;
  const parts = [];
  if (h > 0) parts.push(`${h}h`);
  if (m > 0) parts.push(`${m}m`);
  if (remainS > 0 || parts.length === 0) parts.push(`${remainS}s`);
  return parts.join(' ');
}

const COOKBOOK_RECIPES = [
  { id: 8, name: 'Thuộc Tính Đan', page: 2, time: 10800, ingredients: [{ id: 25302, name: 'Hoa Lạ', count: 10 }, { id: 25303, name: 'Trân Quả', count: 10 }] }
];

const STOVE_STATUS = {
  LOCKED: -1,
  EMPTY: 1,
  COOKING: 2,
  FINISHED: 3
};

const TRADE_TYPES = [
  { type: 1, name: 'Từ Thiện (Thu Bạc)', short: 'Bạc', rewardName: 'Bạc', resKey: 'silver' },
  { type: 2, name: 'Vườn Thuốc (Thu Thảo Dược)', short: 'Thảo Dược', rewardName: 'Thảo Dược', resKey: 'food' },
  { type: 3, name: 'H.Y Bổ Khí (Thu Binh Lực)', short: 'Binh Lực', rewardName: 'Binh Lực', resKey: 'soldier' }
];

module.exports = {
  getItemName,
  getWorkDetails,
  formatAwards,
  formatDuration,
  COOKBOOK_RECIPES,
  STOVE_STATUS,
  TRADE_TYPES
};
