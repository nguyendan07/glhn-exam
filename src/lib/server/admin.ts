import { lamSach } from './normalize';
import { parseHocVien } from './hoc-vien';
import { docVung, ghiVung, TAB_KET_QUA, TIEU_DE_KET_QUA, type SheetEnv } from './sheets';
import { sha256Hex } from './thi';

/** Header `Authorization: Bearer <ADMIN_TOKEN>`. So sánh qua SHA-256 để thời gian so sánh không phụ thuộc nội dung. */
export async function laAdmin(request: Request, adminToken: string | undefined): Promise<boolean> {
	if (!adminToken || adminToken.length < 16) return false;
	const h = request.headers.get('authorization') ?? '';
	if (!h.startsWith('Bearer ')) return false;
	return (await sha256Hex(h.slice(7))) === (await sha256Hex(adminToken));
}

/**
 * Bọc một thao tác quản trị: kiểm tra token (401), chạy, và trả lỗi dạng JSON { error } (500) thay vì trang lỗi chung,
 * để trang /admin hiển thị được nguyên nhân thật (ví dụ Google từ chối quyền). Chỉ người đã qua bước token mới thấy nội dung lỗi.
 */
export async function chayAdmin(
	request: Request,
	adminToken: string | undefined,
	viec: () => Promise<{ status: number; body: unknown }>
): Promise<Response> {
	if (!(await laAdmin(request, adminToken))) return Response.json({ error: 'Không có quyền.' }, { status: 401 });
	try {
		const r = await viec();
		return Response.json(r.body, { status: r.status });
	} catch (e) {
		console.error('Lỗi thao tác quản trị:', e);
		return Response.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
	}
}

/** Đọc tab tùy chọn; trả null nếu tab không tồn tại. */
async function docTab(env: SheetEnv, range: string): Promise<string[][] | null> {
	try {
		return await docVung(env, range);
	} catch (e) {
		if (String(e).includes('Unable to parse range')) return null;
		throw e;
	}
}

const o = (h: string[], i: number) => lamSach(h[i] ?? '');

export function parseCauHoi(rows: string[][]) {
	const loi: string[] = [];
	const ds: { ma: string; loai: string; nhom: string; noi_dung: string; lua_chon: string | null; dap_an: number | null; diem: number }[] = [];
	const daCo = new Set<string>();
	rows.forEach((h, i) => {
		const dong = i + 2;
		if (h.every((c) => !c?.trim())) return;
		const [ma, loai, nhom, dapAn, diemS] = [o(h, 0), o(h, 1).toUpperCase(), o(h, 2), o(h, 4).toUpperCase(), o(h, 5)];
		const noiDung = (h[3] ?? '').trim();
		if (!ma || daCo.has(ma)) return loi.push(`CauHoi dòng ${dong}: mã trống hoặc trùng.`);
		if (loai !== 'TN' && loai !== 'DK' && loai !== 'TL') return loi.push(`CauHoi dòng ${dong}: Loại phải là TN, DK (điền vào chỗ trống) hoặc TL (tự luận).`);
		if (!nhom || !noiDung) return loi.push(`CauHoi dòng ${dong}: thiếu Nhóm hoặc Nội dung.`);
		const diem = diemS ? Number(diemS.replace(',', '.')) : 1;
		if (!(diem > 0)) return loi.push(`CauHoi dòng ${dong}: Điểm không hợp lệ.`);
		let luaChon: string[] | null = null;
		let idx: number | null = null;
		if (loai === 'TN') {
			luaChon = h.slice(6).map((c) => (c ?? '').trim());
			while (luaChon.length && !luaChon.at(-1)) luaChon.pop();
			idx = /^[A-Z]$/.test(dapAn) ? dapAn.charCodeAt(0) - 65 : -1;
			if (luaChon.length < 2 || luaChon.some((c) => !c)) return loi.push(`CauHoi dòng ${dong}: cần ít nhất 2 lựa chọn liên tiếp (cột G trở đi).`);
			if (idx < 0 || idx >= luaChon.length) return loi.push(`CauHoi dòng ${dong}: Đáp án phải là chữ cái ứng với một lựa chọn.`);
		}
		daCo.add(ma);
		ds.push({ ma, loai, nhom, noi_dung: noiDung, lua_chon: luaChon && JSON.stringify(luaChon), dap_an: idx, diem });
	});
	return { ds, loi };
}

/**
 * Nạp tab CauHoi, PhanThi, HocVien và ThongTin (tùy chọn) từ Sheet vào D1. Câu hỏi được thay toàn bộ; học viên được cập nhật theo khóa (giữ nguyên id của
 * người đã có lượt thi), dòng nào bị xóa khỏi Sheet thì bị xóa khỏi D1 trừ khi đã có lượt thi.
 * Từ chối khi đang có lượt thi dở dang (trừ khi force) vì đề đã phát tham chiếu tới mã câu hỏi.
 */
/**
 * Mở khóa lượt thi của một học viên (token_hash = NULL) để họ vào lại từ thiết bị/trình duyệt khác bằng cách tìm và chọn lại tên.
 * Dùng khi học viên mất cookie phiên (xóa dữ liệu duyệt web, chế độ riêng tư, đổi máy).
 */
export async function moKhoa(db: D1Database, body: unknown) {
	const id = (body as { hoc_vien_id?: unknown } | null)?.hoc_vien_id;
	if (!Number.isInteger(id) || (id as number) <= 0) return { status: 400, body: { error: 'Thiếu hoc_vien_id.' } };
	const l = await db
		.prepare('SELECT ho_ten, ten_thanh, trang_thai FROM luot_thi WHERE hoc_vien_id = ?')
		.bind(id)
		.first<{ ho_ten: string; ten_thanh: string; trang_thai: string }>();
	if (!l) return { status: 404, body: { error: 'Học viên này chưa có lượt thi để mở khóa.' } };
	await db.prepare('UPDATE luot_thi SET token_hash = NULL WHERE hoc_vien_id = ?').bind(id).run();
	return { status: 200, body: { ten: [l.ten_thanh, l.ho_ten].filter(Boolean).join(' '), trang_thai: l.trang_thai } };
}

/** Tab PhanThi: A Nhóm | B Tiêu đề phần | C Số câu | D Hướng dẫn (tùy chọn) | E Xáo thứ tự câu: để trống/có, hoặc "không" để giữ thứ tự trong ngân hàng. Thứ tự dòng là thứ tự các phần. */
export function parsePhanThi(rows: string[][]) {
	const loi: string[] = [];
	const daCo = new Set<string>();
	const ds: { nhom: string; ten: string; so_cau: number; huong_dan: string; thu_tu: number; xao_tron: number }[] = [];
	rows.forEach((h, i) => {
		const [nhom, ten, soCau, huongDan, xao] = [o(h, 0), o(h, 1), o(h, 2), o(h, 3), o(h, 4).toLowerCase()];
		if (!nhom && !ten && !soCau) return;
		const dong = i + 2;
		if (!nhom || daCo.has(nhom)) return loi.push(`PhanThi dòng ${dong}: Nhóm trống hoặc trùng.`);
		if (!/^\d+$/.test(soCau)) return loi.push(`PhanThi dòng ${dong}: Số câu phải là số nguyên không âm.`);
		if (!['', 'có', 'co', 'không', 'khong', '1', '0'].includes(xao)) return loi.push(`PhanThi dòng ${dong}: cột Xáo chỉ nhận "có" hoặc "không".`);
		daCo.add(nhom);
		ds.push({ nhom, ten, so_cau: Number(soCau), huong_dan: huongDan, thu_tu: ds.length + 1, xao_tron: ['không', 'khong', '0'].includes(xao) ? 0 : 1 });
	});
	return { ds, loi };
}

/** Tab ThongTin: A Khóa | B Nội dung. Khóa: to_chuc, tieu_de, luu_y (nhiều dòng) và thoi_luong_phut (một dòng, đặt thời gian làm bài). Tab trống là hợp lệ. */
export function parseThongTin(rows: string[][]) {
	const loi: string[] = [];
	const ds: { khoa: string; noi_dung: string }[] = [];
	let thoiLuongPhut: number | null = null;
	rows.forEach((h, i) => {
		const [khoa, nd] = [o(h, 0), o(h, 1)];
		if (!khoa && !nd) return;
		const dong = i + 2;
		if (!nd) return loi.push(`ThongTin dòng ${dong}: thiếu Nội dung.`);
		if (khoa === 'thoi_luong_phut') {
			if (!/^\d+$/.test(nd) || +nd < 1 || +nd > 600) return loi.push(`ThongTin dòng ${dong}: thoi_luong_phut phải là số phút từ 1 đến 600.`);
			thoiLuongPhut = +nd;
		} else if (khoa === 'to_chuc' || khoa === 'tieu_de' || khoa === 'luu_y') ds.push({ khoa, noi_dung: nd });
		else loi.push(`ThongTin dòng ${dong}: Khóa "${khoa}" không hợp lệ (to_chuc, tieu_de, luu_y, thoi_luong_phut).`);
	});
	if (ds.length && !ds.some((x) => x.khoa === 'tieu_de')) loi.push('ThongTin: thiếu dòng tieu_de.');
	return { ds, thoiLuongPhut, loi };
}

export async function nhapTuSheet(db: D1Database, env: SheetEnv, force: boolean) {
	if (!force) {
		const dang = await db.prepare(`SELECT COUNT(*) n FROM luot_thi WHERE trang_thai = 'dang_thi'`).first<{ n: number }>();
		if (dang && dang.n > 0) return { status: 409, body: { error: `Đang có ${dang.n} lượt thi chưa nộp. Thêm ?force=1 nếu chắc chắn.` } };
	}
	const [ch, pt, hv, tt] = await Promise.all([docTab(env, 'CauHoi!A2:Z'), docTab(env, 'PhanThi!A2:E'), docTab(env, 'HocVien!A2:D'), docTab(env, 'ThongTin!A2:B')]);
	if (!ch) return { status: 400, body: { error: 'Không tìm thấy tab CauHoi.' } };
	if (!pt) return { status: 400, body: { error: 'Không tìm thấy tab PhanThi.' } };
	if (!hv) return { status: 400, body: { error: 'Không tìm thấy tab HocVien.' } };
	const cauHoi = parseCauHoi(ch);
	const phanThi = parsePhanThi(pt);
	const hocVien = parseHocVien(hv);
	const thongTin = tt ? parseThongTin(tt) : null;
	const loi = [...cauHoi.loi, ...phanThi.loi, ...hocVien.loi, ...(thongTin?.loi ?? [])];
	if (loi.length) return { status: 400, body: { error: 'Dữ liệu Sheet có lỗi, chưa ghi gì vào D1.', chi_tiet: loi } };
	if (!cauHoi.ds.length) return { status: 400, body: { error: 'Tab CauHoi không có câu hỏi nào.' } };
	if (!phanThi.ds.length) return { status: 400, body: { error: 'Tab PhanThi không có phần thi nào.' } };
	if (!hocVien.ds.length) return { status: 400, body: { error: 'Tab HocVien không có học viên nào.' } };

	const json = (x: unknown) => JSON.stringify(x);
	const stmts = [
		db.prepare('DELETE FROM cau_hoi'),
		db
			.prepare(
				`INSERT INTO cau_hoi (ma, loai, nhom, noi_dung, lua_chon, dap_an, diem)
				SELECT value->>'ma', value->>'loai', value->>'nhom', value->>'noi_dung', value->>'lua_chon', value->>'dap_an', value->>'diem'
				FROM json_each(?)`
			)
			.bind(json(cauHoi.ds)),
		db.prepare('DELETE FROM cau_hinh_nhom'),
		db
			.prepare(
				`INSERT INTO cau_hinh_nhom (nhom, so_cau, ten, huong_dan, thu_tu, xao_tron)
				SELECT value->>'nhom', value->>'so_cau', value->>'ten', value->>'huong_dan', value->>'thu_tu', value->>'xao_tron'
				FROM json_each(?)`
			)
			.bind(json(phanThi.ds))
	];
	stmts.push(
		db
			.prepare(
				`INSERT INTO hoc_vien_cho_phep (khoa, ten_thanh, ho_ten, tim_kiem, giao_xu, giao_phan)
				SELECT value->>'khoa', value->>'ten_thanh', value->>'ho_ten', value->>'tim_kiem', value->>'giao_xu', value->>'giao_phan'
				FROM json_each(?) WHERE true
				ON CONFLICT (khoa) DO UPDATE SET ten_thanh = excluded.ten_thanh, ho_ten = excluded.ho_ten,
				tim_kiem = excluded.tim_kiem, giao_xu = excluded.giao_xu, giao_phan = excluded.giao_phan`
			)
			.bind(json(hocVien.ds)),
		db
			.prepare(
				`DELETE FROM hoc_vien_cho_phep WHERE khoa NOT IN (SELECT value->>'khoa' FROM json_each(?))
				AND id NOT IN (SELECT hoc_vien_id FROM luot_thi)`
			)
			.bind(json(hocVien.ds))
	);
	if (thongTin) {
		stmts.push(
			db.prepare('DELETE FROM thong_tin'),
			db.prepare(`INSERT INTO thong_tin (khoa, noi_dung) SELECT value->>'khoa', value->>'noi_dung' FROM json_each(?)`).bind(json(thongTin.ds))
		);
		if (thongTin.thoiLuongPhut) stmts.push(db.prepare('UPDATE cau_hinh SET thoi_luong_giay = ? WHERE id = 1').bind(thongTin.thoiLuongPhut * 60));
	}
	await db.batch(stmts);

	const canhBao: string[] = [];
	if (!thongTin) canhBao.push('Chưa có tab ThongTin: trang chào dùng nội dung mặc định, thời gian làm bài giữ nguyên.');
	const { results: nhom } = await db
		.prepare('SELECT n.nhom, n.so_cau, COUNT(c.ma) co FROM cau_hinh_nhom n LEFT JOIN cau_hoi c ON c.nhom = n.nhom GROUP BY n.nhom')
		.all<{ nhom: string; so_cau: number; co: number }>();
	for (const n of nhom) if (n.co < n.so_cau) canhBao.push(`Nhóm "${n.nhom}" cần ${n.so_cau} câu nhưng chỉ có ${n.co}.`);

	const { results: thua } = await db
		.prepare('SELECT nhom, COUNT(*) n FROM cau_hoi WHERE nhom NOT IN (SELECT nhom FROM cau_hinh_nhom) GROUP BY nhom')
		.all<{ nhom: string; n: number }>();
	for (const t of thua) canhBao.push(`Nhóm "${t.nhom}" có ${t.n} câu nhưng không nằm trong tab PhanThi nên sẽ không bao giờ được bốc.`);

	const tieuDe = await docTab(env, `${TAB_KET_QUA}!A1:M1`);
	if (!tieuDe) canhBao.push(`Chưa có tab ${TAB_KET_QUA}: hãy tạo tab này để nhận kết quả.`);
	else if (!tieuDe.length) await ghiVung(env, `${TAB_KET_QUA}!A1:M1`, [TIEU_DE_KET_QUA]);

	return {
		status: 200,
		body: { cau_hoi: cauHoi.ds.length, phan_thi: phanThi.ds.length, hoc_vien: hocVien.ds.length, thoi_luong_phut: thongTin?.thoiLuongPhut ?? null, canh_bao: canhBao }
	};
}
