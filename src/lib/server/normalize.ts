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

export const GIOI_HAN = { tu_luan: 5000 } as const;

/** SHA-256 dạng hex (dùng cho token phiên và mã băm nhật ký). */
export async function sha256Hex(s: string): Promise<string> {
	const h = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
	return [...new Uint8Array(h)].map((x) => x.toString(16).padStart(2, '0')).join('');
}
