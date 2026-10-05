import { env } from 'cloudflare:workers';
import { COOKIE, docJson, nopBai } from '#lib/server/thi.ts';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request, cookies }) => {
	const { res } = await nopBai(env.DB, cookies.get(COOKIE), await docJson(request));
	return res;
};
