import { expect, it } from 'vitest';
import { csvHocVien, parseHocVien, sqlHocVien } from './hoc-vien';
import { d1Test } from './testing/d1';
import { batDau, timHocVien } from './thi';

const CSV = '﻿Họ & tên,,,Buổi học 1\r\nMaria Lê Phương Lan,,,\r\n"Vinh Sơn, Đỗ ""Văn"" Hậu",x,,\r\n\r\nPhạm Đức Hải (dự tòng),,,\r\n,,,\r\n';

it('đọc cột đầu của CSV: bỏ tiêu đề, dòng trống, các cột sau; hiểu ô có ngoặc kép', () => {
	expect(csvHocVien(CSV)).toEqual([['', 'Maria Lê Phương Lan'], ['', 'Vinh Sơn, Đỗ "Văn" Hậu'], ['', 'Phạm Đức Hải (dự tòng)']]);
});

it('SQL nạp danh sách: thay danh sách cũ, giữ lại người đã có lượt thi, tìm được theo tên có/không có Tên Thánh', async () => {
	const db = d1Test(); // có sẵn 5 học viên mẫu
	const st = await batDau(db, { hoc_vien_id: 3 }, undefined); // Trần Thị Bình đã thi
	expect(st.res.status).toBe(200);
	const { ds, loi } = parseHocVien(csvHocVien(CSV));
	expect(loi).toEqual([]);
	for (const cau of sqlHocVien(ds).split(';\n').filter((x) => x.trim())) await db.prepare(cau).run();

	const ten = (await db.prepare('SELECT ho_ten FROM hoc_vien_cho_phep ORDER BY id').all<{ ho_ten: string }>()).results.map((r) => r.ho_ten);
	expect(ten).toEqual(['Trần Thị Bình', 'Maria Lê Phương Lan', 'Vinh Sơn, Đỗ "Văn" Hậu', 'Phạm Đức Hải (dự tòng)']);
	expect((await timHocVien(db, 'le phuong lan')).map((r) => r.ho_ten)).toEqual(['Maria Lê Phương Lan']);
	expect((await timHocVien(db, 'pham duc hai')).map((r) => r.ho_ten)).toEqual(['Phạm Đức Hải (dự tòng)']);
	expect((await timHocVien(db, "do 'van' hau")).length).toBe(0);
	expect((await timHocVien(db, 'văn hậu')).length).toBe(1);

	// Chạy lại lần hai: idempotent
	for (const cau of sqlHocVien(ds).split(';\n').filter((x) => x.trim())) await db.prepare(cau).run();
	expect((await db.prepare('SELECT COUNT(*) n FROM hoc_vien_cho_phep').first<{ n: number }>())!.n).toBe(4);
});
