import { chuanHoa, lamSach } from './normalize';
import { docVung, ghiVung, TAB_KET_QUA, TIEU_DE_KET_QUA, type SheetEnv } from './sheets';
import { sha256Hex } from './thi';

/** Header `Authorization: Bearer <ADMIN_TOKEN>`. So sánh qua SHA-256 để thời gian so sánh không phụ thuộc nội dung. */
export async function laAdmin(request: Request, adminToken: string | undefined): Promise<boolean> {
	if (!adminToken || adminToken.length < 16) return false;
	const h = request.headers.get('authorization') ?? '';
	if (!h.startsWith('Bearer ')) return false;
	return (await sha256Hex(h.slice(7))) === (await sha256Hex(adminToken));
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
		if (loai !== 'TN' && loai !== 'TL') return loi.push(`CauHoi dòng ${dong}: Loại phải là TN hoặc TL.`);
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

/** Tab HocVien: A Tên Thánh (có thể trống) | B Họ và tên | C Giáo xứ | D Giáo phận (tùy chọn). */
export function parseHocVien(rows: string[][]) {
	const loi: string[] = [];
	const dem = new Map<string, number>();
	const ds: { khoa: string; ten_thanh: string; ho_ten: string; tim_kiem: string; giao_xu: string; giao_phan: string }[] = [];
	rows.forEach((h, i) => {
		const [tenThanh, hoTen, giaoXu, giaoPhan] = [o(h, 0), o(h, 1), o(h, 2), o(h, 3)];
		if (!tenThanh && !hoTen && !giaoXu && !giaoPhan) return;
		if (!hoTen) return loi.push(`HocVien dòng ${i + 2}: thiếu Họ và tên.`);
		if (tenThanh.length > 60 || hoTen.length > 100 || giaoXu.length > 60 || giaoPhan.length > 60) return loi.push(`HocVien dòng ${i + 2}: giá trị quá dài.`);
		const goc = chuanHoa(hoTen) + '|' + chuanHoa(tenThanh);
		const n = (dem.get(goc) ?? 0) + 1;
		dem.set(goc, n);
		ds.push({ khoa: `${goc}#${n}`, ten_thanh: tenThanh, ho_ten: hoTen, tim_kiem: chuanHoa(`${tenThanh} ${hoTen}`), giao_xu: giaoXu, giao_phan: giaoPhan });
	});
	return { ds, loi };
}

/**
 * Nạp tab CauHoi và HocVien từ Sheet vào D1. Câu hỏi được thay toàn bộ; học viên được cập nhật theo khóa (giữ nguyên id của
 * người đã có lượt thi), dòng nào bị xóa khỏi Sheet thì bị xóa khỏi D1 trừ khi đã có lượt thi.
 * Từ chối khi đang có lượt thi dở dang (trừ khi force) vì đề đã phát tham chiếu tới mã câu hỏi.
 */
export async function nhapTuSheet(db: D1Database, env: SheetEnv, force: boolean) {
	if (!force) {
		const dang = await db.prepare(`SELECT COUNT(*) n FROM luot_thi WHERE trang_thai = 'dang_thi'`).first<{ n: number }>();
		if (dang && dang.n > 0) return { status: 409, body: { error: `Đang có ${dang.n} lượt thi chưa nộp. Thêm ?force=1 nếu chắc chắn.` } };
	}
	const [ch, hv] = await Promise.all([docTab(env, 'CauHoi!A2:Z'), docTab(env, 'HocVien!A2:D')]);
	if (!ch) return { status: 400, body: { error: 'Không tìm thấy tab CauHoi.' } };
	if (!hv) return { status: 400, body: { error: 'Không tìm thấy tab HocVien.' } };
	const cauHoi = parseCauHoi(ch);
	const hocVien = parseHocVien(hv);
	const loi = [...cauHoi.loi, ...hocVien.loi];
	if (loi.length) return { status: 400, body: { error: 'Dữ liệu Sheet có lỗi, chưa ghi gì vào D1.', chi_tiet: loi } };
	if (!cauHoi.ds.length) return { status: 400, body: { error: 'Tab CauHoi không có câu hỏi nào.' } };
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
			.bind(json(cauHoi.ds))
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
	await db.batch(stmts);

	const canhBao: string[] = [];
	const { results: nhom } = await db
		.prepare('SELECT n.nhom, n.so_cau, COUNT(c.ma) co FROM cau_hinh_nhom n LEFT JOIN cau_hoi c ON c.nhom = n.nhom GROUP BY n.nhom')
		.all<{ nhom: string; so_cau: number; co: number }>();
	for (const n of nhom) if (n.co < n.so_cau) canhBao.push(`Nhóm "${n.nhom}" cần ${n.so_cau} câu nhưng chỉ có ${n.co}.`);

	const tieuDe = await docTab(env, `${TAB_KET_QUA}!A1:M1`);
	if (!tieuDe) canhBao.push(`Chưa có tab ${TAB_KET_QUA}: hãy tạo tab này để nhận kết quả.`);
	else if (!tieuDe.length) await ghiVung(env, `${TAB_KET_QUA}!A1:M1`, [TIEU_DE_KET_QUA]);

	return {
		status: 200,
		body: { cau_hoi: cauHoi.ds.length, hoc_vien: hocVien.ds.length, canh_bao: canhBao }
	};
}
