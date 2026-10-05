import { describe, expect, it } from 'vitest';
import { chuanHoa, khoaDinhDanh, kiemTraThongTin, lamSach, parseNgaySinh } from './normalize';

describe('chuẩn hóa chuỗi', () => {
	it('bỏ dấu, xử lý đ/Đ, chữ thường, gộp khoảng trắng', () => {
		expect(chuanHoa('  Nguyễn   Văn  ĐỨC ')).toBe('nguyen van duc');
		expect(chuanHoa('Đỗ Thị Hường')).toBe('do thi huong');
		expect(chuanHoa('Phêrô\tGiuse\nAnna')).toBe('phero giuse anna');
	});

	it('bản gốc giữ nguyên dấu (chỉ làm sạch)', () => {
		expect(lamSach('  Phêrô  ')).toBe('Phêrô');
		expect(lamSach('Giuse')).toBe('Giuse');
		expect(lamSach('Anna\u0000 Maria')).toBe('Anna Maria');
		const r = kiemTraThongTin({ ten_thanh: 'Phêrô', ho_ten: 'Trần  Văn Đức', ngay_sinh: '05/09/2010', giao_xu: 'Giáo xứ Tân Định', giao_phan: 'Sài Gòn' });
		expect(r).toEqual({ ok: true, data: { ten_thanh: 'Phêrô', ho_ten: 'Trần Văn Đức', ngay_sinh: '2010-09-05', giao_xu: 'Giáo xứ Tân Định', giao_phan: 'Sài Gòn' } });
	});

	it('khóa định danh chỉ từ họ tên + ngày sinh', () => {
		expect(khoaDinhDanh('Trần Văn Đức', '2010-09-05')).toBe('tran van duc|2010-09-05');
	});

	it('ngày sinh', () => {
		expect(parseNgaySinh('1/2/2000')).toBe('2000-02-01');
		expect(parseNgaySinh('31/02/2000')).toBeNull();
		expect(parseNgaySinh('2000-02-01')).toBeNull();
		expect(parseNgaySinh('01/01/2999')).toBeNull();
	});
});
