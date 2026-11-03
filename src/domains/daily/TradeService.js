const BaseService = require('../base/BaseService');
const { TRADE_TYPES, formatDuration } = require('../../config/names');

class TradeService extends BaseService {
  constructor(client) {
    super(client, {
      name: 'Sắp Xếp Nội Vụ',
      listenedMsgIds: [102206, 102226]
    });
    this.lastTradeResult = null;
  }

  onPacket(msgId, data) {
    if (msgId === 102206) {
      this.lastTradeResult = data;
    }
  }

  getMinRemainSec() {
    let minSec = Infinity;
    for (const t of TRADE_TYPES) {
      const item = (this.client.tradeInfoList || []).find(x => x.type === t.type);
      if (item) {
        let timeSec = Number(item.time) || 0;
        if (item.updatedAt) {
          const elapsed = Math.floor((Date.now() - item.updatedAt) / 1000);
          timeSec = Math.max(0, timeSec - elapsed);
        }
        if (Number(item.num) > 0) {
          return 0;
        }
        if (timeSec < minSec) {
          minSec = timeSec;
        }
      }
    }
    return minSec === Infinity ? 600 : minSec;
  }

  async execute() {
    console.log(`[${this.client.email}] 💼 Bắt đầu kiểm tra Sắp Xếp Nội Vụ...`);
    let totalHarvested = 0;
    const summary = [];

    for (const t of TRADE_TYPES) {
      let item = (this.client.tradeInfoList || []).find(x => x.type === t.type);
      if (!item) {
        continue;
      }

      let curNum = Number(item.num) || 0;
      let timeSec = Number(item.time) || 0;
      if (item.updatedAt) {
        const elapsed = Math.floor((Date.now() - item.updatedAt) / 1000);
        timeSec = Math.max(0, timeSec - elapsed);
      }

      if (curNum <= 0) {
        summary.push(`${t.short}: 0 lượt (Hồi sau: ${formatDuration(timeSec)})`);
        continue;
      }

      let harvestTries = 0;
      while (harvestTries < curNum) {
        this.lastTradeResult = null;
        this.client.lastReturnCode = null;
        this.send(102101, { type: t.type });

        const success = await this.waitFor(() => Boolean(this.lastTradeResult) || (this.client.lastReturnCode && this.client.lastReturnCode.reqId === 102101), 3000, 100);

        if (!success || (this.client.lastReturnCode && this.client.lastReturnCode.code !== 0)) {
          break;
        }

        harvestTries++;
        totalHarvested++;
        await this.sleepRandom(0.8, 1.2);
      }

      item.num = Math.max(0, curNum - harvestTries);
      if (item.num === 0) {
        item.time = 60;
      }
      item.updatedAt = Date.now();

      summary.push(`${t.name}: Đã thu hoạch x${harvestTries} (Hồi sau: ${formatDuration(item.time)})`);
    }

    const minRemainSec = this.getMinRemainSec();
    console.log(`[${this.client.email}] 💼 [Nội Vụ Hoàn Tất] Đã thu hoạch: ${totalHarvested} lần | ${summary.join(' | ')}`);

    return {
      totalHarvested,
      minRemainSec,
      hasAction: totalHarvested > 0
    };
  }
}

module.exports = TradeService;
