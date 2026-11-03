const fs = require('fs');
const path = require('path');

const STATIC_URLS = [
  'https://yxgl-static.muugamevn.com:8007/server/all.json',
  'https://yxgl-static.52look.com:8007/server/all.json'
];
const CHANNEL = 'yxgl_android';
const LOCAL_BACKUP = path.join(__dirname, '_source_game', 'all.json');

async function fetchRawData() {
  for (const url of STATIC_URLS) {
    try {
      console.log(`Đang tải dữ liệu máy chủ từ: ${url}...`);
      const res = await fetch(url, {
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
        signal: AbortSignal.timeout(10000)
      });
      if (res.ok) {
        return await res.json();
      }
    } catch (err) {
      console.warn(`Không thể kết nối tới ${url}: ${err.message}`);
    }
  }

  if (fs.existsSync(LOCAL_BACKUP)) {
    console.log(`Đọc dữ liệu dự phòng từ: ${LOCAL_BACKUP}`);
    return JSON.parse(fs.readFileSync(LOCAL_BACKUP, 'utf8'));
  }

  throw new Error('Không thể lấy dữ liệu danh sách máy chủ từ cả server lẫn file dự phòng.');
}

function parseState(code) {
  switch (code) {
    case 0:
      return 'Mới mở';
    case 2:
      return 'Đông đúc';
    case 4:
      return 'Bình thường';
    case 6:
      return 'Bảo trì';
    case -1:
      return 'Chưa mở';
    default:
      return `Trạng thái ${code}`;
  }
}

function formatServer(item) {
  const dateStr = item.openTime
    ? new Date(item.openTime).toISOString().replace('T', ' ').substring(0, 19)
    : 'N/A';

  const host = item.ip;
  const port = item.port;
  const isMerged = Boolean(item.mainServerId && item.mainServerId !== item.serverId);

  return {
    cp_sid: item.serverId,
    serverName: item.serverName,
    cluster: item.home_name,
    host: host,
    port: port,
    wsUrl: `wss://${host}:${port}`,
    mainServerId: item.mainServerId || item.serverId,
    isMerged: isMerged,
    openTime: dateStr,
    openTimestamp: item.openTime,
    stateCode: item.state,
    stateText: parseState(item.state)
  };
}

function generateMarkdown(servers) {
  const now = Date.now();
  const opened = servers.filter(s => s.openTimestamp && s.openTimestamp <= now && s.stateCode !== -1);
  const unopened = servers.length - opened.length;

  let md = '# 👑 DANH SÁCH MÁY CHỦ HOÀNG HẬU CÁT TƯỜNG (HHCT)\n\n';
  md += `> **Tổng số máy chủ:** ${servers.length} | **Đã mở:** ${opened.length} | **Chưa mở/Dự kiến:** ${unopened}\n`;
  md += `> **Nguồn dữ liệu:** Cổng Gateway & CDN Tĩnh MuuGame / 52look (\`yxgl_android\`)\n\n`;
  md += '---\n\n';
  md += '## 📋 Bảng Tra Cứu Máy Chủ (Sắp xếp theo ID)\n\n';
  md += '| ID (cp_sid) | Tên Máy Chủ | Cụm | WebSocket Game URL | Server Gộp | Trạng Thái | Thời Gian Mở |\n';
  md += '| :---: | :--- | :--- | :--- | :---: | :---: | :--- |\n';

  for (const s of servers) {
    const mergedText = s.isMerged ? `S${s.mainServerId}` : '-';
    md += `| **${s.cp_sid}** | ${s.serverName} | ${s.cluster} | \`${s.wsUrl}\` | ${mergedText} | ${s.stateText} | ${s.openTime} |\n`;
  }

  return md;
}

async function main() {
  const raw = await fetchRawData();
  const rawList = raw[CHANNEL];

  if (!rawList || !Array.isArray(rawList)) {
    throw new Error(`Kênh '${CHANNEL}' không tồn tại trong dữ liệu máy chủ.`);
  }

  const servers = rawList.map(formatServer);

  // Xuất file JSON tra cứu
  const jsonPath = path.join(__dirname, 'servers.json');
  fs.writeFileSync(jsonPath, JSON.stringify(servers, null, 2), 'utf8');
  console.log(`✅ Đã xuất dữ liệu máy chủ dạng JSON: ${jsonPath} (${servers.length} máy chủ)`);

  // Xuất file Markdown tra cứu
  const mdPath = path.join(__dirname, 'servers.md');
  fs.writeFileSync(mdPath, generateMarkdown(servers), 'utf8');
  console.log(`✅ Đã xuất dữ liệu máy chủ dạng Markdown: ${mdPath}`);

  // In thống kê tóm tắt
  const now = Date.now();
  const opened = servers.filter(s => s.openTimestamp && s.openTimestamp <= now && s.stateCode !== -1);
  console.log('\n📊 THỐNG KÊ MÁY CHỦ HHCT:');
  console.log(`- Tổng số máy chủ cấu hình: ${servers.length}`);
  console.log(`- Máy chủ đang hoạt động: ${opened.length}`);
  console.log(`- Máy chủ dự kiến / chưa mở: ${servers.length - opened.length}`);
  console.log('\n🔍 MẪU 5 MÁY CHỦ MỚI NHẤT:');
  console.table(opened.slice(-5).map(s => ({
    cp_sid: s.cp_sid,
    serverName: s.serverName,
    cluster: s.cluster,
    wsUrl: s.wsUrl,
    state: s.stateText,
    openTime: s.openTime
  })));
}

main().catch(err => {
  console.error('❌ Lỗi khi trích xuất danh sách máy chủ:', err.message);
  process.exit(1);
});
