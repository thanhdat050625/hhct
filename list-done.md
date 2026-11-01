# Danh Sách Công Việc Đã Hoàn Thành (List Done)

Dự án: **Hoàng Hậu Cát Tường (HHCT) Bot** — Hệ thống bot tự động hóa game Hoàng Hậu Cát Tường (100% Server-Authoritative State Sync).

---

## 📌 Tổng Hợp Tính Năng Đã Triển Khai

### 1. Kiến Trúc & Quy Chuẩn (Architecture & Guidelines)
- [x] **Chuẩn Hóa Quy Tắc Agent ([AGENTS.md](file:///d:/GAME/hhct/AGENTS.md))**: Tái cấu trúc bộ quy chuẩn kiến trúc bot, quy trình 4 bước, cấm cache tĩnh, bảo vệ biến môi trường (.env fail-fast), và bảng protocol đồng bộ 23 phân hệ.

### 2. Xác Thực & Kết Nối (Auth & WebSocket)
- [x] **Xác Thực Passport MuuGame & SDK Android (`yxgl_android`)**: Giải mã thuật toán băm mật khẩu MD5, tạo chữ ký `sn` với `APP_KEY`, gói tin Base64 gửi `passport.muugame.com/login/normalLogin` và xác thực SDK `logincheck/check/hhjxA1/muyou/V1_1`.
- [x] **Bắt Tay Gateway WebSocket & Game WebSocket ([GameClient.js](file:///d:/GAME/hhct/src/core/GameClient.js))**: Tự động bắt tay Gateway WS (port 6868), định tuyến máy chủ theo `cp_sid`, tính toán mã hóa động `generateGameServerCode` và `autoAddCode`, duy trì heartbeat định kỳ `101102`, giải phóng bộ nhớ và ngắt kết nối an toàn khi hoàn thành phiên.

### 3. Phân Hệ Tự Động Hóa (Game Services)
- [x] **Nấu Đan (Ngự Thiện Phòng - [KitchenService.js](file:///d:/GAME/hhct/src/domains/kitchen/KitchenService.js))**: Tự động thu hoạch toàn bộ bếp chín (`144104`), tự động nấu công thức phù hợp với nguyên liệu tồn kho trong túi (`144103`), tuân thủ nghiêm ngặt nguyên tắc Zero Resource Waste (không dùng Vàng mua nguyên liệu), tính toán thời gian chín kế tiếp.
- [x] **Cung Vụ Triều Đình ([AffairService.js](file:///d:/GAME/hhct/src/domains/daily/AffairService.js))**: Tự động phê duyệt các sự vụ tự nhiên khả dụng (`102102`), ưu tiên lựa chọn phương án nhận Cung Vận (EXP Tước Vị), tuyệt đối không dùng Cung Vụ Lệnh, tính toán thời gian hồi lượt tự nhiên.
- [x] **Sắp Xếp Nội Vụ ([TradeService.js](file:///d:/GAME/hhct/src/domains/daily/TradeService.js))**: Tự động thu hoạch Bạc, Thảo Dược, Binh Lực khả dụng (`102101`), không dùng vật phẩm tăng tốc, tính toán thời gian hồi lượt tự nhiên.
- [x] **Quản Lý Phiên & Đồng Bộ Web Note 31 Ngày ([NoteManager.js](file:///d:/GAME/hhct/src/core/NoteManager.js), [TaskRunner.js](file:///d:/GAME/hhct/src/runners/TaskRunner.js))**: Mỗi nhiệm vụ thực hiện 5 lần/ngày. Khi xong phiên, tính toán `nextRunTime` tối ưu dựa trên cooldown và ngắt kết nối WebSocket ngay lập tức. Khi đạt 5/5 lần cho cả 3 nhiệm vụ, thời gian chạy tự động chỉ sang đầu ngày tiếp theo (`00:00:01` GMT+7). Tự động đồng bộ và lưu trữ lịch sử 31 ngày gần nhất lên Web Note `https://van900379.onrender.com/notes/hhct-naudan-cungvu-noivu`.
- [x] **Tối Ưu Chu Kỳ Lập Lịch Đồng Bộ Theo Nấu Đan ([TaskRunner.js](file:///d:/GAME/hhct/src/runners/TaskRunner.js))**: Ưu tiên thời gian chín của mẻ đan làm mốc kích hoạt chính khi chưa đủ 5 lượt (`updatedNaudan < 5`), giúp Cung vụ và Nội vụ tích lũy đầy lượt tự nhiên và xử lý gom gọn trong 1 phiên duy nhất, giảm thiểu tối đa số lần login thừa.
- [x] **Triển Khai Web Service Cloud (Render)**: Khởi chạy HTTP server tích hợp, cấu hình bảo mật tài khoản qua `ACCOUNTS_JSON`, và kích hoạt tự động hóa 24/7 trên Render tại `https://hhct-tools.onrender.com`.
- [x] **Chuẩn Hóa Múi Giờ Lập Lịch & Giữ Kết Nối Cloud ([index.js](file:///d:/GAME/hhct/src/index.js))**: Tích hợp hàm `parseNextRunTimestamp` ép offset múi giờ GMT+7 chuẩn xác trên môi trường container UTC; bổ sung log heartbeat định kỳ 10 phút đếm ngược thời gian chạy cho từng tài khoản; tích hợp cơ chế tự ping keep-alive giữ Render Web Service không bị spin-down.
- [x] **Khung Giờ Tạm Dừng (18h29 - 21h00) & Cưỡng Chế Ngắt WebSocket ([TaskRunner.js](file:///d:/GAME/hhct/src/runners/TaskRunner.js), [GameClient.js](file:///d:/GAME/hhct/src/core/GameClient.js))**: Tích hợp hàm kiểm tra `isInBlackoutWindow` ngưng hoạt động trong khung 18h29 - 21h00 GMT+7 (dư 1 phút an toàn ở cả 2 đầu: bắt đầu từ 18h29 và chạy lại lúc 21h01); tích hợp watchdog 1s tự động cưỡng chế đóng WebSocket (`ws.terminate()`) nếu phiên đang chạy chạm mốc 18h29; chặn `sendRaw` và từ chối `connect` trong suốt khung giờ; tự động chuyển `nextRun` sang 21h01; chuyển mốc hoàn tất ngày mới sang 00h01 (`00:01:00` GMT+7).
- [x] **Nâng Mốc Nấu Đan Hằng Ngày Lên 6 Lần ([TaskRunner.js](file:///d:/GAME/hhct/src/runners/TaskRunner.js), [NoteManager.js](file:///d:/GAME/hhct/src/core/NoteManager.js))**: Tăng chỉ tiêu nấu đan từ 5 lên 6 lần/ngày (`Math.min(6, ...)` và `currentNaudan >= 6`); mốc hoàn tất ngày mới chuyển sang 00h01 khi đủ 6/6 lượt đan.
- [x] **Chặt Chẽ Điều Kiện Tính Lượt Nấu Đan ([KitchenService.js](file:///d:/GAME/hhct/src/domains/kitchen/KitchenService.js))**: Siết chặt cờ `hasAction` chỉ kích hoạt khi thực tế nấu thành công mẻ đan mới (`cookedCount > 0`), loại bỏ tình trạng chỉ thu hoạch mẻ chín cũ mà không nấu mới được vẫn bị tính +1 lượt trên Web Note.
- [x] **Giới Hạn Nấu Thuần Đan Dược ([names.js](file:///d:/GAME/hhct/src/config/names.js))**: Loại bỏ toàn bộ công thức Thức Ăn Mèo ra khỏi danh mục nấu nướng (`COOKBOOK_RECIPES`), chỉ giữ lại 3 loại Đan Dược Thuộc Tính (Đan, Hoàn, Tán), tuyệt đối không dùng nông sản nấu thức ăn.

### 4. Công Cụ & Tối Ưu (Tools & Optimization)
- [x] **Trích Xuất Danh Sách Toàn Bộ Máy Chủ ([get_servers.js](file:///d:/GAME/hhct/get_servers.js))**: Phân tích dữ liệu Gateway/CDN tĩnh từ Server MuuGame (`yxgl_android`), trích xuất đầy đủ 850 máy chủ (828 máy chủ đang hoạt động) kèm đầy đủ thông số (`cp_sid`, tên server, cụm, WebSocket game URL, port, server gộp, trạng thái, ngày mở) ra file dữ liệu [servers.json](file:///d:/GAME/hhct/servers.json).
