/// <reference types="node" />
// D1 giả lập trên node:sqlite (Node ≥ 22) để test chạy SQL thật của migrations/.
// ponytail: chỉ hiện thực phần API mà code dùng (prepare/bind/first/all/run/batch).
import { readdirSync, readFileSync } from 'node:fs';
import { DatabaseSync, type SQLInputValue } from 'node:sqlite';

export function d1Test(): D1Database {
	const db = new DatabaseSync(':memory:');
	for (const f of readdirSync('migrations').sort()) db.exec(readFileSync(`migrations/${f}`, 'utf8'));
	db.exec(readFileSync('src/lib/server/testing/mau.sql', 'utf8'));
	db.exec('UPDATE cau_hinh SET mo_thi_luc = 0');

	const exec = (sql: string, params: SQLInputValue[]) => {
		const st = db.prepare(sql);
		if (st.columns().length) return { results: st.all(...params).map((r: object) => ({ ...r })), meta: { changes: 0 }, success: true };
		const r = st.run(...params);
		return { results: [], meta: { changes: Number(r.changes) }, success: true };
	};

	const stmt = (sql: string, params: SQLInputValue[] = []): any => ({
		bind: (...p: SQLInputValue[]) => stmt(sql, p),
		first: async () => exec(sql, params).results[0] ?? null,
		all: async () => exec(sql, params),
		run: async () => exec(sql, params),
		_exec: () => exec(sql, params)
	});

	return {
		prepare: (sql: string) => stmt(sql),
		batch: async (stmts: any[]) => {
			db.exec('BEGIN');
			try {
				const r = stmts.map((s) => s._exec());
				db.exec('COMMIT');
				return r;
			} catch (e) {
				db.exec('ROLLBACK');
				throw e;
			}
		}
	} as unknown as D1Database;
}
