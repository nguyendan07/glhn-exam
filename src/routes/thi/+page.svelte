<script lang="ts">
	import { goto } from '$app/navigation';
	import { onMount } from 'svelte';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
	// ponytail: dữ liệu đề cố định trong suốt lượt thi, chỉ đọc một lần
	// svelte-ignore state_referenced_locally
	const d = data;
	const ds = d.cau_hoi;
	const tt = d.thong_tin;

	let dapAn = $state<Record<string, number>>({ ...d.dap_an_tn });
	let tuLuan = $state<Record<string, string>>({ ...d.tu_luan });
	let roiTab = $state(d.so_lan_roi_tab);
	let hienTai = $state(0);
	let now = $state(Date.now());
	// Mốc theo đồng hồ máy học viên, đồng bộ lại sau mỗi lần lưu bằng thời gian còn lại do server trả về.
	let hetGioLuc = $state(Date.now() + d.con_lai_ms);
	let nopDuocLuc = $state(Date.now() + d.nop_duoc_sau_ms);
	let luu = $state<'da_luu' | 'chua_luu' | 'dang_luu' | 'loi'>('da_luu');
	let online = $state(true);
	let dangNop = $state(false);
	let thongBao = $state('');
	let hopXacNhan: HTMLDialogElement;

	let dirty = false;
	let dangGuiLuu: Promise<void> | null = null;
	let henLuu: ReturnType<typeof setTimeout> | undefined;

	const conLai = $derived(Math.max(0, hetGioLuc - now));
	const conChoNop = $derived(Math.max(0, nopDuocLuc - now));
	const daTraLoi = (ma: string) => (ma in dapAn) || !!tuLuan[ma]?.trim();
	const soDaTraLoi = $derived(ds.filter((q) => daTraLoi(q.ma)).length);
	const q = $derived(ds[hienTai]);

	function dinhDang(ms: number) {
		const s = Math.ceil(ms / 1000);
		const h = Math.floor(s / 3600);
		const m = Math.floor((s % 3600) / 60);
		const ss = String(s % 60).padStart(2, '0');
		return h ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
	}

	const baiLam = () => ({ dap_an_tn: dapAn, tu_luan: tuLuan, so_lan_roi_tab: roiTab });

	function dongBo(r: { con_lai_ms?: number; nop_duoc_sau_ms?: number }) {
		if (typeof r.con_lai_ms === 'number') hetGioLuc = Date.now() + r.con_lai_ms;
		if (typeof r.nop_duoc_sau_ms === 'number') nopDuocLuc = Date.now() + r.nop_duoc_sau_ms;
	}

	async function luuBai() {
		if (dangNop) return;
		if (dangGuiLuu) return dangGuiLuu;
		dirty = false;
		luu = 'dang_luu';
		dangGuiLuu = (async () => {
			try {
				const r = await fetch('/api/save', {
					method: 'PUT',
					headers: { 'content-type': 'application/json' },
					body: JSON.stringify(baiLam())
				});
				const j: any = await r.json();
				if (r.ok) {
					dongBo(j);
					luu = dirty ? 'chua_luu' : 'da_luu';
				} else if (j.het_gio) {
					await nop();
				} else if (j.da_nop) {
					await goto('/ket-qua', { replaceState: true });
				} else {
					dirty = true;
					luu = 'loi';
					thongBao = j.error ?? 'Không lưu được bài.';
				}
			} catch {
				dirty = true;
				luu = 'loi';
			} finally {
				dangGuiLuu = null;
			}
		})();
		return dangGuiLuu;
	}

	function daSua(ngay = true) {
		dirty = true;
		luu = 'chua_luu';
		clearTimeout(henLuu);
		henLuu = setTimeout(luuBai, ngay ? 0 : 2000);
	}

	async function nop() {
		if (dangNop) return;
		dangNop = true;
		hopXacNhan?.close();
		thongBao = '';
		try {
			await dangGuiLuu;
			const r = await fetch('/api/submit', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify(baiLam())
			});
			const j: any = await r.json();
			if (r.ok) {
				dirty = false;
				await goto('/ket-qua', { replaceState: true });
				return;
			}
			dongBo(j);
			thongBao = j.error ?? 'Không nộp được bài.';
			dangNop = false;
		} catch {
			// Hết giờ thì vòng tick 1 giây tự gọi lại nop().
			thongBao = 'Mất kết nối khi nộp bài. Vui lòng thử lại.';
			dangNop = false;
		}
	}

	onMount(() => {
		online = navigator.onLine;
		const tick = setInterval(() => {
			now = Date.now();
			if (hetGioLuc - now <= 0 && !dangNop) nop();
		}, 1000);
		const dinhKy = setInterval(luuBai, 30_000);
		const anTab = () => {
			if (document.hidden) {
				roiTab++;
				daSua();
			}
		};
		const len = () => {
			online = true;
			if (dirty) luuBai();
		};
		const xuong = () => (online = false);
		const roiTrang = (e: BeforeUnloadEvent) => {
			if (dirty || dangGuiLuu) e.preventDefault();
		};
		document.addEventListener('visibilitychange', anTab);
		addEventListener('online', len);
		addEventListener('offline', xuong);
		addEventListener('beforeunload', roiTrang);
		return () => {
			clearInterval(tick);
			clearInterval(dinhKy);
			clearTimeout(henLuu);
			document.removeEventListener('visibilitychange', anTab);
			removeEventListener('online', len);
			removeEventListener('offline', xuong);
			removeEventListener('beforeunload', roiTrang);
		};
	});
</script>

<svelte:head><title>Làm bài thi</title></svelte:head>

<!-- Điện thoại: một cột, đồng hồ dính trên cùng. Máy tính bảng/máy tính: cột trái dính (thông tin + đồng hồ + danh sách câu), cột phải là câu hỏi. -->
<div class="md:grid md:grid-cols-[17rem_1fr] md:items-start md:gap-6">
<div class="contents md:sticky md:top-4 md:block">
<header class="card card-border sticky top-2 z-10 mb-4 bg-base-100 md:static">
	<div class="card-body grid grid-cols-[1fr_auto] gap-x-4 gap-y-2">
		<div class="flex min-w-0 flex-col">
			<strong>{[tt.ten_thanh, tt.ho_ten].filter(Boolean).join(' ')}</strong>
			{#if tt.giao_xu || tt.giao_phan}<span class="text-sm opacity-85">{[tt.giao_xu, tt.giao_phan].filter(Boolean).join(', ')}</span>{/if}
		</div>
		<div
			class={['self-center text-2xl font-semibold tabular-nums', conLai < 5 * 60_000 && 'text-error']}
			role="timer"
			aria-label="Thời gian còn lại"
		>
			{dinhDang(conLai)}
		</div>
		<div class="col-span-full flex flex-wrap items-center gap-2" aria-live="polite">
			{#if !online}
				<span class="badge badge-error">Mất mạng</span>
				<span class="text-sm">Bài vẫn được giữ trên máy, sẽ lưu khi có mạng lại.</span>
			{:else if luu === 'dang_luu'}
				<span class="badge">Đang lưu...</span>
			{:else if luu === 'chua_luu'}
				<span class="badge badge-warning">Chưa lưu</span>
			{:else if luu === 'loi'}
				<span class="badge badge-error">Lưu lỗi — sẽ thử lại</span>
			{:else}
				<span class="badge badge-success">Đã lưu</span>
			{/if}
			<span class="text-sm opacity-85">Đã trả lời {soDaTraLoi}/{ds.length}</span>
		</div>
	</div>
</header>

<nav class="mb-4 grid grid-cols-[repeat(auto-fill,minmax(3rem,1fr))] gap-2" aria-label="Danh sách câu hỏi">
	{#each ds as c, i (c.ma)}
		<button
			class={['btn', i === hienTai ? 'btn-primary' : daTraLoi(c.ma) ? 'btn-soft btn-success' : 'border-base-300 bg-base-100']}
			aria-current={i === hienTai ? 'step' : undefined}
			aria-label={`Câu ${i + 1}${daTraLoi(c.ma) ? ', đã trả lời' : ''}`}
			onclick={() => (hienTai = i)}>{i + 1}</button
		>
	{/each}
</nav>
</div>

<div>
{#if q}
	<section class="card card-border">
		<div class="card-body px-0">
			<p class="text-sm opacity-85">Câu {hienTai + 1}/{ds.length} · {q.loai === 'TN' ? 'Trắc nghiệm' : 'Tự luận'}</p>
			<h2 id="noi-dung" class="card-title whitespace-pre-wrap">{q.noi_dung}</h2>
			{#if q.lua_chon}
				<div class="flex flex-col gap-2" role="radiogroup" aria-labelledby="noi-dung">
					{#each q.lua_chon as lc, i (i)}
						<label
							class={[
								'rounded-box flex cursor-pointer items-start gap-3 border p-3',
								dapAn[q.ma] === i ? 'border-primary bg-primary/10' : 'border-base-300'
							]}
						>
							<input
								type="radio"
								class="radio radio-primary"
								name={q.ma}
								checked={dapAn[q.ma] === i}
								onchange={() => {
									dapAn[q.ma] = i;
									daSua();
								}}
							/>
							<span><b>{String.fromCharCode(65 + i)}.</b> {lc}</span>
						</label>
					{/each}
				</div>
			{:else}
				<textarea
					class="textarea w-full"
					rows="10"
					maxlength="5000"
					aria-labelledby="noi-dung"
					value={tuLuan[q.ma] ?? ''}
					oninput={(e) => {
						tuLuan[q.ma] = e.currentTarget.value;
						daSua(false);
					}}
				></textarea>
				<p class="text-sm opacity-85">{(tuLuan[q.ma] ?? '').length}/5000 ký tự</p>
			{/if}
			<div class="card-actions mt-2 justify-between">
				<button class="btn" disabled={hienTai === 0} onclick={() => hienTai--}>← Câu trước</button>
				<button class="btn" disabled={hienTai === ds.length - 1} onclick={() => hienTai++}>Câu sau →</button>
			</div>
		</div>
	</section>
{/if}

<div class="mt-6 mb-12 flex flex-col gap-2 text-center">
	{#if thongBao}<div class="alert alert-error" role="alert">{thongBao}</div>{/if}
	<button class="btn btn-primary btn-block" disabled={conChoNop > 0 || dangNop} onclick={() => hopXacNhan.showModal()}>
		{#if dangNop}<span class="loading loading-spinner"></span>Đang nộp...{:else}Nộp bài{/if}
	</button>
	{#if conChoNop > 0}
		<p class="text-sm opacity-85">Được nộp sau {dinhDang(conChoNop)} nữa (sau khi hết một nửa thời gian).</p>
	{/if}
</div>
</div>
</div>

<dialog bind:this={hopXacNhan} class="modal" aria-labelledby="xn-title">
	<div class="modal-box">
		<h2 id="xn-title" class="text-xl font-semibold">Nộp bài?</h2>
		<p class="py-2">Bạn đã trả lời {soDaTraLoi}/{ds.length} câu.</p>
		{#if soDaTraLoi < ds.length}<p class="text-error">Còn {ds.length - soDaTraLoi} câu chưa trả lời.</p>{/if}
		<p class="py-2">Sau khi nộp sẽ không sửa được nữa.</p>
		<div class="modal-action">
			<button class="btn" onclick={() => hopXacNhan.close()}>Làm tiếp</button>
			<button class="btn btn-primary" onclick={nop} disabled={dangNop}>Nộp bài</button>
		</div>
	</div>
	<form method="dialog" class="modal-backdrop"><button>Đóng</button></form>
</dialog>
