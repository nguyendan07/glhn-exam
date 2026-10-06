import { beforeEach, describe, expect, it } from 'vitest';
import { d1Test } from './testing/d1';
import { batDau, COOKIE_OPTS, luuBai, nopBai, timHocVien, timLuotTheoToken, trangThaiThi } from './thi';

// Học viên mẫu (migrations/0002): 1 Phêrô Nguyễn Văn An · 2 Giuse Nguyễn Văn An · 3 Trần Thị Bình (chưa có tên Thánh)
// · 4 Maria Lê Thị Cúc · 5 Anrê Phạm Văn Dũng (chưa có giáo xứ/giáo phận)
const T = 1800_000; // cấu hình mẫu: 1800s, dung sai 60s
let db: D1Database;
const t0 = 1_700_000_000_000;

async function start(hocVienId: unknown = 1, token?: string) {
	const r = await batDau(db, { hoc_vien_id: hocVienId }, token, t0);
	return { status: r.res.status, body: (await r.res.json()) as any, token: r.token };
}
const body = (r: Response) => r.json() as Promise<any>;
const ten = (r: { ten_thanh: string; ho_ten: string }) => [r.ten_thanh, r.ho_ten].filter(Boolean).join(' ');

beforeEach(() => {
	db = d1Test();
});

describe('tìm kiếm khi gõ', () => {
	it('không phân biệt dấu/hoa thường, có hoặc không kèm tên Thánh', async () => {
		expect((await timHocVien(db, 'tran thi binh')).map(ten)).toEqual(['Trần Thị Bình']);
		expect((await timHocVien(db, 'TRẦN thị')).map(ten)).toEqual(['Trần Thị Bình']);
		expect((await timHocVien(db, 'maria lê thị cúc')).map(ten)).toEqual(['Maria Lê Thị Cúc']);
		expect((await timHocVien(db, 'le thi cuc')).map(ten)).toEqual(['Maria Lê Thị Cúc']);
		expect((await timHocVien(db, 'phạm văn dũng')).map(ten)).toEqual(['Anrê Phạm Văn Dũng']);
	});

	it('trùng họ tên thì trả đủ các dòng để chọn; tên Thánh thu hẹp kết quả', async () => {
		expect((await timHocVien(db, 'nguyen van an')).map(ten)).toEqual(['Giuse Nguyễn Văn An', 'Phêrô Nguyễn Văn An']);
		expect((await timHocVien(db, 'phêrô nguyễn văn an')).map(ten)).toEqual(['Phêrô Nguyễn Văn An']);
	});

	it('quá ngắn thì không tìm; ký tự đặc biệt không phá câu truy vấn', async () => {
		expect(await timHocVien(db, '')).toEqual([]);
		expect(await timHocVien(db, ' a ')).toEqual([]);
		expect(await timHocVien(db, '%')).toEqual([]);
		expect(await timHocVien(db, "nguyen%' OR 1=1 --")).toEqual([]);
		expect(await timHocVien(db, '_ _')).toEqual([]);
	});

	it('đánh dấu da_thi sau khi đã có lượt thi, và không trả dữ liệu nhạy cảm', async () => {
		await start(3);
		const [r] = await timHocVien(db, 'tran thi binh');
		expect(r).toEqual({ id: 3, ten_thanh: '', ho_ten: 'Trần Thị Bình', giao_xu: 'Giáo xứ Đức Bà', giao_phan: 'Sài Gòn', da_thi: true, tiep_tuc: false });
		expect((await timHocVien(db, 'le thi cuc'))[0].da_thi).toBe(false);
	});

	it('tiep_tuc: chỉ true cho lượt thi của chính máy này (cookie khớp) hoặc lượt giám thị đã mở khóa', async () => {
		const a = await start(3);
		const b = await start(4);
		const tim = async (q: string, token?: string) => (await timHocVien(db, q, token))[0];
		expect(await tim('tran thi binh', a.token)).toMatchObject({ da_thi: true, tiep_tuc: true }); // lượt của mình
		expect(await tim('tran thi binh')).toMatchObject({ da_thi: true, tiep_tuc: false }); // không cookie
		expect(await tim('tran thi binh', b.token)).toMatchObject({ da_thi: true, tiep_tuc: false }); // cookie của người khác
		expect(await tim('tran thi binh', 'rac')).toMatchObject({ da_thi: true, tiep_tuc: false });
		expect(await tim('nguyen van an', a.token)).toMatchObject({ da_thi: false, tiep_tuc: false }); // chưa thi
		await db.prepare('UPDATE luot_thi SET token_hash = NULL WHERE hoc_vien_id = 3').run(); // giám thị mở khóa
		expect(await tim('tran thi binh')).toMatchObject({ da_thi: true, tiep_tuc: true });
	});

	it('giới hạn số kết quả', async () => {
		for (let i = 0; i < 12; i++)
			await db.prepare('INSERT INTO hoc_vien_cho_phep (khoa, ho_ten, tim_kiem) VALUES (?, ?, ?)').bind(`k${i}`, `Hoàng ${i}`, `hoang ${i}`).run();
		expect(await timHocVien(db, 'hoang')).toHaveLength(8);
	});
});

it('cookie phiên là SameSite=Lax: strict làm mất phiên khi mở lại bài thi từ liên kết/QR/ứng dụng khác', () => {
	expect(COOKIE_OPTS).toMatchObject({ sameSite: 'lax', httpOnly: true, path: '/' });
	expect(COOKIE_OPTS.maxAge).toBeGreaterThanOrEqual(60 * 60 * 24 * 7);
});

describe('/api/start', () => {
	it.each([null, 'abc', 0, -1, 1.5, '1'])('400 khi hoc_vien_id = %s', async (v) => {
		expect((await start(v)).status).toBe(400);
	});
	it('400 khi body không phải object, 404 khi mã không có trong danh sách', async () => {
		expect((await batDau(db, 'rác', undefined, t0)).res.status).toBe(400);
		expect((await batDau(db, {}, undefined, t0)).res.status).toBe(400);
		expect((await start(999)).status).toBe(404);
	});

	it('lưu bản sao thông tin (gốc có dấu + chuẩn hóa); học viên chưa có tên Thánh/giáo xứ vẫn thi được', async () => {
		await start(1);
		await start(3);
		await start(5);
		const rows = (await db.prepare('SELECT * FROM luot_thi ORDER BY hoc_vien_id').all<any>()).results;
		expect(rows[0]).toMatchObject({ ten_thanh: 'Phêrô', ten_thanh_chuan_hoa: 'phero', ho_ten: 'Nguyễn Văn An', ho_ten_chuan_hoa: 'nguyen van an', giao_xu: 'Giáo xứ Tân Định', giao_xu_chuan_hoa: 'giao xu tan dinh' });
		expect(rows[1]).toMatchObject({ ten_thanh: '', ten_thanh_chuan_hoa: '', ho_ten: 'Trần Thị Bình' });
		expect(rows[2]).toMatchObject({ giao_xu: '', giao_phan: '' });
	});

	it('tải lại / vào lại cùng thiết bị trả đúng lượt cũ, không tạo đề mới', async () => {
		const a = await start();
		expect(a.status).toBe(200);
		const l1 = (await timLuotTheoToken(db, a.token))!;
		const b = await start(1, a.token);
		expect(b.status).toBe(200);
		expect(b.token).toBeUndefined();
		const l2 = (await timLuotTheoToken(db, a.token))!;
		expect(l2.de_thi).toBe(l1.de_thi);
		expect((await db.prepare('SELECT COUNT(*) n FROM luot_thi').first<any>()).n).toBe(1);
	});

	it('thiết bị khác không vào được lượt đang mở; thi lần hai sau khi nộp bị từ chối', async () => {
		const a = await start();
		expect((await start(1)).status).toBe(409);
		await nopBai(db, a.token, undefined, t0 + T / 2);
		const r = await start(1, a.token);
		expect(r.status).toBe(200); // cùng thiết bị: chỉ xem kết quả
		expect(r.body.trang_thai).toBe('da_nop');
		const khac = await start(1);
		expect(khac.status).toBe(409);
		expect(khac.body.error).toMatch(/đã thi/);
	});

	it('hai người trùng họ tên là hai dòng khác nhau, thi độc lập', async () => {
		expect((await start(1)).status).toBe(200);
		expect((await start(2)).status).toBe(200);
		expect((await db.prepare('SELECT COUNT(*) n FROM luot_thi').first<any>()).n).toBe(2);
	});

	it('UNIQUE(hoc_vien_id) ở tầng DB chặn lượt thứ hai cho cùng một dòng', async () => {
		await start();
		await expect(
			db.prepare(`INSERT INTO luot_thi (id, hoc_vien_id, ho_ten, ho_ten_chuan_hoa, ten_thanh, ten_thanh_chuan_hoa, giao_xu, giao_xu_chuan_hoa, giao_phan, giao_phan_chuan_hoa, started_at, de_thi)
				VALUES ('x', 1, '', '', '', '', '', '', '', '', 0, '[]')`).run()
		).rejects.toThrow(/UNIQUE/);
	});

	it('giám thị mở khóa (token_hash NULL) thì vào lại được từ thiết bị khác', async () => {
		await start();
		await db.prepare('UPDATE luot_thi SET token_hash = NULL').run();
		const r = await start();
		expect(r.status).toBe(200);
		expect(r.token).toBeTruthy();
	});
});

describe('save / submit', () => {
	async function moLuot() {
		const a = await start();
		const l = (await timLuotTheoToken(db, a.token))!;
		const st = await trangThaiThi(db, l, t0);
		return { token: a.token!, st };
	}
	/** Tìm chỉ số hiển thị của đáp án đúng (đọc từ DB, chỉ trong test). */
	async function dapAnDung(token: string) {
		const l = (await timLuotTheoToken(db, token))!;
		const out: Record<string, number> = {};
		for (const m of JSON.parse(l.de_thi)) {
			if (!m.thu_tu) continue;
			const q = await db.prepare('SELECT dap_an FROM cau_hoi WHERE ma = ?').bind(m.ma).first<any>();
			out[m.ma] = m.thu_tu.indexOf(q.dap_an);
		}
		return out;
	}

	it('đề gồm đúng 5 phần theo thứ tự, mỗi phần đủ số câu; Phần V cố định thứ tự Câu 1→4', async () => {
		for (let k = 0; k < 15; k++) {
			db = d1Test();
			const { st } = await moLuot();
			expect(st.phan.map((p) => p.nhom)).toEqual(['giao_ly_hon_nhan', 'giao_ly_can_ban', 'kinh_bon', 'dien_khuyet', 'song_hon_nhan']);
			expect(st.phan[0].ten).toBe('PHẦN I - TRẮC NGHIỆM GIÁO LÝ HÔN NHÂN');
			expect(st.phan[4]).toMatchObject({ ten: 'PHẦN V – TỰ LUẬN - SỐNG HÔN NHÂN', huong_dan: '(điền đáp án vào chỗ trống)' });
			expect(st.cau_hoi.map((c) => c.phan)).toEqual([
				...Array(3).fill('giao_ly_hon_nhan'), ...Array(3).fill('giao_ly_can_ban'), ...Array(2).fill('kinh_bon'),
				...Array(2).fill('dien_khuyet'), ...Array(4).fill('song_hon_nhan')
			]);
			const v = st.cau_hoi.filter((c) => c.phan === 'song_hon_nhan');
			expect(v.map((c) => [c.ma, c.loai, c.diem])).toEqual([['V1', 'DK', 2], ['V2', 'DK', 2], ['V3', 'DK', 2], ['V4', 'TL', 14]]);
			expect(v[3].noi_dung).toMatch(/^Câu 4: Người đời thường cho rằng/);
			expect(st.cau_hoi.filter((c) => c.loai === 'TN').every((c) => c.lua_chon!.length === 4)).toBe(true);
			expect(st.cau_hoi.filter((c) => c.loai !== 'TN').every((c) => c.lua_chon === null)).toBe(true);
		}
	});

	it('lưu và nộp câu điền vào chỗ trống (DK) và tự luận: được lưu nguyên, không tự chấm', async () => {
		const { token } = await moLuot();
		const dk = { V1: 'Sinh con cái và yêu thương nhau', V2: 'Duy nhất và bất khả phân ly', V4: 'x'.repeat(4999) };
		expect((await luuBai(db, token, { tu_luan: dk }, t0 + 1000)).status).toBe(200);
		expect((await luuBai(db, token, { tu_luan: { V4: 'x'.repeat(5001) } }, t0 + 1000)).status).toBe(400);
		const k = await body((await nopBai(db, token, undefined, t0 + T / 2)).res);
		expect(k.diem_tn).toBe(0);
		expect(k.co_tu_luan).toBe(true);
		const luu = JSON.parse((await db.prepare('SELECT tu_luan FROM bai_lam').first<any>()).tu_luan);
		expect(luu).toEqual(dk);
	});

	it('chặn nộp sớm trước T/2', async () => {
		const { token } = await moLuot();
		const r = (await nopBai(db, token, undefined, t0 + T / 2 - 1000)).res;
		expect(r.status).toBe(409);
		expect((await body(r)).nop_duoc_sau_ms).toBe(1000);
	});

	it('chấm đúng và nộp lặp không chấm lại / không ghi đè', async () => {
		const { token } = await moLuot();
		const dung = await dapAnDung(token);
		await luuBai(db, token, { dap_an_tn: dung, tu_luan: {} }, t0 + 1000);
		const r1 = await nopBai(db, token, { dap_an_tn: dung, tu_luan: {}, so_lan_roi_tab: 2 }, t0 + T / 2);
		const k1 = await body(r1.res);
		expect(k1.diem_tn).toBe(10); // phần I: 3×1, phần II: 3×1, phần III: 2×2
		expect(k1.diem_tn_toi_da).toBe(10);
		expect(r1.moiNop).toBe(true);
		const r2 = await nopBai(db, token, { dap_an_tn: {}, tu_luan: {} }, t0 + T / 2 + 5000);
		const k2 = await body(r2.res);
		expect(k2.diem_tn).toBe(10);
		expect(k2.submitted_at).toBe(k1.submitted_at);
		expect(r2.moiNop).toBeUndefined();
		expect((await luuBai(db, token, { dap_an_tn: {} }, t0 + T / 2 + 6000)).status).toBe(409);
	});

	it('nộp quá T + dung sai: nhận, nop_tre, chỉ chấm đáp án đã lưu', async () => {
		const { token } = await moLuot();
		const dung = await dapAnDung(token);
		const [ma1] = Object.keys(dung);
		await luuBai(db, token, { dap_an_tn: { [ma1]: dung[ma1] } }, t0 + 1000);
		expect((await luuBai(db, token, { dap_an_tn: dung }, t0 + T + 61_000)).status).toBe(409);
		const k = await body((await nopBai(db, token, { dap_an_tn: dung }, t0 + T + 61_000)).res);
		expect(k.nop_tre).toBe(true);
		expect(k.diem_tn).toBe(1);
	});

	it('save validate: đáp án ngoài phạm vi, tự luận quá dài, token sai', async () => {
		const { token, st } = await moLuot();
		const tn = st.cau_hoi.find((q) => q.loai === 'TN')!;
		const tl = st.cau_hoi.find((q) => q.loai === 'TL')!;
		expect((await luuBai(db, token, { dap_an_tn: { [tn.ma]: 9 } }, t0)).status).toBe(400);
		expect((await luuBai(db, token, { tu_luan: { [tl.ma]: 'x'.repeat(5001) } }, t0)).status).toBe(400);
		expect((await luuBai(db, 'sai', { dap_an_tn: {} }, t0)).status).toBe(401);
		const ok = await luuBai(db, token, { dap_an_tn: { [tn.ma]: 1 }, tu_luan: { [tl.ma]: 'Bài làm' }, so_lan_roi_tab: 3 }, t0);
		expect(ok.status).toBe(200);
		const l = (await timLuotTheoToken(db, token))!;
		const lai = await trangThaiThi(db, l, t0 + 60_000);
		expect(lai.dap_an_tn).toEqual({ [tn.ma]: 1 });
		expect(lai.tu_luan).toEqual({ [tl.ma]: 'Bài làm' });
		expect(lai.so_lan_roi_tab).toBe(3);
		expect(lai.con_lai_ms).toBe(T - 60_000);
	});

	it('response không chứa đáp án đúng', async () => {
		const a = await start();
		const l = (await timLuotTheoToken(db, a.token))!;
		const ra = [
			JSON.stringify(a.body),
			JSON.stringify(await trangThaiThi(db, l, t0)),
			JSON.stringify(await body(await luuBai(db, a.token, {}, t0))),
			JSON.stringify(await body((await nopBai(db, a.token, undefined, t0 + T / 2)).res))
		];
		for (const x of ra) expect(x).not.toMatch(/"dap_an"|thu_tu|de_thi|token/);
	});
});
