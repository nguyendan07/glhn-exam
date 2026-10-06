import { expect, it, vi } from 'vitest';
import { chayAdmin, laAdmin, moKhoa } from './admin';
import { d1Test } from './testing/d1';
import { batDau, timHocVien, timLuotTheoToken } from './thi';

const TOKEN = 'mot-chuoi-bi-mat-dai-du-16-ky-tu';
const req = (auth?: string) => new Request('https://x/api/admin/import', { method: 'POST', headers: auth ? { authorization: auth } : {} });

it('laAdmin: cần token cấu hình ≥ 16 ký tự và header Bearer khớp', async () => {
	expect(await laAdmin(req(`Bearer ${TOKEN}`), TOKEN)).toBe(true);
	expect(await laAdmin(req(`Bearer ${TOKEN}x`), TOKEN)).toBe(false);
	expect(await laAdmin(req(TOKEN), TOKEN)).toBe(false);
	expect(await laAdmin(req(), TOKEN)).toBe(false);
	expect(await laAdmin(req('Bearer ngan'), 'ngan')).toBe(false); // token cấu hình quá ngắn bị từ chối
	expect(await laAdmin(req(`Bearer ${TOKEN}`), undefined)).toBe(false); // chưa đặt ADMIN_TOKEN
});

it('chayAdmin: 401 khi sai token và không chạy thao tác', async () => {
	const viec = vi.fn(async () => ({ status: 200, body: {} }));
	const r = await chayAdmin(req('Bearer sai'), TOKEN, viec);
	expect(r.status).toBe(401);
	expect(viec).not.toHaveBeenCalled();
});

it('chayAdmin: trả nguyên status/body của thao tác', async () => {
	const r = await chayAdmin(req(`Bearer ${TOKEN}`), TOKEN, async () => ({ status: 409, body: { error: 'Đang có 3 lượt thi' } }));
	expect(r.status).toBe(409);
	expect(await r.json()).toEqual({ error: 'Đang có 3 lượt thi' });
});

it('chayAdmin: lỗi bất ngờ thành JSON { error } với status 500 (không phải trang lỗi chung)', async () => {
	vi.spyOn(console, 'error').mockImplementation(() => {});
	const r = await chayAdmin(req(`Bearer ${TOKEN}`), TOKEN, async () => {
		throw new Error('Sheets GET /values/CauHoi 403: caller does not have permission');
	});
	expect(r.status).toBe(500);
	expect(await r.json()).toEqual({ error: 'Sheets GET /values/CauHoi 403: caller does not have permission' });
});

it('moKhoa: đặt token_hash = NULL để học viên vào lại được từ máy khác', async () => {
	const db = d1Test();
	const st = await batDau(db, { hoc_vien_id: 4 }, undefined, 0); // Maria Lê Thị Cúc
	expect(await timLuotTheoToken(db, st.token)).not.toBeNull();
	expect((await timHocVien(db, 'le thi cuc'))[0]).toMatchObject({ da_thi: true, tiep_tuc: false });

	expect(await moKhoa(db, { hoc_vien_id: 4 })).toEqual({ status: 200, body: { ten: 'Maria Lê Thị Cúc', trang_thai: 'dang_thi' } });
	expect((await timHocVien(db, 'le thi cuc'))[0]).toMatchObject({ da_thi: true, tiep_tuc: true });
	expect(await timLuotTheoToken(db, st.token)).toBeNull(); // cookie cũ không còn dùng được

	const may2 = await batDau(db, { hoc_vien_id: 4 }, undefined, 0); // máy mới chọn lại tên
	expect(may2.res.status).toBe(200);
	expect(may2.token).toBeTruthy();
	expect((await timHocVien(db, 'le thi cuc'))[0]).toMatchObject({ tiep_tuc: false }); // khóa lại cho máy mới
	expect((await batDau(db, { hoc_vien_id: 4 }, undefined, 0)).res.status).toBe(409); // máy thứ ba vẫn bị chặn
});

it('moKhoa: 400 thiếu mã, 404 khi học viên chưa có lượt thi', async () => {
	const db = d1Test();
	expect((await moKhoa(db, {})).status).toBe(400);
	expect((await moKhoa(db, { hoc_vien_id: '4' })).status).toBe(400);
	expect((await moKhoa(db, { hoc_vien_id: 4 })).status).toBe(404);
});
