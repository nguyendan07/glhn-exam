import { env } from 'cloudflare:workers';
import { COOKIE, docJson, luuBai } from '#lib/server/thi.ts';
import type { RequestHandler } from './$types';

export const PUT: RequestHandler = async ({ request, cookies }) =>
	luuBai(env.DB, cookies.get(COOKIE), await docJson(request));
