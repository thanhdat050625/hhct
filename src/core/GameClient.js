const WebSocket = require('ws');
const { encodeMsg, decodeBuffer } = require('./protocol');
const { CONFIG, isInBlackoutWindow } = require('../config/constants');

class GameClient {
  constructor(serverInfo, rcode, gateId, encryptHelper, account) {
    this.serverInfo = serverInfo;
    this.rcode = rcode;
    this.gateId = gateId;
    this.encryptHelper = encryptHelper;
    this.account = account;
    this.ws = null;
    this.autoId = 1;
    this.heartbeatTimer = null;
    this.connectTimer = null;
    this.blackoutWatchdog = null;
    this.isReady = false;
    this.isManualClosed = false;
    this.isKicked = false;
    this.kickReason = '';

    this.playerData = {
      name: '',
      playerId: '',
      lv: 1,
      power: 0,
      vip: 0,
      silver: 0,
      food: 0,
      soldier: 0,
      gold: 0,
      exp: 0,
      allianceName: ''
    };

    this.tradeInfoList = [];
    this.workList = [];
    this.workRefreshTime = 0;
    this.cookList = [];
    this.bagInfoList = [];
    this.lastReturnCode = null;

    this.packetListeners = new Set();
  }

  get email() {
    if (this.account && typeof this.account.email === 'string') {
      return this.account.email;
    }
    return 'Unknown';
  }

  connect() {
    return new Promise((resolve, reject) => {
      if (isInBlackoutWindow()) {
        return reject(new Error(`[${this.email}] Từ chối kết nối: Đang trong khung giờ nghỉ (18h29 - 21h00 GMT+7).`));
      }
      let isSettled = false;
      this.connectTimer = setTimeout(() => {
        if (!isSettled) {
          isSettled = true;
          this.close();
          reject(new Error(`[${this.email}] Quá thời gian kết nối Game Server (timeout 30s)`));
        }
      }, 30000);

      const safeResolve = () => {
        if (!isSettled) {
          isSettled = true;
          if (this.connectTimer) {
            clearTimeout(this.connectTimer);
            this.connectTimer = null;
          }
          this.isReady = true;
          this.startHeartbeat();
          resolve();
        }
      };

      const safeReject = (err) => {
        if (!isSettled) {
          isSettled = true;
          if (this.connectTimer) {
            clearTimeout(this.connectTimer);
            this.connectTimer = null;
          }
          this.close();
          reject(err);
        }
      };

      const targetCodeServerId = (Number(this.serverInfo.mainServerId) > 0) ? Number(this.serverInfo.mainServerId) : Number(this.serverInfo.serverId);
      this.encryptHelper.generateGameServerCode(targetCodeServerId, this.rcode);
      this.autoId = this.encryptHelper.autoAddCode + 1;

      this.blackoutWatchdog = setInterval(() => {
        if (isInBlackoutWindow()) {
          console.warn(`[${this.email}] ⛔ Chạm khung giờ nghỉ (18h29 - 21h00 GMT+7). Cưỡng chế ngắt WebSocket ngay lập tức!`);
          this.close();
        }
      }, 1000);

      const wsUrl = `wss://${this.serverInfo.ip}:${this.serverInfo.port}`;
      try {
        this.ws = new WebSocket(wsUrl, {
          headers: { Origin: CONFIG.ORIGIN_CDN },
          rejectUnauthorized: false
        });
      } catch (err) {
        return safeReject(err);
      }

      this.ws.binaryType = 'arraybuffer';

      this.ws.on('open', () => {
        const initBuf = encodeMsg(101106, { code: this.rcode, gateId: this.gateId }, this.autoId++);
        this.sendRaw(initBuf);
      });

      this.ws.on('message', (data) => {
        try {
          const buf = Buffer.from(data);
          const pkts = decodeBuffer(buf);
          for (const pkt of pkts) {
            this.handlePacket(pkt, safeResolve, safeReject);
          }
        } catch (err) {
        }
      });

      this.ws.on('error', (err) => {
        safeReject(err);
      });

      this.ws.on('close', (code, reason) => {
        this.stopHeartbeat();
        if (!this.isManualClosed && !isSettled) {
          safeReject(new Error(`[${this.email}] Game WebSocket bị đóng (code: ${code}, reason: ${reason || 'unknown'})`));
        }
      });
    });
  }

  handlePacket(pkt, safeResolve, safeReject) {
    if (!pkt) return;
    const { msgId, data } = pkt;

    if (msgId === 101206) {
      const loginPkt = encodeMsg(101101, {
        code: this.rcode,
        serverId: this.serverInfo.serverId,
        channel: CONFIG.CHANNEL,
        version: CONFIG.CLIENT_VERSION,
        param: JSON.stringify({ deviceOS: 'Android', step: 0 })
      }, this.autoId++, true, this.encryptHelper);
      this.sendRaw(loginPkt);
    } else if (msgId === 101201) {
    } else if (msgId === 101203) {
      this.isKicked = true;
      this.kickReason = (data && data.reason) ? data.reason : 'Tài khoản bị đăng nhập ở nơi khác';
      console.warn(`[${this.email}] ⚠️ Đăng nhập đè (ResSubstitute): ${this.kickReason}. Ngắt kết nối ngay.`);
      this.close();
      if (safeReject) safeReject(new Error(`[${this.email}] ${this.kickReason}`));
    } else if (msgId === 102201) {
      if (data) {
        const pInfo = data.playerInfo || {};
        const attrs = data.playerAttributeList || [];
        const attrMap = {};
        attrs.forEach(a => { attrMap[a.attType] = Number(a.attValue) || 0; });

        this.playerData.name = pInfo.playerName || '';
        this.playerData.playerId = pInfo.playerId;
        this.playerData.allianceName = pInfo.allianceName || '';
        this.playerData.attrMap = attrMap;
        this.playerData.lv = attrMap[106] || 1;
        this.playerData.power = attrMap[105] || 0;
        this.playerData.vip = Math.max(0, (Number(attrMap[108]) || 1) - 1);
      }
      safeResolve();
    } else if (msgId === 145201) {
      if (data.workInfoList) this.workList = data.workInfoList;
      if (data.tradeInfoList) {
        this.tradeInfoList = data.tradeInfoList;
        this.tradeInfoList.forEach(t => { t.updatedAt = Date.now(); });
      }
      if (data.workTime !== undefined) {
        const t = Number(data.workTime) || 0;
        this.workRefreshTime = t > 10000000 ? t : (t > 0 ? Math.floor(Date.now() / 1000) + t : 0);
      }
    } else if (msgId === 102206) {
      if (data.tradeInfoList) {
        data.tradeInfoList.forEach(t => {
          t.updatedAt = Date.now();
          const ex = this.tradeInfoList.find(x => x.type === t.type);
          if (ex) Object.assign(ex, t);
          else this.tradeInfoList.push(t);
        });
      }
    } else if (msgId === 102207) {
      const works = data.workInfoList || [];
      if (data.type === 1) {
        works.forEach(w => {
          if (!this.workList.some(ex => ex.workId === w.workId)) {
            this.workList.push(w);
          }
        });
      } else if (data.type === 2 || data.type === 5) {
        const ids = works.map(w => w.workId);
        this.workList = this.workList.filter(w => !ids.includes(w.workId));
      } else if (data.type === 4) {
        this.workList = works.slice();
      }
      if (data.time !== undefined) {
        const t = Number(data.time) || 0;
        this.workRefreshTime = t > 10000000 ? t : (t > 0 ? Math.floor(Date.now() / 1000) + t : 0);
      }
    } else if (msgId === 144201) {
      if (data.cookFuncDataInfo) {
        this.cookList = data.cookFuncDataInfo.cookList || [];
        this.bagInfoList = data.cookFuncDataInfo.bagInfoList || [];
      }
    } else if (msgId === 102226) {
      this.lastReturnCode = data;
    }

    for (const listener of this.packetListeners) {
      try {
        listener(msgId, data);
      } catch (e) {
      }
    }
  }

  registerPacketListener(fn) {
    this.packetListeners.add(fn);
  }

  unregisterPacketListener(fn) {
    this.packetListeners.delete(fn);
  }

  send(msgId, payload = {}) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      return false;
    }
    const pkt = encodeMsg(msgId, payload, this.autoId++, true, this.encryptHelper);
    return this.sendRaw(pkt);
  }

  sendRaw(buffer) {
    if (isInBlackoutWindow()) {
      console.warn(`[${this.email}] ⛔ Chạm khung giờ nghỉ (18h29 - 21h00 GMT+7). Cưỡng chế ngắt WebSocket!`);
      this.close();
      return false;
    }
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(buffer);
      return true;
    }
    return false;
  }

  startHeartbeat() {
    this.stopHeartbeat();
    this.heartbeatTimer = setInterval(() => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.send(101102, {});
      }
    }, 20000);
  }

  stopHeartbeat() {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  async waitFor(predicate, timeoutMs = 3000, intervalMs = 100) {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      if (predicate()) return true;
      await new Promise(r => setTimeout(r, intervalMs));
    }
    return predicate();
  }

  close() {
    this.isManualClosed = true;
    this.stopHeartbeat();
    if (this.blackoutWatchdog) {
      clearInterval(this.blackoutWatchdog);
      this.blackoutWatchdog = null;
    }
    if (this.connectTimer) {
      clearTimeout(this.connectTimer);
      this.connectTimer = null;
    }
    this.packetListeners.clear();
    if (this.ws) {
      try {
        this.ws.terminate();
      } catch (e) {}
      this.ws = null;
    }
  }
}

module.exports = GameClient;
