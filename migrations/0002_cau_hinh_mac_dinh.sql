-- Cấu hình mặc định (một hàng duy nhất): làm bài 90 phút, dung sai nộp muộn 60 giây.
-- Tab ThongTin (khóa thoi_luong_phut) khi import từ Google Sheet sẽ ghi đè thời gian làm bài.
INSERT OR IGNORE INTO cau_hinh (id, thoi_luong_giay, dung_sai_giay) VALUES (1, 5400, 60);
