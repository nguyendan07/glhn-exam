const CONTROL = /[\u0000-\u001f\u007f-\u009f]/g;

/** Bỏ dấu tiếng Việt (kể cả đ/Đ), chữ thường, gộp khoảng trắng, trim. Dùng cho khóa/tìm kiếm, không dùng để lưu bản gốc. */
export function chuanHoa(s: string): string {
	return s
		.normalize('NFD')
		.replace(/[̀-ͯ]/g, '')
		.toLowerCase()
		.replace(/đ/g, 'd')
		.replace(/\s+/g, ' ')
		.trim();
}

/** Làm sạch chuỗi một dòng do người dùng nhập, giữ nguyên dấu: bỏ ký tự điều khiển, gộp khoảng trắng, trim. */
export function lamSach(s: string): string {
	return s.normalize('NFC').replace(CONTROL, ' ').replace(/\s+/g, ' ').trim();
}

/** Làm sạch văn bản nhiều dòng (tự luận): giữ \n và \t, bỏ ký tự điều khiển khác. */
export function lamSachVanBan(s: string): string {
	return s.normalize('NFC').replace(/\r\n?/g, '\n').replace(/[\u0000-\u0008\u000b-\u001f\u007f-\u009f]/g, '');
}

/** 'dd/mm/yyyy' (chấp nhận 1 chữ số, dấu / - .) → 'YYYY-MM-DD', hoặc null nếu không hợp lệ. */
export function parseNgaySinh(s: string, now = new Date()): string | null {
	const m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(s.trim());
	if (!m) return null;
	const [d, mo, y] = [+m[1], +m[2], +m[3]];
	const dt = new Date(Date.UTC(y, mo - 1, d));
	if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return null;
	if (y < 1900 || dt.getTime() > now.getTime()) return null;
	return `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/** 'YYYY-MM-DD' → 'dd/mm/yyyy' để hiển thị. */
export function hienThiNgay(iso: string): string {
	const [y, m, d] = iso.split('-');
	return `${d}/${m}/${y}`;
}

export function khoaDinhDanh(hoTen: string, ngaySinhIso: string): string {
	return chuanHoa(hoTen) + '|' + ngaySinhIso;
}

export const GIOI_HAN = { ho_ten: 100, truong_phu: 60, tu_luan: 5000 } as const;

export type ThongTinHocVien = {
	ten_thanh: string;
	ho_ten: string;
	ngay_sinh: string; // YYYY-MM-DD
	giao_xu: string;
	giao_phan: string;
};

const NHAN = {
	ten_thanh: 'Tên Thánh',
	ho_ten: 'Họ và tên',
	ngay_sinh: 'Ngày sinh',
	giao_xu: 'Giáo xứ',
	giao_phan: 'Giáo phận'
} as const;

/** Validate body của /api/start. Trả lỗi tiếng Việt cho trường đầu tiên sai. */
export function kiemTraThongTin(body: unknown): { ok: true; data: ThongTinHocVien } | { ok: false; error: string } {
	if (!body || typeof body !== 'object') return { ok: false, error: 'Dữ liệu không hợp lệ.' };
	const b = body as Record<string, unknown>;
	const out: Record<string, string> = {};
	for (const k of ['ten_thanh', 'ho_ten', 'ngay_sinh', 'giao_xu', 'giao_phan'] as const) {
		const v = typeof b[k] === 'string' ? lamSach(b[k] as string) : '';
		if (!v) return { ok: false, error: `Vui lòng nhập ${NHAN[k]}.` };
		const max = k === 'ho_ten' ? GIOI_HAN.ho_ten : GIOI_HAN.truong_phu;
		if (v.length > max) return { ok: false, error: `${NHAN[k]} tối đa ${max} ký tự.` };
		out[k] = v;
	}
	const iso = parseNgaySinh(out.ngay_sinh);
	if (!iso) return { ok: false, error: 'Ngày sinh không hợp lệ (định dạng dd/mm/yyyy).' };
	if (!/\p{L}/u.test(out.ho_ten)) return { ok: false, error: 'Họ và tên không hợp lệ.' };
	return { ok: true, data: { ...(out as ThongTinHocVien), ngay_sinh: iso } };
}
