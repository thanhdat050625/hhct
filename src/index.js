const http = require('http');
const { CONFIG, isInBlackoutWindow } = require('./config/constants');
const { loadAccounts } = require('./config/AccountLoader');
const NoteManager = require('./core/NoteManager');
const TaskRunner = require('./runners/TaskRunner');

function parseNextRunTimestamp(dateStr) {
  if (typeof dateStr !== 'string') return 0;
  const s = dateStr.trim();
  if (s.length === 0) return 0;
  if (s.includes('Z') || s.includes('+')) {
    return new Date(s).getTime();
  }
  return new Date(s.replace(' ', 'T') + '+07:00').getTime();
}

async function runCycle(accounts, runner, isOnce = false) {
  for (const acc of accounts) {
    try {
      await runner.runAccount(acc);
      await new Promise(r => setTimeout(r, 2000));
    } catch (err) {
      console.error(`[Main] Lỗi tài khoản [${acc.email}]:`, err.message);
    }
  }

  if (isOnce) {
    console.log('\n[Main] Đã hoàn thành đợt chạy tức thì (--now). Kết thúc chương trình.');
    process.exit(0);
  }
}

async function main() {
  console.log('👑 ========================================================');
  console.log('👑 BOT HOÀNG HẬU CÁT TƯỜNG (HHCT) - NẤU ĐAN, CUNG VỤ, NỘI VỤ');
  console.log('👑 ========================================================');

  const allAccounts = loadAccounts();
  const activeAccounts = allAccounts.filter(a => a.enabled);

  if (activeAccounts.length === 0) {
    console.warn('[Main] ⚠️ Không có tài khoản nào có trạng thái "on" trong config.json!');
    process.exit(0);
  }

  console.log(`[Main] Đã nạp ${activeAccounts.length}/${allAccounts.length} tài khoản đang kích hoạt (status: "on").\n`);

  const noteManager = new NoteManager();
  const runner = new TaskRunner(noteManager);

  const isNowMode = process.argv.includes('--now');
  if (isNowMode) {
    await runCycle(activeAccounts, runner, true);
    return;
  }

  const server = http.createServer((req, res) => {
    if (req.url === '/' || req.url === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'ok', service: 'hhct-thue', time: new Date().toISOString() }));
      return;
    }
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not Found');
  });

  server.listen(CONFIG.PORT, () => {
    console.log(`[HTTP] Web Service đang lắng nghe tại cổng ${CONFIG.PORT}`);
  });

  const selfUrl = process.env.RENDER_EXTERNAL_URL;
  if (typeof selfUrl === 'string' && selfUrl.length > 0) {
    setInterval(async () => {
      try {
        await fetch(selfUrl + '/health');
      } catch (_) {}
    }, 600000);
  }

  try {
    const notifyOrigin = new URL(CONFIG.NOTIFY_API_URL).origin;
    setInterval(async () => {
      try {
        await fetch(notifyOrigin, { signal: AbortSignal.timeout(10000) });
      } catch (_) {}
    }, 600000);
  } catch (_) {}

  await runCycle(activeAccounts, runner, false);

  console.log('\n[Scheduler] ⏳ Bắt đầu vòng lập lịch kiểm tra theo thời gian nextRunTime (chu kỳ 60s)...');

  let tickCount = 0;
  const runningAccounts = new Set();

  setInterval(async () => {
    tickCount++;
    try {
      const noteData = await noteManager.fetchNoteData();
      const now = Date.now();
      const shouldLogStatus = (tickCount % 10 === 0);
      const isBlackout = isInBlackoutWindow(now);

      if (isBlackout) {
        if (shouldLogStatus) {
          console.log('[Scheduler] ⏸️ Đang trong khung giờ nghỉ (18h29 - 21h00 GMT+7). Tuyệt đối không login game. Tiếp tục chạy lúc 21h01.');
        }
        for (const acc of activeAccounts) {
          if (runningAccounts.has(acc.accKey)) {
            continue;
          }
          const accRecord = noteData && (noteData[acc.accKey] || (noteData.accounts && noteData.accounts[acc.accKey]));
          const nextRunTimestamp = accRecord && accRecord.nextRun ? parseNextRunTimestamp(accRecord.nextRun) : 0;
          if (now >= nextRunTimestamp) {
            runningAccounts.add(acc.accKey);
            try {
              await runner.runAccount(acc);
            } finally {
              runningAccounts.delete(acc.accKey);
            }
          }
        }
        return;
      }

      for (const acc of activeAccounts) {
        if (runningAccounts.has(acc.accKey)) {
          continue;
        }

        const accRecord = noteData && (noteData[acc.accKey] || (noteData.accounts && noteData.accounts[acc.accKey]));
        if (!accRecord || !accRecord.nextRun) {
          runningAccounts.add(acc.accKey);
          try {
            await runner.runAccount(acc);
          } finally {
            runningAccounts.delete(acc.accKey);
          }
          continue;
        }

        const nextRunTimestamp = parseNextRunTimestamp(accRecord.nextRun);
        if (now >= nextRunTimestamp) {
          console.log(`[Scheduler] ⏰ Đến thời điểm chạy tiếp theo của [${acc.email} - S${acc.serverId}]. Kích hoạt phiên...`);
          runningAccounts.add(acc.accKey);
          try {
            await runner.runAccount(acc);
          } finally {
            runningAccounts.delete(acc.accKey);
          }
        } else if (shouldLogStatus) {
          const diffMin = Math.max(1, Math.round((nextRunTimestamp - now) / 60000));
          console.log(`[Scheduler] ⏳ [${acc.email} - S${acc.serverId}] Dự kiến chạy tiếp sau ${diffMin} phút (${accRecord.nextRun})`);
        }
      }
    } catch (err) {
      console.error('[Scheduler] Lỗi chu kỳ lập lịch:', err.message);
    }
  }, 60000);
}

main().catch(err => {
  console.error('[Main] Lỗi nghiêm trọng:', err.message);
  process.exit(1);
});
