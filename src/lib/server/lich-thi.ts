export async function docLichThi(db: D1Database) {
	const row = await db.prepare('SELECT mo_thi_luc FROM cau_hinh WHERE id = 1').first<{ mo_thi_luc: number }>();
	if (!row) throw new Error('Chưa có cấu hình kỳ thi.');
	return { mo_thi_luc: row.mo_thi_luc, bay_gio: Date.now() };
}

export async function luuLichThi(db: D1Database, body: unknown) {
	const value = (body as { thoi_gian?: unknown } | null)?.thoi_gian;
	// datetime-local được hiểu theo giờ Việt Nam, không theo múi giờ máy admin.
	if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value))
		return { status: 400, body: { error: 'Ngày giờ không hợp lệ.' } };
	const ms = Date.parse(value + ':00+07:00');
	if (!Number.isFinite(ms) || new Date(ms + 7 * 3600000).toISOString().slice(0, 16) !== value)
		return { status: 400, body: { error: 'Ngày giờ không hợp lệ.' } };
	await db.prepare('UPDATE cau_hinh SET mo_thi_luc = ? WHERE id = 1').bind(ms).run();
	return { status: 200, body: await docLichThi(db) };
}
