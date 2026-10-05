<script lang="ts">
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
	const tt = $derived(data.thong_tin);
</script>

<svelte:head><title>Kết quả thi</title></svelte:head>

<div class="mx-auto max-w-xl">
<h1 class="mb-4 text-2xl font-bold md:text-3xl">Kết quả thi</h1>

<section class="card card-border bg-base-100">
	<div class="card-body">
		<dl class="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 [&_dd]:font-semibold [&_dt]:opacity-70">
			<dt>Tên Thánh</dt><dd>{tt.ten_thanh}</dd>
			<dt>Họ và tên</dt><dd>{tt.ho_ten}</dd>
			<dt>Ngày sinh</dt><dd>{tt.ngay_sinh}</dd>
			<dt>Giáo xứ</dt><dd>{tt.giao_xu}</dd>
			<dt>Giáo phận</dt><dd>{tt.giao_phan}</dd>
			<dt>Nộp lúc</dt>
			<dd>{data.submitted_at ? new Date(data.submitted_at).toLocaleString('vi-VN') : ''}</dd>
		</dl>
	</div>
</section>

<div class="stats stats-vertical md:stats-horizontal mt-4 w-full border border-base-300 bg-base-100">
	<div class="stat">
		<div class="stat-title">Điểm trắc nghiệm</div>
		<div class="stat-value">{data.diem_tn ?? 0}/{data.diem_tn_toi_da}</div>
	</div>
	{#if data.co_tu_luan}
		<div class="stat">
			<div class="stat-title">Điểm tự luận</div>
			<div class="stat-value">Chờ chấm</div>
		</div>
	{/if}
</div>

{#if data.nop_tre}
	<div class="alert alert-warning mt-4" role="alert">Bài nộp trễ: chỉ chấm các đáp án đã được lưu trước khi hết giờ.</div>
{/if}

<p class="mt-4 text-sm opacity-70">Mã lượt thi: {tt.ma_luot}</p>
</div>
