const BaseService = require('../base/BaseService');
const { getWorkDetails, getItemName, formatDuration } = require('../../config/names');

function isCungVan(award) {
  if (!award) return false;
  return Number(award.type) === 2 && Number(award.id) === 1;
}

function formatAwardChoice(award) {
  if (!award) return 'Không có thưởng';
  const num = Number(award.num || 1);
  if (Number(award.type) === 2) {
    if (Number(award.id) === 1) return `+${num} Cung Vận (EXP Tước Vị)`;
    if (Number(award.id) === 2) return `+${num.toLocaleString('vi-VN')} Bạc`;
    if (Number(award.id) === 3) return `+${num.toLocaleString('vi-VN')} Thảo Dược`;
    if (Number(award.id) === 4) return `+${num.toLocaleString('vi-VN')} Binh Lực`;
    return `+${num} Tài nguyên #${award.id}`;
  }
  return `+${num} ${getItemName(award.id || award.propId || award.configId, award.type)}`;
}

class AffairService extends BaseService {
  constructor(client) {
    super(client, {
      name: 'Sự Vụ Triều Đình',
      listenedMsgIds: [102207, 102226]
    });
    this.lastWorkResult = null;
  }

  onPacket(msgId, data) {
    if (msgId === 102207) {
      this.lastWorkResult = data;
    }
  }

  getRemainSec() {
    const nowSec = Math.floor(Date.now() / 1000);
    const refreshTime = Number(this.client.workRefreshTime) || 0;
    if (refreshTime > nowSec) {
      return refreshTime - nowSec;
    }
    const currentWorks = (this.client.workList || []).length;
    if (currentWorks > 0) {
      return 0;
    }
    return 1800;
  }

  async execute() {
    console.log(`[${this.client.email}] 📜 Bắt đầu kiểm tra Sự Vụ Triều Đình (Cung vụ)...`);
    let handledCount = 0;

    while (true) {
      const availableWorks = (this.client.workList || []).slice();
      if (availableWorks.length === 0) break;

      for (const work of availableWorks) {
        this.client.lastReturnCode = null;
        const details = getWorkDetails(work.workId);

        let chooseType = 2;
        let expectedReward = formatAwardChoice(work.award2);
        let chosenOptName = details.option2;

        if (isCungVan(work.award1)) {
          chooseType = 1;
          expectedReward = formatAwardChoice(work.award1);
          chosenOptName = details.option1;
        } else if (isCungVan(work.award2)) {
          chooseType = 2;
          expectedReward = formatAwardChoice(work.award2);
          chosenOptName = details.option2;
        }

        this.lastWorkResult = null;
        this.client.lastReturnCode = null;
        this.send(102102, { workId: work.workId, type: chooseType });

        const success = await this.waitFor(() => Boolean(this.lastWorkResult) || (this.client.lastReturnCode && this.client.lastReturnCode.reqId === 102102), 3000, 100);

        if (!success || (this.client.lastReturnCode && this.client.lastReturnCode.code !== 0)) {
          if (this.client.lastReturnCode && this.client.lastReturnCode.code !== 0) {
            console.warn(`[${this.client.email}] ⚠️ Phê duyệt sự vụ [${details.description}] phản hồi lỗi: ${this.client.lastReturnCode.code}`);
          }
          continue;
        }

        handledCount++;
        console.log(`[${this.client.email}] 📜 [Cung Vụ Tự Nhiên] "${details.description}" -> [Chọn: "${chosenOptName}"] -> Nhận: ${expectedReward}`);
        await this.sleepRandom(0.8, 1.2);
      }

      await this.sleepRandom(0.5, 0.8);
      if ((this.client.workList || []).length === 0) {
        break;
      }
    }

    const remainSec = this.getRemainSec();
    console.log(`[${this.client.email}] 📜 [Cung Vụ Hoàn Tất] Đã phê duyệt: ${handledCount} sự vụ | Hồi lượt sau: ${formatDuration(remainSec)}`);

    return {
      handledCount,
      remainSec,
      hasAction: handledCount > 0
    };
  }
}

module.exports = AffairService;
