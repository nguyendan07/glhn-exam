<script lang="ts">
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
	const tt = $derived(data.thong_tin);
</script>

<svelte:head><title>Kết quả thi</title></svelte:head>

<h1 class="mb-4 text-2xl font-bold">Kết quả thi</h1>

<section class="card">
	<dl class="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 [&_dd]:font-semibold [&_dt]:text-muted">
		<dt>Tên Thánh</dt><dd>{tt.ten_thanh}</dd>
		<dt>Họ và tên</dt><dd>{tt.ho_ten}</dd>
		<dt>Ngày sinh</dt><dd>{tt.ngay_sinh}</dd>
		<dt>Giáo xứ</dt><dd>{tt.giao_xu}</dd>
		<dt>Giáo phận</dt><dd>{tt.giao_phan}</dd>
		<dt>Nộp lúc</dt>
		<dd>{data.submitted_at ? new Date(data.submitted_at).toLocaleString('vi-VN') : ''}</dd>
	</dl>
</section>

<section class="card mt-4 space-y-1 text-center">
	<p>Điểm trắc nghiệm</p>
	<p class="text-4xl font-bold">{data.diem_tn ?? 0}<small class="text-xl text-muted">/{data.diem_tn_toi_da}</small></p>
	{#if data.co_tu_luan}<p class="text-sm text-muted">Điểm tự luận: <b>chờ chấm</b></p>{/if}
	{#if data.nop_tre}
		<p class="text-danger">Bài nộp trễ: chỉ chấm các đáp án đã được lưu trước khi hết giờ.</p>
	{/if}
</section>

<p class="mt-4 text-sm text-muted">Mã lượt thi: {tt.ma_luot}</p>
