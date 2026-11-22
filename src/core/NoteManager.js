const { CONFIG } = require('../config/constants');

function formatVnTime(dateInput) {
  const d = dateInput instanceof Date ? dateInput : new Date(dateInput);
  const parts = new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Asia/Ho_Chi_Minh',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  }).format(d);
  return parts.replace('T', ' ');
}

function getVnToday() {
  return new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Asia/Ho_Chi_Minh',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(new Date());
}

function getVnDateOffset(daysAgo) {
  return new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Asia/Ho_Chi_Minh',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000));
}

class NoteManager {
  constructor(options = {}) {
    this.noteUrl = typeof options.noteUrl === 'string' && options.noteUrl.length > 0 ? options.noteUrl : CONFIG.NOTE_URL;
    this.loginUrl = typeof options.loginUrl === 'string' && options.loginUrl.length > 0 ? options.loginUrl : CONFIG.NOTE_LOGIN_URL;
    this.saveUrl = typeof options.saveUrl === 'string' && options.saveUrl.length > 0 ? options.saveUrl : CONFIG.NOTE_SAVE_URL;
    this.notePassword = typeof options.notePassword === 'string' && options.notePassword.length > 0 ? options.notePassword : CONFIG.NOTE_PASSWORD;
    this.noteId = typeof options.noteId === 'string' && options.noteId.length > 0 ? options.noteId : CONFIG.NOTE_ID;
    this.noteTitle = typeof options.noteTitle === 'string' && options.noteTitle.length > 0 ? options.noteTitle : CONFIG.NOTE_TITLE;

    this.requestTimeoutMs = 20000;
    this._writeQueue = Promise.resolve();
  }

  decodeHtmlEntities(str) {
    if (!str) return '';
    const namedMap = {
      '&#34;': '"',
      '&quot;': '"',
      '&#39;': "'",
      '&apos;': "'",
      '&#43;': '+',
      '&lt;': '<',
      '&gt;': '>',
      '&nbsp;': ' ',
      '&amp;': '&'
    };
    return str
      .replace(/&#34;|&quot;|&#39;|&apos;|&#43;|&lt;|&gt;|&nbsp;|&amp;|&#(\d+);|&#x([0-9a-f]+);/gi, (match, dec, hex) => {
        if (dec !== undefined) {
          return String.fromCharCode(parseInt(dec, 10));
        }
        if (hex !== undefined) {
          return String.fromCharCode(parseInt(hex, 16));
        }
        const key = match.toLowerCase();
        return Object.prototype.hasOwnProperty.call(namedMap, key) ? namedMap[key] : match;
      })
      .trim();
  }

  extractSessionCookie(res) {
    const rawCookies = typeof res.headers.getSetCookie === 'function'
      ? res.headers.getSetCookie()
      : (res.headers.get('set-cookie') ? [res.headers.get('set-cookie')] : []);

    for (const raw of rawCookies) {
      const cookieMatch = raw.match(/note_session=[^;]+/);
      if (cookieMatch) {
        return cookieMatch[0];
      }
    }

    if (rawCookies.length > 0) {
      const firstPair = rawCookies[0].split(';')[0].trim();
      if (firstPair.length > 0) {
        return firstPair;
      }
    }

    return null;
  }

  extractCsrfToken(html) {
    if (typeof html !== 'string' || html.length === 0) return null;
    const patterns = [
      /<input[^>]*name=["']csrf_token["'][^>]*value=["']([^"']+)["']/i,
      /<input[^>]*value=["']([^"']+)["'][^>]*name=["']csrf_token["']/i,
      /<meta[^>]*name=["']csrf-token["'][^>]*content=["']([^"']+)["']/i,
      /<meta[^>]*content=["']([^"']+)["'][^>]*name=["']csrf-token["']/i
    ];
    for (const pattern of patterns) {
      const match = html.match(pattern);
      if (match && match[1]) {
        return match[1];
      }
    }
    return null;
  }

  extractFormMode(html) {
    if (typeof html !== 'string' || html.length === 0) return null;
    const patterns = [
      /<input[^>]*name=["']mode["'][^>]*value=["']([^"']+)["']/i,
      /<input[^>]*value=["']([^"']+)["'][^>]*name=["']mode["']/i
    ];
    for (const pattern of patterns) {
      const match = html.match(pattern);
      if (match && match[1]) {
        return match[1];
      }
    }
    return null;
  }

  getAdminBaseUrl() {
    return this.saveUrl.replace(/\/action\/save\/?$/, '');
  }

  async login() {
    console.log('[NoteManager] Đang xác thực phiên quản trị Web Note...');
    const getRes = await fetch(this.loginUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
        'Cache-Control': 'no-cache, no-store'
      },
      signal: AbortSignal.timeout(this.requestTimeoutMs)
    });

    if (!getRes.ok) {
      throw new Error(`[NoteManager] Không thể tải trang đăng nhập Web Note (HTTP ${getRes.status}).`);
    }

    const initCookie = this.extractSessionCookie(getRes);
    const loginHtml = await getRes.text();
    const csrfToken = this.extractCsrfToken(loginHtml);

    if (!initCookie) {
      throw new Error('[NoteManager] Không tìm thấy cookie khởi tạo trên trang đăng nhập Web Note.');
    }
    if (!csrfToken) {
      throw new Error('[NoteManager] Không tìm thấy csrf_token trên trang đăng nhập Web Note.');
    }

    const loginOrigin = new URL(this.loginUrl).origin;
    const res = await fetch(this.loginUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Cookie': initCookie,
        'Origin': loginOrigin,
        'Referer': this.loginUrl,
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'
      },
      body: new URLSearchParams({
        csrf_token: csrfToken,
        password: this.notePassword
      }).toString(),
      redirect: 'manual',
      signal: AbortSignal.timeout(this.requestTimeoutMs)
    });

    const loc = res.headers.get('location') || '';
    const isAuthenticatedRedirect = res.status === 302 && loc.length > 0 && !loc.includes('/auth/login');

    if (!isAuthenticatedRedirect) {
      const errBody = (await res.text().catch(() => '')).slice(0, 200).trim();
      throw new Error(`[NoteManager] Đăng nhập Web Note thất bại. HTTP Status: ${res.status} Location: ${loc}${errBody ? ` Body: ${errBody}` : ''}`);
    }

    const postCookie = this.extractSessionCookie(res);
    return postCookie ? postCookie : initCookie;
  }

  async fetchRawContent() {
    let lastErr = null;
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const res = await fetch(this.noteUrl, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
            'Cache-Control': 'no-cache, no-store'
          },
          signal: AbortSignal.timeout(this.requestTimeoutMs)
        });

        if (res.status >= 500) {
          throw new Error(`[NoteManager] HTTP ${res.status} ${res.statusText} khi đọc ${this.noteUrl}`);
        }

        if (!res.ok) {
          throw new Error(`[NoteManager] HTTP ${res.status} ${res.statusText} khi đọc ${this.noteUrl}`);
        }

        const html = await res.text();
        const match = html.match(/<div class="content-text">([\s\S]*?)<\/div>/i);
        if (match) {
          return this.decodeHtmlEntities(match[1]);
        }

        const trimmed = html.trim();
        if (trimmed.startsWith('[') || trimmed.startsWith('{')) {
          return this.decodeHtmlEntities(html);
        }

        throw new Error('[NoteManager] Trang Web Note không chứa nội dung hợp lệ (thiếu content-text).');
      } catch (err) {
        lastErr = err;
        if (attempt < 3) {
          await new Promise(r => setTimeout(r, 1500));
        }
      }
    }
    throw lastErr;
  }

  async fetchNoteData() {
    const rawText = await this.fetchRawContent();
    if (!rawText || !rawText.trim()) {
      return {};
    }

    let parsed;
    try {
      parsed = JSON.parse(rawText);
    } catch (err) {
      throw new Error(`[NoteManager] Dữ liệu Note không phải JSON hợp lệ: ${err.message}`);
    }

    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      throw new Error('[NoteManager] Dữ liệu Note không đúng cấu trúc đối tượng JSON.');
    }

    if (parsed.accounts && typeof parsed.accounts === 'object' && !Array.isArray(parsed.accounts)) {
      return parsed.accounts;
    }
    return parsed;
  }

  async fetchSaveFormContext(cookie) {
    const adminBase = this.getAdminBaseUrl();
    const editUrl = `${adminBase}/action/edit/${encodeURIComponent(this.noteId)}`;
    const editRes = await fetch(editUrl, {
      headers: {
        'Cookie': cookie,
        'Cache-Control': 'no-cache, no-store',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'
      },
      redirect: 'manual',
      signal: AbortSignal.timeout(this.requestTimeoutMs)
    });

    const editLoc = editRes.headers.get('location') || '';
    const rotatedEditCookie = this.extractSessionCookie(editRes);
    let currentCookie = rotatedEditCookie ? rotatedEditCookie : cookie;

    if (editRes.status === 200) {
      const editHtml = await editRes.text();
      const csrfToken = this.extractCsrfToken(editHtml);
      if (!csrfToken) {
        throw new Error('[NoteManager] Không tìm thấy csrf_token trong trang chỉnh sửa Web Note.');
      }
      const mode = this.extractFormMode(editHtml);
      return {
        csrfToken,
        mode: typeof mode === 'string' && mode.length > 0 ? mode : 'edit',
        referer: editUrl,
        cookie: currentCookie
      };
    }

    if (editRes.status === 404) {
      const managerRes = await fetch(adminBase, {
        headers: {
          'Cookie': currentCookie,
          'Cache-Control': 'no-cache, no-store',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'
        },
        redirect: 'manual',
        signal: AbortSignal.timeout(this.requestTimeoutMs)
      });

      const managerLoc = managerRes.headers.get('location') || '';
      const rotatedManagerCookie = this.extractSessionCookie(managerRes);
      if (rotatedManagerCookie) {
        currentCookie = rotatedManagerCookie;
      }

      if (managerRes.status === 200) {
        const managerHtml = await managerRes.text();
        const csrfToken = this.extractCsrfToken(managerHtml);
        if (!csrfToken) {
          throw new Error('[NoteManager] Không tìm thấy csrf_token trên trang quản trị Web Note.');
        }
        return {
          csrfToken,
          mode: 'create',
          referer: adminBase,
          cookie: currentCookie
        };
      }

      throw new Error(`[NoteManager] Không thể tải trang quản trị Web Note (HTTP ${managerRes.status} Location: ${managerLoc}).`);
    }

    throw new Error(`[NoteManager] Không thể tải trang chỉnh sửa Web Note (HTTP ${editRes.status} Location: ${editLoc}).`);
  }

  async saveRawContent(contentStr) {
    const cookie = await this.login();
    const ctx = await this.fetchSaveFormContext(cookie);
    const saveOrigin = new URL(this.saveUrl).origin;

    const body = new URLSearchParams({
      csrf_token: ctx.csrfToken,
      mode: ctx.mode,
      note_id: this.noteId,
      title: this.noteTitle,
      content: contentStr
    });

    const res = await fetch(this.saveUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Cookie': ctx.cookie,
        'Origin': saveOrigin,
        'Referer': ctx.referer,
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'
      },
      body: body.toString(),
      redirect: 'manual',
      signal: AbortSignal.timeout(this.requestTimeoutMs)
    });

    const loc = res.headers.get('location') || '';
    const isSuccess = (res.status === 200 || res.status === 302) && !loc.includes('/auth/login');

    if (!isSuccess) {
      const bodySnippet = (await res.text().catch(() => '')).slice(0, 200).trim();
      throw new Error(`[NoteManager] Lưu Web Note thất bại. HTTP Status: ${res.status} Location: ${loc}${bodySnippet ? ` Body: ${bodySnippet}` : ''}`);
    }

    return true;
  }

  pruneOldHistory(historyMap, maxDays = 31) {
    if (!historyMap || typeof historyMap !== 'object') return;
    const cutoffDate = getVnDateOffset(maxDays);
    for (const d of Object.keys(historyMap)) {
      if (d < cutoffDate) {
        delete historyMap[d];
      }
    }
  }

  formatCompactJson(data) {
    const accKeys = Object.keys(data);
    if (accKeys.length === 0) return '{}';

    const accBlocks = [];
    for (const k of accKeys) {
      const acc = data[k];
      const historyKeys = Object.keys(acc.history || {}).sort().reverse();
      const historyLines = historyKeys.map(d => {
        const item = acc.history[d];
        return `      ${JSON.stringify(d)}: { "dan": ${item.dan || 0}, "cung": ${item.cung || 0}, "noi": ${item.noi || 0} }`;
      });

      const historyStr = historyLines.length > 0
        ? `{\n${historyLines.join(',\n')}\n    }`
        : '{}';

      const accName = typeof acc.name === 'string' ? acc.name : '';
      const accNextRun = typeof acc.nextRun === 'string' ? acc.nextRun : '';
      const block = [
        `  ${JSON.stringify(k)}: {`,
        `    "name": ${JSON.stringify(accName)},`,
        `    "nextRun": ${JSON.stringify(accNextRun)},`,
        `    "history": ${historyStr}`,
        `  }`
      ].join('\n');

      accBlocks.push(block);
    }

    return `{\n${accBlocks.join(',\n')}\n}`;
  }

  updateAccountRun(account, runResult) {
    const task = async () => {
      const noteData = await this.fetchNoteData();
      const accKey = account.accKey;
      const todayStr = getVnToday();

      if (!noteData[accKey]) {
        noteData[accKey] = {
          name: runResult.roleName || '',
          nextRun: formatVnTime(runResult.nextRunTime),
          history: {}
        };
      }

      const accData = noteData[accKey];
      if (!accData.history || typeof accData.history !== 'object') {
        accData.history = {};
      }
      if (runResult.roleName) {
        accData.name = runResult.roleName;
      }
      accData.nextRun = formatVnTime(runResult.nextRunTime);

      if (!accData.history[todayStr]) {
        accData.history[todayStr] = { dan: 0, cung: 0, noi: 0 };
      }

      const dayRecord = accData.history[todayStr];
      dayRecord.dan = typeof dayRecord.dan === 'number' ? dayRecord.dan : (typeof dayRecord.naudan === 'number' ? dayRecord.naudan : 0);
      dayRecord.cung = typeof dayRecord.cung === 'number' ? dayRecord.cung : (typeof dayRecord.cungvu === 'number' ? dayRecord.cungvu : 0);
      dayRecord.noi = typeof dayRecord.noi === 'number' ? dayRecord.noi : (typeof dayRecord.noivu === 'number' ? dayRecord.noivu : 0);

      if (runResult.naudan && runResult.naudan.hasAction) {
        dayRecord.dan = Math.min(6, dayRecord.dan + 1);
      }
      if (runResult.cungvu && runResult.cungvu.hasAction) {
        dayRecord.cung = dayRecord.cung + 1;
      }
      if (runResult.noivu && runResult.noivu.hasAction) {
        dayRecord.noi = dayRecord.noi + 1;
      }

      this.pruneOldHistory(accData.history, 31);

      const formattedJson = this.formatCompactJson(noteData);
      await this.saveRawContent(formattedJson);
      console.log(`[NoteManager] ✅ Đã lưu Web Note [${accKey}]. Tiến độ: Đan: ${dayRecord.dan}/6, Cung: ${dayRecord.cung}, Nội: ${dayRecord.noi} | Tiếp theo: ${accData.nextRun}`);
      return accData;
    };

    const run = this._writeQueue.then(task, task);
    this._writeQueue = run.catch(() => {});
    return run;
  }
}

module.exports = NoteManager;
