import { env } from 'cloudflare:workers';
import { docLichThi } from '#lib/server/lich-thi.ts';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async () =>
	Response.json(await docLichThi(env.DB), { headers: { 'cache-control': 'no-store' } });
