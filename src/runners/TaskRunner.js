const { EncryptHelper } = require('../core/crypto');
const { loginPassport, authenticateSdk, getGatewayAuth } = require('../core/auth');
const GameClient = require('../core/GameClient');
const KitchenService = require('../domains/kitchen/KitchenService');
const AffairService = require('../domains/daily/AffairService');
const TradeService = require('../domains/daily/TradeService');
const { isInBlackoutWindow, getBlackoutResumeTime } = require('../config/constants');
const { sendNotification } = require('../core/Notifier');

function getTomorrowMidnightGMT7() {
  const vnMs = Date.now() + (7 * 3600 * 1000);
  const vnDate = new Date(vnMs);
  vnDate.setUTCDate(vnDate.getUTCDate() + 1);
  vnDate.setUTCHours(0, 1, 0, 0);
  return new Date(vnDate.getTime() - (7 * 3600 * 1000));
}

function getVnToday() {
  return new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Asia/Ho_Chi_Minh',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(new Date());
}

class TaskRunner {
  constructor(noteManager) {
    this.noteManager = noteManager;
  }

  async runAccount(account) {
    console.log(`\n======================================================`);
    console.log(`🚀 Bắt đầu phiên làm việc: [${account.email} - S${account.serverId}]`);
    console.log(`======================================================`);

    const noteData = await this.noteManager.fetchNoteData();
    const accKey = account.accKey;
    const todayStr = getVnToday();
    const accRecord = noteData && noteData[accKey];

    if (isInBlackoutWindow()) {
      const resumeTime = getBlackoutResumeTime();
      console.log(`[${account.email}] ⏸️ Đang trong khung giờ nghỉ (18h29 - 21h00). Tự động đặt lịch chạy tiếp lúc 21h01.`);
      await this.noteManager.updateAccountRun(account, {
        roleName: accRecord?.name || '',
        nextRunTime: resumeTime,
        naudan: { hasAction: false },
        cungvu: { hasAction: false },
        noivu: { hasAction: false }
      });
      return { success: true, skipped: true, nextRunTime: resumeTime };
    }

    let currentNaudan = 0;
    let currentCungvu = 0;
    let currentNoivu = 0;

    if (accRecord && accRecord.history && accRecord.history[todayStr]) {
      const todayHistory = accRecord.history[todayStr];
      currentNaudan = typeof todayHistory.dan === 'number' ? todayHistory.dan : (Number(todayHistory.naudan) || 0);
      currentCungvu = typeof todayHistory.cung === 'number' ? todayHistory.cung : (Number(todayHistory.cungvu) || 0);
      currentNoivu = typeof todayHistory.noi === 'number' ? todayHistory.noi : (Number(todayHistory.noivu) || 0);
    }

    if (currentNaudan >= 6) {
      const nextRun = getTomorrowMidnightGMT7();
      console.log(`[${account.email}] 🎯 Tài khoản đã hoàn thành 6/6 lượt nấu đan hôm nay (Cung vụ: ${currentCungvu}, Nội vụ: ${currentNoivu}).`);
      console.log(`[${account.email}] ⏰ Hẹn giờ chạy tiếp theo vào ngày mai (00h01): ${nextRun}`);
      await this.noteManager.updateAccountRun(account, {
        roleName: accRecord?.name || '',
        nextRunTime: nextRun,
        naudan: { hasAction: false },
        cungvu: { hasAction: false },
        noivu: { hasAction: false }
      });
      return { success: true, skipped: true, nextRunTime: nextRun };
    }

    console.log(`[${account.email}] 📊 Tiến độ hiện tại trong ngày: Nấu đan: ${currentNaudan}/6 | Cung vụ: ${currentCungvu} | Nội vụ: ${currentNoivu}`);

    const encryptHelper = new EncryptHelper();
    let client = null;

    try {
      if (isInBlackoutWindow()) {
        const resumeTime = getBlackoutResumeTime();
        console.log(`[${account.email}] ⏸️ Đang trong khung giờ nghỉ (18h29 - 21h00 GMT+7). Tuyệt đối không login game. Tự động đặt lịch chạy tiếp lúc 21h01.`);
        await this.noteManager.updateAccountRun(account, {
          roleName: accRecord?.name || '',
          nextRunTime: resumeTime,
          naudan: { hasAction: false },
          cungvu: { hasAction: false },
          noivu: { hasAction: false }
        });
        return { success: true, skipped: true, nextRunTime: resumeTime };
      }

      console.log(`[${account.email}] [1/4] Đăng nhập Passport MuuGame...`);
      const loginData = await loginPassport(account.email, account.password);

      console.log(`[${account.email}] [2/4] Xác thực SDK MuuGame...`);
      const sdkAuth = await authenticateSdk(loginData);

      console.log(`[${account.email}] [3/4] Bắt tay Gateway WebSocket...`);
      const gatewayData = await getGatewayAuth(sdkAuth, encryptHelper);

      const targetServerId = Number(account.serverId);
      const allServers = (gatewayData.myServerList || []).concat(gatewayData.serverList || []);
      let serverInfo = allServers.find(s => Number(s.serverId) === targetServerId);

      if (!serverInfo && allServers.length > 0) {
        serverInfo = allServers[0];
        console.warn(`[${account.email}] ⚠️ Không tìm thấy S${targetServerId} trên Gateway, dùng S${serverInfo.serverId}`);
      }

      if (!serverInfo) {
        throw new Error(`[${account.email}] Không thể lấy thông tin kết nối máy chủ S${targetServerId}`);
      }

      console.log(`[${account.email}] [4/4] Kết nối Game Server [S${serverInfo.serverId} - ${serverInfo.serverName || serverInfo.name || ''}]...`);
      client = new GameClient(serverInfo, gatewayData.rcode, gatewayData.gateId, encryptHelper, account);
      await client.connect();

      await new Promise(r => setTimeout(r, 2000));

      const roleName = client.playerData.name;
      console.log(`[${account.email}] ✅ Đăng nhập thành công! Nhân vật: [${roleName}] | Cấp: ${client.playerData.lv} | Lực chiến: ${client.playerData.power.toLocaleString('vi-VN')}`);

      let naudanResult = { reapedCount: 0, cookedCount: 0, unlockedCount: 0, minRemainSec: 3600, hasAction: false };
      let cungvuResult = { handledCount: 0, remainSec: 1800, hasAction: false };
      let noivuResult = { totalHarvested: 0, minRemainSec: 600, hasAction: false };

      if (currentNaudan < 6) {
        const kitchen = new KitchenService(client);
        naudanResult = await kitchen.execute();
        kitchen.destroy();
      } else {
        console.log(`[${account.email}] 🍲 [Nấu Đan] Đã đạt chỉ tiêu 6/6 lần hôm nay. Bỏ qua.`);
      }

      if (isInBlackoutWindow()) {
        client.close();
        const resumeTime = getBlackoutResumeTime();
        console.log(`[${account.email}] ⏸️ Chạm mốc 18h29 trong khi chạy. Cưỡng chế ngắt WebSocket và đặt lịch chạy tiếp lúc 21h01.`);
        await this.noteManager.updateAccountRun(account, {
          roleName,
          nextRunTime: resumeTime,
          naudan: naudanResult,
          cungvu: cungvuResult,
          noivu: noivuResult
        });
        return { success: true, skipped: true, nextRunTime: resumeTime };
      }

      await new Promise(r => setTimeout(r, 1000));

      const shouldSyncWithDan = currentNaudan < 6 && naudanResult.isCooking;
      const canRunDailyAffairs = !shouldSyncWithDan || naudanResult.hasAction;

      if (canRunDailyAffairs) {
        const affair = new AffairService(client);
        cungvuResult = await affair.execute();
        affair.destroy();
      } else {
        console.log(`[${account.email}] 📜 [Cung Vụ] Đang chờ mẻ đan chín để gom làm cùng lúc. Tạm hoãn để tích lũy lượt.`);
      }

      if (isInBlackoutWindow()) {
        client.close();
        const resumeTime = getBlackoutResumeTime();
        console.log(`[${account.email}] ⏸️ Chạm mốc 18h29 trong khi chạy. Cưỡng chế ngắt WebSocket và đặt lịch chạy tiếp lúc 21h01.`);
        await this.noteManager.updateAccountRun(account, {
          roleName,
          nextRunTime: resumeTime,
          naudan: naudanResult,
          cungvu: cungvuResult,
          noivu: noivuResult
        });
        return { success: true, skipped: true, nextRunTime: resumeTime };
      }

      await new Promise(r => setTimeout(r, 1000));

      if (canRunDailyAffairs) {
        const trade = new TradeService(client);
        noivuResult = await trade.execute();
        trade.destroy();
      } else {
        console.log(`[${account.email}] 💼 [Nội Vụ] Đang chờ mẻ đan chín để gom làm cùng lúc. Tạm hoãn để tích lũy lượt.`);
      }

      const updatedNaudan = currentNaudan + (naudanResult.hasAction ? 1 : 0);
      const updatedCungvu = currentCungvu + (cungvuResult.hasAction ? 1 : 0);
      const updatedNoivu = currentNoivu + (noivuResult.hasAction ? 1 : 0);

      if (naudanResult.boughtMaterials) {
        const diThao = naudanResult.materials ? naudanResult.materials.diThao : 0;
        const hoaLa = naudanResult.materials ? naudanResult.materials.hoaLa : 0;
        const tranQua = naudanResult.materials ? naudanResult.materials.tranQua : 0;
        const boughtHoaLa = naudanResult.boughtMaterials.hoaLa || 0;
        const boughtTranQua = naudanResult.boughtMaterials.tranQua || 0;
        const msg = [
          `🛒 <b>[MUA NGUYÊN LIỆU THÀNH CÔNG]</b>`,
          `👤 <b>Nhân vật:</b> ${roleName}`,
          `📧 <b>Tài khoản:</b> ${account.email} (S${account.serverId})`,
          `📦 <b>Đã mua bổ sung:</b>`,
          `  • Hoa Lạ: <b>+${boughtHoaLa}</b>`,
          `  • Trân Quả: <b>+${boughtTranQua}</b>`,
          `📊 <b>Tồn kho hiện tại:</b>`,
          `  • Hoa Lạ: <b>${hoaLa}</b>`,
          `  • Trân Quả: <b>${tranQua}</b>`,
          `  • Dị Thảo: <b>${diThao}</b>`
        ].join('\n');
        await sendNotification(msg);
        console.log(`[${account.email}] 📢 Đã gửi thông báo mua nguyên liệu thành công qua API.`);
      }

      if (naudanResult.hasAction) {
        const diThao = naudanResult.materials ? naudanResult.materials.diThao : 0;
        const hoaLa = naudanResult.materials ? naudanResult.materials.hoaLa : 0;
        const tranQua = naudanResult.materials ? naudanResult.materials.tranQua : 0;
        const unlockedCount = naudanResult.unlockedCount || 0;
        const cookedCount = naudanResult.cookedCount || 0;
        const msg = [
          `🍲 <b>[NẤU ĐAN THÀNH CÔNG +1]</b>`,
          `👤 <b>Nhân vật:</b> ${roleName}`,
          `📧 <b>Tài khoản:</b> ${account.email} (S${account.serverId})`,
          `🔥 <b>Bếp đã mở khóa:</b> ${unlockedCount} bếp`,
          `👨‍🍳 <b>Đã nấu lượt này:</b> ${cookedCount}/${unlockedCount} bếp`,
          `📈 <b>Tiến độ hôm nay:</b> ${updatedNaudan}/6 lần`,
          `📦 <b>Nguyên liệu còn lại:</b>`,
          `  • Dị Thảo: <b>${diThao}</b>`,
          `  • Hoa Lạ: <b>${hoaLa}</b>`,
          `  • Trân Quả: <b>${tranQua}</b>`
        ].join('\n');
        await sendNotification(msg);
        console.log(`[${account.email}] 📢 Đã gửi thông báo nấu đan thành công qua API.`);
      }

      let nextRunTime;
      if (updatedNaudan >= 6) {
        nextRunTime = getTomorrowMidnightGMT7();
        console.log(`[${account.email}] 🎉 Đã hoàn tất toàn bộ 6/6 lượt nấu đan trong ngày (Cung vụ: ${updatedCungvu}, Nội vụ: ${updatedNoivu}). Đặt lịch chạy tiếp vào ngày mai lúc 00h01: ${nextRunTime}`);
      } else if (naudanResult.isOutOfMaterials) {
        const effectiveCooldown = 600;
        const calculatedNext = new Date(Date.now() + effectiveCooldown * 1000);
        if (isInBlackoutWindow(calculatedNext)) {
          nextRunTime = getBlackoutResumeTime(calculatedNext);
          console.log(`[${account.email}] ⚠️ Thiếu nguyên liệu nấu đan nhưng rơi vào khung giờ nghỉ (18h29 - 21h00), chuyển lịch sang 21h01 (${nextRunTime.toISOString()})`);
        } else {
          nextRunTime = calculatedNext;
          console.log(`[${account.email}] ⚠️ Thiếu nguyên liệu nấu đan. Lên lịch kiểm tra lại sau 10 phút (${nextRunTime.toISOString()})`);
        }
      } else {
        const cookCooldown = Number(naudanResult.minRemainSec) || 3600;
        const effectiveCooldown = Math.max(300, cookCooldown + 30);
        const calculatedNext = new Date(Date.now() + effectiveCooldown * 1000);
        if (isInBlackoutWindow(calculatedNext)) {
          nextRunTime = getBlackoutResumeTime(calculatedNext);
          console.log(`[${account.email}] 🍲 Đang chờ mẻ đan chín. Thời gian chín rơi vào khung giờ nghỉ (18h29 - 21h00), chuyển lịch sang 21h01 (${nextRunTime.toISOString()})`);
        } else {
          nextRunTime = calculatedNext;
          console.log(`[${account.email}] 🍲 Đang chờ mẻ đan chín. Lượt chạy tiếp theo sau ${Math.round(effectiveCooldown / 60)} phút (${nextRunTime.toISOString()})`);
        }
      }

      await this.noteManager.updateAccountRun(account, {
        roleName,
        nextRunTime,
        naudan: naudanResult,
        cungvu: cungvuResult,
        noivu: noivuResult
      });

      return {
        success: true,
        nextRunTime,
        naudan: naudanResult,
        cungvu: cungvuResult,
        noivu: noivuResult
      };
    } catch (err) {
      console.error(`[${account.email}] ❌ Lỗi trong phiên làm việc: ${err.message}`);
      let fallbackNext = new Date(Date.now() + 15 * 60 * 1000);
      if (isInBlackoutWindow(fallbackNext)) {
        fallbackNext = getBlackoutResumeTime(fallbackNext);
      }
      try {
        await this.noteManager.updateAccountRun(account, {
          roleName: '',
          nextRunTime: fallbackNext,
          naudan: { hasAction: false },
          cungvu: { hasAction: false },
          noivu: { hasAction: false }
        });
      } catch (noteErr) {
      }
      return { success: false, error: err.message, nextRunTime: fallbackNext };
    } finally {
      if (client) {
        client.close();
      }
    }
  }
}

module.exports = TaskRunner;
