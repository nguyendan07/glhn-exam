import { beforeEach, expect, it, vi } from 'vitest';
import { moKhoa, xemNhatKy } from './admin';
import { deltaBaiLam, mayTuYeuCau, thongTinMay, type May } from './nhat-ky';
import { d1Test } from './testing/d1';
import { batDau, luuBai, nopBai, timLuotTheoToken } from './thi';

const t0 = 1_700_000_000_000;
const T = 1800_000; // cấu hình mẫu: 30 phút, dung sai 60 giây
const mayA: May = { ip: '1.2.3.4', quoc_gia: 'VN', thanh_pho: 'Thái Bình', vung: 'Thái Bình', mui_gio: 'Asia/Ho_Chi_Minh', nha_mang: 'VNPT', ua: 'Mozilla/5.0 (iPad) Safari' };
const mayB: May = { ...mayA, ip: '5.6.7.8', thanh_pho: 'Hà Nội', ua: 'Mozilla/5.0 (Windows) Chrome' };
let db: D1Database;
beforeEach(() => {
	db = d1Test();
});

const sk = async () =>
	(await db.prepare('SELECT su_kien, chi_tiet, may FROM nhat_ky ORDER BY id').all<{ su_kien: string; chi_tiet: string | null; may: string | null }>()).results.map((e) => ({
		su_kien: e.su_kien,
		chi_tiet: e.chi_tiet ? JSON.parse(e.chi_tiet) : null,
		may: e.may ? (JSON.parse(e.may) as May) : null
	}));
const tenSk = async () => (await sk()).map((e) => e.su_kien);

async function vaoThi(hv = 1, may: May | undefined = mayA) {
	const r = await batDau(db, { hoc_vien_id: hv }, undefined, t0, may);
	const l = (await timLuotTheoToken(db, r.token))!;
	const de: { ma: string; thu_tu?: number[] }[] = JSON.parse(l.de_thi);
	return { token: r.token!, de, tn: de.filter((m) => m.thu_tu), tl: de.filter((m) => !m.thu_tu) };
}

it('thongTinMay: IP, vị trí Cloudflare (request.cf) và trình duyệt; cắt ngắn, bỏ ký tự điều khiển', () => {
	const req = new Request('https://x/', { headers: { 'cf-connecting-ip': '9.9.9.9', 'user-agent': 'UA-' + 'x'.repeat(500) } });
	Object.assign(req, { cf: { country: 'VN', city: 'Hải\u0000Phòng', region: 'Hải Phòng', timezone: 'Asia/Bangkok', asOrganization: 'FPT Telecom' } });
	const m = thongTinMay(req);
	expect(m).toMatchObject({ ip: '9.9.9.9', quoc_gia: 'VN', thanh_pho: 'Hải Phòng', vung: 'Hải Phòng', mui_gio: 'Asia/Bangkok', nha_mang: 'FPT Telecom' });
	expect(m.ua).toHaveLength(300);
	expect(m.thanh_pho).toBe('Hải Phòng'); // ký tự điều khiển bị thay bằng dấu cách
	// không có cf và không có header: dùng IP do SvelteKit cung cấp, các trường còn lại bỏ trống
	expect(thongTinMay(new Request('https://x/'), '127.0.0.1')).toEqual({ ip: '127.0.0.1' });
	expect(mayTuYeuCau(new Request('https://x/'), () => { throw new Error('không có IP'); })).toEqual({ ip: '' });
});

it('deltaBaiLam: chỉ các đáp án thay đổi; tự luận chỉ ghi độ dài + mã băm, không chép nội dung', async () => {
	expect(await deltaBaiLam({ tn: { a: 1 }, tl: {} }, { tn: { a: 1 }, tl: {} })).toBeNull();
	const d = await deltaBaiLam({ tn: { a: 1, b: 0 }, tl: { t: 'cũ' } }, { tn: { a: 1, b: 2 }, tl: { t: 'bài viết mới', u: 'x' } });
	expect(d).toMatchObject({ tn: { b: 2 }, tl: { t: { do_dai: 12 }, u: { do_dai: 1 } } });
	expect((d as any).tl.t.bam).toMatch(/^[0-9a-f]{8}$/);
	expect(JSON.stringify(d)).not.toContain('bài viết mới');
	expect(await deltaBaiLam({ tn: { a: 1 }, tl: { t: 'x' } }, { tn: {}, tl: {} })).toEqual({ xoa: ['a', 't'] });
});

it('bắt đầu: ghi sự kiện bat_dau kèm IP/vị trí/trình duyệt và nhớ máy hiện tại', async () => {
	const { token } = await vaoThi();
	expect(await sk()).toEqual([{ su_kien: 'bat_dau', chi_tiet: { so_cau: 14 }, may: mayA }]);
	expect((await timLuotTheoToken(db, token))!.may_cuoi).toBe(JSON.stringify(mayA));
});

it('lưu: chỉ ghi khi có thay đổi, chỉ ghi phần thay đổi, không lặp lại thông tin máy', async () => {
	const { token, tn, tl } = await vaoThi();
	const [c1, c2] = tn;
	await luuBai(db, token, { dap_an_tn: { [c1.ma]: 1 } }, t0 + 1000, mayA);
	await luuBai(db, token, { dap_an_tn: { [c1.ma]: 1 } }, t0 + 2000, mayA); // không đổi → không ghi
	await luuBai(db, token, { dap_an_tn: { [c1.ma]: 1, [c2.ma]: 3 } }, t0 + 3000, mayA);
	await luuBai(db, token, { dap_an_tn: { [c1.ma]: 2, [c2.ma]: 3 }, tu_luan: { [tl[0].ma]: 'Hôn nhân là giao ước thiêng liêng' } }, t0 + 4000, mayA);
	const ev = (await sk()).slice(1);
	expect(ev.map((e) => e.su_kien)).toEqual(['luu', 'luu', 'luu']);
	expect(ev.map((e) => e.chi_tiet)).toEqual([
		{ tn: { [c1.ma]: 1 } },
		{ tn: { [c2.ma]: 3 } },
		{ tn: { [c1.ma]: 2 }, tl: { [tl[0].ma]: { do_dai: 33, bam: expect.stringMatching(/^[0-9a-f]{8}$/) } } }
	]);
	expect(ev.every((e) => e.may === null)).toBe(true); // máy không đổi → không lặp lại
	expect(JSON.stringify(await sk())).not.toContain('giao ước');
});

it('rời màn hình: ghi số giây từng lần, bỏ giá trị không hợp lệ, tối đa 50 lần mỗi lần gửi', async () => {
	const { token } = await vaoThi();
	await luuBai(db, token, { roi: [12, 5, -1, 'x', 1e9, 3.5, null, 0] }, t0 + 1000, mayA);
	expect((await sk()).slice(1)).toEqual([
		{ su_kien: 'roi_man_hinh', chi_tiet: { giay: 12 }, may: null },
		{ su_kien: 'roi_man_hinh', chi_tiet: { giay: 5 }, may: null },
		{ su_kien: 'roi_man_hinh', chi_tiet: { giay: 0 }, may: null }
	]);
	await luuBai(db, token, { roi: Array(80).fill(2) }, t0 + 2000, mayA);
	expect((await tenSk()).filter((s) => s === 'roi_man_hinh')).toHaveLength(3 + 50);
});

it('đổi máy/IP giữa chừng: ghi doi_may (hoặc gắn vào sự kiện đang ghi) và cập nhật máy hiện tại', async () => {
	const { token, tn } = await vaoThi();
	await luuBai(db, token, {}, t0 + 1000, mayB); // chỉ đổi IP
	await luuBai(db, token, {}, t0 + 2000, mayB); // vẫn máy B → không ghi thêm
	await luuBai(db, token, { dap_an_tn: { [tn[0].ma]: 0 } }, t0 + 3000, mayA); // quay lại máy A cùng lúc đổi đáp án
	const ev = (await sk()).slice(1);
	expect(ev.map((e) => e.su_kien)).toEqual(['doi_may', 'luu']);
	expect(ev[0].may).toEqual(mayB);
	expect(ev[1].may).toEqual(mayA);
	expect((await timLuotTheoToken(db, token))!.may_cuoi).toBe(JSON.stringify(mayA));
});

it('thiết bị khác thử vào lượt đang thi: bị chặn nhưng ghi lại IP/trình duyệt của người thử, không đổi máy hiện tại', async () => {
	const { token } = await vaoThi();
	const r = await batDau(db, { hoc_vien_id: 1 }, undefined, t0 + 5000, mayB);
	expect(r.res.status).toBe(409);
	expect((await sk()).at(-1)).toEqual({ su_kien: 'tu_choi', chi_tiet: { ly_do: 'thiet_bi_khac' }, may: mayB });
	expect((await timLuotTheoToken(db, token))!.may_cuoi).toBe(JSON.stringify(mayA));
	// vào lại bằng đúng cookie → tiep_tuc
	await batDau(db, { hoc_vien_id: 1 }, token, t0 + 6000, mayA);
	expect((await sk()).at(-1)).toMatchObject({ su_kien: 'tiep_tuc', may: mayA });
	// sau khi nộp, người khác thử vào → lý do da_nop
	await nopBai(db, token, undefined, t0 + T / 2, mayA);
	await batDau(db, { hoc_vien_id: 1 }, undefined, t0 + T, mayB);
	expect((await sk()).at(-1)).toMatchObject({ su_kien: 'tu_choi', chi_tiet: { ly_do: 'da_nop' } });
});

it('giám thị mở khóa rồi học viên vào lại từ máy khác: ghi mo_khoa và tiep_tuc', async () => {
	await vaoThi();
	await moKhoa(db, { hoc_vien_id: 1 }, t0 + 1000);
	await batDau(db, { hoc_vien_id: 1 }, undefined, t0 + 2000, mayB);
	expect((await sk()).slice(1)).toMatchObject([{ su_kien: 'mo_khoa' }, { su_kien: 'tiep_tuc', chi_tiet: { sau_mo_khoa: true }, may: mayB }]);
});

it('nộp bài: ghi thay đổi cuối, các lần rời màn hình và sự kiện nop kèm điểm trắc nghiệm', async () => {
	const { token, tn } = await vaoThi();
	await nopBai(db, token, { dap_an_tn: { [tn[0].ma]: 2 }, roi: [7] }, t0 + T / 2, mayA);
	const ev = (await sk()).slice(1);
	expect(ev.map((e) => e.su_kien)).toEqual(['luu', 'roi_man_hinh', 'nop']);
	expect(ev[2]).toMatchObject({ chi_tiet: { nop_tre: false, diem_tn: expect.any(Number) }, may: mayA });
	const n = (await tenSk()).length;
	await nopBai(db, token, undefined, t0 + T / 2 + 1000, mayA); // nộp lặp: không ghi thêm
	expect(await tenSk()).toHaveLength(n);
});

it('nộp quá hạn: câu trả lời nộp muộn không được chấm nhưng được ghi lại trong nhật ký (bo_qua)', async () => {
	const { token, tn } = await vaoThi();
	await luuBai(db, token, { dap_an_tn: { [tn[0].ma]: 1 } }, t0 + 1000, mayA);
	await nopBai(db, token, { dap_an_tn: { [tn[0].ma]: 1, [tn[1].ma]: 2 } }, t0 + T + 61_000, mayA);
	const nop = (await sk()).at(-1)!;
	expect(nop).toMatchObject({ su_kien: 'nop', chi_tiet: { nop_tre: true, bo_qua: { tn: { [tn[1].ma]: 2 } } } });
	expect(JSON.parse((await db.prepare('SELECT dap_an_tn FROM bai_lam').first<any>()).dap_an_tn)).toEqual({ [tn[0].ma]: 1 }); // không được nhận
});

it('lỗi khi ghi nhật ký không làm hỏng bài thi (bắt đầu, lưu, nộp vẫn thành công)', async () => {
	vi.spyOn(console, 'error').mockImplementation(() => {});
	await db.prepare('DROP TABLE nhat_ky').run();
	const { token, tn } = await vaoThi();
	expect((await luuBai(db, token, { dap_an_tn: { [tn[0].ma]: 1 }, roi: [3] }, t0 + 1000, mayA)).status).toBe(200);
	expect((await nopBai(db, token, undefined, t0 + T / 2, mayA)).res.status).toBe(200);
	expect(JSON.parse((await db.prepare('SELECT dap_an_tn FROM bai_lam').first<any>()).dap_an_tn)).toEqual({ [tn[0].ma]: 1 });
});

it('xemNhatKy: lượt thi, dòng thời gian và bài làm đúng như học viên thấy (đáp án chọn, đúng/sai)', async () => {
	const { token, de, tn, tl } = await vaoThi();
	const q = async (ma: string) => (await db.prepare('SELECT dap_an, lua_chon FROM cau_hoi WHERE ma = ?').bind(ma).first<any>());
	const [m1, m2] = tn;
	const dung1 = m1.thu_tu!.indexOf((await q(m1.ma)).dap_an);
	const sai2 = (m2.thu_tu!.indexOf((await q(m2.ma)).dap_an) + 1) % 4;
	await luuBai(db, token, { dap_an_tn: { [m1.ma]: dung1, [m2.ma]: sai2 }, tu_luan: { [tl[0].ma]: 'Trả lời của tôi' }, roi: [9] }, t0 + 1000, mayA);
	await nopBai(db, token, undefined, t0 + T / 2, mayA);

	expect((await xemNhatKy(db, { hoc_vien_id: 99 })).status).toBe(404);
	expect((await xemNhatKy(db, {})).status).toBe(400);
	const r = await xemNhatKy(db, { hoc_vien_id: 1 });
	expect(r.status).toBe(200);
	const b: any = r.body;
	expect(b.luot).toMatchObject({ ten: 'Phêrô Nguyễn Văn An', bat_dau: t0, nop: t0 + T / 2, trang_thai: 'da_nop', nop_tre: false, so_lan_roi_tab: 0 });
	expect(b.su_kien.map((e: any) => e.su_kien)).toEqual(['bat_dau', 'luu', 'roi_man_hinh', 'nop']);
	expect(b.su_kien[0].may).toEqual(mayA);
	expect(b.bai_thi).toHaveLength(de.length);
	const c1 = b.bai_thi.find((x: any) => x.ma === m1.ma);
	const c2 = b.bai_thi.find((x: any) => x.ma === m2.ma);
	expect(c1).toMatchObject({ da_chon: dung1, dung: true, dap_an_dung: dung1 });
	expect(c1.lua_chon).toHaveLength(4);
	expect(c2).toMatchObject({ da_chon: sai2, dung: false });
	expect(b.bai_thi.find((x: any) => x.ma === tl[0].ma)).toMatchObject({ tra_loi: 'Trả lời của tôi', lua_chon: null });
	expect(b.bai_thi.filter((x: any) => x.loai === 'TN' && x.da_chon === null && x.dung === null).length).toBe(tn.length - 2);
});
