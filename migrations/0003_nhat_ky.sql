-- Nhật ký bài thi để đối chiếu khi có khiếu nại. Mỗi dòng là một sự kiện của một lượt thi, theo thứ tự id.
-- su_kien: bat_dau | tiep_tuc | tu_choi | luu | roi_man_hinh | doi_may | nop | mo_khoa
-- chi_tiet: JSON tùy sự kiện (ví dụ luu = các đáp án thay đổi). may: JSON { ip, quoc_gia, thanh_pho, vung, mui_gio, nha_mang, ua },
-- chỉ ghi ở sự kiện đầu hoặc khi máy/IP đổi so với sự kiện trước.
CREATE TABLE nhat_ky (
	id INTEGER PRIMARY KEY,
	luot_id TEXT NOT NULL REFERENCES luot_thi (id),
	luc INTEGER NOT NULL, -- epoch ms, giờ máy chủ
	su_kien TEXT NOT NULL,
	chi_tiet TEXT,
	may TEXT
);
CREATE INDEX idx_nhat_ky_luot ON nhat_ky (luot_id, id);

-- Thông tin máy ở sự kiện gần nhất (cùng định dạng với nhat_ky.may), để biết khi nào máy/IP thay đổi.
ALTER TABLE luot_thi ADD COLUMN may_cuoi TEXT;
