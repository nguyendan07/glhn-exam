import { beforeEach, describe, expect, it } from 'vitest';
import { d1Test } from './testing/d1';
import { batDau, luuBai, nopBai, timLuotTheoToken, trangThaiThi } from './thi';

const HV = { ten_thanh: 'Phêrô', ho_ten: 'Nguyễn Văn An', ngay_sinh: '01/02/2010', giao_xu: 'Giáo xứ Tân Định', giao_phan: 'Sài Gòn' };
const T = 1800_000; // cấu hình mẫu: 1800s, dung sai 60s
let db: D1Database;
const t0 = 1_700_000_000_000;

async function start(body: unknown = HV, token?: string, roster = false) {
	const r = await batDau(db, body, token, roster, t0);
	return { status: r.res.status, body: (await r.res.json()) as any, token: r.token };
}
const body = (r: Response) => r.json() as Promise<any>;

beforeEach(() => {
	db = d1Test();
});

describe('/api/start', () => {
	it.each(['ten_thanh', 'giao_xu', 'giao_phan', 'ho_ten', 'ngay_sinh'])('400 khi thiếu %s', async (k) => {
		expect((await start({ ...HV, [k]: '   ' })).status).toBe(400);
	});
	it('400 khi vượt độ dài hoặc ngày sai', async () => {
		expect((await start({ ...HV, ten_thanh: 'x'.repeat(61) })).status).toBe(400);
		expect((await start({ ...HV, giao_xu: 'x'.repeat(61) })).status).toBe(400);
		expect((await start({ ...HV, giao_phan: 'x'.repeat(61) })).status).toBe(400);
		expect((await start({ ...HV, ngay_sinh: '30/02/2010' })).status).toBe(400);
		expect((await start('rác')).status).toBe(400);
	});

	it('lưu bản gốc có dấu và bản chuẩn hóa', async () => {
		await start({ ...HV, ten_thanh: '  Phêrô ', giao_xu: 'Giáo  xứ Đức Bà' });
		const r = await db.prepare('SELECT * FROM luot_thi').first<any>();
		expect(r).toMatchObject({ ten_thanh: 'Phêrô', ten_thanh_chuan_hoa: 'phero', giao_xu: 'Giáo xứ Đức Bà', giao_xu_chuan_hoa: 'giao xu duc ba', khoa_dinh_danh: 'nguyen van an|2010-02-01' });
	});

	it('tải lại / vào lại cùng thiết bị trả đúng lượt cũ, không tạo đề mới', async () => {
		const a = await start();
		expect(a.status).toBe(200);
		const l1 = (await timLuotTheoToken(db, a.token))!;
		const b = await start({ ...HV, ten_thanh: 'Giuse' }, a.token);
		expect(b.status).toBe(200);
		expect(b.token).toBeUndefined();
		const l2 = (await timLuotTheoToken(db, a.token))!;
		expect(l2.de_thi).toBe(l1.de_thi);
		expect(l2.ten_thanh).toBe('Phêrô'); // không cho sửa thông tin
		expect((await db.prepare('SELECT COUNT(*) n FROM luot_thi').first<any>()).n).toBe(1);
	});

	it('cùng họ tên + ngày sinh nhưng khác Tên Thánh/Giáo xứ/Giáo phận vẫn là một người', async () => {
		await start();
		const r = await start({ ten_thanh: 'Giuse', ho_ten: 'nguyen  van AN', ngay_sinh: '1/2/2010', giao_xu: 'Khác', giao_phan: 'Khác' });
		expect(r.status).toBe(409);
	});

	it('thi lần hai sau khi nộp bị từ chối', async () => {
		const a = await start();
		await nopBai(db, a.token, undefined, t0 + T / 2);
		const r = await start({ ...HV, giao_xu: 'Giáo xứ khác' });
		expect(r.status).toBe(409);
		expect(r.body.error).toMatch(/đã thi/);
	});

	it('UNIQUE ở tầng DB chặn insert trùng khóa', async () => {
		await start();
		await expect(
			db.prepare(`INSERT INTO luot_thi (id, khoa_dinh_danh, ho_ten, ho_ten_chuan_hoa, ten_thanh, ten_thanh_chuan_hoa, giao_xu, giao_xu_chuan_hoa, giao_phan, giao_phan_chuan_hoa, ngay_sinh, started_at, de_thi)
				VALUES ('x', 'nguyen van an|2010-02-01', '', '', '', '', '', '', '', '', '', 0, '[]')`).run()
		).rejects.toThrow(/UNIQUE/);
	});

	it('REQUIRE_ROSTER chỉ cho học viên trong danh sách', async () => {
		expect((await start(HV, undefined, true)).status).toBe(403);
		await db.prepare(`INSERT INTO hoc_vien_cho_phep (ho_ten, ho_ten_chuan_hoa, ngay_sinh) VALUES ('Nguyễn Văn An', 'nguyen van an', '2010-02-01')`).run();
		expect((await start(HV, undefined, true)).status).toBe(200);
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
		expect(k1.diem_tn).toBe(5);
		expect(k1.diem_tn_toi_da).toBe(5);
		expect(r1.moiNop).toBe(true);
		const r2 = await nopBai(db, token, { dap_an_tn: {}, tu_luan: {} }, t0 + T / 2 + 5000);
		const k2 = await body(r2.res);
		expect(k2.diem_tn).toBe(5);
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
