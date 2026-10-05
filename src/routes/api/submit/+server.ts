import { env, waitUntil } from 'cloudflare:workers';
import { dongBoMot } from '#lib/server/sheets.ts';
import { COOKIE, docJson, nopBai } from '#lib/server/thi.ts';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request, cookies }) => {
	const r = await nopBai(env.DB, cookies.get(COOKIE), await docJson(request));
	// Đẩy lên Sheets sau khi trả kết quả; lỗi thì giữ sync_pending=1 cho resync.
	if (r.moiNop && r.luotId) waitUntil(dongBoMot(env.DB, env, r.luotId));
	return r.res;
};
