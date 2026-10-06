// Client Google Sheets tối giản cho Workers: ký JWT service account bằng Web Crypto, gọi REST API bằng fetch.
// Không import gì của SvelteKit để Worker cron dùng lại được.
import { baiNopThanhChu, type CauHoi, type MucDe } from './exam';
import { trinhDuyet } from '../trinh-duyet';

export type SheetEnv = { GOOGLE_SA_EMAIL: string; GOOGLE_SA_PRIVATE_KEY: string; SHEET_ID: string };

export const TAB_KET_QUA = 'KetQua';
export const TIEU_DE_KET_QUA = [
	'Mã lượt', 'Tên Thánh', 'Họ và tên', 'Giáo xứ', 'Giáo phận', 'Giờ bắt đầu', 'Giờ nộp',
	'Nộp trễ', 'Số lần rời tab', 'Điểm TN', 'Bài tự luận', 'Điểm TL', 'Tổng điểm', 'IP', 'Vị trí', 'Trình duyệt', 'Bài đã nộp'
];

/** Chống formula injection: chuỗi bắt đầu bằng = + - @ được thêm ' phía trước (Sheets hiểu là văn bản). */
export function escapeCell(s: string): string {
	return /^[=+\-@]/.test(s) ? "'" + s : s;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** fetch có retry + exponential backoff khi gặp 429/5xx hoặc lỗi mạng. */
export async function fetchRetry(url: string, init: RequestInit, lan = 5, coSo = 500): Promise<Response> {
	for (let i = 0; ; i++) {
		let res: Response | undefined;
		try {
			res = await fetch(url, init);
			if (res.status !== 429 && res.status < 500) return res;
		} catch (e) {
			if (i >= lan - 1) throw e;
		}
		if (i >= lan - 1) return res!;
		const ra = Number(res?.headers.get('retry-after'));
		await sleep(ra > 0 ? ra * 1000 : coSo * 2 ** i + Math.random() * coSo);
	}
}

const b64url = (b: ArrayBuffer | Uint8Array | string) =>
	btoa(String.fromCharCode(...(typeof b === 'string' ? new TextEncoder().encode(b) : new Uint8Array(b))))
		.replace(/\+/g, '-')
		.replace(/\//g, '_')
		.replace(/=+$/, '');

// ponytail: cache trong bộ nhớ isolate, mỗi isolate tự xin token mới khi hết hạn
let cache: { token: string; exp: number; email: string } | null = null;

export async function accessToken(env: SheetEnv): Promise<string> {
	if (cache && cache.email === env.GOOGLE_SA_EMAIL && cache.exp > Date.now() + 60_000) return cache.token;
	const pem = env.GOOGLE_SA_PRIVATE_KEY.replace(/\\n/g, '\n').replace(/-----[^-]+-----|\s/g, '');
	const der = Uint8Array.from(atob(pem), (c) => c.charCodeAt(0));
	const key = await crypto.subtle.importKey('pkcs8', der, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']);
	const iat = Math.floor(Date.now() / 1000);
	const unsigned =
		b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' })) +
		'.' +
		b64url(
			JSON.stringify({
				iss: env.GOOGLE_SA_EMAIL,
				scope: 'https://www.googleapis.com/auth/spreadsheets',
				aud: 'https://oauth2.googleapis.com/token',
				iat,
				exp: iat + 3600
			})
		);
	const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(unsigned));
	const res = await fetchRetry('https://oauth2.googleapis.com/token', {
		method: 'POST',
		headers: { 'content-type': 'application/x-www-form-urlencoded' },
		body: new URLSearchParams({
			grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
			assertion: `${unsigned}.${b64url(sig)}`
		})
	});
	if (!res.ok) throw new Error(`Google token ${res.status}: ${await res.text()}`);
	const j = (await res.json()) as { access_token: string; expires_in: number };
	cache = { token: j.access_token, exp: Date.now() + j.expires_in * 1000, email: env.GOOGLE_SA_EMAIL };
	return j.access_token;
}

async function api<T>(env: SheetEnv, method: string, path: string, body?: unknown): Promise<T> {
	const res = await fetchRetry(`https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(env.SHEET_ID)}${path}`, {
		method,
		headers: { authorization: `Bearer ${await accessToken(env)}`, 'content-type': 'application/json' },
		body: body === undefined ? undefined : JSON.stringify(body)
	});
	if (!res.ok) throw new Error(`Sheets ${method} ${path} ${res.status}: ${await res.text()}`);
	return res.json() as Promise<T>;
}

const r = (range: string) => encodeURIComponent(range);

/** Đọc một vùng, trả mảng hàng (chuỗi như hiển thị trên Sheet). */
export async function docVung(env: SheetEnv, range: string): Promise<string[][]> {
	const j = await api<{ values?: string[][] }>(env, 'GET', `/values/${r(range)}?valueRenderOption=FORMATTED_VALUE`);
	return j.values ?? [];
}

export async function ghiVung(env: SheetEnv, range: string, values: unknown[][]) {
	await api(env, 'PUT', `/values/${r(range)}?valueInputOption=USER_ENTERED`, { values });
}

/** Append nhiều hàng trong một request; trả số hàng đầu tiên được ghi. */
export async function themHang(env: SheetEnv, tab: string, values: unknown[][]): Promise<number> {
	const j = await api<{ updates: { updatedRange: string } }>(
		env,
		'POST',
		`/values/${r(`${tab}!A:A`)}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`,
		{ values }
	);
	const m = /![A-Z]+(\d+)/.exec(j.updates.updatedRange);
	if (!m) throw new Error(`Không đọc được updatedRange: ${j.updates.updatedRange}`);
	return Number(m[1]);
}

type LuotSync = {
	id: string;
	ten_thanh: string;
	ho_ten: string;
	giao_xu: string;
	giao_phan: string;
	started_at: number;
	submitted_at: number;
	nop_tre: number;
	so_lan_roi_tab: number;
	diem_tn: number | null;
	tu_luan: string;
	de_thi: string;
	dap_an_tn: string;
	may_cuoi: string | null;
	sheet_row: number | null;
};

const SELECT_SYNC = `SELECT l.id, l.ten_thanh, l.ho_ten, l.giao_xu, l.giao_phan, l.started_at, l.submitted_at,
	l.nop_tre, l.so_lan_roi_tab, l.sheet_row, l.de_thi, l.may_cuoi, b.diem_tn, b.tu_luan, b.dap_an_tn
	FROM luot_thi l JOIN bai_lam b ON b.luot_id = l.id`;

const gio = (ms: number) =>
	"'" + new Date(ms).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', hour12: false });

/** Toàn bộ ngân hàng câu hỏi (cần để dựng "Bài đã nộp"; chỉ có ~vài chục câu nên đọc một lần cho cả đợt đồng bộ). */
async function docNganHang(db: D1Database) {
	const { results } = await db.prepare('SELECT * FROM cau_hoi').all<CauHoi>();
	return new Map(results.map((q) => [q.ma, q]));
}

/**
 * Một hàng của tab KetQua: A..M như cũ (Điểm TN là J, Điểm TL là L), N IP, O Vị trí, P Trình duyệt (của máy ở sự kiện cuối),
 * Q Bài đã nộp (toàn bộ bài như học viên đã thấy). Mọi chuỗi do học viên nhập đều qua escapeCell.
 */
export function hangKetQua(l: LuotSync, cauHoi: ReadonlyMap<string, CauHoi>): (string | number)[] {
	const may = l.may_cuoi ? (JSON.parse(l.may_cuoi) as Record<string, string | undefined>) : {};
	const viTri = [may.thanh_pho, may.vung !== may.thanh_pho ? may.vung : '', may.quoc_gia].filter(Boolean).join(', ');
	const tl = Object.entries(JSON.parse(l.tu_luan) as Record<string, string>)
		.map(([ma, s]) => `[${ma}]\n${s}`)
		.join('\n\n');
	return [
		l.id,
		escapeCell(l.ten_thanh),
		escapeCell(l.ho_ten),
		escapeCell(l.giao_xu),
		escapeCell(l.giao_phan),
		gio(l.started_at),
		gio(l.submitted_at),
		l.nop_tre ? 'Có' : '',
		l.so_lan_roi_tab,
		l.diem_tn ?? 0,
		escapeCell(tl),
		'', // Điểm TL: giáo viên nhập
		'=N(INDIRECT("J"&ROW()))+N(INDIRECT("L"&ROW()))',
		escapeCell(may.ip ?? ''),
		escapeCell(viTri),
		escapeCell(may.ua ? `${trinhDuyet(may.ua)} — ${may.ua}` : ''),
		escapeCell(baiNopThanhChu(JSON.parse(l.de_thi) as MucDe[], cauHoi, JSON.parse(l.dap_an_tn), JSON.parse(l.tu_luan)))
	];
}

const coCauHinh = (env: Partial<SheetEnv>): env is SheetEnv =>
	!!(env.GOOGLE_SA_EMAIL && env.GOOGLE_SA_PRIVATE_KEY && env.SHEET_ID);

/** Gọi qua waitUntil ngay sau khi nộp. Lỗi thì giữ sync_pending=1 để resync xử lý. */
export async function dongBoMot(db: D1Database, env: Partial<SheetEnv>, id: string) {
	if (!coCauHinh(env)) return;
	try {
		const l = await db.prepare(`${SELECT_SYNC} WHERE l.id = ? AND l.sync_pending = 1 AND l.trang_thai = 'da_nop'`).bind(id).first<LuotSync>();
		if (!l) return;
		const row = await themHang(env, TAB_KET_QUA, [hangKetQua(l, await docNganHang(db))]);
		await db.prepare('UPDATE luot_thi SET sync_pending = 0, sheet_row = ? WHERE id = ?').bind(row, id).run();
	} catch (e) {
		console.error('Đồng bộ Sheets lỗi, để resync xử lý:', id, e);
	}
}

/**
 * Đồng bộ lại các lượt sync_pending. Đọc cột A để không tạo hàng trùng: lượt đã có trên Sheet thì cập nhật A..K
 * (không đụng cột L do giáo viên nhập), chưa có thì append. Bỏ qua lượt vừa nộp < 2 phút (waitUntil có thể đang chạy).
 */
export async function dongBoLai(db: D1Database, env: Partial<SheetEnv>, now = Date.now(), gioiHan = 500) {
	if (!coCauHinh(env)) throw new Error('Thiếu GOOGLE_SA_EMAIL / GOOGLE_SA_PRIVATE_KEY / SHEET_ID.');
	const { results } = await db
		.prepare(`${SELECT_SYNC} WHERE l.sync_pending = 1 AND l.trang_thai = 'da_nop' AND l.submitted_at < ? ORDER BY l.submitted_at LIMIT ?`)
		.bind(now - 120_000, gioiHan)
		.all<LuotSync>();
	if (!results.length) return { da_dong_bo: 0 };

	const cauHoi = await docNganHang(db);
	const cotA = await docVung(env, `${TAB_KET_QUA}!A:A`);
	const daCo = new Map(cotA.map((h, i) => [h[0], i + 1]));
	const capNhat: { range: string; values: unknown[][] }[] = [];
	const them: LuotSync[] = [];
	const xong: [string, number][] = [];
	for (const l of results) {
		const row = daCo.get(l.id);
		if (row) {
			capNhat.push({ range: `${TAB_KET_QUA}!A${row}:K${row}`, values: [hangKetQua(l, cauHoi).slice(0, 11)] });
			xong.push([l.id, row]);
		} else them.push(l);
	}
	if (capNhat.length) await api(env, 'POST', '/values:batchUpdate', { valueInputOption: 'USER_ENTERED', data: capNhat });
	if (them.length) {
		const dau = await themHang(env, TAB_KET_QUA, them.map((l) => hangKetQua(l, cauHoi)));
		them.forEach((l, i) => xong.push([l.id, dau + i]));
	}
	await db.batch(xong.map(([id, row]) => db.prepare('UPDATE luot_thi SET sync_pending = 0, sheet_row = ? WHERE id = ?').bind(row, id)));
	return { da_dong_bo: xong.length, cap_nhat: capNhat.length, them_moi: them.length };
}
