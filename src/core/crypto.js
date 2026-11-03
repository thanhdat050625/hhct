const CRC16Helper = (() => {
  const POLYNOMIAL = 4129;
  const DropBits = [
    4294967295, 4294967294, 4294967292, 4294967288,
    4294967280, 4294967264, 4294967232, 4294967168,
    4294967040, 4294966784, 4294966272, 4294965248,
    4294963200, 4294959104, 4294950912, 4294934528
  ];

  function makeCRCTable() {
    const table = new Array(256);
    for (let a = 0; a < 256; ++a) {
      let e = (a << 8) & 4294967040;
      for (let n = 0; n < 8; ++n) {
        e = (32768 & e) ? ((e << 1) & 4294967294) ^ POLYNOMIAL : ((e << 1) & 4294967294);
      }
      table[a] = e >>> 0;
    }
    return table;
  }

  const CRCTable = makeCRCTable();

  function CRCBitReflect(e, i) {
    let a = 0;
    i--;
    for (let o = 0; o <= i; ++o) {
      const n = i - o;
      if (1 & e) a |= (1 << n) & DropBits[n];
      e = (e >> 1) & 2147483647;
    }
    return a >>> 0;
  }

  function update(buf) {
    let n = 0;
    let o = 0;
    for (let r = 0; r < buf.length; ++r) {
      const byte = buf[r];
      o = (255 & CRCBitReflect(byte, 8)) ^ ((n >> 8) & 16777215);
      o &= 255;
      n = CRCTable[o] ^ ((n << 8) & 4294967040);
    }
    return 65535 & (0 ^ CRCBitReflect(n, 16));
  }

  return { update };
})();

class EncryptHelper {
  constructor() {
    this.selfSalt = 0;
    this.sKey = 0;
    this.sKeyBuff = new Uint8Array(4);
    this.autoAddCode = 0;
    this.encryptCode = 0;
  }

  getSelfSalt() {
    this.selfSalt = Math.floor(Math.random() * (Date.now() / 1000));
    return this.selfSalt;
  }

  getCheckKey(serverSalt) {
    this.sKey = ((this.selfSalt ^ serverSalt) + 8254) >>> 0;
    for (let i = 0; i < 4; ++i) {
      this.sKeyBuff[i] = (this.sKey & (255 << (i << 3))) >> (i << 3);
    }
    const buf = Buffer.alloc(4);
    buf.writeUInt32LE(this.sKey, 0);
    return CRC16Helper.update(buf);
  }

  calculateEncryptLength(sKey, serverId, loginCode) {
    const bytes = Buffer.from(loginCode, 'utf8');
    let o = sKey;
    for (let r = 0; r < bytes.length; r++) {
      o = (o ^ bytes[r]) + (serverId << r);
    }
    return 4 + ((2147483647 & o) % 7);
  }

  generateGameServerCode(serverId, loginCode) {
    const a = (serverId << 3) ^ (this.sKey + serverId);
    for (let i = 0; i < 4; ++i) {
      this.sKeyBuff[i] = (a & (255 << (i << 3))) >> (i << 3);
    }
    this.autoAddCode = serverId + Math.floor(10 * Math.random());
    this.encryptCode = this.calculateEncryptLength(this.sKey, serverId, loginCode);
  }

  encodeGamePacket(buffer, length) {
    const len = Math.min(length, buffer.length);
    for (let o = 0; o < len; ++o) {
      buffer[o] ^= this.sKeyBuff[o % 4];
    }
    return buffer;
  }
}

module.exports = {
  CRC16Helper,
  EncryptHelper
};
