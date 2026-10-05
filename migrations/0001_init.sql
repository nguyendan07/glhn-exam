-- Ngân hàng câu hỏi. lua_chon: JSON mảng chuỗi (chỉ TN). dap_an: chỉ số 0-based trong lua_chon gốc (chỉ TN).
CREATE TABLE cau_hoi (
	ma TEXT PRIMARY KEY,
	loai TEXT NOT NULL CHECK (loai IN ('TN', 'TL')),
	nhom TEXT NOT NULL,
	noi_dung TEXT NOT NULL,
	lua_chon TEXT,
	dap_an INTEGER,
	diem REAL NOT NULL DEFAULT 1,
	CHECK (loai = 'TL' OR (lua_chon IS NOT NULL AND dap_an IS NOT NULL))
);

-- Danh sách học viên được phép thi. Học viên tìm tên rồi chọn đúng dòng của mình; id là khóa chống thi lần hai.
-- khoa = ho_ten|ten_thanh chuẩn hóa + '#' + số thứ tự trong nhóm trùng, để import lại cập nhật đúng dòng cũ (giữ nguyên id).
CREATE TABLE hoc_vien_cho_phep (
	id INTEGER PRIMARY KEY,
	khoa TEXT NOT NULL UNIQUE,
	ten_thanh TEXT NOT NULL DEFAULT '', -- có thể trống: chưa có tên Thánh
	ho_ten TEXT NOT NULL,
	tim_kiem TEXT NOT NULL, -- chuẩn hóa của "tên Thánh + họ tên", để tìm khi gõ
	giao_xu TEXT NOT NULL DEFAULT '',
	giao_phan TEXT NOT NULL DEFAULT ''
);

-- Cấu hình chung (một hàng duy nhất).
CREATE TABLE cau_hinh (
	id INTEGER PRIMARY KEY CHECK (id = 1),
	thoi_luong_giay INTEGER NOT NULL CHECK (thoi_luong_giay > 0),
	dung_sai_giay INTEGER NOT NULL DEFAULT 60 CHECK (dung_sai_giay >= 0)
);

-- Số câu bốc ở mỗi nhóm.
CREATE TABLE cau_hinh_nhom (
	nhom TEXT PRIMARY KEY,
	so_cau INTEGER NOT NULL CHECK (so_cau >= 0)
);

CREATE TABLE luot_thi (
	id TEXT PRIMARY KEY, -- Mã lượt
	hoc_vien_id INTEGER NOT NULL UNIQUE REFERENCES hoc_vien_cho_phep (id), -- chặn thi lần hai ở tầng DB
	ho_ten TEXT NOT NULL, -- bản sao tại thời điểm thi
	ho_ten_chuan_hoa TEXT NOT NULL,
	ten_thanh TEXT NOT NULL,
	ten_thanh_chuan_hoa TEXT NOT NULL,
	giao_xu TEXT NOT NULL,
	giao_xu_chuan_hoa TEXT NOT NULL,
	giao_phan TEXT NOT NULL,
	giao_phan_chuan_hoa TEXT NOT NULL,
	token_hash TEXT UNIQUE, -- SHA-256 của token phiên; NULL = cho phép nhận lại từ thiết bị khác (giám thị đặt)
	started_at INTEGER NOT NULL, -- epoch ms, do server ghi
	submitted_at INTEGER,
	trang_thai TEXT NOT NULL DEFAULT 'dang_thi' CHECK (trang_thai IN ('dang_thi', 'da_nop')),
	de_thi TEXT NOT NULL, -- JSON [{ma, thu_tu?: number[]}] theo thứ tự hiển thị
	so_lan_roi_tab INTEGER NOT NULL DEFAULT 0,
	nop_tre INTEGER NOT NULL DEFAULT 0,
	sync_pending INTEGER NOT NULL DEFAULT 0,
	sheet_row INTEGER
);
CREATE INDEX idx_luot_thi_giao_xu ON luot_thi (giao_xu_chuan_hoa);
CREATE INDEX idx_luot_thi_giao_phan ON luot_thi (giao_phan_chuan_hoa);

CREATE TABLE bai_lam (
	luot_id TEXT PRIMARY KEY REFERENCES luot_thi (id),
	dap_an_tn TEXT NOT NULL DEFAULT '{}', -- JSON {ma: chỉ số lựa chọn theo thứ tự hiển thị}
	tu_luan TEXT NOT NULL DEFAULT '{}', -- JSON {ma: bài viết}
	updated_at INTEGER,
	diem_tn REAL,
	diem_tl REAL, -- giáo viên chấm trên Sheet
	tong_diem REAL
);
