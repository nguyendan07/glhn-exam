import { env } from 'cloudflare:workers';
import { mayTuYeuCau } from '#lib/server/nhat-ky.ts';
import { COOKIE, docJson, luuBai } from '#lib/server/thi.ts';
import type { RequestHandler } from './$types';

export const PUT: RequestHandler = async ({ request, cookies, getClientAddress }) =>
	luuBai(env.DB, cookies.get(COOKIE), await docJson(request), Date.now(), mayTuYeuCau(request, getClientAddress));
