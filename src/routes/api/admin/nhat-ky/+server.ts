import { env } from 'cloudflare:workers';
import { chayAdmin, xemNhatKy } from '#lib/server/admin.ts';
import { docJson } from '#lib/server/thi.ts';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request }) => {
	const body = await docJson(request);
	return chayAdmin(request, env.ADMIN_TOKEN, () => xemNhatKy(env.DB, body));
};
