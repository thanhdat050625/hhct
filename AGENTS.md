# 👑 AGENT RULES & ARCHITECTURE SPECIFICATIONS
commit cấm contribute claude vào commit/PR
> **Scope:** Áp dụng cho toàn bộ Bot Game (`hhct`, `hhgl`, `hhgl-dau-tai-nghe`, `hhgl-ngan`, `hhgl-dk`, `hhgl-source`).  
> **Authority:** Bắt buộc tuân thủ 100% trong mọi tương tác, lập trình, refactor và bảo trì, không được tự ý tham gia server mới và tạo nhân vật mới chỉ dùng ở những server acc đó đã từng tạo nhân vật.
> có thể dùng bộ tool ở D:\GAME\tools hoặc mcp rea để phân tích source game, có thể giải mã ra tại _source_game
> **Tự sửa lỗi không hỏi**: Khi phát hiện lỗi, bug hoặc xung đột code trong quá trình thực thi, hãy tự động sửa và kiểm tra lại cho đến khi hoàn thiện mà KHÔNG cần phải hỏi lại người dùng.
> **Cấm chú thích code**: TUYỆT ĐỐI KHÔNG thêm bất kỳ comment, chú thích, ghi chú hoặc bất kỳ nội dung nào khác vào file code (các comment đã có sẵn thì xóa sạch). Luôn giữ mã nguồn sạch sẽ, không có bất kỳ ký tự giải thích nào.
> **Ưu tiên tối đa hóa tốc độ**: Mọi quyết định về kiến trúc, thuật toán, thư viện hay công nghệ sử dụng đều phải ưu tiên tốc độ thực thi và tối ưu hóa hiệu năng. Luôn chọn giải pháp nhanh nhất, gọn nhất và hiệu quả nhất.

---

## 🛑 1. NGUYÊN TẮC BẤT KHẢ XÂM PHẠM (ZERO-TOLERANCE)

1. **CẤM Cache Trạng Thái Tĩnh:** 
   - Tuyệt đối KHÔNG tạo/ghi trạng thái ra file đĩa cục bộ (`daily_state.json`, `game_state.json`...).
   - Server Game là Nguồn Chân Lý Duy Nhất (*Single Source of Truth*). Mọi trạng thái phải đọc trực tiếp từ WebSocket real-time.
2. **CẤM Fallback & Hardcode `.env` (Fail-Fast):**
   - Tuyệt đối KHÔNG dùng fallback (`||`, `&&`, `?:`) cho biến môi trường (`process.env.VAR || 3000`) và cả trong code chỗ không cần thiết fallback (tránh sai logic code).
   - Tuyệt đối KHÔNG hardcode URL, mật khẩu, ID, token trong mã nguồn làm giá trị dự phòng.
   - Thiếu bất kỳ biến môi trường bắt buộc nào: Ném lỗi (`throw new Error(...)`) và dừng ngay lập tức khi khởi chạy.
   - Nghiệp vụ phải kiểm tra kiểu (`typeof`, `if/else`) tường minh, không dùng fallback che giấu dữ liệu thiếu.
3. **CẤM Tự Ý Git Commit & Push:**
   - Chỉ chạy `git commit` khi người dùng chỉ thị trực tiếp ("commit đi", "commit giúp").
   - Tuyệt đối KHÔNG chạy `git push` trong mọi tình huống trừ khi có lệnh rõ ràng.
4. **Bảo Toàn Tài Nguyên Game (Zero Resource Waste):**
   - Tuyệt đối KHÔNG tự ý tiêu Vàng, Bạc, Đan dược quý, Vé quay có phí.
   - Chỉ thực hiện nhận free, bái kiến free, điểm danh, nhận mốc thưởng hoặc lượt quay miễn phí mỗi ngày.
5. **Giới Hạn Tối Đa 1000 Dòng / File:**
   - File mã nguồn logic (`.js`, `.html`, `.css`...) không được vượt quá 1000 dòng.
   - Khi tiệm cận 500 - 800 dòng, BẮT BUỘC chủ động tách nhỏ module (Component, Controller, Service, Helper).
   - Ngoại lệ duy nhất: File từ điển/dữ liệu tĩnh JSON thuần dữ liệu (`item_names.json`, `main_tasks.json`, `proto.json`).

---

## 🔄 2. CHU TRÌNH 4 BƯỚC CHO MỌI SERVICE

Mọi Service (Hoàng Cung, BXH, 7 Ngày, Thành Tựu, Vườn Hoa, Nông Trại, Đấu Boss...) bắt buộc tuân theo chu trình:

1. **Query & Reset:** Reset biến tạm client $\rightarrow$ Gửi gói query (`send(msgId, {})`) $\rightarrow$ Sleep ngẫu nhiên (1.2s - 2.0s).
2. **Route Response:** Định tuyến chính xác mã `msgId` trong `GameClient.js` và gán vào thuộc tính client.
3. **Validate Cờ Server:** Kiểm tra trực tiếp các trường Protobuf trả về từ Server (không tự suy đoán).
4. **Execute & Log Minh Bạch (CẤM IN ID SỐ TRẦN):**
   - ❌ CẤM log ID trần vô nghĩa: `[ID: 10012001]`, `[Mục Tiêu 10014]`.
   - ✅ BẮT BUỘC map ID sang Tên/Nội dung Tiếng Việt: `👉 Đang nhận: [Tổng tư chất Tùy Tùng đạt 10]...`
   - In chi tiết vật phẩm nhận được (`🎉 +10 Vàng, +50,000 Bạc`) hoặc in mã lỗi nếu thất bại.

> **Fresh State Re-sync:** Sau khi thay đổi chỉ số (vượt ải, thăng quan, tăng thế lực, dùng đan), BẮT BUỘC gửi lại lệnh query (`125102`, `162101`) để đồng bộ mốc thưởng mới từ Server.

---

## 📋 3. BẢNG TRA CỨU PROTOCOL CÁC PHÂN HỆ

| Phân Hệ | Request | Response | Trường Trạng Thái Cần Kiểm Tra & Lệnh Xử Lý |
| :--- | :---: | :---: | :--- |
| 🏛️ **Hoàng Cung** | `114101` | `114201` | `isHi: bool` (`false`: chưa thỉnh an). Nhận: `114102 { palaceId: 1 }`. |
| 👑 **Bái Kiến BXH** | `113101` | `113201` | `isWorship: int32` (`0`: chưa bái). Nhận: `113103 { type: id }`. |
| 🎯 **Mục Tiêu 7 Ngày** | `162101` | `162201` | `targetList [ { id, status: 1 } ]` & `rewardList`. Nhận: `162102 { id }`. |
| 🏆 **Thành Tựu** | `125102` | `125202` | `achievementList [ { achievementId, state: 1 } ]`. Nhận: `125103 { achievement: id }`. |
| 🌸 **Báo Danh** | `102102` | `102202` | `attrMap[114]` (`1`: đã điểm danh, `0`: chưa). |
| ⏳ **Thưởng Online** | `151101` | `151201` | `sec: int64` & `rewardList: [idx]` các mốc đã nhận. |
| 📅 **Đăng Nhập 7 Ngày** | `152101` | `152201` | `day: int32` & `rewardList: [id]`. Nhận: `152102 { id: day - 1 }`. |
| 👑 **Điểm Danh Tích Lũy** | `211101` | `211201` | `totalSignDay: int32` & `rewardSidList: [sid]`. Nhận: `211102 { rewardSid }`. |
| 🌳 **Cầu Nguyện Miễn Phí** | `128102` | `128202` | `YBCdTime: int32` (`0`: có lượt miễn phí). Quay: `128101`. |
| 🌸 **Vườn Hoa & Thêu Hoa** | `153101, 153113` | `153201, 153217` | `canStealIds` (trộm), `canAssistantIds` (chăm), hái: `153103`, thêu: `153110`. |
| 🌾 **Trang Viên Nông Trại** | `142101` | `142201` | `manorFuncDataInfo`. Thu hoạch: `142105`, gieo hạt: `142110`. |
| 📚 **Thư Viện / Học Viện** | `217107, 217108` | `217208` | `academyInfo`. Cho học: `217104`, tốt nghiệp: `217105`. |
| 🏰 **Bang Hội / Liên Minh** | `146113, 146124` | `146213, 146224` | Cống hiến: `146118`, đánh boss bang: `146126`. |
| 💼 **Nội Vụ (Thu Hoạch)** | `102101` | `102206` | `tradeInfoList [ { type, num > 0 } ]`. Thu: `102101 { type }`. |
| 📜 **Sự Vụ Triều Đình** | `105101` | `105201` | `workList [ { id } ]`. Duyệt: `105103 { id, choose }`. |
| 🎒 **Túi Đồ (Đan Dược)** | `104102` | `104202` | `propList [ { configId, num > 0 } ]`. Dùng: `104101 { propId, propNum }`. |
| ⚔️ **Tùy Tùng** | `103101` | `103201` | `helperInfoList [ { helperId, lv, exp } ]`. Nâng cấp: `103102`. |
| ⚔️ **Vượt Ải Cốt Truyện** | `112101` | `112201` | `sceneInfo` & `helperStateList`. Đánh: `112102` / `112103` / `112109`. |
| 💕 **Hậu Cung & Tri Kỷ** | `106111, 106119` | `106211, 106219` | `wifeInfoList` & `wifeEnergyFuncDataInfo.num > 0`. Vấn an: `106104`. |
| 📬 **Hộp Thư** | `107101` | `107201` | `mailList [ { id, state: 1 } ]`. Nhận: `107103 { id }`. |
| 👑 **Đấu Tài Nghệ (BigBoss)** | `250101, 250102` | `250201, 250202` | Báo danh Top 4: `250102 { helperIds }`. Nhặt trứng: `250101`. Đấu: `250104`. Thưởng: `250106 { type }`. |
| 🐱 **Nuôi Mèo (Tổ Ấm)** | `160101` | `160201` | Cho ăn: `160102 { id, foodId }`. Lễ thành niên: `160103 { id }`. Du ngoạn: `160104`. |
| 🎣 **Câu Cá (Chợ Đêm)** | `170101` | `170201` | Kiểm tra điểm tuần (trần 6.000 Đồng), câu: `170102 { type }`. |

---

## 🛡️ 4. VÒNG ĐỜI PHIÊN & KẾT NỐI (ZERO MEMORY LEAK)

1. **Đăng nhập đè (`101203 ResSubstitute`):** Ngắt socket (`client.close()`) và OFF bot ngay lập tức, không cố reconnect.
2. **Giải phóng tài nguyên:** 
   - Module chạy theo đợt phải đóng WebSocket ngay khi xong việc, không treo socket rỗng.
   - Hủy bỏ toàn bộ timer heartbeat, ping-pong, timeouts và event listeners khi socket đóng.

---

## 💻 5. TIÊU CHUẨN CODE & COMMENT

1. **Module hóa Frontend:** Giao diện Web bắt buộc tách riêng `index.html`, `style.css`, `app.js`. Không nhúng template HTML dài trong file server.
2. **Comment tối giản:**
   - ❌ CẤM comment banner hoa văn trang trí (`// -----`, `// =====`, `# =====`).
   - ❌ CẤM comment lặp lại hiển nhiên hành động của code (`let a = 1; // Khởi tạo a`).
   - ✅ Chỉ viết comment ngắn gọn (1 dòng) giải thích lý do (*Why*) cho logic phức tạp.

---

## 📝 6. QUY TRÌNH HOÀN TẤT & QUẢN TRỊ GIT

1. **Ghi nhận tiến độ:** Tự động cập nhật tính năng/nhiệm vụ đã hoàn thành vào file `list-done.md`.
2. **Dọn dẹp trước khi commit:** Xóa toàn bộ file test (`test_*.js`), file debug (`debug_*.json`), file rác và dữ liệu tạm.
3. **Chính sách Commit:**
   - Mặc định: Commit thông thường theo từng tính năng hoàn chỉnh.
   - Chỉ gom thành 1 commit duy nhất (*squash commit*) khi người dùng yêu cầu cụ thể.
   - Tuyệt đối KHÔNG tự ý push.
