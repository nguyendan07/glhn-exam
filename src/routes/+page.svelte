<script lang="ts">
	import { goto } from '$app/navigation';
	import { onMount, tick, untrack } from 'svelte';
	import logo from '#lib/assets/gpthaibinh90years.webp';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
	const tt = $derived(data.thongTin);
	let moThiLuc = $state(untrack(() => data.lich.mo_thi_luc));
	let bayGio = $state(untrack(() => data.lich.bay_gio));
	let daXacNhanMo = $state(untrack(() => !data.lich.on_dem_nguoc || data.lich.bay_gio >= data.lich.mo_thi_luc));
	const conLai = $derived(Math.max(0, Math.ceil((moThiLuc - bayGio) / 1000)));
	const cacMoc = $derived([
		{ so: Math.floor(conLai / 86400), ten: 'Ngày' },
		{ so: Math.floor(conLai / 3600) % 24, ten: 'Giờ' },
		{ so: Math.floor(conLai / 60) % 60, ten: 'Phút' },
		{ so: conLai % 60, ten: 'Giây' }
	]);
	onMount(() => {
		let goc = performance.now();
		let gioMayChu = data.lich.bay_gio;
		let dangTai = false;
		const huyLich = new AbortController();
		async function dongBo() {
			if (dangTai) return;
			dangTai = true;
			try {
				const r = await fetch('/api/lich-thi', { signal: huyLich.signal, cache: 'no-store' });
				if (!r.ok) return;
				const lich = await r.json() as { mo_thi_luc: number; bay_gio: number; on_dem_nguoc: boolean };
				moThiLuc = lich.mo_thi_luc;
				gioMayChu = lich.bay_gio;
				goc = performance.now();
				bayGio = gioMayChu;
				daXacNhanMo = !lich.on_dem_nguoc || bayGio >= moThiLuc;
			} catch { /* Thử lại ở lần đồng bộ tiếp theo. */ }
			finally { dangTai = false; }
		}
		void dongBo();
		const dem = setInterval(() => {
			bayGio = gioMayChu + performance.now() - goc;
			if (!daXacNhanMo && bayGio >= moThiLuc) void dongBo();
		}, 1000);
		const capNhat = setInterval(dongBo, 15000);
		return () => { clearInterval(dem); clearInterval(capNhat); huyLich.abort(); };
	});


	// Chữ mặc định khi chưa nạp tab ThongTin từ Google Sheet.
	const TIEU_DE = 'Chào mừng bạn đến với kỳ thi Giáo Lý Hôn Nhân (2026)';
	const PHU_DE = '(thời gian làm bài 90 phút)';

	type HocVien = { id: number; ten_thanh: string; ho_ten: string; giao_xu: string; giao_phan: string; da_thi: boolean; tiep_tuc: boolean };
	const ten = (h: HocVien) => [h.ten_thanh, h.ho_ten].filter(Boolean).join(' ');
	const noi = (h: HocVien) => [h.giao_xu, h.giao_phan].filter(Boolean).join(', ');

	let q = $state('');
	let ds = $state<HocVien[]>([]);
	let daTim = $state(false); // đã có kết quả cho chuỗi đang gõ
	let chon = $state<HocVien | null>(null);
	let nutBatDau = $state<HTMLButtonElement>();
	let hopXacNhan: HTMLDialogElement;
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

	// Chọn một dòng: điền tên vào ô nhập, đóng danh sách, chuyển focus sang nút bắt đầu.
	function chonHocVien(h: HocVien) {
		clearTimeout(hen);
		huy?.abort();
		chon = h;
		q = ten(h);
		loi = '';
		tick().then(() => nutBatDau?.focus());
	}

	async function batDau() {
		if (!chon || dangGui) return;
		loi = '';
		dangGui = true;
		try {
			const r = await fetch('/api/start', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ hoc_vien_id: chon.id })
			});
			const d: any = await r.json();
			if (!r.ok) {
				hopXacNhan.close();
				loi = d.error ?? 'Có lỗi xảy ra, vui lòng thử lại.';
			}
			else await goto(d.trang_thai === 'da_nop' ? '/ket-qua' : '/thi', { replaceState: true });
		} catch {
			hopXacNhan.close();
			loi = 'Không kết nối được máy chủ. Kiểm tra mạng và thử lại.';
		} finally {
			dangGui = false;
		}
	}
</script>

<div class="mx-auto max-w-xl">
	<header class="mb-6 text-center">
		<img src={logo} alt="Giáo phận Thái Bình 90 năm (1936 - 2026)" width="319" height="315" class="mx-auto mb-4 h-32 w-auto md:h-40" />
		{#each tt.to_chuc as dong (dong)}<p class="font-semibold tracking-wide">{dong}</p>{/each}
		<h1 class="mt-2 text-[28px] leading-9 font-semibold md:text-[32px] md:leading-10">{tt.tieu_de ?? TIEU_DE}</h1>
		<p class="mt-2 text-base-content/70">
			{tt.tieu_de && tt.thoi_luong_phut ? `(thời gian làm bài ${tt.thoi_luong_phut} phút)` : PHU_DE}
		</p>
	</header>


	{#if !daXacNhanMo}
		<section class="card card-border bg-base-100 text-center" aria-labelledby="cho-thi">
			<div class="card-body">
				<h2 id="cho-thi" class="text-xl font-semibold">Kỳ thi sẽ bắt đầu sau</h2>
				<p>{new Date(moThiLuc).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', hour12: false })} · Giờ Việt Nam (UTC+7)</p>
				<div class="my-4 grid grid-cols-4 gap-2" role="timer" aria-label="Thời gian còn lại đến giờ thi">
					{#each cacMoc as moc (moc.ten)}
						<div class="rounded-box bg-base-200 px-1 py-4">
							<div class="text-3xl font-semibold tabular-nums md:text-4xl">{String(moc.so).padStart(2, '0')}</div>
							<div class="mt-1 text-sm">{moc.ten}</div>
						</div>
					{/each}
				</div>
				<p class="text-base-content/70">{conLai ? 'Trang sẽ tự mở khi đến giờ thi. Bạn có thể giữ màn hình này để chờ.' : 'Đang xác nhận giờ mở thi với máy chủ. Vui lòng giữ kết nối mạng.'}</p>
			</div>
		</section>
	{:else}
	{#if tt.luu_y.length}
		<section class="mb-4 rounded-box border border-base-300 bg-base-100 p-4" aria-labelledby="luu-y">
			<h2 id="luu-y" class="font-semibold">Lưu ý:</h2>
			<ul class="mt-2 list-disc space-y-1 pl-5">
				{#each tt.luu_y as dong (dong)}<li>{dong}</li>{/each}
			</ul>
		</section>
	{/if}

	<div class="card card-border">
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
					aria-controls="kq-tim"
				/>
			</div>

			<div id="kq-tim" aria-live="polite">
				{#if ds.length && !chon}
					<ul class="menu w-full rounded-box border border-base-300 p-1">
						{#each ds as h (h.id)}
							<li>
								{#if h.da_thi && !h.tiep_tuc}
									<div class="pointer-events-none flex flex-col items-start">
										<span class="font-semibold">{ten(h)}</span>
										{#if noi(h)}<span class="text-sm opacity-85">{noi(h)}</span>{/if}
										<span class="text-sm text-warning">Đã có lượt thi. Nếu đây là bạn, hãy liên hệ giám thị.</span>
									</div>
								{:else}
									<button type="button" onclick={() => chonHocVien(h)}>
										<span class="flex flex-col items-start text-left">
											<span class="font-semibold">{ten(h)}</span>
											{#if noi(h)}<span class="text-sm opacity-85">{noi(h)}</span>{/if}
											{#if h.da_thi}<span class="text-sm text-primary">Bạn đã bắt đầu bài thi này. Chọn để tiếp tục.</span>{/if}
										</span>
									</button>
								{/if}
							</li>
						{/each}
					</ul>
				{:else if daTim && !chon}
					<div class="alert alert-warning alert-soft">
						Không thấy tên bạn trong danh sách. Hãy kiểm tra lại cách gõ hoặc liên hệ giám thị.
					</div>
				{/if}
			</div>

			{#if loi}<div class="alert alert-error" role="alert">{loi}</div>{/if}

			<button bind:this={nutBatDau} class="btn btn-primary btn-block mt-2" type="button" disabled={!chon || dangGui} onclick={() => hopXacNhan.showModal()}>
				{#if dangGui}<span class="loading loading-spinner"></span>Đang xử lý...{:else}Bắt đầu thi{/if}
			</button>
		</div>
	</div>
	{/if}
</div>

<dialog bind:this={hopXacNhan} class="modal" aria-labelledby="bd-title">
	<div class="modal-box">
		<h2 id="bd-title" class="text-xl font-semibold">{chon?.da_thi ? 'Tiếp tục làm bài?' : 'Bắt đầu làm bài?'}</h2>
		{#if chon}
			<p class="py-2">
				Bạn là <b>{ten(chon)}</b>{#if noi(chon)}{' '}({noi(chon)}){/if}?
			</p>
		{/if}
		<p>{chon?.da_thi ? 'Đồng hồ vẫn đang chạy từ lúc bạn bắt đầu.' : 'Đồng hồ sẽ bắt đầu chạy ngay khi bạn bấm "Bắt đầu".'}</p>
		<p class="mt-3 text-sm opacity-85">
			Để đối chiếu khi cần, hệ thống ghi lại địa chỉ IP, vị trí ước tính, trình duyệt và diễn biến làm bài của bạn (các câu đã chọn, số lần rời màn hình thi).
		</p>
		<div class="modal-action">
			<button class="btn" type="button" onclick={() => hopXacNhan.close()} disabled={dangGui}>Chọn lại</button>
			<button class="btn btn-primary" type="button" onclick={batDau} disabled={dangGui}>
				{#if dangGui}<span class="loading loading-spinner"></span>Đang xử lý...{:else}{chon?.da_thi ? 'Tiếp tục' : 'Bắt đầu'}{/if}
			</button>
		</div>
	</div>
	<form method="dialog" class="modal-backdrop"><button>Đóng</button></form>
</dialog>
