# Thi trực tuyến (SvelteKit + Cloudflare Workers + D1)

Web thi trắc nghiệm + tự luận cho khoảng 100–300 học viên thi cùng lúc. D1 là nguồn dữ liệu chính. Google Sheets chỉ là bản sao để giáo viên xem và chấm tự luận, và chỉ được ghi **sau khi** học viên nộp bài.

## Cấu trúc

```
migrations/              Schema D1 + dữ liệu mẫu
src/lib/server/
  normalize.ts           Chuẩn hóa chuỗi (bỏ dấu, chữ thường, gộp khoảng trắng)
  exam.ts                Random đề (crypto.getRandomValues), chấm TN, luật thời gian
  thi.ts                 start / save / submit / kết quả (D1)
  sheets.ts              Client Google Sheets (JWT Web Crypto, retry 429), đồng bộ, resync
  admin.ts               Xác thực ADMIN_TOKEN, import từ Sheet
  hoc-vien.ts            Đọc danh sách học viên (Sheet/CSV), sinh SQL nạp vào D1
src/routes/
  layout.css             Tailwind + daisyUI, theme light theo Fluent 2 (ô/nút cao 32px, bo góc 4/8/12px), font Merriweather tự lưu trữ (@fontsource), màu theo logo (xanh #273ca7)
  +page.svelte           Trang chào + ô tìm tên (live search)
  thi/                   Trang làm bài
  ket-qua/               Trang kết quả
  api/tim-kiem|start|save|submit|admin/import|admin/resync
scripts/hoc-vien-sql.mjs  CSV danh sách học viên → SQL (npm run db:hoc-vien)
cron/                    Worker riêng chạy Cron Trigger (tùy chọn)
```

## Cài đặt và chạy local

```bash
npm install
cp .dev.vars.example .dev.vars        # sửa giá trị nếu muốn thử đồng bộ Sheets
npm run db:migrate                    # tạo D1 local (.wrangler/) + dữ liệu mẫu
npm run db:hoc-vien                   # (tùy chọn) thay học viên mẫu bằng ds_hoc_vien.csv
npm run dev                           # http://localhost:5173
npm test                              # Vitest
```

Khi chạy dev, adapter dùng `getPlatformProxy` (tùy chọn `platformProxy` của adapter) để có D1 local. Lưu ý: với `@sveltejs/adapter-cloudflare` v8 / SvelteKit 3, `event.platform` không còn nữa, nên code lấy `env` và `waitUntil` qua `import { env, waitUntil } from 'cloudflare:workers'` (tương đương `platform.env.DB` / `platform.context.waitUntil()` ở các bản cũ).

Chạy thử bản build trên runtime thật của Workers: `npm run build && npm run preview`.

`worker-configuration.d.ts` (type của `env`) do `wrangler types` sinh ra và không commit; nó tự sinh lại khi `npm install`, `npm run build`, `npm run check`. Sửa `wrangler.jsonc` xong thì chạy `npm run gen`.

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
4. **Danh sách học viên**: chỉ người có tên trong danh sách mới thi được. Có hai cách nạp (đều chạy lại được nhiều lần, giữ nguyên người đã thi):
   - Từ file CSV (cột đầu là "Tên Thánh + Họ tên" gộp một ô, dòng đầu là tiêu đề, các cột sau bỏ qua): đặt file ở thư mục gốc với tên `ds_hoc_vien.csv` rồi chạy `npm run db:hoc-vien:remote`. Lệnh này cũng xóa 5 học viên mẫu của migration. File CSV đã nằm trong `.gitignore` để không đưa tên người vào git.
   - Từ tab `HocVien` trong Google Sheet bằng `POST /api/admin/import` (xem bên dưới).
5. **Deploy**: `npm run deploy`.

### Cấu hình đề thi

Đề gồm các **phần** theo thứ tự, mỗi phần bốc ngẫu nhiên số câu cấu hình từ một **nhóm** câu hỏi. Đề thật có 5 phần:

| Phần | Nhóm gợi ý | Số câu | Điểm | Loại câu |
|---|---|---|---|---|
| I – Trắc nghiệm giáo lý hôn nhân | `giao_ly_hon_nhan` | 30 | 30 (1 điểm/câu) | `TN` |
| II – Trắc nghiệm giáo lý căn bản | `giao_ly_can_ban` | 30 | 30 (1 điểm/câu) | `TN` |
| III – Trắc nghiệm kinh bổn | `kinh_bon` | 6 | 12 (2 điểm/câu) | `TN` |
| IV – Tự luận (điền vào chỗ trống) | `dien_khuyet` | 4 | 8 (2 điểm/câu) | `DK` |
| V – Tự luận, sống hôn nhân | `song_hon_nhan` | 4 | 20 (2 + 2 + 2 + 14) | `DK` ×3, `TL` ×1 |

Tổng 100 điểm: 72 điểm trắc nghiệm hệ thống tự chấm, 28 điểm (phần IV và V) giáo viên chấm trên Sheet. Phần V luôn đủ 4 câu **theo đúng thứ tự** (Câu 1 → 4, tắt xáo); các phần còn lại xáo thứ tự câu, và câu trắc nghiệm còn xáo cả thứ tự đáp án.

Dữ liệu mẫu trong migration có đủ 5 phần và 4 câu thật của phần V, nhưng chỉ có vài câu mẫu cho phần I–IV nên số câu mỗi phần đang đặt nhỏ (3 / 3 / 2 / 2 / 4). **Số câu thật (30 / 30 / 6 / 4 / 4) và tiêu đề phần được đặt bằng tab `PhanThi` khi import** (xem bên dưới). Nếu phần nào yêu cầu nhiều câu hơn ngân hàng có, import sẽ cảnh báo và học viên sẽ không vào thi được cho đến khi bổ sung.

Thời lượng làm bài đổi trực tiếp trong D1 (bỏ `--remote` để chạy trên local):

```bash
# Thời lượng T = 45 phút, dung sai nộp 60 giây
npx wrangler d1 execute DB --remote --command "UPDATE cau_hinh SET thoi_luong_giay=2700, dung_sai_giay=60"
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

**`CauHoi`** (bắt buộc khi import). Thứ tự dòng chỉ quan trọng với phần tắt xáo (phần V): các câu được lấy theo thứ tự trong tab.

| A: Mã | B: Loại | C: Nhóm    | D: Nội dung                   | E: Đáp án | F: Điểm | G: Lựa chọn A | H: Lựa chọn B | I, J, …: Lựa chọn C, D, … |
| ----- | ------- | ---------- | ----------------------------- | --------- | ------- | ------------- | ------------- | ------------------------- |
| KT01  | TN      | kinh_thanh | Sách đầu tiên của Kinh Thánh? | A         | 1       | Sáng Thế      | Xuất Hành     | I: Lêvi · J: Dân Số       |
| DK01  | DK      | dien_khuyet | Chúa Giêsu sinh ra tại thành ______. |      | 2       |               |               |                           |
| V4    | TL      | song_hon_nhan | Câu 4: Người đời thường cho rằng … (viết khoảng 150-200 từ) | | 14 |      |               |                           |

- Loại: `TN` (trắc nghiệm, tự chấm), `DK` (điền vào chỗ trống, ô trả lời ngắn 3 dòng) hoặc `TL` (tự luận, ô trả lời dài, có đếm số từ). `DK` và `TL` do giáo viên chấm; không cần Đáp án và Lựa chọn.
- Nhóm của câu phải khớp một dòng trong tab `PhanThi`, nếu không câu đó không bao giờ được bốc (import sẽ cảnh báo).
- Đáp án là chữ cái ứng với lựa chọn: G là A, H là B, …
- Điểm để trống thì mặc định là 1; dùng được dấu phẩy thập phân, ví dụ `1,5`.

**`PhanThi`** (bắt buộc khi import): các phần của đề, thứ tự dòng là thứ tự phần. Cột: A: Nhóm (khớp cột Nhóm của `CauHoi`) | B: Tiêu đề phần | C: Số câu bốc | D: Hướng dẫn (tùy chọn) | E: Xáo thứ tự câu (để trống hoặc "có"; ghi "không" để giữ thứ tự trong ngân hàng).

| A: Nhóm | B: Tiêu đề phần | C: Số câu | D: Hướng dẫn | E: Xáo |
|---|---|---|---|---|
| giao_ly_hon_nhan | PHẦN I - TRẮC NGHIỆM GIÁO LÝ HÔN NHÂN | 30 | | |
| giao_ly_can_ban | PHẦN II. TRẮC NGHIỆM GIÁO LÝ CĂN BẢN | 30 | | |
| kinh_bon | PHẦN III. TRẮC NGHIỆM KINH BỔN | 6 | | |
| dien_khuyet | PHẦN IV – TỰ LUẬN | 4 | (điền đáp án vào chỗ trống) | |
| song_hon_nhan | PHẦN V – TỰ LUẬN - SỐNG HÔN NHÂN | 4 | (điền đáp án vào chỗ trống) | không |

Trên trang làm bài, mỗi câu hiển thị tiêu đề phần, hướng dẫn và "(số câu – số điểm)" của phần (tính từ các câu thực sự bốc), cùng điểm của câu.

**`HocVien`** (bắt buộc khi import; không cần nếu chỉ nạp bằng CSV): A: Tên Thánh (**có thể để trống** nếu chưa có) | B: Họ và tên | C: Giáo xứ | D: Giáo phận (hai cột cuối tùy chọn, chỉ để hiển thị và giúp phân biệt người trùng tên).

**`KetQua`** (bắt buộc có tab, có thể để trống): app ghi kết quả vào đây. Lần import đầu tiên sẽ tự ghi dòng tiêu đề nếu tab đang trống. Các cột theo thứ tự:

Mã lượt · Tên Thánh · Họ và tên · Giáo xứ · Giáo phận · Giờ bắt đầu · Giờ nộp · Nộp trễ · Số lần rời tab · Điểm TN · Bài tự luận (gồm cả câu điền vào chỗ trống, mỗi câu một đoạn "[mã câu] đáp án") · **Điểm TL** (giáo viên nhập) · Tổng điểm (công thức = Điểm TN + Điểm TL)

Mọi chuỗi do học viên nhập mà bắt đầu bằng `=`, `+`, `-`, `@` đều được thêm `'` phía trước để chống formula injection.

### Import và resync

```bash
# Nạp CauHoi, PhanThi và HocVien từ Sheet vào D1
curl -X POST https://<app>/api/admin/import -H "Authorization: Bearer $ADMIN_TOKEN"
# Đẩy lại các bài đã nộp nhưng chưa lên được Sheet (sync_pending = 1)
curl -X POST https://<app>/api/admin/resync -H "Authorization: Bearer $ADMIN_TOKEN"
```

- **Câu hỏi** và **các phần của đề** (tab `PhanThi`) được thay toàn bộ. **Học viên** được cập nhật theo (tên Thánh + họ tên + số thứ tự nếu trùng) nên sửa giáo xứ hay thêm người mới đều chạy lại import được; người đã có lượt thi luôn được giữ lại dù bị xóa khỏi Sheet. Sửa chính tả họ tên của người *chưa thi* cũng được (dòng cũ bị xóa, dòng mới được tạo); với người *đã thi*, dòng cũ vẫn giữ nên sẽ xuất hiện thêm một dòng mới trùng tên: hãy tự sửa trực tiếp trong D1 nếu muốn.
- Import sẽ **từ chối** khi đang có lượt thi chưa nộp, vì đề đã phát tham chiếu tới mã câu hỏi. Thêm `?force=1` nếu chắc chắn. Nếu Sheet có lỗi, import trả danh sách lỗi theo dòng và không ghi gì vào D1.
- Resync đọc cột A của `KetQua` để tránh tạo hàng trùng. Lượt đã có trên Sheet thì chỉ cập nhật cột A–K, không đụng cột Điểm TL (L). Lượt vừa nộp chưa quá 2 phút sẽ được bỏ qua, vì bước đồng bộ ngay sau khi nộp có thể vẫn đang chạy.

### Cron tự động resync (tùy chọn)

```bash
# sửa database_id trong cron/wrangler.jsonc cho giống wrangler.jsonc
npx wrangler secret put GOOGLE_SA_EMAIL -c cron/wrangler.jsonc
npx wrangler secret put GOOGLE_SA_PRIVATE_KEY -c cron/wrangler.jsonc
npx wrangler secret put SHEET_ID -c cron/wrangler.jsonc
npm run deploy:cron     # chạy mỗi 10 phút
```

## Luật thi (kiểm tra ở server)

- **Định danh**: học viên *chọn đúng dòng của mình* trong danh sách (tìm khi gõ), không tự nhập thông tin. `luot_thi.hoc_vien_id` có `UNIQUE` nên mỗi dòng trong danh sách chỉ thi được một lần, kể cả khi hai request gửi cùng lúc. Họ tên, Tên Thánh, Giáo xứ, Giáo phận được sao vào `luot_thi` (bản gốc có dấu kèm bản chuẩn hóa) tại thời điểm bắt đầu thi.
- **Thời gian** chỉ tính từ `started_at` do server ghi. Chưa đủ T/2 thì không được nộp. Nộp sau T + dung sai thì vẫn nhận nhưng gắn `nop_tre`, và chỉ chấm các đáp án đã lưu trước hạn (sau hạn thì `save` bị từ chối).
- **Phiên thi**: token ngẫu nhiên nằm trong cookie httpOnly, DB chỉ lưu SHA-256 của token. Mọi thao tác save/submit đều phải có token này.
- **Nộp bài idempotent**: dùng `UPDATE … WHERE trang_thai = 'dang_thi'` (và `diem_tn IS NULL`) trong cùng một batch, nên nộp lặp sẽ trả lại đúng kết quả cũ.
- Đáp án đúng không bao giờ được gửi xuống trình duyệt. Thứ tự lựa chọn đã xáo nằm ở server; client chỉ gửi lên chỉ số lựa chọn theo thứ tự đang hiển thị.

## Các quyết định khi đặc tả chưa rõ (chọn phương án an toàn)

- **Vào lại từ thiết bị khác**: cùng trình duyệt (còn cookie) thì vào lại đúng lượt đang làm. Thiết bị khác thì bị chặn với thông báo "liên hệ giám thị", để người biết tên người khác không chiếm được bài của họ. Giám thị mở khóa như sau, rồi học viên tìm và chọn lại tên ở thiết bị mới:
  ```bash
  npx wrangler d1 execute DB --remote --command "UPDATE luot_thi SET token_hash = NULL WHERE ho_ten_chuan_hoa = 'nguyen van an'"  # thêm AND ten_thanh_chuan_hoa = '...' nếu trùng tên
  ```
- **Bỏ dở không nộp**: nếu học viên quay lại (cùng trình duyệt) sau khi hết giờ, trang sẽ tự nộp ngay. Nếu đã quá T + dung sai thì bài được đánh dấu nộp trễ và chấm theo đáp án đã lưu. Lượt không bao giờ quay lại vẫn ở trạng thái `dang_thi`; xem bằng `SELECT * FROM luot_thi WHERE trang_thai='dang_thi'`.
- **Đã thi rồi**: khi tìm thấy tên một người đã có lượt thi, kết quả hiện "Đã có lượt thi, hãy liên hệ giám thị" và không chọn được. Điểm chỉ xem được ở trình duyệt đã dùng để thi.
- **Trùng họ tên**: danh sách cho phép trùng. Mỗi dòng là một người; kết quả tìm hiển thị Giáo xứ/Giáo phận để phân biệt. Hạn chế: nếu hai người trùng *cả* tên Thánh, họ tên và giáo xứ thì không phân biệt được, và người đến sau có thể chọn nhầm dòng chưa dùng; nên thêm giáo xứ hoặc ghi chú vào tên trong Sheet.
- **Ai cũng tìm được tên trong danh sách**: ô tìm không yêu cầu đăng nhập, nên ai mở trang cũng thấy tên, Giáo xứ và Giáo phận của người khớp (tối đa 8 dòng, phải gõ từ 2 ký tự, không hiện ngày sinh hay điểm). Nếu danh sách cần giữ kín, đặt cả trang sau Cloudflare Access hoặc chỉ mở link cho lớp thi.
- **Logo/favicon**: `src/lib/assets/gpthaibinh90years.webp`, hiển thị ở đầu trang chào và dùng làm favicon (`+layout.svelte`). 
- **Danh sách từ CSV không tách Tên Thánh**: toàn bộ chuỗi (ví dụ "Vinh Sơn Đỗ Văn Hậu") được lưu ở cột Họ và tên, cột Tên Thánh trên Sheet kết quả sẽ để trống. Muốn tách riêng, dùng tab `HocVien` với cột A là Tên Thánh.
- **Trang chào**: tiêu đề và phụ đề nằm ở hai hằng `TIEU_DE`, `PHU_DE` đầu file `src/routes/+page.svelte`.
- **Quota Sheets** là khoảng 60 lượt ghi mỗi phút. Khi nhiều người nộp cùng lúc, có thể một số bài không lên Sheet ngay (sau khi đã retry). Các bài đó vẫn giữ `sync_pending = 1` để resync hoặc cron đẩy lên sau. Resync gom nhiều hàng vào một request.
- **Bài tự luận** tối đa 5000 ký tự mỗi câu. Khi import, họ và tên tối đa 100 ký tự; Tên Thánh, Giáo xứ, Giáo phận tối đa 60 ký tự.
