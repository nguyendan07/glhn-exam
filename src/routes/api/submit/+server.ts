import { env, waitUntil } from 'cloudflare:workers';
import { mayTuYeuCau } from '#lib/server/nhat-ky.ts';
import { dongBoMot } from '#lib/server/sheets.ts';
import { COOKIE, docJson, nopBai } from '#lib/server/thi.ts';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request, cookies, getClientAddress }) => {
	const r = await nopBai(env.DB, cookies.get(COOKIE), await docJson(request), Date.now(), mayTuYeuCau(request, getClientAddress));
	// Đẩy lên Sheets sau khi trả kết quả; lỗi thì giữ sync_pending=1 cho resync.
	if (r.moiNop && r.luotId) waitUntil(dongBoMot(env.DB, env, r.luotId));
	return r.res;
};
