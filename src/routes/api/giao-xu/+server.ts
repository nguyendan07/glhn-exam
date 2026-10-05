import { env } from 'cloudflare:workers';
import { danhSachGiaoXu } from '#lib/server/thi.ts';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async () =>
	Response.json(await danhSachGiaoXu(env.DB), { headers: { 'cache-control': 'public, max-age=300' } });
