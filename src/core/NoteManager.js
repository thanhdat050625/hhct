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

class NoteManager {
  constructor(options = {}) {
    this.noteUrl = options.noteUrl || CONFIG.NOTE_URL;
    this.loginUrl = options.loginUrl || CONFIG.NOTE_LOGIN_URL;
    this.saveUrl = options.saveUrl || CONFIG.NOTE_SAVE_URL;
    this.notePassword = options.notePassword || CONFIG.NOTE_PASSWORD;
    this.noteId = options.noteId || CONFIG.NOTE_ID;
    this.noteTitle = options.noteTitle || CONFIG.NOTE_TITLE;

    this.sessionCookie = null;
    this.sessionCookieExpiresAt = 0;
    this.loginPromise = null;
  }

  decodeHtmlEntities(str) {
    if (!str) return '';
    return str
      .replace(/&#34;|&quot;/g, '"')
      .replace(/&#39;|&apos;/g, "'")
      .replace(/&#43;/g, '+')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&#(\d+);/g, (_, dec) => String.fromCharCode(dec))
      .trim();
  }

  async ensureValidSession(force = false) {
    const isExpired = !this.sessionCookie || Date.now() >= (this.sessionCookieExpiresAt - 120000);
    if (force || isExpired) {
      await this.login(force);
    }
    return this.sessionCookie;
  }

  async login(force = false) {
    if (!force && this.sessionCookie && Date.now() < (this.sessionCookieExpiresAt - 120000)) {
      return this.sessionCookie;
    }

    if (this.loginPromise) {
      return await this.loginPromise;
    }

    this.loginPromise = (async () => {
      try {
        console.log('[NoteManager] Đang xác thực phiên quản trị Web Note...');
        const res = await fetch(this.loginUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'
          },
          body: new URLSearchParams({ password: this.notePassword }).toString(),
          redirect: 'manual'
        });

        const setCookie = res.headers.get('set-cookie');
        if (setCookie) {
          const cookieMatch = setCookie.match(/note_session=[^;]+/);
          if (cookieMatch) {
            this.sessionCookie = cookieMatch[0];
            let maxAgeSeconds = 3600;
            const maxAgeMatch = setCookie.match(/Max-Age=(\d+)/i);
            if (maxAgeMatch) {
              maxAgeSeconds = parseInt(maxAgeMatch[1], 10) || 3600;
            }
            this.sessionCookieExpiresAt = Date.now() + (maxAgeSeconds * 1000);
            return this.sessionCookie;
          }
        }

        const rawCookie = res.headers.get('set-cookie');
        if (rawCookie) {
          this.sessionCookie = rawCookie.split(';')[0];
          this.sessionCookieExpiresAt = Date.now() + (3600 * 1000);
          return this.sessionCookie;
        }

        throw new Error('[NoteManager] Không tìm thấy cookie phiên sau khi đăng nhập Web Note.');
      } finally {
        this.loginPromise = null;
      }
    })();

    return await this.loginPromise;
  }

  async fetchRawContent() {
    const res = await fetch(this.noteUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
        'Cache-Control': 'no-cache, no-store'
      }
    });

    if (!res.ok) {
      throw new Error(`[NoteManager] HTTP ${res.status} ${res.statusText} khi đọc ${this.noteUrl}`);
    }

    const html = await res.text();
    const match = html.match(/<div class="content-text">([\s\S]*?)<\/div>/i);
    if (!match) {
      if (html.startsWith('[') || html.startsWith('{')) {
        return this.decodeHtmlEntities(html);
      }
      return '';
    }

    return this.decodeHtmlEntities(match[1]);
  }

  async fetchNoteData() {
    try {
      const rawText = await this.fetchRawContent();
      if (!rawText || !rawText.trim()) {
        return {};
      }
      const parsed = JSON.parse(rawText);
      if (typeof parsed === 'object' && parsed !== null) {
        if (parsed.accounts && typeof parsed.accounts === 'object') {
          return parsed.accounts;
        }
        return parsed;
      }
    } catch (err) {
      console.warn('[NoteManager] Lưu ý: Dữ liệu Note chưa có hoặc không phải JSON hợp lệ. Khởi tạo cấu trúc mới.');
    }
    return {};
  }

  async saveRawContent(contentStr) {
    const cookie = await this.ensureValidSession();

    const postData = async (activeCookie) => {
      const body = new URLSearchParams({
        note_id: this.noteId,
        title: this.noteTitle,
        content: contentStr
      });

      return await fetch(this.saveUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Cookie': activeCookie,
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'
        },
        body: body.toString(),
        redirect: 'manual'
      });
    };

    let res = await postData(cookie);
    const loc = res.headers.get('location') || '';
    const isSessionExpired = res.status === 401 || res.status === 403 || (res.status === 302 && loc.includes('/auth/login'));

    if (isSessionExpired) {
      console.warn('[NoteManager] Phiên Web Note hết hạn. Đang đăng nhập lại...');
      const newCookie = await this.ensureValidSession(true);
      res = await postData(newCookie);
    }

    const newLoc = res.headers.get('location') || '';
    const isSuccess = (res.status === 200 || res.status === 302) && !newLoc.includes('/auth/login');

    if (!isSuccess) {
      throw new Error(`[NoteManager] Lưu Web Note thất bại. HTTP Status: ${res.status} Location: ${newLoc}`);
    }

    return true;
  }

  pruneOldHistory(historyMap, maxDays = 31) {
    if (!historyMap || typeof historyMap !== 'object') return;
    const cutoffDate = new Date(Date.now() - maxDays * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
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
        return `      "${d}": { "dan": ${item.dan || 0}, "cung": ${item.cung || 0}, "noi": ${item.noi || 0} }`;
      });

      const historyStr = historyLines.length > 0
        ? `{\n${historyLines.join(',\n')}\n    }`
        : '{}';

      const block = [
        `  "${k}": {`,
        `    "name": "${acc.name || ''}",`,
        `    "nextRun": "${acc.nextRun || ''}",`,
        `    "history": ${historyStr}`,
        `  }`
      ].join('\n');

      accBlocks.push(block);
    }

    return `{\n${accBlocks.join(',\n')}\n}`;
  }

  async updateAccountRun(account, runResult) {
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
  }
}

module.exports = NoteManager;
