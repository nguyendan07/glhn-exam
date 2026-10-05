import { json } from '@sveltejs/kit';
import { env } from 'cloudflare:workers';
import { laAdmin } from '#lib/server/admin.ts';
import { dongBoLai } from '#lib/server/sheets.ts';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request }) => {
	if (!(await laAdmin(request, env.ADMIN_TOKEN))) return json({ error: 'Không có quyền.' }, { status: 401 });
	return json(await dongBoLai(env.DB, env));
};
