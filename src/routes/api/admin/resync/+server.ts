import { env } from 'cloudflare:workers';
import { chayAdmin } from '#lib/server/admin.ts';
import { dongBoLai } from '#lib/server/sheets.ts';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = ({ request }) =>
	chayAdmin(request, env.ADMIN_TOKEN, async () => ({ status: 200, body: await dongBoLai(env.DB, env) }));
