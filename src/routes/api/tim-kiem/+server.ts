import { env } from 'cloudflare:workers';
import { COOKIE, timHocVien } from '#lib/server/thi.ts';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ url, cookies }) =>
	Response.json(await timHocVien(env.DB, url.searchParams.get('q') ?? '', cookies.get(COOKIE)), { headers: { 'cache-control': 'no-store' } });
