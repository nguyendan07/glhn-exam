import { env } from 'cloudflare:workers';
import { chayAdmin, nhapTuSheet } from '#lib/server/admin.ts';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = ({ request, url }) =>
	chayAdmin(request, env.ADMIN_TOKEN, () => nhapTuSheet(env.DB, env, url.searchParams.get('force') === '1'));
