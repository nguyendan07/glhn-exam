<script lang="ts">
	import { goto } from '$app/navigation';
	import { onMount } from 'svelte';

	let f = $state({ ten_thanh: '', ho_ten: '', ngay_sinh: '', giao_xu: '', giao_phan: '' });
	let ds = $state<{ ten: string; giao_phan: string }[]>([]);
	let loi = $state('');
	let dangGui = $state(false);
	const dsGiaoPhan = $derived([...new Set(ds.map((x) => x.giao_phan))]);

	onMount(async () => {
		try {
			const r = await fetch('/api/giao-xu');
			if (r.ok) ds = (await r.json()) as typeof ds;
		} catch {
			// Chỉ là gợi ý, bỏ qua lỗi.
		}
	});

	function chonGiaoXu() {
		const m = ds.filter((x) => x.ten === f.giao_xu.trim());
		if (m.length === 1) f.giao_phan = m[0].giao_phan;
	}

	async function batDau(e: SubmitEvent) {
		e.preventDefault();
		loi = '';
		if (!confirm('Kiểm tra kỹ thông tin. Sau khi bắt đầu sẽ không sửa được và đồng hồ bắt đầu chạy. Bắt đầu thi?')) return;
		dangGui = true;
		try {
			const r = await fetch('/api/start', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify(f)
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

<h1>Thông tin dự thi</h1>

<form class="card" onsubmit={batDau}>
	<div class="field">
		<label for="ten_thanh">Tên Thánh</label>
		<p class="hint" id="h-tt">Ví dụ: Phêrô, Maria, Giuse...</p>
		<input id="ten_thanh" type="text" bind:value={f.ten_thanh} required maxlength="60" autocomplete="off" aria-describedby="h-tt" />
	</div>
	<div class="field">
		<label for="ho_ten">Họ và tên</label>
		<p class="hint" id="h-ht">Ghi đầy đủ, có dấu. Ví dụ: Nguyễn Văn An</p>
		<input id="ho_ten" type="text" bind:value={f.ho_ten} required maxlength="100" autocomplete="name" aria-describedby="h-ht" />
	</div>
	<div class="field">
		<label for="ngay_sinh">Ngày tháng năm sinh</label>
		<p class="hint" id="h-ns">Định dạng dd/mm/yyyy. Ví dụ: 05/09/2010</p>
		<input
			id="ngay_sinh"
			type="text"
			inputmode="numeric"
			placeholder="dd/mm/yyyy"
			pattern={'\\d{1,2}/\\d{1,2}/\\d{4}'}
			bind:value={f.ngay_sinh}
			required
			maxlength="10"
			autocomplete="bday"
			aria-describedby="h-ns"
		/>
	</div>
	<div class="field">
		<label for="giao_xu">Giáo xứ</label>
		<p class="hint" id="h-gx">Gõ để chọn trong danh sách gợi ý, hoặc tự nhập nếu không có.</p>
		<input id="giao_xu" type="text" list="ds-giao-xu" bind:value={f.giao_xu} oninput={chonGiaoXu} required maxlength="60" autocomplete="off" aria-describedby="h-gx" />
		<datalist id="ds-giao-xu">
			{#each ds as x (x.ten + x.giao_phan)}<option value={x.ten}>{x.giao_phan}</option>{/each}
		</datalist>
	</div>
	<div class="field">
		<label for="giao_phan">Giáo phận</label>
		<p class="hint" id="h-gp">Tự điền khi chọn giáo xứ có trong danh sách; vẫn sửa được.</p>
		<input id="giao_phan" type="text" list="ds-giao-phan" bind:value={f.giao_phan} required maxlength="60" autocomplete="off" aria-describedby="h-gp" />
		<datalist id="ds-giao-phan">
			{#each dsGiaoPhan as x (x)}<option value={x}></option>{/each}
		</datalist>
	</div>

	{#if loi}<p class="error" role="alert">{loi}</p>{/if}

	<button class="primary full" type="submit" disabled={dangGui}>{dangGui ? 'Đang xử lý...' : 'Bắt đầu thi'}</button>
</form>

<style>
	.field {
		margin-bottom: 1rem;
	}
	.full {
		width: 100%;
	}
</style>
