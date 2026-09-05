#!/usr/bin/env node
/**
 * 擋住「後端位址又被寫死回程式碼」。
 *
 * 為什麼需要
 * ----------
 * 導入 .env 之前，切換環境要手動註解／取消註解 main.js 裡的一行，而且散落的
 * 寫死位址造成過三個真實缺陷：分享頁 WebSocket 無條件連測試環境、聊天
 * WebSocket 預設寫死正式位址、IM 的兩個條件編譯分支填同一組位址。
 * 沒有機關的話，這些會慢慢長回來。
 *
 * 設計取捨
 * --------
 * 難的不是抓到網域，是不要誤報。誤報一多，下一個人就學會忽略它，gate 等於
 * 不存在。所以：
 *
 *   - 只擋「會隨環境改變」的位址（api / api-im / ws-im）。
 *     objects、downloads、站台主網域刻意不擋——它們不隨環境變化，
 *     理由見 src/config/env.js 的 SITE_ORIGIN 註解。
 *   - 註解裡的位址放行。程式碼註解寫清楚範例位址是好事，不該被罰。
 *   - 允許清單逐檔明列，不用萬用比對。用 `utils/**` 這種規則會讓 gate 隨
 *     時間失效，因為新檔案會自動落進放行範圍。
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * 只擋會隨環境改變的位址。
 * 涵蓋 http/https/ws/wss——初版只寫 https?:// 的話會漏掉 wss://，
 * 而 share-chat.vue 的 WebSocket 寫死測試環境正是這樣躲過檢查的。
 */
const ENDPOINT_RE = /(?:https?|wss?):\/\/api\.lunatalk\.ai/g;

export const ALLOWED = {
	// 位址本來就該待的地方
	files: [
		'src/config/env.js',
		'build/dev-proxy.js',
		'scripts/check-hardcoded-endpoints.mjs',
		// OAuth resource 識別字固定不隨 API origin 變，是識別字不是位址。
		'src/common/open-oauth.ts',
	],
	// 這些目錄的內容不是執行期設定
	dirs: ['src/locale/', 'tests/', 'node_modules/', 'dist/', 'unpackage/'],
	// .env 檔正是位址該待的地方
	filePatterns: [/^\.env(\.|$)/, /\.spec\.[jt]s$/, /\.test\.[jt]s$/],
};

function isAllowed(file) {
	const rel = file.replace(/^\.\//, '');
	if (ALLOWED.files.includes(rel)) return true;
	if (ALLOWED.dirs.some(d => rel.includes(d))) return true;
	const base = path.basename(rel);
	return ALLOWED.filePatterns.some(re => re.test(base));
}

/** 這一行是不是純註解。行內尾隨註解不放行——那有可能是真的程式碼加上說明。 */
function isCommentLine(line) {
	return /^\s*(\/\/|\*|\/\*)/.test(line);
}

/**
 * @returns {{file:string,line:number,match:string}[]}
 */
export function scanSource(file, text) {
	if (isAllowed(file)) return [];
	const hits = [];
	text.split('\n').forEach((line, i) => {
		if (isCommentLine(line)) return;
		for (const m of line.matchAll(ENDPOINT_RE)) {
			hits.push({ file, line: i + 1, match: m[0] });
		}
	});
	return hits;
}

function walk(dir, acc = []) {
	for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
		const full = path.join(dir, entry.name);
		if (entry.isDirectory()) {
			if (['node_modules', 'dist', 'unpackage', '.git'].includes(entry.name)) continue;
			walk(full, acc);
		} else if (/\.(js|vue|ts)$/.test(entry.name)) {
			acc.push(full);
		}
	}
	return acc;
}

function main() {
	const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
	const hits = [];
	for (const file of walk(path.join(root, 'src'))) {
		const rel = path.relative(root, file);
		hits.push(...scanSource(rel, fs.readFileSync(file, 'utf-8')));
	}

	if (hits.length === 0) {
		console.log('[check-hardcoded-endpoints] 沒有寫死的後端位址 ✅');
		return;
	}

	console.error('[check-hardcoded-endpoints] 發現寫死的後端位址：\n');
	for (const h of hits) console.error(`  ${h.file}:${h.line}  ${h.match}`);
	console.error(
		'\n位址應該從 src/config/env.js 取得，值由 .env.[mode] 提供。' +
		'\n若這是刻意保留的用法（例如運行時判斷部署網域），把檔案加進' +
		'\nscripts/check-hardcoded-endpoints.js 的 ALLOWED.files 並註明原因。'
	);
	process.exit(1);
}

export { isAllowed, ENDPOINT_RE }

if (process.argv[1] && process.argv[1].endsWith('check-hardcoded-endpoints.mjs')) main()
