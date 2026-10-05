import { json } from '@sveltejs/kit';
import { env } from 'cloudflare:workers';
import { laAdmin, nhapTuSheet } from '#lib/server/admin.ts';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request, url }) => {
	if (!(await laAdmin(request, env.ADMIN_TOKEN))) return json({ error: 'Không có quyền.' }, { status: 401 });
	const r = await nhapTuSheet(env.DB, env, url.searchParams.get('force') === '1');
	return json(r.body, { status: r.status });
};
