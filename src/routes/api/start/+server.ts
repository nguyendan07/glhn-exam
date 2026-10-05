import { env } from 'cloudflare:workers';
import { batDau, COOKIE, COOKIE_OPTS, docJson } from '#lib/server/thi.ts';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request, cookies }) => {
	const { res, token } = await batDau(env.DB, await docJson(request), cookies.get(COOKIE), String(env.REQUIRE_ROSTER) === 'true');
	if (token) cookies.set(COOKIE, token, COOKIE_OPTS);
	return res;
};
