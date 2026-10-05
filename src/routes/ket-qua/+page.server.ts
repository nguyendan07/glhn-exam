import { redirect } from '@sveltejs/kit';
import { env } from 'cloudflare:workers';
import { COOKIE, ketQua, timLuotTheoToken } from '#lib/server/thi.ts';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ cookies, setHeaders }) => {
	const l = await timLuotTheoToken(env.DB, cookies.get(COOKIE));
	if (!l) redirect(303, '/');
	if (l.trang_thai === 'dang_thi') redirect(303, '/thi');
	setHeaders({ 'cache-control': 'no-store' });
	return ketQua(env.DB, l);
};
