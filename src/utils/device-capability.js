// LunaTalk · 裝置能力探測（低端降級用）
//
// desktop H5 沒有 APP-PLUS 那條原生降級路徑：低階集顯 / 少核 CPU / 小記憶體的機器，
// 跑滿配的 ambient 動態背景（多層旋轉 conic + blur(55px)）與常駐 backdrop-filter 會嚴重掉幀。
// 這支工具在偵測到低端信號時回傳 true，呼叫端據此關閉 spin、降 blur、或把玻璃換成純色底。
//
// 判定信號（任一命中即視為低端）：
//   - 使用者系統層要求減少動畫（prefers-reduced-motion: reduce）
//   - navigator.deviceMemory ≤ 門檻（預設 4，代表 RAM ≤ 4GB；Chrome 會把上限截在 8）
//   - navigator.hardwareConcurrency ≤ 門檻（預設 4，代表 CPU 邏輯核心數少）
//
// 探測不到的信號（欄位 undefined / 0 / 非數字）不作為低端依據，
// 避免誤傷「無法上報硬體能力但其實跑得動」的正常機器。

function resolveNav(nav) {
	if (nav) return nav;
	return typeof navigator !== 'undefined' ? navigator : undefined;
}

function resolveWin(win) {
	if (win) return win;
	return typeof window !== 'undefined' ? window : undefined;
}

// 系統層是否要求減少動畫
export function prefersReducedMotion(win) {
	const w = resolveWin(win);
	try {
		return !!(
			w &&
			typeof w.matchMedia === 'function' &&
			w.matchMedia('(prefers-reduced-motion: reduce)').matches
		);
	} catch (e) {
		return false;
	}
}

// 是否為低端裝置
export function detectLowEndDevice(nav, win, opts = {}) {
	const memThreshold = opts.memThreshold != null ? opts.memThreshold : 4;
	const coreThreshold = opts.coreThreshold != null ? opts.coreThreshold : 4;

	const n = resolveNav(nav);
	const w = resolveWin(win);

	// 1. 使用者顯式要求減少動畫 → 直接視為需要降級
	if (prefersReducedMotion(w)) return true;

	// 2. 記憶體（> 0 才算探測成功，避免 0 / undefined 誤判）
	if (n && typeof n.deviceMemory === 'number' && n.deviceMemory > 0 && n.deviceMemory <= memThreshold) {
		return true;
	}

	// 3. CPU 邏輯核心數
	if (
		n &&
		typeof n.hardwareConcurrency === 'number' &&
		n.hardwareConcurrency > 0 &&
		n.hardwareConcurrency <= coreThreshold
	) {
		return true;
	}

	return false;
}

export default {
	detectLowEndDevice,
	prefersReducedMotion,
};
