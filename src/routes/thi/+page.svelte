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

<header class="card sticky top-2 z-10 mb-4 grid grid-cols-[1fr_auto] gap-x-4 gap-y-1">
	<div class="flex min-w-0 flex-col">
		<strong>{tt.ten_thanh} {tt.ho_ten}</strong>
		<span class="text-sm text-muted">{tt.giao_xu}, {tt.giao_phan}</span>
	</div>
	<div
		class={['self-center text-2xl font-bold tabular-nums', conLai < 5 * 60_000 && 'text-danger']}
		role="timer"
		aria-label="Thời gian còn lại"
	>
		{dinhDang(conLai)}
	</div>
	<div class="col-span-full text-sm text-muted" aria-live="polite">
		{#if !online}
			<span class="text-danger">Mất mạng — bài vẫn được giữ trên máy, sẽ lưu khi có mạng lại</span>
		{:else if luu === 'dang_luu'}
			<span>Đang lưu...</span>
		{:else if luu === 'chua_luu'}
			<span>Chưa lưu</span>
		{:else if luu === 'loi'}
			<span class="text-danger">Lưu lỗi — sẽ thử lại</span>
		{:else}
			<span class="text-ok">Đã lưu</span>
		{/if}
		<span>· Đã trả lời {soDaTraLoi}/{ds.length}</span>
	</div>
</header>

<nav class="mb-4 grid grid-cols-[repeat(auto-fill,minmax(44px,1fr))] gap-1.5" aria-label="Danh sách câu hỏi">
	{#each ds as c, i (c.ma)}
		<button
			class={['btn px-0 py-1.5', daTraLoi(c.ma) && 'border-ok bg-ok/15', i === hienTai && 'font-bold outline-2 outline-primary']}
			aria-current={i === hienTai ? 'step' : undefined}
			aria-label={`Câu ${i + 1}${daTraLoi(c.ma) ? ', đã trả lời' : ''}`}
			onclick={() => (hienTai = i)}>{i + 1}</button
		>
	{/each}
</nav>

{#if q}
	<section class="card">
		<p class="text-sm text-muted">Câu {hienTai + 1}/{ds.length} · {q.loai === 'TN' ? 'Trắc nghiệm' : 'Tự luận'}</p>
		<h2 id="noi-dung" class="mt-1 mb-4 text-lg font-semibold whitespace-pre-wrap">{q.noi_dung}</h2>
		{#if q.lua_chon}
			<div role="radiogroup" aria-labelledby="noi-dung">
				{#each q.lua_chon as lc, i (i)}
					<label
						class={[
							'mb-2 flex cursor-pointer items-start gap-2.5 rounded-lg border p-3',
							dapAn[q.ma] === i ? 'border-primary bg-primary/10' : 'border-line'
						]}
					>
						<input
							type="radio"
							class="mt-1 size-[1.1rem] accent-primary"
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
				class="input"
				rows="10"
				maxlength="5000"
				aria-labelledby="noi-dung"
				value={tuLuan[q.ma] ?? ''}
				oninput={(e) => {
					tuLuan[q.ma] = e.currentTarget.value;
					daSua(false);
				}}
			></textarea>
			<p class="text-sm text-muted">{(tuLuan[q.ma] ?? '').length}/5000 ký tự</p>
		{/if}
		<div class="mt-4 flex justify-between gap-2">
			<button class="btn" disabled={hienTai === 0} onclick={() => hienTai--}>← Câu trước</button>
			<button class="btn" disabled={hienTai === ds.length - 1} onclick={() => hienTai++}>Câu sau →</button>
		</div>
	</section>
{/if}

<div class="mt-6 mb-12 text-center">
	{#if thongBao}<p class="mb-2 text-danger" role="alert">{thongBao}</p>{/if}
	<button class="btn btn-primary w-full" disabled={conChoNop > 0 || dangNop} onclick={() => hopXacNhan.showModal()}>
		{dangNop ? 'Đang nộp...' : 'Nộp bài'}
	</button>
	{#if conChoNop > 0}
		<p class="mt-2 text-sm text-muted">Được nộp sau {dinhDang(conChoNop)} nữa (sau khi hết một nửa thời gian).</p>
	{/if}
</div>

<dialog
	bind:this={hopXacNhan}
	aria-labelledby="xn-title"
	class="m-auto w-[min(420px,calc(100vw-2rem))] space-y-2 rounded-xl border border-line bg-card p-5 text-ink backdrop:bg-black/50"
>
	<h2 id="xn-title" class="text-lg font-semibold">Nộp bài?</h2>
	<p>Bạn đã trả lời {soDaTraLoi}/{ds.length} câu.</p>
	{#if soDaTraLoi < ds.length}<p class="text-danger">Còn {ds.length - soDaTraLoi} câu chưa trả lời.</p>{/if}
	<p>Sau khi nộp sẽ không sửa được nữa.</p>
	<div class="mt-4 flex justify-between gap-2">
		<button class="btn" onclick={() => hopXacNhan.close()}>Làm tiếp</button>
		<button class="btn btn-primary" onclick={nop} disabled={dangNop}>Nộp bài</button>
	</div>
</dialog>
