import { beforeEach, expect, it, vi } from 'vitest';
import { moKhoa, xemNhatKy } from './admin';
import { mayTuYeuCau, thongTinMay, type May } from './nhat-ky';
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

it('bắt đầu: ghi sự kiện bat_dau kèm IP/vị trí/trình duyệt và nhớ máy hiện tại', async () => {
	const { token } = await vaoThi();
	expect(await sk()).toEqual([{ su_kien: 'bat_dau', chi_tiet: { so_cau: 14 }, may: mayA }]);
	expect((await timLuotTheoToken(db, token))!.may_cuoi).toBe(JSON.stringify(mayA));
});

it('lưu bài không ghi nhật ký (bài làm chỉ được ghi một lần, bản đã nộp, vào Google Sheet)', async () => {
	const { token, tn, tl } = await vaoThi();
	await luuBai(db, token, { dap_an_tn: { [tn[0].ma]: 1 }, tu_luan: { [tl[0].ma]: 'Hôn nhân là giao ước' } }, t0 + 1000, mayA);
	await luuBai(db, token, { dap_an_tn: { [tn[0].ma]: 2 } }, t0 + 2000, mayA);
	expect(await tenSk()).toEqual(['bat_dau']);
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
	const { token } = await vaoThi();
	await luuBai(db, token, {}, t0 + 1000, mayB); // chỉ đổi IP
	await luuBai(db, token, {}, t0 + 2000, mayB); // vẫn máy B → không ghi thêm
	await luuBai(db, token, { roi: [4] }, t0 + 3000, mayA); // quay lại máy A cùng lúc có lần rời màn hình
	const ev = (await sk()).slice(1);
	expect(ev.map((e) => e.su_kien)).toEqual(['doi_may', 'roi_man_hinh']);
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

it('nộp bài: ghi các lần rời màn hình chưa gửi và sự kiện nop kèm điểm trắc nghiệm (không ghi nội dung bài)', async () => {
	const { token, tn } = await vaoThi();
	await nopBai(db, token, { dap_an_tn: { [tn[0].ma]: 2 }, roi: [7] }, t0 + T / 2, mayA);
	const ev = (await sk()).slice(1);
	expect(ev.map((e) => e.su_kien)).toEqual(['roi_man_hinh', 'nop']);
	expect(JSON.stringify(ev)).not.toContain(tn[0].ma);
	expect(ev[1]).toMatchObject({ chi_tiet: { nop_tre: false, diem_tn: expect.any(Number) }, may: mayA });
	const n = (await tenSk()).length;
	await nopBai(db, token, undefined, t0 + T / 2 + 1000, mayA); // nộp lặp: không ghi thêm
	expect(await tenSk()).toHaveLength(n);
});

it('nộp quá hạn: nop_tre được ghi, câu trả lời nộp muộn không được nhận', async () => {
	const { token, tn } = await vaoThi();
	await luuBai(db, token, { dap_an_tn: { [tn[0].ma]: 1 } }, t0 + 1000, mayA);
	await nopBai(db, token, { dap_an_tn: { [tn[0].ma]: 1, [tn[1].ma]: 2 } }, t0 + T + 61_000, mayA);
	expect((await sk()).at(-1)).toMatchObject({ su_kien: 'nop', chi_tiet: { nop_tre: true } });
	expect(JSON.parse((await db.prepare('SELECT dap_an_tn FROM bai_lam').first<any>()).dap_an_tn)).toEqual({ [tn[0].ma]: 1 });
});

it('lỗi khi ghi nhật ký không làm hỏng bài thi (bắt đầu, lưu, nộp vẫn thành công)', async () => {
	vi.spyOn(console, 'error').mockImplementation(() => {});
	await db.prepare('DROP TABLE nhat_ky').run();
	const { token, tn } = await vaoThi();
	expect((await luuBai(db, token, { dap_an_tn: { [tn[0].ma]: 1 }, roi: [3] }, t0 + 1000, mayA)).status).toBe(200);
	expect((await nopBai(db, token, undefined, t0 + T / 2, mayA)).res.status).toBe(200);
	expect(JSON.parse((await db.prepare('SELECT dap_an_tn FROM bai_lam').first<any>()).dap_an_tn)).toEqual({ [tn[0].ma]: 1 });
});

it('xemNhatKy: thông tin lượt thi và dòng thời gian theo thứ tự, kèm thông tin máy', async () => {
	const { token } = await vaoThi();
	await luuBai(db, token, { roi: [9] }, t0 + 1000, mayA);
	await nopBai(db, token, undefined, t0 + T / 2, mayA);

	expect((await xemNhatKy(db, { hoc_vien_id: 99 })).status).toBe(404);
	expect((await xemNhatKy(db, {})).status).toBe(400);
	const r = await xemNhatKy(db, { hoc_vien_id: 1 });
	expect(r.status).toBe(200);
	const b: any = r.body;
	expect(b.luot).toMatchObject({ ten: 'Phêrô Nguyễn Văn An', bat_dau: t0, nop: t0 + T / 2, trang_thai: 'da_nop', nop_tre: false });
	expect(b.su_kien.map((e: any) => e.su_kien)).toEqual(['bat_dau', 'roi_man_hinh', 'nop']);
	expect(b.su_kien[0].may).toEqual(mayA);
	expect(b.bai_thi).toBeUndefined(); // bài đã nộp xem ở Google Sheet
});
