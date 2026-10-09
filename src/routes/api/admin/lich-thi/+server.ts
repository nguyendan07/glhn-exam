import { env } from 'cloudflare:workers';
import { chayAdmin } from '#lib/server/admin.ts';
import { luuLichThi } from '#lib/server/lich-thi.ts';
import { docJson } from '#lib/server/thi.ts';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request }) =>
	chayAdmin(request, env.ADMIN_TOKEN, async () => luuLichThi(env.DB, await docJson(request)));
