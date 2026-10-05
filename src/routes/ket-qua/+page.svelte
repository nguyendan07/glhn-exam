<script lang="ts">
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
	const tt = $derived(data.thong_tin);
</script>

<svelte:head><title>Kết quả thi</title></svelte:head>

<h1>Kết quả thi</h1>

<section class="card">
	<dl>
		<dt>Tên Thánh</dt><dd>{tt.ten_thanh}</dd>
		<dt>Họ và tên</dt><dd>{tt.ho_ten}</dd>
		<dt>Ngày sinh</dt><dd>{tt.ngay_sinh}</dd>
		<dt>Giáo xứ</dt><dd>{tt.giao_xu}</dd>
		<dt>Giáo phận</dt><dd>{tt.giao_phan}</dd>
		<dt>Nộp lúc</dt>
		<dd>{data.submitted_at ? new Date(data.submitted_at).toLocaleString('vi-VN') : ''}</dd>
	</dl>
</section>

<section class="card score">
	<p>Điểm trắc nghiệm</p>
	<p class="big">{data.diem_tn ?? 0}<small>/{data.diem_tn_toi_da}</small></p>
	{#if data.co_tu_luan}<p class="muted">Điểm tự luận: <b>chờ chấm</b></p>{/if}
	{#if data.nop_tre}
		<p class="error">Bài nộp trễ: chỉ chấm các đáp án đã được lưu trước khi hết giờ.</p>
	{/if}
</section>

<p class="muted">Mã lượt thi: {tt.ma_luot}</p>

<style>
	dl {
		display: grid;
		grid-template-columns: auto 1fr;
		gap: 0.35rem 1rem;
		margin: 0;
	}
	dt {
		color: var(--muted);
	}
	dd {
		margin: 0;
		font-weight: 600;
	}
	.score {
		margin-top: 1rem;
		text-align: center;
	}
	.score p {
		margin: 0.25rem 0;
	}
	.big {
		font-size: 2.5rem;
		font-weight: 700;
	}
	.big small {
		font-size: 1.2rem;
		color: var(--muted);
	}
	.muted {
		color: var(--muted);
		font-size: 0.9rem;
	}
</style>
