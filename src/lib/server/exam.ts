export type CauHoi = {
	ma: string;
	loai: 'TN' | 'DK' | 'TL';
	nhom: string;
	noi_dung: string;
	lua_chon: string | null; // JSON string[]
	dap_an: number | null; // chỉ số trong lua_chon gốc
	diem: number;
};

/** Một câu trong đề của học viên, theo thứ tự hiển thị. thu_tu[i] = chỉ số gốc của lựa chọn hiển thị thứ i. */
export type MucDe = { ma: string; thu_tu?: number[] };

/** Số nguyên ngẫu nhiên đều trong [0, n), không lệch (rejection sampling). */
export function randomInt(n: number): number {
	const limit = Math.floor(0x1_0000_0000 / n) * n;
	const buf = new Uint32Array(1);
	do crypto.getRandomValues(buf);
	while (buf[0] >= limit);
	return buf[0] % n;
}

/** Fisher–Yates, trả mảng mới. */
export function shuffle<T>(a: readonly T[]): T[] {
	const r = [...a];
	for (let i = r.length - 1; i > 0; i--) {
		const j = randomInt(i + 1);
		[r[i], r[j]] = [r[j], r[i]];
	}
	return r;
}

// Lựa chọn dạng "Cả A, B và C", "Tất cả đều đúng", "Không có đáp án nào đúng"... luôn giữ nguyên vị trí gốc khi xáo.
const CO_DINH = /^(cả|tất cả|các ý trên|không có (đáp án|câu|ý) nào|[A-D]\s*(,|và)\s*[A-D](?![\p{L}]))/iu;
const CHU_CAI = /(?<![\p{L}])([A-D])(?![\p{L}])/gu;

/**
 * Thứ tự hiển thị các lựa chọn: thu_tu[i] = chỉ số gốc của lựa chọn hiển thị thứ i.
 * Lựa chọn khớp CO_DINH giữ nguyên vị trí, các lựa chọn còn lại xáo trong những vị trí còn trống.
 * Nếu một lựa chọn cố định nêu chữ cái cụ thể mà không phải "tất cả các lựa chọn còn lại" (ví dụ "Cả A và C"),
 * nghĩa của nó phụ thuộc vị trí A, C nên cả câu giữ nguyên thứ tự gốc. "Cả A, B và C" đặt ở D thì vẫn xáo được A, B, C.
 */
export function thuTuLuaChon(luaChon: readonly string[]): number[] {
	const n = luaChon.length;
	const goc = [...Array(n).keys()];
	const coDinh = goc.filter((i) => CO_DINH.test(luaChon[i].trim()));
	const dongBang = coDinh.some((i) => {
		const tamChieu = new Set([...luaChon[i].matchAll(CHU_CAI)].map((m) => m[1].charCodeAt(0) - 65));
		return tamChieu.size > 0 && (tamChieu.size !== n - 1 || tamChieu.has(i) || [...tamChieu].some((c) => c >= n));
	});
	if (dongBang || coDinh.length >= n - 1) return goc;
	const tu_do = shuffle(goc.filter((i) => !coDinh.includes(i)));
	return goc.map((i) => (coDinh.includes(i) ? i : tu_do.shift()!));
}

/** Một phần của đề (theo thứ tự). xao_tron=false: lấy so_cau câu đầu của nhóm theo thứ tự trong ngân hàng, không xáo. */
export type Phan = { nhom: string; so_cau: number; xao_tron: boolean };

/** Bốc đề theo từng phần, giữ thứ tự các phần; xáo thứ tự câu trong phần (nếu xao_tron) và thứ tự lựa chọn của câu TN. */
export function taoDe(nganHang: readonly CauHoi[], phan: readonly Phan[]): MucDe[] {
	const chon: CauHoi[] = [];
	for (const { nhom, so_cau: n, xao_tron } of phan) {
		const pool = nganHang.filter((q) => q.nhom === nhom);
		if (pool.length < n) throw new Error(`Nhóm "${nhom}" cần ${n} câu nhưng ngân hàng chỉ có ${pool.length}.`);
		chon.push(...(xao_tron ? shuffle(pool) : pool).slice(0, n));
	}
	return chon.map((q) =>
		q.loai === 'TN'
			? { ma: q.ma, thu_tu: thuTuLuaChon(JSON.parse(q.lua_chon!)) }
			: { ma: q.ma }
	);
}

/** Tổng điểm trắc nghiệm. dapAn[ma] là chỉ số lựa chọn theo thứ tự hiển thị. */
export function chamTN(de: readonly MucDe[], cauHoi: ReadonlyMap<string, CauHoi>, dapAn: Record<string, number>) {
	let diem = 0;
	let toiDa = 0;
	for (const m of de) {
		const q = cauHoi.get(m.ma);
		if (!q || q.loai !== 'TN' || !m.thu_tu) continue;
		toiDa += q.diem;
		const c = dapAn[m.ma];
		if (Number.isInteger(c) && m.thu_tu[c] === q.dap_an) diem += q.diem;
	}
	return { diem, toiDa };
}

/** Luật thời gian, tính hoàn toàn từ started_at do server ghi. */
export function thoiGian(startedAt: number, now: number, thoiLuongGiay: number, dungSaiGiay: number) {
	const T = thoiLuongGiay * 1000;
	const daLam = now - startedAt;
	return {
		conLaiMs: Math.max(0, T - daLam),
		nopDuocSauMs: Math.max(0, T / 2 - daLam),
		duocNop: daLam >= T / 2,
		tre: daLam > T + dungSaiGiay * 1000
	};
}

const GIOI_HAN_O = 48_000; // Google Sheets: tối đa 50.000 ký tự mỗi ô

/**
 * Bài đã nộp dưới dạng chữ (để lưu một ô trong Google Sheet): mỗi câu theo đúng thứ tự học viên thấy, đáp án đã chọn (theo chữ cái
 * hiển thị), đúng/sai kèm đáp án đúng với câu trắc nghiệm, và câu trả lời của câu điền chỗ trống/tự luận.
 */
export function baiNopThanhChu(
	de: readonly MucDe[],
	cauHoi: ReadonlyMap<string, CauHoi>,
	tn: Record<string, number>,
	tl: Record<string, string>
): string {
	const chu = (i: number) => String.fromCharCode(65 + i);
	const khoi = de.flatMap((m, i) => {
		const q = cauHoi.get(m.ma);
		if (!q) return [];
		const dau = `Câu ${i + 1} [${q.ma}] (${q.diem} điểm): ${q.noi_dung}`;
		if (!m.thu_tu) return [`${dau}\n  ${tl[m.ma]?.trim() ? `Trả lời: ${tl[m.ma]}` : 'Không trả lời'}`];
		const goc: string[] = JSON.parse(q.lua_chon!);
		const hienThi = m.thu_tu.map((j) => goc[j]);
		const dung = m.thu_tu.indexOf(q.dap_an as number);
		const c = tn[m.ma];
		const dapAnDung = `đáp án đúng: ${chu(dung)}. ${hienThi[dung]}`;
		if (c === undefined) return [`${dau}\n  Không trả lời (${dapAnDung})`];
		return [`${dau}\n  Chọn: ${chu(c)}. ${hienThi[c]} → ${c === dung ? 'ĐÚNG' : `SAI (${dapAnDung})`}`];
	});
	const s = khoi.join('\n\n');
	return s.length > GIOI_HAN_O ? s.slice(0, GIOI_HAN_O) + '\n… (đã cắt bớt vì vượt giới hạn của một ô Google Sheet)' : s;
}
