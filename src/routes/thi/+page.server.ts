import { redirect } from '@sveltejs/kit';
import { env } from 'cloudflare:workers';
import { COOKIE, timLuotTheoToken, trangThaiThi } from '#lib/server/thi.ts';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ cookies, setHeaders }) => {
	const l = await timLuotTheoToken(env.DB, cookies.get(COOKIE));
	if (!l) redirect(303, '/');
	if (l.trang_thai === 'da_nop') redirect(303, '/ket-qua');
	setHeaders({ 'cache-control': 'no-store' });
	return trangThaiThi(env.DB, l);
};
