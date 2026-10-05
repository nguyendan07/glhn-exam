// See https://svelte.dev/docs/kit/types#app.d.ts
// ponytail: adapter-cloudflare v8 không còn `platform`; env/waitUntil lấy từ 'cloudflare:workers'
declare global {
	namespace App {}
}

export {};
