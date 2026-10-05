# Thi trực tuyến (SvelteKit + Cloudflare Workers + D1)

Web thi trắc nghiệm + tự luận cho khoảng 100–300 học viên thi cùng lúc. D1 là nguồn dữ liệu chính. Google Sheets chỉ là bản sao để giáo viên xem và chấm tự luận, và chỉ được ghi **sau khi** học viên nộp bài.

## Cấu trúc

```
migrations/              Schema D1 + cấu hình mặc định (không có dữ liệu mẫu)
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
scripts/tao-sheet-de-thi.py  CSV đề thi + danh sách học viên → file Excel upload lên Google Sheets
cron/                    Worker riêng chạy Cron Trigger (tùy chọn)
```

## Cài đặt và chạy local

```bash
npm install
cp .dev.vars.example .dev.vars        # sửa giá trị nếu muốn thử đồng bộ Sheets
npm run db:migrate                    # tạo D1 local (.wrangler/), bảng còn trống
npm run db:mau                        # nạp dữ liệu MẪU để chạy thử (30 phút, vài câu hỏi, 5 học viên giả)
npm run db:hoc-vien                   # (tùy chọn) nạp danh sách học viên thật từ resources/ds_hoc_vien.csv
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

## Triển khai lên Cloudflare (giao diện Workers & Pages)

Hướng dẫn cho trường hợp đã đẩy code lên GitHub (`nguyendan07/glhn-exam`) và đã kết nối Cloudflare với GitHub. Mỗi lần `git push` lên nhánh `main`, Cloudflare tự build và deploy (tính năng **Workers Builds**). Tên mục trên giao diện Cloudflare có thể thay đổi đôi chút theo thời gian.

> **Thứ tự quan trọng:** D1 và `database_id` đúng → tạo Worker từ GitHub → migration → secrets → import dữ liệu → kiểm tra. Làm sai thứ tự thường gây lỗi ở lần build đầu.

### Bước 1. Kiểm tra cấu hình trong repo

- `wrangler.jsonc` có `"name": "glhn-exam"` và binding **`DB`** với `database_id` của D1 `glhn-exam` (đã điền sẵn: `7ce38b38-…`). Mã ứng dụng chỉ dùng binding tên `DB`, đừng đổi tên.
- **Tên Worker trên dashboard phải trùng `name` trong `wrangler.jsonc`**, nếu không build sẽ thất bại.
- Tạo D1 mới (hoặc đổi D1) thì: dashboard → **Storage & databases → D1 SQL database → Create database** (tên `glhn-exam`, nên chọn vùng gần nhất, ví dụ Asia-Pacific), chép **Database ID** vào `wrangler.jsonc` (và `cron/wrangler.jsonc` nếu dùng cron), commit và push.

### Bước 2. Tạo Worker từ repo GitHub

1. Vào **Workers & Pages → Create application → Import a repository** (hoặc _Connect to Git_), chọn tài khoản GitHub và repo `glhn-exam`.
2. Điền:
   | Mục | Giá trị |
   |---|---|
   | Project / Worker name | `glhn-exam` (đúng bằng `name` trong `wrangler.jsonc`) |
   | Production branch | `main` |
   | Root directory | để trống (thư mục gốc) |
   | Build command | `npm run build` |
   | Deploy command | `npx wrangler deploy` (mặc định) |
3. Bấm **Save and Deploy**. Môi trường build dùng Node 24 mặc định, phù hợp với dự án; không cần đặt `NODE_VERSION`.

Lần build đầu có thể báo lỗi ở bước deploy nếu `database_id` sai; sửa ở Bước 1 rồi bấm **Retry build** (Worker → **Deployments/Builds**).

### Bước 3. Chạy migration trên D1 (làm một lần)

Hai file `migrations/0001_init.sql` (bảng) và `0002_cau_hinh_mac_dinh.sql` (cấu hình mặc định 90 phút). Thiếu một trong hai, trang sẽ báo lỗi.

- **Cách A, từ máy tính (khuyên dùng):** đăng nhập một lần rồi chạy
  ```bash
  npx wrangler login
  npm run db:migrate:remote
  ```
  Wrangler ghi nhớ file nào đã chạy, nên chạy lại hoặc thêm migration mới về sau đều an toàn.
- **Cách B, trên dashboard:** D1 → `glhn-exam` → tab **Console** → dán lần lượt nội dung hai file trên rồi **Execute**. Cách này không ghi vào bảng theo dõi migration của Wrangler; nếu về sau chạy cách A, Wrangler sẽ chạy lại `0001` và báo "table already exists". Hãy chọn một cách và dùng nhất quán.

### Bước 4. Đặt secrets (biến bí mật lúc chạy)

Worker `glhn-exam` → **Settings → Variables and Secrets → Add**, kiểu **Secret**:

| Tên                     | Giá trị                                                                   |
| ----------------------- | ------------------------------------------------------------------------- |
| `GOOGLE_SA_EMAIL`       | `client_email` trong file JSON của service account                        |
| `GOOGLE_SA_PRIVATE_KEY` | `private_key` trong file JSON, dán nguyên (cả `-----BEGIN …` và các `\n`) |
| `SHEET_ID`              | phần giữa `/d/` và `/edit` trong URL Google Sheet                         |
| `ADMIN_TOKEN`           | chuỗi ngẫu nhiên từ 16 ký tự trở lên, ví dụ chạy `openssl rand -hex 24`   |

Bấm **Deploy** để áp dụng. Chú ý: mục **Settings → Build → Variables and secrets** là biến chỉ dùng _lúc build_ và **không** truy cập được khi chạy, đừng đặt secrets ở đó.

### Bước 5. Nạp đề thi và danh sách học viên

1. Tạo file Sheet (xem [Tạo nhanh file Sheet từ các file CSV](#tạo-nhanh-file-sheet-từ-các-file-csv)), tải lên Google Sheets và chia sẻ cho email service account (quyền _Người chỉnh sửa_).
2. Mở trang **`https://glhn-exam.<tên-tài-khoản>.workers.dev/admin`** (thay bằng URL của Worker, xem ở trang Worker hoặc **Settings → Domains & Routes**), nhập **mã quản trị** (`ADMIN_TOKEN` ở Bước 4) rồi bấm **Nạp đề thi và danh sách học viên**. Trang hiển thị kết quả, cảnh báo và lỗi (ví dụ Google từ chối quyền) ngay trên màn hình.
   - Kết quả đúng: "Đã nạp thành công. 74 câu hỏi, 5 phần thi, 39 học viên. Thời gian làm bài: 90 phút", và không có mục "Cần xem lại". Nếu có cảnh báo (thiếu câu, nhóm không có trong `PhanThi`…), sửa Sheet rồi nạp lại. Nạp lại bao nhiêu lần cũng được.
   - Đang có lượt thi chưa nộp thì trang hỏi lại bằng nút **Vẫn nạp (bỏ qua kiểm tra)**.
   - Nút **Đồng bộ lại** đẩy các bài đã nộp nhưng chưa lên được Google Sheet.

   Trang này công khai nhưng mọi thao tác đều cần mã quản trị. Trang không lưu mã trong trình duyệt.

   Cách khác bằng dòng lệnh:
   ```bash
   curl -X POST https://glhn-exam.<tên-tài-khoản>.workers.dev/api/admin/import \
     -H "Content-Type: application/json" -H "Authorization: Bearer <ADMIN_TOKEN>" -d '{}'
   ```
   Windows PowerShell:
   ```powershell
   Invoke-RestMethod -Method Post -Uri "https://glhn-exam.<tên-tài-khoản>.workers.dev/api/admin/import" `
     -ContentType "application/json" -Headers @{ Authorization = "Bearer <ADMIN_TOKEN>" } -Body "{}"
   ```
   **Bắt buộc có `Content-Type: application/json`** (và một body, dù chỉ là `{}`). Thiếu header này, hoặc gửi kiểu form, SvelteKit chặn ngay với lỗi `Cross-site POST form submissions are forbidden` (HTTP 403) trước cả khi kiểm tra token. Trang `/admin` đã gửi đúng nên không gặp lỗi này.

### Bước 6. Kiểm tra trước ngày thi

- Mở URL: trang chào hiện đúng tiêu đề, giáo xứ, thời gian, lưu ý; gõ thử một tên thấy gợi ý.
- Thi thử một lượt bằng một học viên rồi **xóa lượt thử** để học viên đó thi thật được: D1 → Console:
  ```sql
  DELETE FROM bai_lam; DELETE FROM luot_thi;
  ```
  (chỉ dùng trước ngày thi; lệnh này xóa **toàn bộ** bài làm).
- Xem log khi gặp lỗi: Worker → **Logs / Observability**, hoặc `npx wrangler tail glhn-exam`.
- Tên miền riêng (tùy chọn): Worker → **Settings → Domains & Routes → Add → Custom domain** (tên miền phải nằm trong tài khoản Cloudflare).

### Cập nhật về sau

- Sửa code: `git push` lên `main`, Cloudflare tự build và deploy. Xem tiến trình và log ở Worker → **Deployments / Builds**; hỏng bản mới thì chọn bản cũ → **Rollback**.
- Đổi schema: thêm file migration **mới** (`0003_….sql`, không sửa file đã chạy), chạy `npm run db:migrate:remote` **trước** khi push.
- Đổi đề, học viên, tiêu đề, thời gian làm bài: sửa Google Sheet rồi gọi lại `/api/admin/import` (bị từ chối nếu đang có lượt thi chưa nộp, thêm `?force=1` nếu chắc chắn).
- **Bản xem trước (preview) dùng chung D1 và secrets với bản thật.** Build của nhánh khác `main` tạo URL xem trước nhưng vẫn ghi vào D1 thật. Nên tắt: Worker → **Settings → Build → Branch control**, bỏ build cho các nhánh không phải production (hoặc chỉ push thẳng `main`).

### Cron tự động gửi lại bài chưa lên Sheet (tùy chọn)

Tạo Worker thứ hai từ cùng repo: **Create application → Import a repository →** repo `glhn-exam`, đặt:

| Mục                   | Giá trị                                                     |
| --------------------- | ----------------------------------------------------------- |
| Project / Worker name | `glhn-exam-cron` (trùng `name` trong `cron/wrangler.jsonc`) |
| Build command         | để trống                                                    |
| Deploy command        | `npx wrangler deploy -c cron/wrangler.jsonc`                |

Rồi thêm 3 secrets `GOOGLE_SA_EMAIL`, `GOOGLE_SA_PRIVATE_KEY`, `SHEET_ID` cho Worker này (Settings → Variables and Secrets). Worker chạy mỗi 10 phút.

### Xử lý sự cố

| Triệu chứng                                                             | Nguyên nhân thường gặp                                                                                                       | Cách xử lý                                                      |
| ----------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| Build lỗi, nhắc tên Worker không khớp                                   | Tên Worker trên dashboard khác `name` trong `wrangler.jsonc`                                                                 | Đổi tên cho trùng                                               |
| Build xong nhưng deploy lỗi về D1                                       | `database_id` sai hoặc chưa phải D1 của tài khoản này                                                                        | Sửa ở Bước 1, push lại                                          |
| Trang báo lỗi 500, log có `no such table`                               | Chưa chạy migration                                                                                                          | Bước 3                                                          |
| Trang báo lỗi 500, log có `Chưa có cấu hình`                            | Chưa chạy `0002_cau_hinh_mac_dinh.sql`                                                                                       | Bước 3                                                          |
| `/api/admin/…` trả 403 `Cross-site POST form submissions are forbidden` | Gọi POST thiếu `Content-Type: application/json` hoặc gửi kiểu form (cơ chế chống CSRF của SvelteKit, chỉ có ở bản chạy thật) | Dùng trang `/admin`, hoặc thêm `-H "Content-Type: application/json" -d '{}'` (xem Bước 5) |
| `/api/admin/…` trả 401                                                  | Chưa đặt `ADMIN_TOKEN`, ngắn hơn 16 ký tự, hoặc sai header `Authorization: Bearer …`                                         | Bước 4                                                          |
| Import trả 400 "Không tìm thấy tab …"                                   | Tên tab trên Sheet sai (phải đúng `CauHoi`, `PhanThi`, `HocVien`, …)                                                         | Sửa tên tab                                                     |
| Import trả 500, log có `Sheets … 403`                                   | Chưa chia sẻ Sheet cho email service account, hoặc sai `SHEET_ID`                                                            | Chia sẻ lại, kiểm tra secrets                                   |
| Gõ tên không ra gợi ý                                                   | Chưa import tab `HocVien`                                                                                                    | Bước 5                                                          |
| Học viên bấm bắt đầu nhưng báo thiếu câu hỏi                            | Phần cần nhiều câu hơn ngân hàng có                                                                                          | Xem `canh_bao` của import, bổ sung câu                          |

### Cách khác: dùng dòng lệnh thay cho Git

```bash
npx wrangler login
npm run db:migrate:remote
npx wrangler secret put ADMIN_TOKEN      # lặp lại cho 3 secret còn lại
npm run deploy                           # build + wrangler deploy
```

Nạp danh sách học viên trực tiếp từ CSV (không cần Sheet): đặt file ở `resources/ds_hoc_vien.csv` rồi `npm run db:hoc-vien:remote` (file nằm trong `.gitignore` để không đưa tên người vào git).

### Cấu hình đề thi

Đề gồm các **phần** theo thứ tự, mỗi phần bốc ngẫu nhiên số câu cấu hình từ một **nhóm** câu hỏi. Đề thật có 5 phần:

| Phần                              | Nhóm gợi ý         | Số câu | Điểm                | Loại câu         |
| --------------------------------- | ------------------ | ------ | ------------------- | ---------------- |
| I – Trắc nghiệm giáo lý hôn nhân  | `giao_ly_hon_nhan` | 30     | 30 (1 điểm/câu)     | `TN`             |
| II – Trắc nghiệm giáo lý căn bản  | `giao_ly_can_ban`  | 30     | 30 (1 điểm/câu)     | `TN`             |
| III – Trắc nghiệm kinh bổn        | `kinh_bon`         | 6      | 12 (2 điểm/câu)     | `TN`             |
| IV – Tự luận (điền vào chỗ trống) | `dien_khuyet`      | 4      | 8 (2 điểm/câu)      | `DK`             |
| V – Tự luận, sống hôn nhân        | `song_hon_nhan`    | 4      | 20 (2 + 2 + 2 + 14) | `DK` ×3, `TL` ×1 |

Tổng 100 điểm: 72 điểm trắc nghiệm hệ thống tự chấm, 28 điểm (phần IV và V) giáo viên chấm trên Sheet. Phần V luôn đủ 4 câu **theo đúng thứ tự** (Câu 1 → 4, tắt xáo); các phần còn lại xáo thứ tự câu, và câu trắc nghiệm còn xáo cả thứ tự đáp án.

Migration chỉ tạo bảng rỗng và cấu hình mặc định. **Số câu (30 / 30 / 6 / 4 / 4), tiêu đề phần, câu hỏi và học viên được đặt bằng tab `PhanThi`, `CauHoi`, `HocVien` khi import** (xem bên dưới); `npm run db:mau` chỉ nạp dữ liệu mẫu cho máy local. Nếu phần nào yêu cầu nhiều câu hơn ngân hàng có, import sẽ cảnh báo và học viên sẽ không vào thi được cho đến khi bổ sung.

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

### Tạo nhanh file Sheet từ các file CSV

Nếu có đề thi dạng CSV (`resources/phanthi/phan1..5.csv`, `resources/info.csv`, `resources/ds_hoc_vien.csv`), tạo sẵn cả 5 tab bằng một lệnh:

```bash
python3 -m venv .venv && .venv/bin/pip install openpyxl     # lần đầu
.venv/bin/python scripts/tao-sheet-de-thi.py                # → resources/de-thi-2026.xlsx
```

Script tự kiểm tra: mỗi câu trắc nghiệm đủ 4 lựa chọn và đáp án A–D, số câu mỗi phần khớp `info.csv`, tổng đúng 100 điểm (điểm mỗi câu = điểm phần ÷ số câu; Phần V lấy điểm ghi trong câu). Rồi lên Google Sheets: **Tệp → Nhập → Tải lên →** chọn file → _Thay thế bảng tính_ (hoặc _Chèn trang tính mới_ nếu Sheet đã có tab `KetQua`). Chia sẻ Sheet cho service account, rồi gọi `/api/admin/import`.

File `.xlsx` chứa đáp án và tên học viên: không đưa vào git.

Dòng 1 của mỗi tab là tiêu đề (bị bỏ qua khi import). Tên tab phải đúng như sau:

**`CauHoi`** (bắt buộc khi import). Thứ tự dòng chỉ quan trọng với phần tắt xáo (phần V): các câu được lấy theo thứ tự trong tab.

| A: Mã | B: Loại | C: Nhóm       | D: Nội dung                                                 | E: Đáp án | F: Điểm | G: Lựa chọn A | H: Lựa chọn B | I, J, …: Lựa chọn C, D, … |
| ----- | ------- | ------------- | ----------------------------------------------------------- | --------- | ------- | ------------- | ------------- | ------------------------- |
| KT01  | TN      | kinh_thanh    | Sách đầu tiên của Kinh Thánh?                               | A         | 1       | Sáng Thế      | Xuất Hành     | I: Lêvi · J: Dân Số       |
| DK01  | DK      | dien_khuyet   | Chúa Giêsu sinh ra tại thành **\_\_**.                      |           | 2       |               |               |                           |
| V4    | TL      | song_hon_nhan | Câu 4: Người đời thường cho rằng … (viết khoảng 150-200 từ) |           | 14      |               |               |                           |

- Loại: `TN` (trắc nghiệm, tự chấm), `DK` (điền vào chỗ trống, ô trả lời ngắn 3 dòng) hoặc `TL` (tự luận, ô trả lời dài, có đếm số từ). `DK` và `TL` do giáo viên chấm; không cần Đáp án và Lựa chọn.
- Nhóm của câu phải khớp một dòng trong tab `PhanThi`, nếu không câu đó không bao giờ được bốc (import sẽ cảnh báo).
- Đáp án là chữ cái ứng với lựa chọn: G là A, H là B, …
- Điểm để trống thì mặc định là 1; dùng được dấu phẩy thập phân, ví dụ `1,5`.

**`PhanThi`** (bắt buộc khi import): các phần của đề, thứ tự dòng là thứ tự phần. Cột: A: Nhóm (khớp cột Nhóm của `CauHoi`) | B: Tiêu đề phần | C: Số câu bốc | D: Hướng dẫn (tùy chọn) | E: Xáo thứ tự câu (để trống hoặc "có"; ghi "không" để giữ thứ tự trong ngân hàng).

| A: Nhóm          | B: Tiêu đề phần                       | C: Số câu | D: Hướng dẫn                | E: Xáo |
| ---------------- | ------------------------------------- | --------- | --------------------------- | ------ |
| giao_ly_hon_nhan | PHẦN I - TRẮC NGHIỆM GIÁO LÝ HÔN NHÂN | 30        |                             |        |
| giao_ly_can_ban  | PHẦN II. TRẮC NGHIỆM GIÁO LÝ CĂN BẢN  | 30        |                             |        |
| kinh_bon         | PHẦN III. TRẮC NGHIỆM KINH BỔN        | 6         |                             |        |
| dien_khuyet      | PHẦN IV – TỰ LUẬN                     | 4         | (điền đáp án vào chỗ trống) |        |
| song_hon_nhan    | PHẦN V – TỰ LUẬN - SỐNG HÔN NHÂN      | 4         | (điền đáp án vào chỗ trống) | không  |

Trên trang làm bài, mỗi câu hiển thị tiêu đề phần, hướng dẫn và "(số câu – số điểm)" của phần (tính từ các câu thực sự bốc), cùng điểm của câu.

**`ThongTin`** (tùy chọn): nội dung trang chào và thời gian làm bài. Cột A: Khóa | B: Nội dung. Khóa `to_chuc` (các dòng đầu trang, ví dụ tên giáo phận, giáo xứ), `tieu_de` (một dòng), `thoi_luong_phut` (một dòng; đặt thời gian làm bài và hiển thị "(thời gian làm bài N phút)"), `luu_y` (mỗi dòng một ý trong khung "Lưu ý"). Không có tab này thì trang chào dùng chữ mặc định và thời gian giữ nguyên.

**`HocVien`** (bắt buộc khi import; không cần nếu chỉ nạp bằng CSV): A: Tên Thánh (**có thể để trống** nếu chưa có) | B: Họ và tên | C: Giáo xứ | D: Giáo phận (hai cột cuối tùy chọn, chỉ để hiển thị và giúp phân biệt người trùng tên).

**`KetQua`** (bắt buộc có tab, có thể để trống): app ghi kết quả vào đây. Lần import đầu tiên sẽ tự ghi dòng tiêu đề nếu tab đang trống. Các cột theo thứ tự:

Mã lượt · Tên Thánh · Họ và tên · Giáo xứ · Giáo phận · Giờ bắt đầu · Giờ nộp · Nộp trễ · Số lần rời tab · Điểm TN · Bài tự luận (gồm cả câu điền vào chỗ trống, mỗi câu một đoạn "[mã câu] đáp án") · **Điểm TL** (giáo viên nhập) · Tổng điểm (công thức = Điểm TN + Điểm TL)

Mọi chuỗi do học viên nhập mà bắt đầu bằng `=`, `+`, `-`, `@` đều được thêm `'` phía trước để chống formula injection.

### Import và resync

Dùng trang `/admin` (xem Bước 5 phần triển khai) hoặc gọi API:

```bash
# Nạp CauHoi, PhanThi, HocVien và ThongTin từ Sheet vào D1
curl -X POST https://<app>/api/admin/import -H "Content-Type: application/json" -H "Authorization: Bearer $ADMIN_TOKEN" -d '{}'
# Đẩy lại các bài đã nộp nhưng chưa lên được Sheet (sync_pending = 1)
curl -X POST https://<app>/api/admin/resync -H "Content-Type: application/json" -H "Authorization: Bearer $ADMIN_TOKEN" -d '{}'
```

- **Câu hỏi** và **các phần của đề** (tab `PhanThi`) được thay toàn bộ. **Học viên** được cập nhật theo (tên Thánh + họ tên + số thứ tự nếu trùng) nên sửa giáo xứ hay thêm người mới đều chạy lại import được; người đã có lượt thi luôn được giữ lại dù bị xóa khỏi Sheet. Sửa chính tả họ tên của người _chưa thi_ cũng được (dòng cũ bị xóa, dòng mới được tạo); với người _đã thi_, dòng cũ vẫn giữ nên sẽ xuất hiện thêm một dòng mới trùng tên: hãy tự sửa trực tiếp trong D1 nếu muốn.
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

- **Định danh**: học viên _chọn đúng dòng của mình_ trong danh sách (tìm khi gõ), không tự nhập thông tin. `luot_thi.hoc_vien_id` có `UNIQUE` nên mỗi dòng trong danh sách chỉ thi được một lần, kể cả khi hai request gửi cùng lúc. Họ tên, Tên Thánh, Giáo xứ, Giáo phận được sao vào `luot_thi` (bản gốc có dấu kèm bản chuẩn hóa) tại thời điểm bắt đầu thi.
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
- **Trùng họ tên**: danh sách cho phép trùng. Mỗi dòng là một người; kết quả tìm hiển thị Giáo xứ/Giáo phận để phân biệt. Hạn chế: nếu hai người trùng _cả_ tên Thánh, họ tên và giáo xứ thì không phân biệt được, và người đến sau có thể chọn nhầm dòng chưa dùng; nên thêm giáo xứ hoặc ghi chú vào tên trong Sheet.
- **Ai cũng tìm được tên trong danh sách**: ô tìm không yêu cầu đăng nhập, nên ai mở trang cũng thấy tên, Giáo xứ và Giáo phận của người khớp (tối đa 8 dòng, phải gõ từ 2 ký tự, không hiện ngày sinh hay điểm). Nếu danh sách cần giữ kín, đặt cả trang sau Cloudflare Access hoặc chỉ mở link cho lớp thi.
- **Logo/favicon**: `src/lib/assets/gpthaibinh90years.webp`, hiển thị ở đầu trang chào và dùng làm favicon (`+layout.svelte`).
- **Danh sách từ CSV không tách Tên Thánh**: toàn bộ chuỗi (ví dụ "Vinh Sơn Đỗ Văn Hậu") được lưu ở cột Họ và tên, cột Tên Thánh trên Sheet kết quả sẽ để trống. Muốn tách riêng, dùng tab `HocVien` với cột A là Tên Thánh.
- **Trang chào**: tiêu đề và phụ đề nằm ở hai hằng `TIEU_DE`, `PHU_DE` đầu file `src/routes/+page.svelte`.
- **Quota Sheets** là khoảng 60 lượt ghi mỗi phút. Khi nhiều người nộp cùng lúc, có thể một số bài không lên Sheet ngay (sau khi đã retry). Các bài đó vẫn giữ `sync_pending = 1` để resync hoặc cron đẩy lên sau. Resync gom nhiều hàng vào một request.
- **Bài tự luận** tối đa 5000 ký tự mỗi câu. Khi import, họ và tên tối đa 100 ký tự; Tên Thánh, Giáo xứ, Giáo phận tối đa 60 ký tự.
