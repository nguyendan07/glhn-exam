INSERT INTO cau_hinh (id, thoi_luong_giay, dung_sai_giay) VALUES (1, 1800, 60);

-- Cấu trúc 5 phần của đề thật. so_cau ở đây chỉ vừa đủ cho ngân hàng câu hỏi MẪU bên dưới;
-- đề thật là 30 / 30 / 6 / 4 / 4 câu, đặt bằng tab PhanThi khi import từ Google Sheet (xem README).
INSERT INTO cau_hinh_nhom (nhom, so_cau, ten, huong_dan, thu_tu, xao_tron) VALUES
('giao_ly_hon_nhan', 3, 'PHẦN I - TRẮC NGHIỆM GIÁO LÝ HÔN NHÂN', '', 1, 1),
('giao_ly_can_ban', 3, 'PHẦN II. TRẮC NGHIỆM GIÁO LÝ CĂN BẢN', '', 2, 1),
('kinh_bon', 2, 'PHẦN III. TRẮC NGHIỆM KINH BỔN', '', 3, 1),
('dien_khuyet', 2, 'PHẦN IV – TỰ LUẬN', '(điền đáp án vào chỗ trống)', 4, 1),
('song_hon_nhan', 4, 'PHẦN V – TỰ LUẬN - SỐNG HÔN NHÂN', '(điền đáp án vào chỗ trống)', 5, 0);

-- Câu hỏi MẪU cho các phần I–IV (thay bằng ngân hàng thật bằng cách import). Phần V là 4 câu thật của đề.
INSERT INTO cau_hoi (ma, loai, nhom, noi_dung, lua_chon, dap_an, diem) VALUES
('HN01', 'TN', 'giao_ly_hon_nhan', 'Hôn nhân Công giáo có hai đặc tính cốt yếu là gì?', '["Duy nhất và bất khả phân ly","Tự do và bình đẳng","Hiếu thảo và thủy chung","Sinh sản và giáo dục"]', 0, 1),
('HN02', 'TN', 'giao_ly_hon_nhan', 'Trong Giáo hội Latinh, ai là thừa tác viên của bí tích Hôn phối?', '["Linh mục chủ sự","Hai người nam nữ kết hôn","Cha mẹ hai bên","Hai người làm chứng"]', 1, 1),
('HN03', 'TN', 'giao_ly_hon_nhan', 'Bí tích Hôn phối thuộc nhóm bí tích nào?', '["Bí tích khai tâm Kitô giáo","Bí tích chữa lành","Bí tích phục vụ hiệp thông","Bí tích tha tội"]', 2, 1),
('KT01', 'TN', 'giao_ly_can_ban', 'Sách đầu tiên của Kinh Thánh là sách nào?', '["Sáng Thế","Xuất Hành","Lêvi","Dân Số"]', 0, 1),
('KT02', 'TN', 'giao_ly_can_ban', 'Có bao nhiêu sách Tin Mừng?', '["Ba","Bốn","Năm","Sáu"]', 1, 1),
('KT03', 'TN', 'giao_ly_can_ban', 'Chúa Giêsu sinh ra tại đâu?', '["Nadarét","Giêrusalem","Bêlem","Caphácnaum"]', 2, 1),
('KT04', 'TN', 'giao_ly_can_ban', 'Ai đã chối Chúa ba lần?', '["Gioan","Phêrô","Giuđa","Tôma"]', 1, 1),
('KT05', 'TN', 'giao_ly_can_ban', 'Ông Môsê nhận Mười Điều Răn trên núi nào?', '["Xinai","Tabo","Ô-liu","Cácmen"]', 0, 1),
('PV01', 'TN', 'giao_ly_can_ban', 'Mùa Vọng có bao nhiêu Chúa Nhật?', '["Ba","Bốn","Năm","Sáu"]', 1, 1),
('PV02', 'TN', 'giao_ly_can_ban', 'Màu phẩm phục của Mùa Chay là màu gì?', '["Trắng","Xanh","Tím","Đỏ"]', 2, 1),
('PV03', 'TN', 'giao_ly_can_ban', 'Hội Thánh có bao nhiêu Bí Tích?', '["Năm","Sáu","Bảy","Tám"]', 2, 1),
('KB01', 'TN', 'kinh_bon', 'Kinh Lạy Cha mở đầu bằng câu nào?', '["Lạy Cha chúng con ở trên trời","Kính mừng Maria đầy ơn phước","Nhân danh Cha và Con và Thánh Thần","Tôi tin kính một Thiên Chúa"]', 0, 2),
('KB02', 'TN', 'kinh_bon', 'Kinh Kính Mừng mở đầu bằng câu nào?', '["Lạy Cha chúng con ở trên trời","Kính mừng Maria đầy ơn phước","Nhân danh Cha và Con và Thánh Thần","Tôi tin kính một Thiên Chúa"]', 1, 2),
('DK01', 'DK', 'dien_khuyet', 'Chúa Giêsu sinh ra tại thành ______.', NULL, NULL, 2),
('DK02', 'DK', 'dien_khuyet', 'Ông Môsê nhận Mười Điều Răn trên núi ______.', NULL, NULL, 2),
('V1', 'DK', 'song_hon_nhan', 'Câu 1: Mục đích chính yếu của Hôn nhân công giáo là gì?', NULL, NULL, 2),
('V2', 'DK', 'song_hon_nhan', 'Câu 2: Đặc tính chính yếu của Hôn nhân công giáo là gì?', NULL, NULL, 2),
('V3', 'DK', 'song_hon_nhan', 'Câu 3: Sáu chữ T trong Hôn nhân công giáo là gì?', NULL, NULL, 2),
('V4', 'TL', 'song_hon_nhan', 'Câu 4: Người đời thường cho rằng: nếu đã hết yêu thương nhau thì chia tay, đường ai nấy đi, giải thoát cho nhau, hơn là sống với nhau mà như hoả ngục. Bạn nghĩ gì về quan điểm này? (viết khoảng 150-200 từ)', NULL, NULL, 14);

-- Học viên mẫu (một người chưa có tên Thánh, hai người trùng họ tên để thử trường hợp trùng tên).
INSERT INTO hoc_vien_cho_phep (khoa, ten_thanh, ho_ten, tim_kiem, giao_xu, giao_phan) VALUES
('nguyen van an|phero#1', 'Phêrô', 'Nguyễn Văn An', 'phero nguyen van an', 'Giáo xứ Tân Định', 'Sài Gòn'),
('nguyen van an|giuse#1', 'Giuse', 'Nguyễn Văn An', 'giuse nguyen van an', 'Giáo xứ Hàm Long', 'Hà Nội'),
('tran thi binh|#1', '', 'Trần Thị Bình', 'tran thi binh', 'Giáo xứ Đức Bà', 'Sài Gòn'),
('le thi cuc|maria#1', 'Maria', 'Lê Thị Cúc', 'maria le thi cuc', 'Giáo xứ Phú Cam', 'Huế'),
('pham van dung|anre#1', 'Anrê', 'Phạm Văn Dũng', 'anre pham van dung', '', '');
