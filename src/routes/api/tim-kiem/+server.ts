import { env } from 'cloudflare:workers';
import { timHocVien } from '#lib/server/thi.ts';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ url }) =>
	Response.json(await timHocVien(env.DB, url.searchParams.get('q') ?? ''), { headers: { 'cache-control': 'no-store' } });
