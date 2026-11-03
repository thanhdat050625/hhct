const BaseService = require('../base/BaseService');
const { COOKBOOK_RECIPES, STOVE_STATUS, getItemName, formatAwards, formatDuration } = require('../../config/names');

class KitchenService extends BaseService {
  constructor(client) {
    super(client, {
      name: 'Ngự Thiện Phòng',
      listenedMsgIds: [144201, 144203, 144204, 144206]
    });

    this.cookList = [];
    this.bagInfoList = [];
    this.materialStock = {};
    this.lastReapResult = null;
    this.lastCookResult = null;
    this.lastBuyResult = null;
  }

  onPacket(msgId, data) {
    if (msgId === 144201) {
      if (data && data.cookFuncDataInfo) {
        this.cookList = data.cookFuncDataInfo.cookList || [];
        this.bagInfoList = data.cookFuncDataInfo.bagInfoList || [];
      }
    } else if (msgId === 144204) {
      this.lastReapResult = data;
    } else if (msgId === 144203) {
      this.lastCookResult = data;
    } else if (msgId === 144206) {
      this.lastBuyResult = data;
    }
  }

  getMaterialStock() {
    const stock = {};
    for (const item of (this.bagInfoList || [])) {
      stock[item.configId] = (stock[item.configId] || 0) + (Number(item.num) || 0);
    }
    return stock;
  }

  async fetchKitchenInfo() {
    this.cookList = [];
    this.send(144101, {});
    const success = await this.waitFor(() => this.cookList && this.cookList.length > 0, 4000, 150);
    if (!success) {
      console.warn(`[${this.client.email}] [Ngự Thiện] Chưa nhận được dữ liệu từ Server.`);
    }
    return {
      cookList: this.cookList,
      bagInfoList: this.bagInfoList
    };
  }

  getRecipe(foodId) {
    return COOKBOOK_RECIPES.find(r => r.id === foodId) || { name: `Món #${foodId}`, time: 10800, ingredients: [] };
  }

  async buyMaterial(shopConfigId, num = 60) {
    this.lastBuyResult = null;
    this.client.lastReturnCode = null;
    this.send(144106, { shopConfigId, num });
    const success = await this.waitFor(() => Boolean(this.lastBuyResult) || (this.client.lastReturnCode && this.client.lastReturnCode.reqId === 144106), 3000, 100);
    if (!success || (this.client.lastReturnCode && this.client.lastReturnCode.code !== 0)) {
      console.warn(`[${this.client.email}] [Ngự Thiện] Mua nguyên liệu (${shopConfigId}) không thành công.`);
      return false;
    }
    const awardText = this.lastBuyResult && this.lastBuyResult.awardBeans ? formatAwards(this.lastBuyResult.awardBeans) : `x${num}`;
    console.log(`[${this.client.email}] 🛒 [Ngự Thiện] Mua thành công: ${awardText}`);
    return true;
  }

  getMaxRemainSec() {
    if (!this.cookList || this.cookList.length === 0) return 3600;
    const nowSec = Math.floor(Date.now() / 1000);
    const unlocked = this.cookList.filter(s => s.status !== STOVE_STATUS.LOCKED);
    if (unlocked.length === 0) return 3600;

    const cooking = unlocked.filter(s => s.status === STOVE_STATUS.COOKING);
    if (cooking.length === 0) return 3600;

    let maxRemain = 0;
    for (const s of cooking) {
      const recipe = this.getRecipe(s.foodId);
      const num = Number(s.num) > 0 ? Number(s.num) : 1;
      const remain = Math.max(0, (Number(s.cropTime) + Number(recipe.time) * num) - nowSec);
      if (remain > maxRemain) maxRemain = remain;
    }
    return Math.max(60, maxRemain);
  }

  async reapAllFinishedStoves() {
    const finished = (this.cookList || []).filter(s => s.status === STOVE_STATUS.FINISHED);
    if (finished.length === 0) return 0;

    this.lastReapResult = null;
    this.send(144104, { cookId: -1 });

    const success = await this.waitFor(() => Boolean(this.lastReapResult), 3000, 100);
    if (!success) {
      console.warn(`[${this.client.email}] [Ngự Thiện] Không nhận được phản hồi thu hoạch.`);
      return 0;
    }

    const awards = this.lastReapResult.awardBeans || [];
    const awardText = formatAwards(awards);
    console.log(`[${this.client.email}] 🍲 [Ngự Thiện] Thu hoạch ${finished.length} bếp chín -> Nhận: ${awardText}`);

    for (const s of finished) {
      s.status = STOVE_STATUS.EMPTY;
      s.foodId = 0;
      s.cropTime = 0;
    }

    await this.sleepRandom(0.8, 1.2);
    return finished.length;
  }

  async execute() {
    console.log(`[${this.client.email}] 🍲 Bắt đầu kiểm tra Ngự Thiện Phòng...`);
    await this.fetchKitchenInfo();
    this.materialStock = this.getMaterialStock();

    const unlockedStoves = (this.cookList || []).filter(s => s.status !== STOVE_STATUS.LOCKED);
    const unlockedCount = unlockedStoves.length;
    console.log(`[${this.client.email}] 🍲 [Ngự Thiện] Số bếp đã mở khóa: ${unlockedCount}`);

    if (unlockedCount === 0) {
      return {
        reapedCount: 0,
        cookedCount: 0,
        unlockedCount: 0,
        emptyStovesCount: 0,
        minRemainSec: 3600,
        isCooking: false,
        hasAction: false,
        isOutOfMaterials: false,
        materials: {
          diThao: this.materialStock[25301] || 0,
          hoaLa: this.materialStock[25302] || 0,
          tranQua: this.materialStock[25303] || 0
        }
      };
    }

    const reapedCount = await this.reapAllFinishedStoves();

    const emptyStoves = unlockedStoves.filter(s => s.status === STOVE_STATUS.EMPTY);
    const cookingStoves = unlockedStoves.filter(s => s.status === STOVE_STATUS.COOKING);

    if (emptyStoves.length < unlockedCount) {
      const maxRemainSec = this.getMaxRemainSec();
      console.log(`[${this.client.email}] 🍲 [Ngự Thiện] Có ${cookingStoves.length}/${unlockedCount} bếp đang nấu. Chờ toàn bộ bếp chín để nấu đồng loạt (Bếp cuối cùng chín sau: ${formatDuration(maxRemainSec)}).`);
      return {
        reapedCount,
        cookedCount: 0,
        unlockedCount,
        emptyStovesCount: emptyStoves.length,
        remainSec: maxRemainSec,
        minRemainSec: maxRemainSec,
        isCooking: true,
        hasAction: false,
        isOutOfMaterials: false,
        materials: {
          diThao: this.materialStock[25301] || 0,
          hoaLa: this.materialStock[25302] || 0,
          tranQua: this.materialStock[25303] || 0
        }
      };
    }

    const neededHoaLa = unlockedCount * 10;
    const neededTranQua = unlockedCount * 10;
    const buyAmount = (unlockedCount * 10) + 10;
    let curHoaLa = this.materialStock[25302] || 0;
    let curTranQua = this.materialStock[25303] || 0;
    let boughtHoaLa = 0;
    let boughtTranQua = 0;

    let buyTries = 0;
    while ((curHoaLa < neededHoaLa || curTranQua < neededTranQua) && buyTries < 5) {
      buyTries++;
      let didBuy = false;

      if (curHoaLa < neededHoaLa) {
        console.log(`[${this.client.email}] 🍲 [Ngự Thiện] Thiếu Hoa Lạ (${curHoaLa}/${neededHoaLa}). Đang mua thêm ${buyAmount}...`);
        const bought = await this.buyMaterial(10004, buyAmount);
        if (bought) {
          boughtHoaLa += buyAmount;
          didBuy = true;
        }
        await this.sleepRandom(0.8, 1.2);
      }

      if (curTranQua < neededTranQua) {
        console.log(`[${this.client.email}] 🍲 [Ngự Thiện] Thiếu Trân Quả (${curTranQua}/${neededTranQua}). Đang mua thêm ${buyAmount}...`);
        const bought = await this.buyMaterial(10006, buyAmount);
        if (bought) {
          boughtTranQua += buyAmount;
          didBuy = true;
        }
        await this.sleepRandom(0.8, 1.2);
      }

      if (!didBuy) {
        break;
      }

      await this.fetchKitchenInfo();
      this.materialStock = this.getMaterialStock();
      curHoaLa = this.materialStock[25302] || 0;
      curTranQua = this.materialStock[25303] || 0;
    }

    const stockAfterBuy = {
      diThao: this.materialStock[25301] || 0,
      hoaLa: curHoaLa,
      tranQua: curTranQua
    };

    if (curHoaLa < neededHoaLa || curTranQua < neededTranQua) {
      console.warn(`[${this.client.email}] ⚠️ [Ngự Thiện] Sau khi mua vẫn không đủ nguyên liệu để nấu đủ ${unlockedCount} bếp (Hoa Lạ: ${curHoaLa}/${neededHoaLa}, Trân Quả: ${curTranQua}/${neededTranQua}).`);
      return {
        reapedCount,
        cookedCount: 0,
        unlockedCount,
        emptyStovesCount: unlockedCount,
        minRemainSec: 600,
        isCooking: false,
        hasAction: false,
        isOutOfMaterials: true,
        boughtMaterials: (boughtHoaLa > 0 || boughtTranQua > 0) ? {
          hoaLa: boughtHoaLa,
          tranQua: boughtTranQua
        } : null,
        stockAfterBuy,
        materials: {
          diThao: this.materialStock[25301] || 0,
          hoaLa: curHoaLa,
          tranQua: curTranQua
        }
      };
    }

    let cookedCount = 0;
    for (const stove of emptyStoves) {
      this.lastCookResult = null;
      this.send(144103, {
        cookId: stove.cookId,
        foodId: 8
      });

      const success = await this.waitFor(() => Boolean(this.lastCookResult), 3000, 100);
      if (success) {
        this.materialStock[25302] = Math.max(0, (this.materialStock[25302] || 0) - 10);
        this.materialStock[25303] = Math.max(0, (this.materialStock[25303] || 0) - 10);
        stove.status = STOVE_STATUS.COOKING;
        stove.foodId = 8;
        let cropTime = Math.floor(Date.now() / 1000);
        let num = 1;
        if (this.lastCookResult && Array.isArray(this.lastCookResult.cookInfo)) {
          const info = this.lastCookResult.cookInfo.find(c => c.cookId === stove.cookId);
          if (info) {
            if (info.cropTime) cropTime = Number(info.cropTime);
            if (info.num) num = Number(info.num);
          }
        }
        stove.cropTime = cropTime;
        stove.num = num;
        cookedCount++;
        console.log(`[${this.client.email}] 👨‍🍳 [Ngự Thiện] Bếp #${stove.cookId}: Bắt đầu nấu [Thuộc Tính Đan] (Thời gian: 3h)`);
      }
      await this.sleepRandom(0.8, 1.2);
    }

    const maxRemainSec = this.getMaxRemainSec();
    const allSuccess = cookedCount === unlockedCount && unlockedCount > 0;
    console.log(`[${this.client.email}] 🍲 [Ngự Thiện Hoàn Tất] Thu hoạch: ${reapedCount} | Đã nấu: ${cookedCount}/${unlockedCount} bếp | Bếp cuối cùng chín sau: ${formatDuration(maxRemainSec)}`);

    return {
      reapedCount,
      cookedCount,
      unlockedCount,
      emptyStovesCount: unlockedCount - cookedCount,
      remainSec: maxRemainSec,
      minRemainSec: maxRemainSec,
      isCooking: cookedCount > 0,
      hasAction: allSuccess,
      isOutOfMaterials: false,
      boughtMaterials: (boughtHoaLa > 0 || boughtTranQua > 0) ? {
        hoaLa: boughtHoaLa,
        tranQua: boughtTranQua
      } : null,
      stockAfterBuy,
      materials: {
        diThao: this.materialStock[25301] || 0,
        hoaLa: this.materialStock[25302] || 0,
        tranQua: this.materialStock[25303] || 0
      }
    };
  }
}

module.exports = KitchenService;

