import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { nhapTuSheet, parseCauHoi, parseHocVien } from './admin';
import { dongBoLai, escapeCell, fetchRetry, hangKetQua } from './sheets';
import { d1Test } from './testing/d1';
import { batDau, nopBai } from './thi';

describe('chống formula injection', () => {
	it('thêm dấu nháy cho = + - @', () => {
		for (const s of ['=1+1', '+84', '-2', '@SUM(A1)']) expect(escapeCell(s)).toBe("'" + s);
		expect(escapeCell('Phêrô')).toBe('Phêrô');
		expect(escapeCell("'abc")).toBe("'abc");
	});

	it('mọi trường học viên nhập trong hàng KetQua đều được escape', () => {
		const h = hangKetQua({
			id: 'x', ten_thanh: '=HYPERLINK("http://x")', ho_ten: '@Ai', giao_xu: '+GX', giao_phan: '-GP',
			started_at: 0, submitted_at: 1, nop_tre: 1, so_lan_roi_tab: 2, diem_tn: 3, tu_luan: JSON.stringify({ TL01: '=bad()' }), sheet_row: null
		});
		expect(h).toHaveLength(13);
		expect(h.slice(1, 5)).toEqual(['\'=HYPERLINK("http://x")', "'@Ai", "'+GX", "'-GP"]);
		expect(h[10]).toBe('[TL01]\n=bad()');
		expect(h[12]).toBe('=N(INDIRECT("J"&ROW()))+N(INDIRECT("L"&ROW()))');
	});
});

const realFetch = globalThis.fetch;
afterEach(() => {
	globalThis.fetch = realFetch;
});

it('fetchRetry thử lại khi 429', async () => {
	const f = vi.fn(async () => new Response('', { status: 429 }));
	f.mockResolvedValueOnce(new Response('', { status: 429 })).mockResolvedValueOnce(new Response('', { status: 429 }));
	f.mockResolvedValueOnce(new Response('ok', { status: 200 }));
	globalThis.fetch = f as typeof fetch;
	const r = await fetchRetry('https://x', {}, 5, 1);
	expect(r.status).toBe(200);
	expect(f).toHaveBeenCalledTimes(3);
});

async function moiEnv() {
	const k = await crypto.subtle.generateKey(
		{ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' },
		true,
		['sign', 'verify']
	);
	const der = new Uint8Array(await crypto.subtle.exportKey('pkcs8', k.privateKey));
	const b64 = btoa(String.fromCharCode(...der));
	return { GOOGLE_SA_EMAIL: `sa${Math.random()}@x.iam.gserviceaccount.com`, GOOGLE_SA_PRIVATE_KEY: `-----BEGIN PRIVATE KEY-----\\n${b64}\\n-----END PRIVATE KEY-----\\n`, SHEET_ID: 'sheet' };
}

/** fetch giả: trả lời theo URL, ghi lại các request. */
function gaFetch(tra: (url: string, body: any) => unknown) {
	const calls: { url: string; method: string; body: any }[] = [];
	globalThis.fetch = (async (u: string, init: RequestInit = {}) => {
		const body = typeof init.body === 'string' ? JSON.parse(init.body) : init.body;
		calls.push({ url: decodeURIComponent(u), method: init.method ?? 'GET', body });
		if (u.startsWith('https://oauth2')) return Response.json({ access_token: 'tok', expires_in: 3600 });
		const r = tra(decodeURIComponent(u), body);
		return r instanceof Response ? r : Response.json(r ?? {});
	}) as typeof fetch;
	return calls;
}

describe('resync', () => {
	let db: D1Database;
	beforeEach(() => {
		db = d1Test();
	});

	it('append lượt mới, cập nhật lượt đã có (không đụng cột L), đánh dấu đã đồng bộ', async () => {
		const ids: string[] = [];
		for (const [i, hv] of [1, 3].entries()) {
			const st = await batDau(db, { hoc_vien_id: hv }, undefined, 0);
			await nopBai(db, st.token, undefined, 1_000_000 + i);
			ids.push((await db.prepare('SELECT id FROM luot_thi WHERE hoc_vien_id = ?').bind(hv).first<any>()).id);
		}
		const calls = gaFetch((url) => {
			if (url.includes('KetQua!A:A?')) return { values: [['Mã lượt'], [ids[0]]] };
			if (url.includes(':append')) return { updates: { updatedRange: 'KetQua!A7:M7' } };
		});
		const env = await moiEnv();
		const r = await dongBoLai(db, env, 10_000_000);
		expect(r).toEqual({ da_dong_bo: 2, cap_nhat: 1, them_moi: 1 });
		const upd = calls.find((c) => c.url.endsWith('values:batchUpdate'))!;
		expect(upd.body.data[0].range).toBe('KetQua!A2:K2');
		expect(upd.body.data[0].values[0]).toHaveLength(11);
		const rows = (await db.prepare('SELECT id, sync_pending, sheet_row FROM luot_thi ORDER BY sheet_row').all<any>()).results;
		expect(rows).toEqual([{ id: ids[0], sync_pending: 0, sheet_row: 2 }, { id: ids[1], sync_pending: 0, sheet_row: 7 }]);
		expect(await dongBoLai(db, env, 10_000_000)).toEqual({ da_dong_bo: 0 });
	});
});

describe('import', () => {
	it('parse câu hỏi và báo lỗi theo dòng', () => {
		const r = parseCauHoi([
			['Q1', 'tn', 'g', 'Hỏi?', 'b', '1,5', 'x', 'y', '', ''],
			['Q2', 'TL', 'g', 'Viết', '', ''],
			['Q3', 'TN', 'g', 'Hỏi', 'D', '', 'x', 'y'],
			['Q1', 'TL', 'g', 'trùng']
		]);
		expect(r.ds[0]).toEqual({ ma: 'Q1', loai: 'TN', nhom: 'g', noi_dung: 'Hỏi?', lua_chon: '["x","y"]', dap_an: 1, diem: 1.5 });
		expect(r.ds[1]).toMatchObject({ ma: 'Q2', loai: 'TL', lua_chon: null, dap_an: null });
		expect(r.loi).toEqual(['CauHoi dòng 4: Đáp án phải là chữ cái ứng với một lựa chọn.', 'CauHoi dòng 5: mã trống hoặc trùng.']);
	});

	it('parse học viên: tên Thánh có thể trống, đánh số các dòng trùng, báo lỗi theo dòng', () => {
		const r = parseHocVien([
			['Phêrô', 'Nguyễn Văn An', 'Tân Định', 'Sài Gòn'],
			['Phêrô', 'nguyễn  văn an'],
			['', 'Trần Thị Bình'],
			['', ''],
			['Maria', '']
		]);
		expect(r.ds.map((x) => x.khoa)).toEqual(['nguyen van an|phero#1', 'nguyen van an|phero#2', 'tran thi binh|#1']);
		expect(r.ds[0]).toEqual({ khoa: 'nguyen van an|phero#1', ten_thanh: 'Phêrô', ho_ten: 'Nguyễn Văn An', tim_kiem: 'phero nguyen van an', giao_xu: 'Tân Định', giao_phan: 'Sài Gòn' });
		expect(r.ds[2]).toMatchObject({ ten_thanh: '', tim_kiem: 'tran thi binh', giao_xu: '' });
		expect(r.loi).toEqual(['HocVien dòng 6: thiếu Họ và tên.']);
	});

	const sheet = (hocVien: string[][]) =>
		gaFetch((url) => {
			if (url.includes('CauHoi!')) return { values: [['N1', 'TN', 'kinh_thanh', 'Hỏi', 'A', '2', 'Đúng', 'Sai']] };
			if (url.includes('HocVien!')) return { values: hocVien };
		});

	it('import ghi câu hỏi + học viên vào D1, cập nhật theo khóa (giữ id người đã thi), chặn khi có lượt đang thi', async () => {
		const db = d1Test();
		const calls = sheet([['Phêrô', 'Nguyễn Văn An', 'GX Một', 'GP Một'], ['', 'Trần Thị Bình']]);
		const env = await moiEnv();
		const r = await nhapTuSheet(db, env, false);
		expect(r.status).toBe(200);
		expect(r.body).toMatchObject({ cau_hoi: 1, hoc_vien: 2 });
		expect(await db.prepare('SELECT * FROM cau_hoi').all().then((x) => x.results)).toEqual([
			{ ma: 'N1', loai: 'TN', nhom: 'kinh_thanh', noi_dung: 'Hỏi', lua_chon: '["Đúng","Sai"]', dap_an: 0, diem: 2 }
		]);
		const hv = () => db.prepare('SELECT id, ten_thanh, ho_ten, giao_xu FROM hoc_vien_cho_phep ORDER BY id').all<any>().then((x) => x.results);
		const [an, binh] = await hv();
		expect(an).toMatchObject({ ten_thanh: 'Phêrô', ho_ten: 'Nguyễn Văn An', giao_xu: 'GX Một' });
		expect(calls.some((c) => c.method === 'PUT' && c.body.values[0][0] === 'Mã lượt')).toBe(true);

		// Bình đã có lượt thi; import lại: An sửa giáo xứ, Bình bị xóa khỏi Sheet nhưng vẫn giữ vì đã thi, thêm Cúc.
		await db.batch([db.prepare('DELETE FROM cau_hinh_nhom'), db.prepare(`INSERT INTO cau_hinh_nhom VALUES ('kinh_thanh', 1)`)]);
		const st = await batDau(db, { hoc_vien_id: binh.id }, undefined);
		await nopBai(db, st.token, undefined, Date.now() + 3_600_000);
		sheet([['Phêrô', 'Nguyễn Văn An', 'GX Hai', 'GP Một'], ['Maria', 'Lê Thị Cúc']]);
		expect((await nhapTuSheet(db, env, false)).status).toBe(200);
		const sau = await hv();
		expect(sau.map((x) => [x.id, x.ho_ten, x.giao_xu])).toEqual([
			[an.id, 'Nguyễn Văn An', 'GX Hai'],
			[binh.id, 'Trần Thị Bình', ''],
			[expect.any(Number), 'Lê Thị Cúc', '']
		]);

		await batDau(db, { hoc_vien_id: an.id }, undefined);
		expect((await nhapTuSheet(db, env, false)).status).toBe(409);
	});

	it('từ chối khi thiếu tab HocVien', async () => {
		const db = d1Test();
		gaFetch((url) => {
			if (url.includes('CauHoi!')) return { values: [['N1', 'TN', 'g', 'Hỏi', 'A', '', 'x', 'y']] };
			if (url.includes('HocVien!')) return new Response('{"error":{"message":"Unable to parse range: HocVien!A2:D"}}', { status: 400 });
		});
		const r = await nhapTuSheet(db, await moiEnv(), false);
		expect(r.status).toBe(400);
		expect(r.body).toMatchObject({ error: expect.stringContaining('HocVien') });
	});
});
