import { describe, expect, it } from 'vitest';
import { chuanHoa, lamSach } from './normalize';

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
	});
});
