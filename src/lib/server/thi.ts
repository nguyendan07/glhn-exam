import { chamTN, taoDe, thoiGian, type CauHoi, type MucDe } from './exam';
import { chuanHoa, GIOI_HAN, lamSachVanBan } from './normalize';

export const COOKIE = 'phien_thi';
export const COOKIE_OPTS = {
	path: '/',
	httpOnly: true,
	sameSite: 'strict',
	maxAge: 60 * 60 * 24 * 30
} as const;

const MAX_BODY = 300_000;

/** Đọc JSON có giới hạn kích thước. Trả undefined nếu quá lớn hoặc sai cú pháp. */
export async function docJson(request: Request): Promise<unknown> {
	const text = await request.text();
	if (text.length > MAX_BODY) return undefined;
	try {
		return JSON.parse(text);
	} catch {
		return undefined;
	}
}

export const taoToken = () => crypto.randomUUID();

export async function sha256Hex(s: string): Promise<string> {
	const h = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
	return [...new Uint8Array(h)].map((x) => x.toString(16).padStart(2, '0')).join('');
}

type CauHinh = { thoiLuong: number; dungSai: number; soCau: Record<string, number> };

async function docCauHinh(db: D1Database): Promise<CauHinh> {
	const [c, n] = await db.batch([
		db.prepare('SELECT thoi_luong_giay, dung_sai_giay FROM cau_hinh WHERE id = 1'),
		db.prepare('SELECT nhom, so_cau FROM cau_hinh_nhom')
	]);
	const row = c.results[0] as { thoi_luong_giay: number; dung_sai_giay: number } | undefined;
	if (!row) throw new Error('Chưa có cấu hình (bảng cau_hinh).');
	return {
		thoiLuong: row.thoi_luong_giay,
		dungSai: row.dung_sai_giay,
		soCau: Object.fromEntries((n.results as { nhom: string; so_cau: number }[]).map((r) => [r.nhom, r.so_cau]))
	};
}

type Luot = {
	id: string;
	ho_ten: string;
	ten_thanh: string;
	giao_xu: string;
	giao_phan: string;
	token_hash: string | null;
	started_at: number;
	submitted_at: number | null;
	trang_thai: 'dang_thi' | 'da_nop';
	de_thi: string;
	so_lan_roi_tab: number;
	nop_tre: number;
	dap_an_tn: string;
	tu_luan: string;
	diem_tn: number | null;
};

const SELECT_LUOT = `SELECT l.id, l.ho_ten, l.ten_thanh, l.giao_xu, l.giao_phan, l.token_hash,
	l.started_at, l.submitted_at, l.trang_thai, l.de_thi, l.so_lan_roi_tab, l.nop_tre,
	b.dap_an_tn, b.tu_luan, b.diem_tn
	FROM luot_thi l JOIN bai_lam b ON b.luot_id = l.id`;

export async function timLuotTheoToken(db: D1Database, token: string | undefined): Promise<Luot | null> {
	if (!token || token.length > 100) return null;
	return db.prepare(`${SELECT_LUOT} WHERE l.token_hash = ?`).bind(await sha256Hex(token)).first<Luot>();
}

function thongTin(l: Luot) {
	return {
		ma_luot: l.id,
		ten_thanh: l.ten_thanh,
		ho_ten: l.ho_ten,
		giao_xu: l.giao_xu,
		giao_phan: l.giao_phan
	};
}

/** Câu hỏi (kể cả đáp án đúng, chỉ dùng phía server) theo danh sách mã. */
async function docCauHoi(db: D1Database, mas: string[]): Promise<Map<string, CauHoi>> {
	const { results } = await db
		.prepare('SELECT * FROM cau_hoi WHERE ma IN (SELECT value FROM json_each(?))')
		.bind(JSON.stringify(mas))
		.all<CauHoi>();
	return new Map(results.map((q) => [q.ma, q]));
}

type KetQuaStart = { res: Response; token?: string };

type HocVien = { id: number; ten_thanh: string; ho_ten: string; giao_xu: string; giao_phan: string };

/** GET /api/tim-kiem: tìm khi đang gõ. Mỗi từ trong ô nhập phải khớp (không phân biệt dấu/hoa thường), tên Thánh có hay không đều được. */
export async function timHocVien(db: D1Database, q: string) {
	const tu = chuanHoa(q.slice(0, 100)).split(' ').filter(Boolean).slice(0, 8);
	if (tu.join('').length < 2) return [];
	const dieuKien = tu.map(() => `tim_kiem LIKE ? ESCAPE '\\'`).join(' AND ');
	const { results } = await db
		.prepare(
			`SELECT h.id, h.ten_thanh, h.ho_ten, h.giao_xu, h.giao_phan,
			EXISTS (SELECT 1 FROM luot_thi l WHERE l.hoc_vien_id = h.id) AS da_thi
			FROM hoc_vien_cho_phep h WHERE ${dieuKien} ORDER BY h.tim_kiem, h.id LIMIT 8`
		)
		.bind(...tu.map((t) => `%${t.replace(/[\\%_]/g, '\\$&')}%`))
		.all<HocVien & { da_thi: number }>();
	return results.map((r) => ({ ...r, da_thi: r.da_thi === 1 }));
}

/** POST /api/start { hoc_vien_id }: tạo lượt thi mới hoặc trả lại lượt đang có (cùng thiết bị). */
export async function batDau(db: D1Database, body: unknown, token: string | undefined, now = Date.now()): Promise<KetQuaStart> {
	const hvId = (body as { hoc_vien_id?: unknown } | null)?.hoc_vien_id;
	if (!Number.isInteger(hvId) || (hvId as number) <= 0) return { res: Response.json({ error: 'Vui lòng chọn tên của bạn trong danh sách.' }, { status: 400 }) };
	const hv = await db
		.prepare('SELECT id, ten_thanh, ho_ten, giao_xu, giao_phan FROM hoc_vien_cho_phep WHERE id = ?')
		.bind(hvId)
		.first<HocVien>();
	if (!hv) return { res: Response.json({ error: 'Không tìm thấy bạn trong danh sách dự thi. Vui lòng liên hệ giám thị.' }, { status: 404 }) };

	const timTheoHv = () => db.prepare('SELECT id, token_hash, trang_thai FROM luot_thi WHERE hoc_vien_id = ?').bind(hv.id).first<CuRow>();
	const cu = await timTheoHv();
	if (cu) return tiepTuc(db, cu, token);

	const cfg = await docCauHinh(db);
	const { results: nganHang } = await db.prepare('SELECT * FROM cau_hoi').all<CauHoi>();
	const de = taoDe(nganHang, cfg.soCau);
	const id = crypto.randomUUID();
	const moi = taoToken();

	// Atomic: lượt thi + bài làm. UNIQUE(hoc_vien_id) chặn hai request đồng thời.
	const [ins] = await db.batch([
		db
			.prepare(
				`INSERT INTO luot_thi (id, hoc_vien_id, ho_ten, ho_ten_chuan_hoa, ten_thanh, ten_thanh_chuan_hoa,
				giao_xu, giao_xu_chuan_hoa, giao_phan, giao_phan_chuan_hoa, token_hash, started_at, de_thi)
				VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT (hoc_vien_id) DO NOTHING`
			)
			.bind(
				id, hv.id, hv.ho_ten, chuanHoa(hv.ho_ten), hv.ten_thanh, chuanHoa(hv.ten_thanh), hv.giao_xu, chuanHoa(hv.giao_xu),
				hv.giao_phan, chuanHoa(hv.giao_phan), await sha256Hex(moi), now, JSON.stringify(de)
			),
		db.prepare('INSERT INTO bai_lam (luot_id) SELECT id FROM luot_thi WHERE id = ?').bind(id)
	]);
	if (ins.meta.changes === 0) return tiepTuc(db, (await timTheoHv())!, token);
	return { res: Response.json({ trang_thai: 'dang_thi' }), token: moi };
}

type CuRow = { id: string; token_hash: string | null; trang_thai: string };

async function tiepTuc(db: D1Database, cu: CuRow, token: string | undefined): Promise<KetQuaStart> {
	if (token && (await sha256Hex(token)) === cu.token_hash) return { res: Response.json({ trang_thai: cu.trang_thai }) };
	// token_hash NULL: giám thị đã mở khóa để học viên vào lại từ thiết bị khác.
	if (cu.token_hash === null) {
		const moi = taoToken();
		const r = await db
			.prepare('UPDATE luot_thi SET token_hash = ? WHERE id = ? AND token_hash IS NULL')
			.bind(await sha256Hex(moi), cu.id)
			.run();
		if (r.meta.changes === 1) return { res: Response.json({ trang_thai: cu.trang_thai }), token: moi };
	}
	const error =
		cu.trang_thai === 'da_nop'
			? 'Bạn đã thi rồi. Mỗi học viên chỉ được thi một lần.'
			: 'Lượt thi của bạn đang mở trên một thiết bị khác. Vui lòng liên hệ giám thị.';
	return { res: Response.json({ error }, { status: 409 }) };
}

type BaiLam = { dap_an_tn: Record<string, number>; tu_luan: Record<string, string>; so_lan_roi_tab: number };

/** Validate đáp án gửi lên, chỉ giữ các câu có trong đề của học viên. */
export function kiemTraBaiLam(body: unknown, de: MucDe[]): BaiLam | string {
	if (!body || typeof body !== 'object') return 'Dữ liệu không hợp lệ.';
	const b = body as Record<string, unknown>;
	const tn = (b.dap_an_tn ?? {}) as Record<string, unknown>;
	const tl = (b.tu_luan ?? {}) as Record<string, unknown>;
	if (typeof tn !== 'object' || typeof tl !== 'object') return 'Dữ liệu không hợp lệ.';
	const out: BaiLam = { dap_an_tn: {}, tu_luan: {}, so_lan_roi_tab: 0 };
	for (const m of de) {
		if (m.thu_tu) {
			const c = tn[m.ma];
			if (c === undefined || c === null) continue;
			if (!Number.isInteger(c) || (c as number) < 0 || (c as number) >= m.thu_tu.length) return 'Đáp án không hợp lệ.';
			out.dap_an_tn[m.ma] = c as number;
		} else {
			const s = tl[m.ma];
			if (s === undefined || s === null || s === '') continue;
			if (typeof s !== 'string') return 'Bài tự luận không hợp lệ.';
			const clean = lamSachVanBan(s);
			if (clean.length > GIOI_HAN.tu_luan) return `Bài tự luận tối đa ${GIOI_HAN.tu_luan} ký tự.`;
			out.tu_luan[m.ma] = clean;
		}
	}
	const r = b.so_lan_roi_tab;
	out.so_lan_roi_tab = Number.isInteger(r) && (r as number) >= 0 ? Math.min(r as number, 100_000) : 0;
	return out;
}

/** Dữ liệu cho trang /thi. Không chứa đáp án đúng. */
export async function trangThaiThi(db: D1Database, l: Luot, now = Date.now()) {
	const cfg = await docCauHinh(db);
	const de: MucDe[] = JSON.parse(l.de_thi);
	const ch = await docCauHoi(db, de.map((m) => m.ma));
	const t = thoiGian(l.started_at, now, cfg.thoiLuong, cfg.dungSai);
	return {
		thong_tin: thongTin(l),
		cau_hoi: de.flatMap((m) => {
			const q = ch.get(m.ma);
			if (!q) return [];
			const goc: string[] | null = q.lua_chon ? JSON.parse(q.lua_chon) : null;
			return [{ ma: q.ma, loai: q.loai, noi_dung: q.noi_dung, lua_chon: m.thu_tu && goc ? m.thu_tu.map((i) => goc[i]) : null }];
		}),
		dap_an_tn: JSON.parse(l.dap_an_tn) as Record<string, number>,
		tu_luan: JSON.parse(l.tu_luan) as Record<string, string>,
		so_lan_roi_tab: l.so_lan_roi_tab,
		thoi_luong_ms: cfg.thoiLuong * 1000,
		con_lai_ms: t.conLaiMs,
		nop_duoc_sau_ms: t.nopDuocSauMs
	};
}

/** PUT /api/save: lưu toàn bộ đáp án hiện tại (ghi đè), chỉ khi còn trong hạn. */
export async function luuBai(db: D1Database, token: string | undefined, body: unknown, now = Date.now()) {
	const l = await timLuotTheoToken(db, token);
	if (!l) return Response.json({ error: 'Phiên thi không hợp lệ.' }, { status: 401 });
	if (l.trang_thai === 'da_nop') return Response.json({ error: 'Bài đã nộp.', da_nop: true }, { status: 409 });
	const cfg = await docCauHinh(db);
	const t = thoiGian(l.started_at, now, cfg.thoiLuong, cfg.dungSai);
	if (t.tre) return Response.json({ error: 'Đã hết giờ làm bài.', het_gio: true }, { status: 409 });
	const b = kiemTraBaiLam(body, JSON.parse(l.de_thi));
	if (typeof b === 'string') return Response.json({ error: b }, { status: 400 });
	await db.batch([
		db
			.prepare(
				`UPDATE bai_lam SET dap_an_tn = ?, tu_luan = ?, updated_at = ?
				WHERE luot_id = ? AND EXISTS (SELECT 1 FROM luot_thi WHERE id = ? AND trang_thai = 'dang_thi')`
			)
			.bind(JSON.stringify(b.dap_an_tn), JSON.stringify(b.tu_luan), now, l.id, l.id),
		db
			.prepare(`UPDATE luot_thi SET so_lan_roi_tab = MAX(so_lan_roi_tab, ?) WHERE id = ? AND trang_thai = 'dang_thi'`)
			.bind(b.so_lan_roi_tab, l.id)
	]);
	return Response.json({ ok: true, con_lai_ms: t.conLaiMs, nop_duoc_sau_ms: t.nopDuocSauMs });
}

/**
 * POST /api/submit. Idempotent: chỉ lần chuyển dang_thi → da_nop đầu tiên được ghi (điều kiện trong SQL).
 * Nộp quá T + dung sai: nhận nhưng nop_tre=1 và chỉ chấm đáp án đã lưu trước đó.
 */
export async function nopBai(db: D1Database, token: string | undefined, body: unknown, now = Date.now()) {
	const l = await timLuotTheoToken(db, token);
	if (!l) return { res: Response.json({ error: 'Phiên thi không hợp lệ.' }, { status: 401 }) };
	if (l.trang_thai === 'da_nop') return { res: Response.json(await ketQua(db, l)) };

	const cfg = await docCauHinh(db);
	const t = thoiGian(l.started_at, now, cfg.thoiLuong, cfg.dungSai);
	if (!t.duocNop)
		return {
			res: Response.json(
				{ error: 'Chưa được nộp bài trước khi hết một nửa thời gian.', nop_duoc_sau_ms: t.nopDuocSauMs },
				{ status: 409 }
			)
		};

	const de: MucDe[] = JSON.parse(l.de_thi);
	let bai: BaiLam = { dap_an_tn: JSON.parse(l.dap_an_tn), tu_luan: JSON.parse(l.tu_luan), so_lan_roi_tab: 0 };
	if (body !== undefined) {
		const b = kiemTraBaiLam(body, de);
		if (typeof b === 'string') return { res: Response.json({ error: b }, { status: 400 }) };
		if (!t.tre) bai = b;
		else bai.so_lan_roi_tab = b.so_lan_roi_tab;
	}
	const { diem } = chamTN(de, await docCauHoi(db, de.map((m) => m.ma)), bai.dap_an_tn);

	const [, upd] = await db.batch([
		db
			.prepare(
				`UPDATE bai_lam SET dap_an_tn = ?, tu_luan = ?, updated_at = COALESCE(?, updated_at), diem_tn = ?, tong_diem = ?
				WHERE luot_id = ? AND diem_tn IS NULL AND EXISTS (SELECT 1 FROM luot_thi WHERE id = ? AND trang_thai = 'dang_thi')`
			)
			.bind(
				JSON.stringify(bai.dap_an_tn), JSON.stringify(bai.tu_luan), t.tre ? null : now, diem, diem, l.id, l.id
			),
		db
			.prepare(
				`UPDATE luot_thi SET trang_thai = 'da_nop', submitted_at = ?, nop_tre = ?, sync_pending = 1,
				so_lan_roi_tab = MAX(so_lan_roi_tab, ?) WHERE id = ? AND trang_thai = 'dang_thi'`
			)
			.bind(now, t.tre ? 1 : 0, bai.so_lan_roi_tab, l.id)
	]);
	const moiNop = upd.meta.changes === 1;
	const sau = (await timLuotTheoToken(db, token))!;
	return { res: Response.json(await ketQua(db, sau)), moiNop, luotId: l.id };
}

/** Kết quả hiển thị cho học viên. */
export async function ketQua(db: D1Database, l: Luot) {
	const de: MucDe[] = JSON.parse(l.de_thi);
	const { toiDa } = chamTN(de, await docCauHoi(db, de.map((m) => m.ma)), {});
	return {
		thong_tin: thongTin(l),
		trang_thai: l.trang_thai,
		diem_tn: l.diem_tn,
		diem_tn_toi_da: toiDa,
		co_tu_luan: de.some((m) => !m.thu_tu),
		nop_tre: l.nop_tre === 1,
		submitted_at: l.submitted_at
	};
}
