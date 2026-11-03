const path = require('path');
const protobuf = require('protobufjs');
const { getItemName, formatAwards, formatDuration } = require('../config/names');

const protoJsonPath = path.resolve(__dirname, '../../proto/proto.json');
const protoIdPath = path.resolve(__dirname, '../../proto/protoId.json');

const protoJson = require(protoJsonPath);
const protoId = require(protoIdPath);

const root = protobuf.Root.fromJSON(protoJson);

function encodeMsg(msgId, payload = {}, autoId = 1, isGame = false, encryptHelper = null) {
  const mapping = protoId.cs[msgId.toString()];
  if (!mapping) {
    throw new Error(`[protocol] Không tìm thấy định nghĩa client message ID: ${msgId}`);
  }
  const [mod, cls] = mapping;
  const type = root.lookupType('com.proto.' + mod + 'Message.' + cls);
  let protoBytes = Buffer.from(type.encode(type.create(payload)).finish());

  if (isGame && msgId !== 101106 && encryptHelper) {
    protoBytes = encryptHelper.encodeGamePacket(protoBytes, encryptHelper.encryptCode);
  }

  const totalLen = 12 + protoBytes.length;
  const pkt = Buffer.alloc(totalLen);
  pkt.writeUInt32BE(totalLen, 0);
  pkt.writeUInt32BE(autoId, 4);
  pkt.writeUInt32BE(msgId, 8);
  protoBytes.copy(pkt, 12);
  return pkt;
}

function decodeBuffer(buf) {
  const pkts = [];
  let offset = 0;
  while (offset < buf.length) {
    if (offset + 8 > buf.length) break;
    const contentLen = buf.readUInt32BE(offset);
    if (contentLen < 4 || offset + 4 + contentLen > buf.length) {
      break;
    }
    const msgId = buf.readUInt32BE(offset + 4);
    const protoLen = contentLen - 4;
    const protoBytes = buf.subarray(offset + 8, offset + 8 + protoLen);
    const mapping = protoId.sc[msgId.toString()];
    if (!mapping) {
      offset += 4 + contentLen;
      continue;
    }
    const [mod, cls] = mapping;
    let data = null;
    try {
      const type = root.lookupType('com.proto.' + mod + 'Message.' + cls);
      data = type.toObject(type.decode(protoBytes), {
        longs: String,
        enums: String,
        bytes: String,
        defaults: true
      });
    } catch (e) {
    }

    pkts.push({ msgId, mod, cls, data });
    offset += 4 + contentLen;
  }
  return pkts;
}

module.exports = {
  root,
  protoId,
  encodeMsg,
  decodeBuffer,
  getItemName,
  formatAwards,
  formatDuration
};
