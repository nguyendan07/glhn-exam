import { redirect } from '@sveltejs/kit';
import { env } from 'cloudflare:workers';
import { COOKIE, timLuotTheoToken } from '#lib/server/thi.ts';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ cookies }) => {
	const l = await timLuotTheoToken(env.DB, cookies.get(COOKIE));
	if (l) redirect(303, l.trang_thai === 'da_nop' ? '/ket-qua' : '/thi');
};
