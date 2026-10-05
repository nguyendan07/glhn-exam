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
			? { ma: q.ma, thu_tu: shuffle([...JSON.parse(q.lua_chon!).keys()] as number[]) }
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
