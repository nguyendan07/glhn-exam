// Nhật ký bài thi: ghi lại diễn biến và thông tin máy của học viên để đối chiếu khi có khiếu nại.
// Quy tắc: nhật ký KHÔNG BAO GIỜ được làm hỏng bài thi, nên ghi sau thao tác chính, riêng một batch, và nuốt lỗi.
import { sha256Hex } from './normalize';

export type May = { ip: string; quoc_gia?: string; thanh_pho?: string; vung?: string; mui_gio?: string; nha_mang?: string; ua?: string };
export type SuKien = { su_kien: string; chi_tiet?: unknown; may?: string | null };
type BaiLamRut = { tn: Record<string, number>; tl: Record<string, string> };

const cat = (v: unknown, n: number) =>
	typeof v === 'string' && v ? v.replace(/[\u0000-\u001f\u007f]/g, ' ').slice(0, n) : undefined;

/** IP, vị trí ước tính (Cloudflare `request.cf`) và trình duyệt của yêu cầu. Thứ tự khóa cố định để so sánh bằng JSON.stringify. */
export function thongTinMay(request: Request, diaChiIp?: string): May {
	const cf = (request as Request & { cf?: Record<string, unknown> }).cf ?? {};
	const h = request.headers;
	return {
		ip: cat(h.get('cf-connecting-ip') ?? diaChiIp, 64) ?? '',
		quoc_gia: cat(cf.country ?? h.get('cf-ipcountry'), 8),
		thanh_pho: cat(cf.city, 80),
		vung: cat(cf.region, 80),
		mui_gio: cat(cf.timezone, 40),
		nha_mang: cat(cf.asOrganization, 80),
		ua: cat(h.get('user-agent'), 300)
	};
}

/** Dùng trong route: `getClientAddress` của SvelteKit có thể ném lỗi khi không xác định được IP (ví dụ chạy dev). */
export function mayTuYeuCau(request: Request, getClientAddress: () => string): May {
	let ip: string | undefined;
	try {
		ip = getClientAddress();
	} catch {
		/* không có IP: vẫn ghi các thông tin còn lại */
	}
	return thongTinMay(request, ip);
}

/**
 * Các đáp án thay đổi giữa hai lần lưu. Trắc nghiệm ghi chỉ số đáp án đã chọn (theo thứ tự hiển thị); tự luận chỉ ghi độ dài và
 * mã băm ngắn (gõ 2 giây lưu một lần, chép nguyên văn mỗi lần sẽ rất tốn chỗ; bản đầy đủ nằm ở bài làm). Độ dài tăng vọt giữa hai lần = dán từ nơi khác.
 */
export async function deltaBaiLam(truoc: BaiLamRut, sau: BaiLamRut) {
	const tn: Record<string, number> = {};
	for (const [ma, c] of Object.entries(sau.tn)) if (truoc.tn[ma] !== c) tn[ma] = c;
	const tl: Record<string, { do_dai: number; bam: string }> = {};
	for (const [ma, t] of Object.entries(sau.tl))
		if (truoc.tl[ma] !== t) tl[ma] = { do_dai: t.length, bam: (await sha256Hex(t)).slice(0, 8) };
	const xoa = [...Object.keys(truoc.tn), ...Object.keys(truoc.tl)].filter((ma) => !(ma in sau.tn) && !(ma in sau.tl));
	if (!Object.keys(tn).length && !Object.keys(tl).length && !xoa.length) return null;
	return { ...(Object.keys(tn).length && { tn }), ...(Object.keys(tl).length && { tl }), ...(xoa.length && { xoa }) };
}

/** Ghi một nhóm sự kiện (và cập nhật `may_cuoi` nếu có `mayMoi`) trong một batch. Lỗi chỉ được ghi log, không ném ra. */
export async function ghiNhatKy(db: D1Database, luotId: string, now: number, ds: SuKien[], mayMoi?: string | null) {
	if (!ds.length && !mayMoi) return;
	try {
		const st = ds.map((e) =>
			db
				.prepare('INSERT INTO nhat_ky (luot_id, luc, su_kien, chi_tiet, may) VALUES (?, ?, ?, ?, ?)')
				.bind(luotId, now, e.su_kien, e.chi_tiet === undefined ? null : JSON.stringify(e.chi_tiet), e.may ?? null)
		);
		if (mayMoi) st.push(db.prepare('UPDATE luot_thi SET may_cuoi = ? WHERE id = ?').bind(mayMoi, luotId));
		await db.batch(st);
	} catch (e) {
		console.error('Không ghi được nhật ký bài thi (bỏ qua, bài thi vẫn bình thường):', e);
	}
}
