class BaseService {
  constructor(client, options = {}) {
    this.client = client;
    this.name = options.name || 'Service';
    this.listenedMsgIds = options.listenedMsgIds || [];

    this._packetHandler = (msgId, data) => {
      if (this.listenedMsgIds.includes(msgId)) {
        this.onPacket(msgId, data);
      }
    };
    this.client.registerPacketListener(this._packetHandler);
  }

  get playerData() {
    return this.client.playerData;
  }

  send(msgId, payload = {}) {
    return this.client.send(msgId, payload);
  }

  onPacket(msgId, data) {
  }

  sleepRandom(minSec, maxSec) {
    const ms = Math.floor((minSec + Math.random() * (maxSec - minSec)) * 1000);
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  waitFor(predicate, timeoutMs = 3000, intervalMs = 100) {
    return this.client.waitFor(predicate, timeoutMs, intervalMs);
  }

  destroy() {
    this.client.unregisterPacketListener(this._packetHandler);
  }
}

module.exports = BaseService;
