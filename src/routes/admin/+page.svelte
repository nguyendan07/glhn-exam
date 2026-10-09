<script lang="ts">
	import { untrack } from 'svelte';
	import type { PageProps } from './$types';
	let { data }: PageProps = $props();
	let gioThi = $state(untrack(() => new Date(data.lich.mo_thi_luc + 7 * 3600000).toISOString().slice(0, 16)));
	let dangLuuLich = $state(false);
	let thongBaoLich = $state('');
	async function luuLich() {
		dangLuuLich = true;
		thongBaoLich = '';
		try {
			const r = await fetch('/api/admin/lich-thi', {
				method: 'POST',
				headers: { 'content-type': 'application/json', authorization: `Bearer ${token.trim()}` },
				body: JSON.stringify({ thoi_gian: gioThi })
			});
			const b = await r.json() as { error?: string };
			thongBaoLich = r.ok ? 'Đã lưu giờ mở thi.' : (b.error ?? 'Không lưu được giờ thi.');
		} catch { thongBaoLich = 'Không kết nối được máy chủ. Vui lòng thử lại.'; }
		finally { dangLuuLich = false; }
	}

	import { trinhDuyet } from '#lib/trinh-duyet.ts';
	type Viec = 'import' | 'resync';
	type Kq = { kieu: 'ok' | 'loi' | 'xung_dot'; tieuDe: string; dong: string[]; canhBao: string[] };

	let token = $state('');
	let dangChay = $state<Viec | null>(null);
	let kq = $state<Kq | null>(null);

	async function chay(viec: Viec, force = false) {
		if (!token.trim()) {
			kq = { kieu: 'loi', tieuDe: 'Vui lòng nhập mã quản trị.', dong: [], canhBao: [] };
			return;
		}
		dangChay = viec;
		kq = null;
		try {
			const r = await fetch(`/api/admin/${viec}${force ? '?force=1' : ''}`, {
				method: 'POST',
				// Bắt buộc JSON: SvelteKit chặn POST kiểu form/không có Content-Type từ nơi khác (lỗi "Cross-site POST").
				headers: { 'content-type': 'application/json', authorization: `Bearer ${token.trim()}` },
				body: '{}'
			});
			const b: any = await r.json().catch(() => ({}));
			kq = dienGiai(viec, r.status, b);
		} catch {
			kq = { kieu: 'loi', tieuDe: 'Không kết nối được máy chủ. Kiểm tra mạng và thử lại.', dong: [], canhBao: [] };
		} finally {
			dangChay = null;
		}
	}

	// --- Mở khóa học viên bị văng ra (mất cookie phiên) ---
	type HocVien = { id: number; ten_thanh: string; ho_ten: string; giao_xu: string; giao_phan: string; da_thi: boolean; tiep_tuc: boolean };
	const ten = (h: HocVien) => [h.ten_thanh, h.ho_ten].filter(Boolean).join(' ');
	let tim = $state('');
	let dsTim = $state<HocVien[]>([]);
	let moKq = $state<{ kieu: 'ok' | 'loi'; noiDung: string } | null>(null);
	let henTim: ReturnType<typeof setTimeout> | undefined;

	// --- Nhật ký bài thi của một học viên ---
	type SuKien = { luc: number; su_kien: string; chi_tiet: any; may: any };
	type NhatKy = { luot: any; su_kien: SuKien[] };
	let nk = $state<NhatKy | null>(null);

	const gio = (ms: number | null) =>
		ms ? new Date(ms).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', hour12: false }) : '—';
	const viTri = (m: any) => [m.thanh_pho, m.vung !== m.thanh_pho ? m.vung : '', m.quoc_gia].filter(Boolean).join(', ') || 'không rõ vị trí';

	function moTa(e: SuKien): string {
		const c = e.chi_tiet ?? {};
		switch (e.su_kien) {
			case 'bat_dau': return 'Bắt đầu làm bài';
			case 'tiep_tuc': return c.sau_mo_khoa ? 'Vào lại bài thi (sau khi giám thị mở khóa)' : 'Vào lại bài thi';
			case 'tu_choi': return c.ly_do === 'da_nop' ? 'Bị chặn: có người thử vào lượt thi đã nộp' : 'Bị chặn: có thiết bị khác thử vào lượt đang thi';
			case 'roi_man_hinh': return `Rời màn hình ${c.giay} giây`;
			case 'doi_may': return 'Máy hoặc địa chỉ IP thay đổi';
			case 'nop': return `Nộp bài${c.nop_tre ? ' (TRỄ)' : ''}, điểm trắc nghiệm ${c.diem_tn}`;
			case 'mo_khoa': return 'Giám thị mở khóa lượt thi';
			default: return e.su_kien;
		}
	}

	// Các máy khác nhau theo thứ tự xuất hiện, và các tín hiệu đáng chú ý.
	const dsMay = $derived.by(() => {
		const thay = new Map<string, { luc: number; may: any }>();
		for (const e of nk?.su_kien ?? []) if (e.may && !thay.has(JSON.stringify(e.may))) thay.set(JSON.stringify(e.may), { luc: e.luc, may: e.may });
		return [...thay.values()];
	});
	const tinHieu = $derived.by(() => {
		const ds = nk?.su_kien ?? [];
		const roi = ds.filter((e) => e.su_kien === 'roi_man_hinh');
		return [
			roi.length && `Rời màn hình ${roi.length} lần, tổng ${roi.reduce((t, e) => t + (e.chi_tiet?.giay ?? 0), 0)} giây`,
			dsMay.length > 1 && `Dùng ${dsMay.length} máy/IP khác nhau`,
			ds.filter((e) => e.su_kien === 'tu_choi').length && `${ds.filter((e) => e.su_kien === 'tu_choi').length} lần thiết bị khác thử vào bị chặn`,
			ds.some((e) => e.su_kien === 'nop' && e.chi_tiet?.nop_tre) && 'Nộp trễ'
		].filter(Boolean) as string[];
	});

	async function xemNk(h: HocVien) {
		if (!token.trim()) {
			moKq = { kieu: 'loi', noiDung: 'Vui lòng nhập mã quản trị ở phía trên.' };
			return;
		}
		moKq = null;
		const r = await fetch('/api/admin/nhat-ky', {
			method: 'POST',
			headers: { 'content-type': 'application/json', authorization: `Bearer ${token.trim()}` },
			body: JSON.stringify({ hoc_vien_id: h.id })
		}).catch(() => null);
		const b: any = await r?.json().catch(() => ({}));
		if (r?.ok) nk = b;
		else moKq = { kieu: 'loi', noiDung: r?.status === 401 ? 'Sai mã quản trị.' : (b?.error ?? 'Không tải được nhật ký.') };
	}

	function taiJson() {
		if (!nk) return;
		const a = document.createElement('a');
		a.href = URL.createObjectURL(new Blob([JSON.stringify(nk, null, 2)], { type: 'application/json' }));
		a.download = `nhat-ky-${nk.luot.ten.replace(/\s+/g, '-')}.json`;
		a.click();
		URL.revokeObjectURL(a.href);
	}

	function gõTim() {
		clearTimeout(henTim);
		moKq = null;
		if (tim.trim().length < 2) {
			dsTim = [];
			return;
		}
		henTim = setTimeout(async () => {
			const r = await fetch(`/api/tim-kiem?q=${encodeURIComponent(tim.trim())}`).catch(() => null);
			if (r?.ok) dsTim = (await r.json()) as HocVien[];
		}, 250);
	}

	async function moKhoa(h: HocVien) {
		if (!token.trim()) {
			moKq = { kieu: 'loi', noiDung: 'Vui lòng nhập mã quản trị ở phía trên.' };
			return;
		}
		const r = await fetch('/api/admin/mo-khoa', {
			method: 'POST',
			headers: { 'content-type': 'application/json', authorization: `Bearer ${token.trim()}` },
			body: JSON.stringify({ hoc_vien_id: h.id })
		}).catch(() => null);
		const b: any = await r?.json().catch(() => ({}));
		if (r?.ok) {
			moKq = { kieu: 'ok', noiDung: `Đã mở khóa ${b.ten}. Bảo học viên mở lại trang thi, gõ và chọn lại tên của mình để tiếp tục.` };
			h.tiep_tuc = true;
		} else moKq = { kieu: 'loi', noiDung: r?.status === 401 ? 'Sai mã quản trị.' : (b?.error ?? 'Không mở khóa được.') };
	}

	function dienGiai(viec: Viec, status: number, b: any): Kq {
		if (status === 401) return { kieu: 'loi', tieuDe: 'Sai mã quản trị, hoặc chưa đặt ADMIN_TOKEN trên Cloudflare (cần từ 16 ký tự).', dong: [], canhBao: [] };
		if (status === 409)
			return {
				kieu: 'xung_dot',
				tieuDe: String(b.error ?? 'Đang có lượt thi chưa nộp.').replace(/\s*Thêm \?force=1.*$/, ''),
				dong: ['Nạp lại lúc này có thể làm lệch đề của người đang thi. Chỉ nạp khi thật sự cần.'],
				canhBao: []
			};
		if (status !== 200) return { kieu: 'loi', tieuDe: b.error ?? `Lỗi ${status}.`, dong: b.chi_tiet ?? [], canhBao: [] };
		if (viec === 'import')
			return {
				kieu: 'ok',
				tieuDe: 'Đã nạp thành công.',
				dong: [
					`${b.cau_hoi} câu hỏi, ${b.phan_thi} phần thi, ${b.hoc_vien} học viên`,
					b.thoi_luong_phut ? `Thời gian làm bài: ${b.thoi_luong_phut} phút` : 'Thời gian làm bài: giữ nguyên (Sheet không có tab ThongTin)'
				],
				canhBao: b.canh_bao ?? []
			};
		return {
			kieu: 'ok',
			tieuDe: b.da_dong_bo ? `Đã đồng bộ ${b.da_dong_bo} bài lên Google Sheets.` : 'Không có bài nào cần đồng bộ.',
			dong: b.da_dong_bo ? [`Cập nhật ${b.cap_nhat} hàng, thêm mới ${b.them_moi} hàng`] : [],
			canhBao: []
		};
	}
</script>

<svelte:head>
	<title>Quản trị</title>
	<meta name="robots" content="noindex" />
</svelte:head>

<div class="mx-auto max-w-xl">
	<h1 class="mb-1 text-[28px] leading-9 font-semibold">Quản trị kỳ thi</h1>
	<p class="mb-4 text-base-content/70">Dành cho giám thị. Mã quản trị là giá trị <code>ADMIN_TOKEN</code> đã đặt trên Cloudflare.</p>

	<div class="card card-border">
		<div class="card-body">
			<div class="fieldset">
				<label class="fieldset-legend" for="token">Mã quản trị</label>
				<input id="token" class="input w-full" type="password" bind:value={token} autocomplete="off" />
			</div>

			<div>
				<button class="btn btn-primary btn-block" disabled={dangChay !== null} onclick={() => chay('import')}>
					{#if dangChay === 'import'}<span class="loading loading-spinner"></span>Đang nạp...{:else}Nạp đề thi và danh sách học viên{/if}
				</button>
				<p class="mt-1 text-sm opacity-85">Đọc các tab CauHoi, PhanThi, HocVien, ThongTin từ Google Sheet. Chạy lại bao nhiêu lần cũng được.</p>
			</div>

			<div>
				<button class="btn btn-block" disabled={dangChay !== null} onclick={() => chay('resync')}>
					{#if dangChay === 'resync'}<span class="loading loading-spinner"></span>Đang đồng bộ...{:else}Đồng bộ lại{/if}
				</button>
				<p class="mt-1 text-sm opacity-85">Đẩy lại các bài đã nộp nhưng chưa lên được Google Sheet.</p>
			</div>

			<div aria-live="polite">
				{#if kq}
					<div class={['alert', kq.kieu === 'ok' ? 'alert-success' : kq.kieu === 'xung_dot' ? 'alert-warning' : 'alert-error', 'alert-soft items-start']} role={kq.kieu === 'ok' ? 'status' : 'alert'}>
						<div>
							<p class="font-semibold">{kq.tieuDe}</p>
							{#each kq.dong as d (d)}<p class="text-sm">{d}</p>{/each}
							{#if kq.kieu === 'xung_dot'}
								<button class="btn mt-2" disabled={dangChay !== null} onclick={() => chay('import', true)}>Vẫn nạp (bỏ qua kiểm tra)</button>
							{/if}
						</div>
					</div>
					{#if kq.canhBao.length}
						<div class="alert alert-warning alert-soft mt-2 items-start">
							<div>
								<p class="font-semibold">Cần xem lại:</p>
								<ul class="list-disc pl-5 text-sm">
									{#each kq.canhBao as c (c)}<li>{c}</li>{/each}
								</ul>
							</div>
						</div>
					{/if}
				{/if}
			</div>
		</div>
	</div>

	<form class="card card-border mt-4" onsubmit={(e) => { e.preventDefault(); void luuLich(); }}>
		<div class="card-body">
			<h2 class="text-lg font-semibold">Thời gian mở thi</h2>
			<label class="fieldset-legend" for="gio-thi">Ngày và giờ thi (Việt Nam, UTC+7)</label>
			<input id="gio-thi" class="input w-full" type="datetime-local" required bind:value={gioThi} />
			<p class="text-sm opacity-85">Trước giờ này, học viên thấy màn đếm ngược. Thay đổi không ảnh hưởng lượt đang thi.</p>
			<button class="btn btn-primary" disabled={dangLuuLich || !token.trim()}>{dangLuuLich ? 'Đang lưu...' : 'Lưu giờ mở thi'}</button>
			<p role="status">{thongBaoLich}</p>
		</div>
	</form>

	<div class="card card-border mt-4">
		<div class="card-body">
			<h2 class="text-lg font-semibold">Học viên: mở khóa và xem nhật ký bài thi</h2>
			<p class="text-sm opacity-85">
				Dùng khi học viên bị văng ra và không vào lại được (báo "đã có lượt thi") vì mất phiên trên máy: xóa dữ liệu trình duyệt, chế độ riêng
				tư, đổi máy. Sau khi mở khóa, học viên tìm và chọn lại tên của mình để làm tiếp, đồng hồ vẫn chạy từ lúc bắt đầu.
				<b>Xem nhật ký</b> cho thấy diễn biến (vào lại, rời màn hình, đổi máy), địa chỉ IP, vị trí ước tính và trình duyệt để đối chiếu khi cần.
			</p>
			<div class="fieldset">
				<label class="fieldset-legend" for="tim-mo-khoa">Tên học viên</label>
				<input id="tim-mo-khoa" class="input w-full" type="text" bind:value={tim} oninput={gõTim} autocomplete="off" />
			</div>
			{#if dsTim.length}
				<ul class="divide-y divide-base-300 rounded-box border border-base-300">
					{#each dsTim as h (h.id)}
						<li class="flex items-center justify-between gap-3 p-3">
							<div class="min-w-0">
								<p class="font-semibold">{ten(h)}</p>
								<p class="text-sm opacity-85">{[h.giao_xu, h.giao_phan].filter(Boolean).join(', ') || 'Chưa có giáo xứ'}</p>
							</div>
							{#if !h.da_thi}
								<span class="text-sm opacity-85">Chưa thi</span>
							{:else}
								<div class="flex flex-wrap justify-end gap-2">
									<button class="btn" onclick={() => xemNk(h)}>Xem nhật ký</button>
									{#if h.tiep_tuc}
										<span class="badge badge-success self-center">Đã mở khóa</span>
									{:else}
										<button class="btn" onclick={() => moKhoa(h)}>Mở khóa</button>
									{/if}
								</div>
							{/if}
						</li>
					{/each}
				</ul>
			{/if}
			<div aria-live="polite">
				{#if moKq}<div class={['alert alert-soft', moKq.kieu === 'ok' ? 'alert-success' : 'alert-error']} role={moKq.kieu === 'ok' ? 'status' : 'alert'}>{moKq.noiDung}</div>{/if}
			</div>

			{#if nk}
				<section class="space-y-4 rounded-box border border-base-300 p-4" aria-label="Nhật ký bài thi">
					<div class="flex flex-wrap items-center justify-between gap-2">
						<h3 class="text-lg font-semibold">Nhật ký: {nk.luot.ten}</h3>
						<div class="flex gap-2">
							<button class="btn" onclick={taiJson}>Tải JSON</button>
							<button class="btn" onclick={() => (nk = null)}>Đóng</button>
						</div>
					</div>
					<dl class="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 [&_dd]:font-semibold">
						<dt>Bắt đầu</dt><dd>{gio(nk.luot.bat_dau)}</dd>
						<dt>Nộp bài</dt><dd>{nk.luot.nop ? gio(nk.luot.nop) + (nk.luot.nop_tre ? ' (trễ)' : '') : 'Chưa nộp'}</dd>
						<dt>Điểm trắc nghiệm</dt><dd>{nk.luot.diem_tn ?? '—'}</dd>
					</dl>
					{#if tinHieu.length}
						<div class="alert alert-warning alert-soft items-start"><ul class="list-disc pl-5">{#each tinHieu as t (t)}<li>{t}</li>{/each}</ul></div>
					{:else}
						<p class="text-sm opacity-85">Không có dấu hiệu bất thường: không rời màn hình, một máy duy nhất.</p>
					{/if}

					<div>
						<h4 class="font-semibold">Máy đã dùng</h4>
						<ul class="mt-1 space-y-1 text-sm">
							{#each dsMay as m (m.luc)}
								<li><b>{gio(m.luc)}</b>: IP {m.may.ip || '?'} · {viTri(m.may)}{m.may.nha_mang ? ' · ' + m.may.nha_mang : ''} · {trinhDuyet(m.may.ua)}</li>
							{:else}
								<li class="opacity-85">Chưa ghi nhận thông tin máy.</li>
							{/each}
						</ul>
					</div>

					<div>
						<h4 class="font-semibold">Diễn biến ({nk.su_kien.length} sự kiện)</h4>
						<ol class="mt-1 max-h-96 space-y-1 overflow-y-auto text-sm">
							{#each nk.su_kien as e, i (i)}
								<li class="flex gap-3"><span class="shrink-0 font-semibold tabular-nums">{gio(e.luc)}</span><span>{moTa(e)}</span></li>
							{/each}
						</ol>
					</div>
					<p class="text-sm opacity-85">Bài làm đã nộp xem ở Google Sheet, tab KetQua, cột "Bài đã nộp".</p>
				</section>
			{/if}
		</div>
	</div>
</div>
