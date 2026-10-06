<script lang="ts">
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

	<div class="card card-border mt-4">
		<div class="card-body">
			<h2 class="text-lg font-semibold">Mở khóa học viên</h2>
			<p class="text-sm opacity-85">
				Dùng khi học viên bị văng ra và không vào lại được (báo "đã có lượt thi") vì mất phiên trên máy: xóa dữ liệu trình duyệt, chế độ riêng
				tư, đổi máy. Sau khi mở khóa, học viên tìm và chọn lại tên của mình để làm tiếp, đồng hồ vẫn chạy từ lúc bắt đầu.
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
							{:else if h.tiep_tuc}
								<span class="badge badge-success">Đã mở khóa</span>
							{:else}
								<button class="btn" onclick={() => moKhoa(h)}>Mở khóa</button>
							{/if}
						</li>
					{/each}
				</ul>
			{/if}
			<div aria-live="polite">
				{#if moKq}<div class={['alert alert-soft', moKq.kieu === 'ok' ? 'alert-success' : 'alert-error']} role={moKq.kieu === 'ok' ? 'status' : 'alert'}>{moKq.noiDung}</div>{/if}
			</div>
		</div>
	</div>
</div>
