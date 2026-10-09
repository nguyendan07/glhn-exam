import { describe, expect, it } from 'vitest';
import { d1Test } from './testing/d1';
import { onOffDemNguoc, docLichThi, luuLichThi } from './lich-thi';
import { batDau } from './thi';
import { chayAdmin } from './admin';

describe('lịch thi', () => {
	it('tắt cho thi ngay, bật lại chặn trước giờ và giữ nguyên lịch', async () => {
		const db = d1Test();
		await luuLichThi(db, { thoi_gian: '2026-10-11T09:00' });
		const lich = await docLichThi(db);
		expect(lich.on_dem_nguoc).toBe(true);
		expect((await onOffDemNguoc(db, { on_dem_nguoc: false })).status).toBe(200);
		expect((await batDau(db, { hoc_vien_id: 1 }, undefined, lich.mo_thi_luc - 1000)).res.status).toBe(200);
		await luuLichThi(db, { thoi_gian: '2026-10-11T09:00' });
		expect((await docLichThi(db)).on_dem_nguoc).toBe(false);
		await onOffDemNguoc(db, { on_dem_nguoc: true });
		expect((await batDau(db, { hoc_vien_id: 2 }, undefined, lich.mo_thi_luc - 1000)).res.status).toBe(403);
		expect((await docLichThi(db)).mo_thi_luc).toBe(lich.mo_thi_luc);
	});
	it('từ chối trạng thái sai và yêu cầu mã quản trị để bật/tắt', async () => {
		const db = d1Test();
		for (const on_dem_nguoc of [null, 0, 'false', undefined]) {
			expect((await onOffDemNguoc(db, { on_dem_nguoc })).status).toBe(400);
		}
		const r = await chayAdmin(new Request('https://example.com'), 'a-valid-admin-token',
			() => onOffDemNguoc(db, { on_dem_nguoc: false }));
		expect(r.status).toBe(401);
		expect((await docLichThi(db)).on_dem_nguoc).toBe(true);
	});

	it('lưu giờ Việt Nam và từ chối ngày sai', async () => {
		const db = d1Test();
		expect((await luuLichThi(db, { thoi_gian: '2026-10-11T09:00' })).status).toBe(200);
		expect((await docLichThi(db)).mo_thi_luc).toBe(Date.parse('2026-10-11T02:00:00Z'));
		for (const thoi_gian of ['', '2026-02-30T09:00', '2026-10-11T25:00', null]) {
			expect((await luuLichThi(db, { thoi_gian })).status).toBe(400);
		}
		expect((await docLichThi(db)).mo_thi_luc).toBe(1791684000000);
	});
	it('chặn trước giờ, mở đúng giờ và cho tiếp tục khi đổi lịch', async () => {
		const db = d1Test();
		await luuLichThi(db, { thoi_gian: '2026-10-11T09:00' });
		const t = (await docLichThi(db)).mo_thi_luc;
		expect((await batDau(db, { hoc_vien_id: 1 }, undefined, t - 1)).res.status).toBe(403);
		expect(await db.prepare('SELECT id FROM luot_thi').first()).toBeNull();
		const start = await batDau(db, { hoc_vien_id: 1 }, undefined, t);
		expect(start.res.status).toBe(200);
		await luuLichThi(db, { thoi_gian: '2026-10-12T09:00' });
		expect((await batDau(db, { hoc_vien_id: 1 }, start.token, t + 1000)).res.status).toBe(200);
	});
	it('không cho đổi lịch khi thiếu mã quản trị', async () => {
		const db = d1Test();
		const r = await chayAdmin(new Request('https://example.com'), 'a-valid-admin-token', () => luuLichThi(db, { thoi_gian: '2026-10-11T09:00' }));
		expect(r.status).toBe(401);
		expect((await docLichThi(db)).mo_thi_luc).toBe(0);
	});
});
