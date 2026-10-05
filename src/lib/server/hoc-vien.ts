// Danh sách học viên: đọc từ Sheet (tab HocVien) hoặc CSV, sinh SQL nạp vào D1.
// Import có đuôi .ts để Node chạy được trực tiếp (scripts/hoc-vien-sql.mjs).
import { chuanHoa, lamSach } from './normalize.ts';

const o = (h: string[], i: number) => lamSach(h[i] ?? '');

/** Tab HocVien: A Tên Thánh (có thể trống) | B Họ và tên | C Giáo xứ | D Giáo phận (tùy chọn). */
export function parseHocVien(rows: string[][]) {
	const loi: string[] = [];
	const dem = new Map<string, number>();
	const ds: { khoa: string; ten_thanh: string; ho_ten: string; tim_kiem: string; giao_xu: string; giao_phan: string }[] = [];
	rows.forEach((h, i) => {
		const [tenThanh, hoTen, giaoXu, giaoPhan] = [o(h, 0), o(h, 1), o(h, 2), o(h, 3)];
		if (!tenThanh && !hoTen && !giaoXu && !giaoPhan) return;
		if (!hoTen) return loi.push(`HocVien dòng ${i + 2}: thiếu Họ và tên.`);
		if (tenThanh.length > 60 || hoTen.length > 100 || giaoXu.length > 60 || giaoPhan.length > 60) return loi.push(`HocVien dòng ${i + 2}: giá trị quá dài.`);
		const goc = chuanHoa(hoTen) + '|' + chuanHoa(tenThanh);
		const n = (dem.get(goc) ?? 0) + 1;
		dem.set(goc, n);
		ds.push({ khoa: `${goc}#${n}`, ten_thanh: tenThanh, ho_ten: hoTen, tim_kiem: chuanHoa(`${tenThanh} ${hoTen}`), giao_xu: giaoXu, giao_phan: giaoPhan });
	});
	return { ds, loi };
}


/**
 * CSV chỉ có cột đầu là "Tên Thánh + Họ tên" gộp một ô (các cột sau, ví dụ điểm danh, bỏ qua). Dòng đầu là tiêu đề.
 * ponytail: không tách Tên Thánh khỏi họ tên (cần danh sách tên Thánh để đoán), toàn bộ chuỗi coi là tên hiển thị và tìm kiếm.
 */
export function csvHocVien(csv: string): string[][] {
	return csv
		.replace(/^\uFEFF/, '')
		.split(/\r?\n/)
		.slice(1)
		.map((dong) => {
			const m = /^"((?:[^"]|"")*)"|^([^,]*)/.exec(dong)!;
			return ['', (m[1]?.replace(/""/g, '"') ?? m[2]).trim()];
		})
		.filter(([, ten]) => ten);
}

const q = (x: string) => `'${x.replace(/'/g, "''")}'`;

/** SQL nạp danh sách: cập nhật theo khóa, xóa người không còn trong danh sách trừ khi đã có lượt thi (giống /api/admin/import). */
export function sqlHocVien(ds: ReturnType<typeof parseHocVien>['ds']): string {
	const rows = ds.map((h) => `(${[h.khoa, h.ten_thanh, h.ho_ten, h.tim_kiem, h.giao_xu, h.giao_phan].map(q).join(', ')})`);
	return `INSERT INTO hoc_vien_cho_phep (khoa, ten_thanh, ho_ten, tim_kiem, giao_xu, giao_phan) VALUES
${rows.join(',\n')}
ON CONFLICT (khoa) DO UPDATE SET ten_thanh = excluded.ten_thanh, ho_ten = excluded.ho_ten,
tim_kiem = excluded.tim_kiem, giao_xu = excluded.giao_xu, giao_phan = excluded.giao_phan;
DELETE FROM hoc_vien_cho_phep WHERE khoa NOT IN (${ds.map((h) => q(h.khoa)).join(', ')})
AND id NOT IN (SELECT hoc_vien_id FROM luot_thi);
`;
}
