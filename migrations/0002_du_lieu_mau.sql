INSERT INTO cau_hinh (id, thoi_luong_giay, dung_sai_giay) VALUES (1, 1800, 60);

INSERT INTO cau_hinh_nhom (nhom, so_cau) VALUES ('kinh_thanh', 3), ('phung_vu', 2), ('tu_luan', 1);

INSERT INTO cau_hoi (ma, loai, nhom, noi_dung, lua_chon, dap_an, diem) VALUES
('KT01', 'TN', 'kinh_thanh', 'Sách đầu tiên của Kinh Thánh là sách nào?', '["Sáng Thế","Xuất Hành","Lêvi","Dân Số"]', 0, 1),
('KT02', 'TN', 'kinh_thanh', 'Có bao nhiêu sách Tin Mừng?', '["Ba","Bốn","Năm","Sáu"]', 1, 1),
('KT03', 'TN', 'kinh_thanh', 'Chúa Giêsu sinh ra tại đâu?', '["Nadarét","Giêrusalem","Bêlem","Caphácnaum"]', 2, 1),
('KT04', 'TN', 'kinh_thanh', 'Ai đã chối Chúa ba lần?', '["Gioan","Phêrô","Giuđa","Tôma"]', 1, 1),
('KT05', 'TN', 'kinh_thanh', 'Ông Môsê nhận Mười Điều Răn trên núi nào?', '["Xinai","Tabo","Ô-liu","Cácmen"]', 0, 1),
('PV01', 'TN', 'phung_vu', 'Mùa Vọng có bao nhiêu Chúa Nhật?', '["Ba","Bốn","Năm","Sáu"]', 1, 1),
('PV02', 'TN', 'phung_vu', 'Màu phẩm phục của Mùa Chay là màu gì?', '["Trắng","Xanh","Tím","Đỏ"]', 2, 1),
('PV03', 'TN', 'phung_vu', 'Hội Thánh có bao nhiêu Bí Tích?', '["Năm","Sáu","Bảy","Tám"]', 2, 1),
('TL01', 'TL', 'tu_luan', 'Hãy trình bày ý nghĩa của Bí Tích Thánh Thể trong đời sống người Kitô hữu.', NULL, NULL, 5),
('TL02', 'TL', 'tu_luan', 'Bạn hiểu thế nào về điều răn mến Chúa yêu người?', NULL, NULL, 5);

-- Học viên mẫu (một người chưa có tên Thánh, hai người trùng họ tên để thử trường hợp trùng tên).
INSERT INTO hoc_vien_cho_phep (khoa, ten_thanh, ho_ten, tim_kiem, giao_xu, giao_phan) VALUES
('nguyen van an|phero#1', 'Phêrô', 'Nguyễn Văn An', 'phero nguyen van an', 'Giáo xứ Tân Định', 'Sài Gòn'),
('nguyen van an|giuse#1', 'Giuse', 'Nguyễn Văn An', 'giuse nguyen van an', 'Giáo xứ Hàm Long', 'Hà Nội'),
('tran thi binh|#1', '', 'Trần Thị Bình', 'tran thi binh', 'Giáo xứ Đức Bà', 'Sài Gòn'),
('le thi cuc|maria#1', 'Maria', 'Lê Thị Cúc', 'maria le thi cuc', 'Giáo xứ Phú Cam', 'Huế'),
('pham van dung|anre#1', 'Anrê', 'Phạm Văn Dũng', 'anre pham van dung', '', '');
