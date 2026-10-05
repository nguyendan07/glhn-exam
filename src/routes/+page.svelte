<script lang="ts">
	import { goto } from '$app/navigation';
	import logo from '#lib/assets/gpthaibinh90years.webp';

	// Nội dung trang chào: sửa tại đây.
	const TIEU_DE = 'Chào mừng bạn đến với kỳ thi';
	const PHU_DE = 'Hãy nhập tên của bạn để tìm và bắt đầu làm bài.';

	type HocVien = { id: number; ten_thanh: string; ho_ten: string; giao_xu: string; giao_phan: string; da_thi: boolean };
	const ten = (h: HocVien) => [h.ten_thanh, h.ho_ten].filter(Boolean).join(' ');
	const noi = (h: HocVien) => [h.giao_xu, h.giao_phan].filter(Boolean).join(', ');

	let q = $state('');
	let ds = $state<HocVien[]>([]);
	let daTim = $state(false); // đã có kết quả cho chuỗi đang gõ
	let chon = $state<HocVien | null>(null);
	let loi = $state('');
	let dangGui = $state(false);
	let hen: ReturnType<typeof setTimeout> | undefined;
	let huy: AbortController | undefined;

	function gõ() {
		chon = null;
		loi = '';
		daTim = false;
		clearTimeout(hen);
		huy?.abort();
		if (q.trim().length < 2) {
			ds = [];
			return;
		}
		hen = setTimeout(async () => {
			huy = new AbortController();
			try {
				const r = await fetch(`/api/tim-kiem?q=${encodeURIComponent(q.trim())}`, { signal: huy.signal });
				if (!r.ok) throw new Error();
				ds = (await r.json()) as HocVien[];
				daTim = true;
			} catch (e) {
				if ((e as Error).name !== 'AbortError') loi = 'Không tìm được. Kiểm tra mạng và thử lại.';
			}
		}, 250);
	}

	async function batDau() {
		if (!chon || dangGui) return;
		if (!confirm(`Bạn là ${ten(chon)}? Đồng hồ sẽ bắt đầu chạy ngay khi bạn bấm OK.`)) return;
		loi = '';
		dangGui = true;
		try {
			const r = await fetch('/api/start', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ hoc_vien_id: chon.id })
			});
			const d: any = await r.json();
			if (!r.ok) loi = d.error ?? 'Có lỗi xảy ra, vui lòng thử lại.';
			else await goto(d.trang_thai === 'da_nop' ? '/ket-qua' : '/thi', { replaceState: true });
		} catch {
			loi = 'Không kết nối được máy chủ. Kiểm tra mạng và thử lại.';
		} finally {
			dangGui = false;
		}
	}
</script>

<div class="mx-auto max-w-xl">
	<header class="mb-6 text-center">
		<img src={logo} alt="Giáo phận Thái Bình 90 năm (1936 - 2026)" width="319" height="315" class="mx-auto mb-4 h-32 w-auto md:h-40" />
		<h1 class="text-3xl font-bold md:text-4xl">{TIEU_DE}</h1>
		<p class="mt-2 text-base-content/70">{PHU_DE}</p>
	</header>

	<div class="card card-border bg-base-100">
		<div class="card-body">
			<div class="fieldset">
				<label class="fieldset-legend" for="ten">Họ và tên</label>
				<input
					id="ten"
					class="input w-full"
					type="text"
					bind:value={q}
					oninput={gõ}
					maxlength="100"
					autocomplete="off"
					aria-describedby="h-ten"
					aria-controls="kq-tim"
				/>
				<p class="label whitespace-normal" id="h-ten">
					Có Tên Thánh thì ghi kèm, ví dụ: Phêrô Nguyễn Văn An. Chưa có Tên Thánh thì chỉ cần ghi họ và tên.
				</p>
			</div>

			<div id="kq-tim" aria-live="polite">
				{#if chon}
					<div class="alert alert-success alert-soft">
						<div>
							<div class="font-semibold">{ten(chon)}</div>
							{#if noi(chon)}<div class="text-sm">{noi(chon)}</div>{/if}
						</div>
					</div>
				{:else if ds.length}
					<ul class="menu w-full rounded-box border border-base-300 p-1">
						{#each ds as h (h.id)}
							<li>
								{#if h.da_thi}
									<div class="pointer-events-none flex flex-col items-start">
										<span class="font-semibold">{ten(h)}</span>
										{#if noi(h)}<span class="text-sm opacity-70">{noi(h)}</span>{/if}
										<span class="text-sm text-warning">Đã có lượt thi. Nếu đây là bạn, hãy liên hệ giám thị.</span>
									</div>
								{:else}
									<button type="button" onclick={() => (chon = h)}>
										<span class="flex flex-col items-start text-left">
											<span class="font-semibold">{ten(h)}</span>
											{#if noi(h)}<span class="text-sm opacity-70">{noi(h)}</span>{/if}
										</span>
									</button>
								{/if}
							</li>
						{/each}
					</ul>
				{:else if daTim}
					<div class="alert alert-warning alert-soft">
						Không thấy tên bạn trong danh sách. Hãy kiểm tra lại cách gõ hoặc liên hệ giám thị.
					</div>
				{/if}
			</div>

			{#if loi}<div class="alert alert-error" role="alert">{loi}</div>{/if}

			<button class="btn btn-primary btn-block mt-2" type="button" disabled={!chon || dangGui} onclick={batDau}>
				{#if dangGui}<span class="loading loading-spinner"></span>Đang xử lý...{:else}Bắt đầu thi{/if}
			</button>
		</div>
	</div>
</div>
