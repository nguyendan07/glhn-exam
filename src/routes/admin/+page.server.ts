import { env } from 'cloudflare:workers';
import { docLichThi } from '#lib/server/lich-thi.ts';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async () => ({ lich: await docLichThi(env.DB) });
