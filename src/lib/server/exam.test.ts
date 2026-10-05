import { describe, expect, it } from 'vitest';
import { chamTN, taoDe, thoiGian, type CauHoi } from './exam';

const tn = (ma: string, nhom: string, dap_an = 0): CauHoi => ({
	ma, loai: 'TN', nhom, noi_dung: ma, lua_chon: JSON.stringify(['A', 'B', 'C', 'D', 'E', 'F']), dap_an, diem: 1
});
const bank: CauHoi[] = [
	...Array.from({ length: 10 }, (_, i) => tn(`a${i}`, 'a')),
	...Array.from({ length: 5 }, (_, i) => tn(`b${i}`, 'b')),
	{ ma: 't1', loai: 'TL', nhom: 't', noi_dung: 'tl', lua_chon: null, dap_an: null, diem: 5 }
];

describe('random đề', () => {
	it('đúng số câu mỗi nhóm, không trùng, đáp án được xáo', () => {
		let xao = false;
		for (let k = 0; k < 50; k++) {
			const de = taoDe(bank, { a: 4, b: 2, t: 1 });
			expect(de.filter((m) => m.ma.startsWith('a'))).toHaveLength(4);
			expect(de.filter((m) => m.ma.startsWith('b'))).toHaveLength(2);
			expect(de.find((m) => m.ma === 't1')?.thu_tu).toBeUndefined();
			expect(new Set(de.map((m) => m.ma)).size).toBe(7);
			for (const m of de.filter((m) => m.thu_tu)) {
				expect([...m.thu_tu!].sort()).toEqual([0, 1, 2, 3, 4, 5]);
				if (m.thu_tu!.some((v, i) => v !== i)) xao = true;
			}
		}
		expect(xao).toBe(true);
	});

	it('báo lỗi khi nhóm thiếu câu', () => {
		expect(() => taoDe(bank, { b: 6 })).toThrow(/b/);
	});
});

describe('chấm trắc nghiệm', () => {
	it('ánh xạ chỉ số hiển thị về đáp án gốc', () => {
		const ch = new Map(bank.map((q) => [q.ma, q]));
		const de = [{ ma: 'a0', thu_tu: [3, 0, 1, 2] }, { ma: 'a1', thu_tu: [0, 1, 2, 3] }, { ma: 't1' }];
		expect(chamTN(de, ch, { a0: 1, a1: 2 })).toEqual({ diem: 1, toiDa: 2 });
	});
});

describe('thời gian', () => {
	const T = 600, tol = 60, s = 1_000_000;
	it('trước T/2 không được nộp', () => {
		expect(thoiGian(s, s + 299_000, T, tol)).toMatchObject({ duocNop: false, tre: false });
	});
	it('từ T/2 đến T được nộp, không trễ', () => {
		expect(thoiGian(s, s + 300_000, T, tol)).toMatchObject({ duocNop: true, tre: false });
		expect(thoiGian(s, s + 660_000, T, tol)).toMatchObject({ duocNop: true, tre: false });
	});
	it('quá T + dung sai thì trễ', () => {
		expect(thoiGian(s, s + 660_001, T, tol)).toMatchObject({ duocNop: true, tre: true, conLaiMs: 0 });
	});
});
