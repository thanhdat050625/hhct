const BaseService = require('../base/BaseService');
const { COOKBOOK_RECIPES, STOVE_STATUS, getItemName, formatAwards, formatDuration } = require('../../config/names');

class KitchenService extends BaseService {
  constructor(client) {
    super(client, {
      name: 'Ngự Thiện Phòng',
      listenedMsgIds: [144201, 144203, 144204]
    });

    this.cookList = [];
    this.bagInfoList = [];
    this.materialStock = {};
    this.lastReapResult = null;
    this.lastCookResult = null;
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
    return COOKBOOK_RECIPES.find(r => r.id === foodId) || { name: `Món #${foodId}`, time: 0, ingredients: [] };
  }

  canCookRecipe(recipe, materialStock) {
    for (const req of recipe.ingredients) {
      const current = materialStock[req.id] || 0;
      if (current < req.count) {
        return false;
      }
    }
    return true;
  }

  hasAnyCookableRecipe(stock = this.materialStock) {
    if (!stock) return false;
    for (const recipe of COOKBOOK_RECIPES) {
      if (this.canCookRecipe(recipe, stock)) {
        return true;
      }
    }
    return false;
  }

  getMinRemainSec() {
    if (!this.cookList || this.cookList.length === 0) return 3600;
    const nowSec = Math.floor(Date.now() / 1000);
    const unlocked = this.cookList.filter(s => s.status !== STOVE_STATUS.LOCKED);
    if (unlocked.length === 0) return 3600;

    let minRemain = Infinity;
    const canCookMore = this.hasAnyCookableRecipe(this.materialStock);

    for (const s of unlocked) {
      if (s.status === STOVE_STATUS.FINISHED) {
        return 0;
      }
      if (s.status === STOVE_STATUS.EMPTY && canCookMore) {
        return 0;
      }
      if (s.status === STOVE_STATUS.COOKING) {
        const recipe = this.getRecipe(s.foodId);
        const remain = Math.max(0, (Number(s.cropTime) + Number(recipe.time)) - nowSec);
        if (remain === 0) return 0;
        if (remain < minRemain) minRemain = remain;
      }
    }

    return minRemain === Infinity ? 3600 : minRemain;
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

  async cookInEmptyStoves() {
    const emptyStoves = (this.cookList || []).filter(s => s.status === STOVE_STATUS.EMPTY);
    if (emptyStoves.length === 0) return 0;

    let cookedCount = 0;

    for (const stove of emptyStoves) {
      let selectedRecipe = null;
      for (const recipe of COOKBOOK_RECIPES) {
        if (this.canCookRecipe(recipe, this.materialStock)) {
          selectedRecipe = recipe;
          break;
        }
      }

      if (!selectedRecipe) {
        continue;
      }

      this.lastCookResult = null;
      this.send(144103, {
        cookId: stove.cookId,
        foodId: selectedRecipe.id
      });

      const success = await this.waitFor(() => Boolean(this.lastCookResult), 3000, 100);
      if (success) {
        for (const req of selectedRecipe.ingredients) {
          this.materialStock[req.id] = (this.materialStock[req.id] || 0) - req.count;
        }
        stove.status = STOVE_STATUS.COOKING;
        stove.foodId = selectedRecipe.id;
        stove.cropTime = Math.floor(Date.now() / 1000);
        cookedCount++;
        console.log(`[${this.client.email}] 👨‍🍳 [Ngự Thiện] Bếp #${stove.cookId}: Bắt đầu nấu [${selectedRecipe.name}] (Thời gian: ${formatDuration(selectedRecipe.time)})`);
      }

      await this.sleepRandom(0.8, 1.2);
    }

    return cookedCount;
  }

  async execute() {
    console.log(`[${this.client.email}] 🍲 Bắt đầu kiểm tra Ngự Thiện Phòng...`);
    await this.fetchKitchenInfo();
    this.materialStock = this.getMaterialStock();

    const reapedCount = await this.reapAllFinishedStoves();
    const cookedCount = await this.cookInEmptyStoves();
    const minRemainSec = this.getMinRemainSec();

    console.log(`[${this.client.email}] 🍲 [Ngự Thiện Hoàn Tất] Thu hoạch: ${reapedCount} | Đã nấu: ${cookedCount} | Món kế tiếp chín sau: ${formatDuration(minRemainSec)}`);

    const isCooking = (this.cookList || []).some(s => s.status === STOVE_STATUS.COOKING);
    const remainingEmptyStoves = (this.cookList || []).filter(s => s.status === STOVE_STATUS.EMPTY);
    const hasCookableRecipe = this.hasAnyCookableRecipe(this.materialStock);
    const isOutOfMaterials = remainingEmptyStoves.length > 0 && !hasCookableRecipe;

    return {
      reapedCount,
      cookedCount,
      minRemainSec,
      isCooking,
      hasAction: cookedCount > 0,
      isOutOfMaterials,
      emptyStovesCount: remainingEmptyStoves.length,
      materials: {
        diThao: this.materialStock[25301] || 0,
        hoaLa: this.materialStock[25302] || 0,
        tranQua: this.materialStock[25303] || 0
      }
    };
  }
}

module.exports = KitchenService;
