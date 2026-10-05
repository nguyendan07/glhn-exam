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

INSERT INTO giao_xu (ten, giao_phan) VALUES
('Giáo xứ Tân Định', 'Sài Gòn'),
('Giáo xứ Đức Bà', 'Sài Gòn'),
('Giáo xứ Hàm Long', 'Hà Nội'),
('Giáo xứ Phát Diệm', 'Phát Diệm'),
('Giáo xứ Phú Cam', 'Huế');
