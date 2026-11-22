# AGENT RULES & ARCHITECTURE SPECIFICATIONS
- **Authority:** Bắt buộc tuân thủ 100% trong mọi tác vụ lập trình, sửa lỗi, refactor và bảo trì.
- **Reverse Engineering Tools:** Dùng bộ tool tại `D:\GAME\tools` hoặc MCP `rea` để phân tích source game; file giải mã đặt tại `_source_game`.
## 1. HARD RULES (ZERO-TOLERANCE)
### 1.1. Hành Vi & Thực Thi
- **Tự sửa lỗi không hỏi:** Khi gặp bug, lỗi runtime hoặc xung đột code, tự động sửa và kiểm tra lại đến khi đạt yêu cầu mà KHÔNG hỏi lại người dùng.
- **Ưu tiên tốc độ & hiệu năng:** Mọi lựa chọn về kiến trúc, thuật toán, thư viện đều phải ưu tiên tốc độ thực thi nhanh nhất, gọn nhất, hiệu quả nhất.
- **Không tạo nhân vật / server mới:** Tuyệt đối KHÔNG tự ý vào server mới hoặc tạo nhân vật mới; chỉ chạy trên server mà tài khoản đã có nhân vật.
- **Bảo toàn tài nguyên game (Zero Resource Waste):** Tuyệt đối KHÔNG tự ý tiêu Vàng, Bạc, Đan dược quý, Vé quay có phí. Chỉ nhận free, bái kiến free, điểm danh, nhận mốc thưởng và dùng lượt miễn phí hằng ngày.
### 1.2. Chuẩn Mã Nguồn
- **CẤM chú thích code:** Tuyệt đối KHÔNG thêm bất kỳ comment, chú thích hay ghi chú nào vào file code (`.js`, `.html`, `.css`...); nếu file đang sửa có comment sẵn thì xóa sạch.
- **CẤM cache trạng thái tĩnh:** Không tạo/ghi trạng thái game ra file đĩa cục bộ (`daily_state.json`, `game_state.json`...). Server Game là *Single Source of Truth* — mọi trạng thái phải đọc real-time từ WebSocket.
- **CẤM fallback & hardcode (Fail-Fast):**
  - Không dùng fallback (`||`, `&&`, `?:`) cho biến môi trường (`process.env.*`) hoặc ở các chỗ nghiệp vụ không cần fallback làm sai lệch logic.
  - Không hardcode URL, mật khẩu, ID, token dự phòng trong mã nguồn.
  - Thiếu biến môi trường bắt buộc -> `throw new Error(...)` và dừng ngay khi khởi chạy.
  - Kiểm tra dữ liệu bằng `typeof`, `if/else` tường minh, không che giấu dữ liệu thiếu.
- **Giới hạn `1000` dòng / file:** File logic (`.js`, `.html`, `.css`...) không vượt quá `1000` dòng; khi tiệm cận `500 - 800` dòng phải chủ động tách module (Component, Controller, Service, Helper). Ngoại lệ duy nhất: JSON từ điển/dữ liệu tĩnh (`item_names.json`, `main_tasks.json`, `proto.json`).
- **Tách module Frontend:** Giao diện web bắt buộc tách riêng `index.html`, `style.css`, `app.js`; không nhúng HTML dài trong file server.
## 2. CHU TRÌNH 4 BƯỚC CHO MỌI GAME SERVICE
Mọi Service (Hoàng Cung, BXH, 7 Ngày, Thành Tựu, Vườn Hoa, Nông Trại, Đấu Boss...) phải tuân theo đúng thứ tự:
1. **Query & Reset:** Reset biến tạm trên client -> gửi gói query (`send(msgId, {})`) -> sleep ngẫu nhiên `1.2s - 2.0s`.
2. **Route Response:** Định tuyến chính xác `msgId` trong `GameClient.js` và gán dữ liệu vào thuộc tính client.
3. **Validate Server Flags:** Kiểm tra trực tiếp các trường Protobuf trả về từ Server, không tự suy đoán.
4. **Execute & Log Minh Bạch:**
   - **CẤM** log ID số trần (`[ID: 10012001]`, `[Mục Tiêu 10014]`).
   - **BẮT BUỘC** map ID sang tên/nội dung Tiếng Việt (`👉 Đang nhận: [Tổng tư chất Tùy Tùng đạt 10]...`) và in chi tiết phần thưởng (`🎉 +10 Vàng, +50,000 Bạc`) hoặc mã lỗi nếu thất bại.
> **Fresh State Re-sync:** Sau mọi thao tác làm thay đổi chỉ số (vượt ải, thăng quan, tăng thế lực, dùng đan), BẮT BUỘC gửi lại lệnh query (`125102`, `162101`) để đồng bộ mốc thưởng mới từ Server.
## 3. VÒNG ĐỜI PHIÊN & KẾT NỐI (ZERO MEMORY LEAK)
- **Đăng nhập đè (`101203 ResSubstitute`):** Ngắt kết nối (`client.close()`) và dừng bot ngay lập tức, KHÔNG reconnect.
- **Giải phóng tài nguyên:** Module chạy theo đợt phải đóng WebSocket ngay khi hoàn tất; hủy toàn bộ `setInterval`/`setTimeout` (heartbeat, ping-pong, watchdog) và event listeners khi đóng socket.
## 4. QUY TRÌNH HOÀN TẤT & QUẢN TRỊ GIT
- **Cập nhật tiến độ:** Ghi nhận tính năng/sửa lỗi đã hoàn thành vào `list-done.md`.
- **Dọn file tạm:** Xóa sạch file test (`test_*.js`), file debug (`debug_*.json`) và dữ liệu tạm trước khi kết thúc/commit.
- **Quy tắc Commit & Push:**
  - **KHÔNG** tự ý `git commit` — chỉ commit khi người dùng chỉ thị trực tiếp.
  - **KHÔNG** tự ý `git push` trong mọi tình huống trừ khi có lệnh rõ ràng.
  - **CẤM** thêm thông tin contribute hoặc `Co-Authored-By` của AI/Claude vào commit message hay PR.
  - Mặc định commit theo từng tính năng hoàn chỉnh; chỉ squash thành 1 commit khi người dùng yêu cầu cụ thể.
