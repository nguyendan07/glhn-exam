import { expect, it, vi } from 'vitest';
import { chayAdmin, laAdmin } from './admin';

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
