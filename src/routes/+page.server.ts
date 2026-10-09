import { docLichThi } from '#lib/server/lich-thi.ts';
import { redirect } from '@sveltejs/kit';
import { env } from 'cloudflare:workers';
import { COOKIE, thongTinTrangChao, timLuotTheoToken } from '#lib/server/thi.ts';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ cookies }) => {
	const l = await timLuotTheoToken(env.DB, cookies.get(COOKIE));
	if (l) redirect(303, l.trang_thai === 'da_nop' ? '/ket-qua' : '/thi');
	return { thongTin: await thongTinTrangChao(env.DB), lich: await docLichThi(env.DB) };
};
