import { env } from 'cloudflare:workers';
import { mayTuYeuCau } from '#lib/server/nhat-ky.ts';
import { batDau, COOKIE, COOKIE_OPTS, docJson } from '#lib/server/thi.ts';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request, cookies, getClientAddress }) => {
	const { res, token } = await batDau(env.DB, await docJson(request), cookies.get(COOKIE), Date.now(), mayTuYeuCau(request, getClientAddress));
	if (token) cookies.set(COOKIE, token, COOKIE_OPTS);
	return res;
};
