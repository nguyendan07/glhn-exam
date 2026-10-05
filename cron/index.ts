// Worker riêng chạy Cron Trigger: gửi lại các lượt sync_pending lên Google Sheets. Dùng chung D1 với app.
import { dongBoLai } from '../src/lib/server/sheets';

export default {
	async scheduled(_event, env, ctx) {
		ctx.waitUntil(
			dongBoLai(env.DB, env).then(
				(r) => console.log('resync', r),
				(e) => console.error('resync lỗi', e)
			)
		);
	}
} satisfies ExportedHandler<Env>;
