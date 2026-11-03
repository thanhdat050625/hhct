const crypto = require('crypto');
const WebSocket = require('ws');
const { CONFIG } = require('../config/constants');
const { encodeMsg, decodeBuffer } = require('./protocol');

function md5Hex(str) {
  return crypto.createHash('md5').update(str).digest('hex');
}

async function loginPassport(username, password) {
  const ts = Math.floor(Date.now() / 1000).toString();
  const hashedPw = md5Hex(password).toLowerCase();

  const params = {
    pf: '1',
    g: String(CONFIG.GAME_ID),
    v: String(CONFIG.CLIENT_VERSION),
    ts: ts,
    cu: 'VND',
    vi: String(CONFIG.CLIENT_VERSION),
    ln: 'vi',
    un: username.trim(),
    pw: hashedPw
  };

  const sortedKeys = Object.keys(params).sort();
  const queryStr = sortedKeys.map(k => `${k}=${params[k]}`).join('&');
  const sn = md5Hex(queryStr + CONFIG.APP_KEY).toUpperCase();
  params.sn = sn;

  const jsonStr = JSON.stringify(params);
  const data = Buffer.from(jsonStr, 'utf8').toString('base64');

  const res = await fetch(CONFIG.PASSPORT_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: 'data=' + encodeURIComponent(data)
  });

  if (!res.ok) {
    throw new Error(`[auth] Lỗi mạng khi đăng nhập Passport (${res.status} ${res.statusText})`);
  }

  const json = await res.json();
  if (json.code !== 200 || !json.data || !json.data.userid || !json.data.token) {
    const msg = typeof json.msg === 'string' ? json.msg : 'Đăng nhập Passport thất bại!';
    throw new Error(`[auth] ${msg} (code: ${json.code})`);
  }

  return json.data;
}

async function authenticateSdk(loginData) {
  const ts = Math.floor(Date.now() / 1000).toString();
  const checkPayload = {
    gameSimpleName: CONFIG.SIMPLE_NAME,
    sdkSimpleName: CONFIG.SDK_SIMPLE_NAME,
    sdkVersionCode: CONFIG.SDK_VERSION_CODE,
    openId: String(loginData.userid),
    sign: String(loginData.token),
    timestamp: ts,
    userType: '11',
    other: JSON.stringify({ token: loginData.token, userid: loginData.userid }),
    ot: 'Android'
  };

  const res = await fetch(CONFIG.CHECK_AUTH_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: 'data=' + encodeURIComponent(JSON.stringify(checkPayload))
  });

  if (!res.ok) {
    throw new Error(`[auth] Lỗi mạng khi xác thực SDK (${res.status} ${res.statusText})`);
  }

  const json = await res.json();
  if (json.code !== 1 || !json.serverSign) {
    const msg = typeof json.message === 'string' ? json.message : (typeof json.msg === 'string' ? json.msg : 'Xác thực SDK thất bại!');
    throw new Error(`[auth] ${msg} (code: ${json.code})`);
  }

  return json;
}

function getGatewayAuth(sdkAuth, encryptHelper) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(CONFIG.GATEWAY_WS_URL, {
      headers: { Origin: CONFIG.ORIGIN_CDN },
      rejectUnauthorized: true
    });

    let autoId = 1;
    let gateId = 1;
    let rcode = '';
    let serverList = [];
    let myServerList = [];
    let isSettled = false;

    const cleanup = () => {
      clearTimeout(timeout);
      ws.onopen = null;
      ws.onmessage = null;
      ws.onerror = () => {};
      ws.onclose = null;
    };

    const timeout = setTimeout(() => {
      if (!isSettled) {
        isSettled = true;
        cleanup();
        try { ws.terminate(); } catch (e) {}
        reject(new Error('[auth] Quá thời gian bắt tay Gateway WebSocket (timeout 30s)'));
      }
    }, 30000);

    ws.binaryType = 'arraybuffer';

    ws.onopen = () => {
      ws.send(encodeMsg(202106, { step: 1, value: encryptHelper.getSelfSalt() }, autoId++));
    };

    ws.onmessage = (evt) => {
      const pkts = decodeBuffer(Buffer.from(evt.data));
      for (const pkt of pkts) {
        if (!pkt || !pkt.data) continue;
        if (pkt.msgId === 202206 && pkt.data.step === 1) {
          const checkKey = encryptHelper.getCheckKey(pkt.data.value);
          ws.send(encodeMsg(202106, { step: 2, value: checkKey }, autoId++));
        } else if (pkt.msgId === 202206 && pkt.data.step === 2) {
          gateId = pkt.data.value;
          ws.send(encodeMsg(202105, {
            userType: sdkAuth.userType.toString(),
            openId: sdkAuth.openId.toString(),
            timestamp: sdkAuth.timestamp.toString(),
            serverSign: sdkAuth.serverSign,
            channel: CONFIG.CHANNEL
          }, autoId++));
        } else if (pkt.msgId === 202201) {
          rcode = pkt.data.rcode;
          ws.send(encodeMsg(202104, { channel: CONFIG.CHANNEL }, autoId++));
        } else if (pkt.msgId === 202203) {
          myServerList = Array.isArray(pkt.data.serverInfoList) ? pkt.data.serverInfoList : [];
        } else if (pkt.msgId === 202204) {
          serverList = Array.isArray(pkt.data.serverInfoList) ? pkt.data.serverInfoList : [];
          if (!isSettled) {
            isSettled = true;
            cleanup();
            try { ws.close(); } catch (e) {}
            resolve({ gateId, rcode, serverList, myServerList });
          }
        }
      }
    };

    ws.onerror = (err) => {
      if (!isSettled) {
        isSettled = true;
        cleanup();
        try { ws.terminate(); } catch (e) {}
        reject(err);
      }
    };

    ws.onclose = (evt) => {
      if (!isSettled) {
        isSettled = true;
        cleanup();
        const code = evt && evt.code ? evt.code : 1006;
        reject(new Error(`[auth] Gateway WebSocket bị đóng trước khi hoàn tất (code: ${code})`));
      }
    };
  });
}

module.exports = {
  loginPassport,
  authenticateSdk,
  getGatewayAuth
};
