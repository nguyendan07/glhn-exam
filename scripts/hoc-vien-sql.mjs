// Dùng: node scripts/hoc-vien-sql.mjs resources/ds_hoc_vien.csv > .wrangler/hoc-vien.sql
import { readFileSync } from 'node:fs';
import { csvHocVien, parseHocVien, sqlHocVien } from '../src/lib/server/hoc-vien.ts';

const file = process.argv[2];
if (!file) {
	console.error('Thiếu đường dẫn file CSV.');
	process.exit(1);
}
const { ds, loi } = parseHocVien(csvHocVien(readFileSync(file, 'utf8')));
if (loi.length || !ds.length) {
	console.error(loi.join('\n') || 'CSV không có học viên nào.');
	process.exit(1);
}
console.error(`${ds.length} học viên`);
process.stdout.write(sqlHocVien(ds));
