# Thi trực tuyến (SvelteKit + Cloudflare Workers + D1)

Web thi trắc nghiệm + tự luận cho khoảng 100–300 học viên thi cùng lúc. D1 là nguồn dữ liệu chính. Google Sheets chỉ là bản sao để giáo viên xem và chấm tự luận, và chỉ được ghi **sau khi** học viên nộp bài.

## Cấu trúc

```
migrations/              Schema D1 + dữ liệu mẫu
src/lib/server/
  normalize.ts           Chuẩn hóa chuỗi, validate thông tin, ngày sinh
  exam.ts                Random đề (crypto.getRandomValues), chấm TN, luật thời gian
  thi.ts                 start / save / submit / kết quả (D1)
  sheets.ts              Client Google Sheets (JWT Web Crypto, retry 429), đồng bộ, resync
  admin.ts               Xác thực ADMIN_TOKEN, import từ Sheet
src/routes/
  +page.svelte           Form 5 trường
  thi/                   Trang làm bài
  ket-qua/               Trang kết quả
  api/start|save|submit|giao-xu|admin/import|admin/resync
cron/                    Worker riêng chạy Cron Trigger (tùy chọn)
```

## Cài đặt và chạy local

```bash
npm install
cp .dev.vars.example .dev.vars        # sửa giá trị nếu muốn thử đồng bộ Sheets
npm run db:migrate                    # tạo D1 local (.wrangler/) + dữ liệu mẫu
npm run dev                           # http://localhost:5173
npm test                              # Vitest
```

Khi chạy dev, adapter dùng `getPlatformProxy` (tùy chọn `platformProxy` của adapter) để có D1 local. Lưu ý: với `@sveltejs/adapter-cloudflare` v8 / SvelteKit 3, `event.platform` không còn nữa, nên code lấy `env` và `waitUntil` qua `import { env, waitUntil } from 'cloudflare:workers'` (tương đương `platform.env.DB` / `platform.context.waitUntil()` ở các bản cũ).

Chạy thử bản build trên runtime thật của Workers: `npm run build && npm run preview`.

Nếu `npm run build` báo `Types at worker-configuration.d.ts are out of date`, chạy `npx wrangler types` để sinh lại (cần làm sau mỗi lần sửa `wrangler.jsonc`, và sau lần build đầu tiên vì khi đó mới có `_worker.js`).

Muốn thử nhanh luật thời gian khi chạy local, rút ngắn đề còn 60 giây:

```bash
npx wrangler d1 execute DB --local --command "UPDATE cau_hinh SET thoi_luong_giay=60, dung_sai_giay=10"
```

## Triển khai lên Cloudflare

1. **Tạo D1** rồi chép `database_id` vào `wrangler.jsonc` (và `cron/wrangler.jsonc` nếu dùng cron):
   ```bash
   npx wrangler d1 create glhn-thi
   ```
2. **Chạy migration**: `npm run db:migrate:remote`. File `0002_du_lieu_mau.sql` có dữ liệu mẫu. Thi thật thì sửa file này, hoặc dùng import từ Sheet (xem bên dưới).
3. **Đặt secrets**:
   ```bash
   npx wrangler secret put GOOGLE_SA_EMAIL
   npx wrangler secret put GOOGLE_SA_PRIVATE_KEY   # dán nguyên private_key trong file JSON (có \n cũng được)
   npx wrangler secret put SHEET_ID                # phần giữa /d/ và /edit trong URL của Sheet
   npx wrangler secret put ADMIN_TOKEN             # chuỗi ngẫu nhiên ≥ 16 ký tự, ví dụ: openssl rand -hex 24
   ```
4. **Danh sách dự thi**: muốn chỉ cho học viên có tên trong danh sách được thi thì đổi `"REQUIRE_ROSTER": "true"` trong `wrangler.jsonc`.
5. **Deploy**: `npm run deploy`.

### Cấu hình đề thi

Đổi trực tiếp trong D1 (bỏ `--remote` để chạy trên local):

```bash
# Thời lượng T = 45 phút, dung sai nộp 60 giây
npx wrangler d1 execute DB --remote --command "UPDATE cau_hinh SET thoi_luong_giay=2700, dung_sai_giay=60"
# Số câu mỗi nhóm (nhóm khớp cột Nhóm của câu hỏi)
npx wrangler d1 execute DB --remote --command "DELETE FROM cau_hinh_nhom; INSERT INTO cau_hinh_nhom VALUES ('kinh_thanh',20),('phung_vu',10),('tu_luan',2)"
```

## Google Sheets

### Tạo service account

1. Vào Google Cloud Console, tạo (hoặc chọn) một project, rồi bật **Google Sheets API**.
2. Vào IAM & Admin → Service Accounts → _Create service account_ (không cần cấp role).
3. Mở service account đó, chọn Keys → _Add key_ → JSON, rồi tải file về.
4. Lấy `client_email` làm `GOOGLE_SA_EMAIL` và `private_key` làm `GOOGLE_SA_PRIVATE_KEY`.
5. Mở Google Sheet, bấm **Chia sẻ** cho đúng email service account đó với quyền **Người chỉnh sửa**.

Không commit file JSON hay `.dev.vars`. `.gitignore` đã loại trừ `.dev.vars*`.

### Các tab trong Sheet

Dòng 1 của mỗi tab là tiêu đề (bị bỏ qua khi import). Tên tab phải đúng như sau:

**`CauHoi`** (bắt buộc khi import)

| A: Mã | B: Loại | C: Nhóm    | D: Nội dung                   | E: Đáp án | F: Điểm | G: Lựa chọn A | H: Lựa chọn B | I, J, …: Lựa chọn C, D, … |
| ----- | ------- | ---------- | ----------------------------- | --------- | ------- | ------------- | ------------- | ------------------------- |
| KT01  | TN      | kinh_thanh | Sách đầu tiên của Kinh Thánh? | A         | 1       | Sáng Thế      | Xuất Hành     | I: Lêvi · J: Dân Số       |
| TL01  | TL      | tu_luan    | Trình bày …                   |           | 5       |               |               |                           |

- Loại là `TN` (trắc nghiệm) hoặc `TL` (tự luận).
- Đáp án là chữ cái ứng với lựa chọn: G là A, H là B, …
- Điểm để trống thì mặc định là 1; dùng được dấu phẩy thập phân, ví dụ `1,5`.

**`GiaoXu`** (tùy chọn, dùng để gợi ý khi nhập): A: Tên giáo xứ | B: Giáo phận

**`HocVien`** (tùy chọn, dùng khi `REQUIRE_ROSTER=true`): A: Họ và tên | B: Ngày sinh (dd/mm/yyyy, nên định dạng cột là _Văn bản thuần túy_) | C: Tên Thánh | D: Giáo xứ | E: Giáo phận. Chỉ họ tên và ngày sinh được dùng để đối chiếu; các cột còn lại chỉ để hiển thị.

**`KetQua`** (bắt buộc có tab, có thể để trống): app ghi kết quả vào đây. Lần import đầu tiên sẽ tự ghi dòng tiêu đề nếu tab đang trống. Các cột theo thứ tự:

Mã lượt · Tên Thánh · Họ và tên · Ngày sinh · Giáo xứ · Giáo phận · Giờ bắt đầu · Giờ nộp · Nộp trễ · Số lần rời tab · Điểm TN · Bài tự luận · **Điểm TL** (giáo viên nhập) · Tổng điểm (công thức = Điểm TN + Điểm TL)

Mọi chuỗi do học viên nhập mà bắt đầu bằng `=`, `+`, `-`, `@` đều được thêm `'` phía trước để chống formula injection.

### Import và resync

```bash
# Nạp CauHoi (+ GiaoXu, HocVien nếu có tab) từ Sheet vào D1, thay toàn bộ dữ liệu cũ của các bảng đó
curl -X POST https://<app>/api/admin/import -H "Authorization: Bearer $ADMIN_TOKEN"
# Đẩy lại các bài đã nộp nhưng chưa lên được Sheet (sync_pending = 1)
curl -X POST https://<app>/api/admin/resync -H "Authorization: Bearer $ADMIN_TOKEN"
```

- Import sẽ **từ chối** khi đang có lượt thi chưa nộp, vì đề đã phát tham chiếu tới mã câu hỏi. Thêm `?force=1` nếu chắc chắn. Nếu Sheet có lỗi, import trả danh sách lỗi theo dòng và không ghi gì vào D1.
- Resync đọc cột A của `KetQua` để tránh tạo hàng trùng. Lượt đã có trên Sheet thì chỉ cập nhật cột A–L, không đụng cột Điểm TL. Lượt vừa nộp chưa quá 2 phút sẽ được bỏ qua, vì bước đồng bộ ngay sau khi nộp có thể vẫn đang chạy.

### Cron tự động resync (tùy chọn)

```bash
# sửa database_id trong cron/wrangler.jsonc cho giống wrangler.jsonc
npx wrangler secret put GOOGLE_SA_EMAIL -c cron/wrangler.jsonc
npx wrangler secret put GOOGLE_SA_PRIVATE_KEY -c cron/wrangler.jsonc
npx wrangler secret put SHEET_ID -c cron/wrangler.jsonc
npm run deploy:cron     # chạy mỗi 10 phút
```

## Luật thi (kiểm tra ở server)

- **Khóa định danh** = họ tên chuẩn hóa (bỏ dấu, kể cả đ; chữ thường; gộp khoảng trắng) + `|` + ngày sinh. Khóa này có `UNIQUE` ở bảng `luot_thi`. Tên Thánh, Giáo xứ, Giáo phận không nằm trong khóa; chúng được lưu nguyên dạng gốc kèm một bản chuẩn hóa để lọc.
- **Thời gian** chỉ tính từ `started_at` do server ghi. Chưa đủ T/2 thì không được nộp. Nộp sau T + dung sai thì vẫn nhận nhưng gắn `nop_tre`, và chỉ chấm các đáp án đã lưu trước hạn (sau hạn thì `save` bị từ chối).
- **Phiên thi**: token ngẫu nhiên nằm trong cookie httpOnly, DB chỉ lưu SHA-256 của token. Mọi thao tác save/submit đều phải có token này.
- **Nộp bài idempotent**: dùng `UPDATE … WHERE trang_thai = 'dang_thi'` (và `diem_tn IS NULL`) trong cùng một batch, nên nộp lặp sẽ trả lại đúng kết quả cũ.
- Đáp án đúng không bao giờ được gửi xuống trình duyệt. Thứ tự lựa chọn đã xáo nằm ở server; client chỉ gửi lên chỉ số lựa chọn theo thứ tự đang hiển thị.

## Các quyết định khi đặc tả chưa rõ (chọn phương án an toàn)

- **Vào lại từ thiết bị khác**: cùng trình duyệt (còn cookie) thì vào lại đúng lượt đang làm. Thiết bị khác thì bị chặn với thông báo "liên hệ giám thị", để người biết họ tên và ngày sinh không chiếm được bài của người khác. Giám thị mở khóa như sau, rồi học viên nhập lại thông tin ở thiết bị mới:
  ```bash
  npx wrangler d1 execute DB --remote --command "UPDATE luot_thi SET token_hash = NULL WHERE khoa_dinh_danh = 'nguyen van an|2010-02-01'"
  ```
- **Bỏ dở không nộp**: nếu học viên quay lại (cùng trình duyệt) sau khi hết giờ, trang sẽ tự nộp ngay. Nếu đã quá T + dung sai thì bài được đánh dấu nộp trễ và chấm theo đáp án đã lưu. Lượt không bao giờ quay lại vẫn ở trạng thái `dang_thi`; xem bằng `SELECT * FROM luot_thi WHERE trang_thai='dang_thi'`.
- **Đã thi rồi**: dùng lại form từ thiết bị khác sẽ chỉ nhận thông báo "đã thi rồi", không xem được điểm (điểm chỉ hiện ở trình duyệt đã dùng để thi).
- **Ngày sinh** nhập dạng văn bản `dd/mm/yyyy`, không dùng `<input type="date">`, vì nhiều điện thoại hiển thị ngày theo kiểu mm/dd.
- **Quota Sheets** là khoảng 60 lượt ghi mỗi phút. Khi nhiều người nộp cùng lúc, có thể một số bài không lên Sheet ngay (sau khi đã retry). Các bài đó vẫn giữ `sync_pending = 1` để resync hoặc cron đẩy lên sau. Resync gom nhiều hàng vào một request.
- **Bài tự luận** tối đa 5000 ký tự mỗi câu. Họ và tên tối đa 100 ký tự; Tên Thánh, Giáo xứ, Giáo phận tối đa 60 ký tự.
