import App from './App'
import fui from './common/fui-app'
import http from './components/firstui/fui-request'
import store from './store'
import messages from './locale/index'
import Antd from 'ant-design-vue';
import 'ant-design-vue/dist/reset.css';
import './static/styles/luna-tokens.css';
import loading from './utils/loadingManager.js';
import toast from './utils/toastManager.js';
import { getFreshAccessToken, refreshAccessToken, clearTokens, redirectToLogin } from './common/open-oauth';
import { API_BASE } from './config/env';
import { setupHttp } from './api/http-setup';
import requestUrl from './config/request-url';

// #ifdef H5

// Stale chunk recovery：發版後使用者開著的 tab 仍是舊版 index.html，
// 第一次造訪未載過的 page 會去抓 [oldHash] chunk → CF 上已是新 hash → 404
// → uni-app SystemAsyncError 黑屏「連接服務器超時，點擊屏幕重試」。
//
// 注意:uni-app SDK 內部對 dynamic import() reject 會自己 catch 然後 render
// <div class="uni-async-error"> 這個 fallback component (見 uni-h5/dist/uni-h5.es.js:
//   AsyncErrorComponent, name="AsyncError" + class="uni-async-error",
//   onClick=reload(), 但要 user 主動點才 reload)
// → promise reject 不會 propagate 到 window,所以單純監聽 `unhandledrejection`
//   完全抓不到（前一版只用 window listener 的 fix 在 uni-app 上失效）。
//
// 真正能接住的入口是「.uni-async-error 元素出現」這個 DOM 事件 —
// 用 MutationObserver 監測,出現就 auto reload (取代 user 手點)。
//
// 雙保險仍保留 window.error / window.unhandledrejection,涵蓋:
//   - <script>/<link> onerror (Vite preload CSS / module preload)
//   - 我們自己代碼的動態 import() reject (沒被 uni-app 攔到的場景)
//
// sessionStorage flag 防迴圈:60s TTL 內 reload 一次仍失敗就不再 reload,
// 呈現原本錯誤畫面讓使用者手動處理 (避免「server 真的掛了」時無限重整)。
(function setupChunkErrorRecovery() {
    if (typeof window === 'undefined') return;
    const FLAG = 'lt_chunk_reloaded';
    const FLAG_TTL_MS = 60 * 1000;
    const tryReload = () => {
        const ts = sessionStorage.getItem(FLAG);
        if (ts && Date.now() - Number(ts) < FLAG_TTL_MS) return;
        sessionStorage.setItem(FLAG, String(Date.now()));
        window.location.reload();
    };
    // isOwnAssetUrl：這個資源是不是「我們自己 build 出來的檔案」。
    //
    // 2026-08-02 使用者回報「頁面瘋狂自動刷新」：對話被洗掉、往上拉的歷史不見、
    // 切去其他分頁再切回來幾乎每次觸發；另有人指出裝擋廣告外掛才會發生、加白名單就好。
    // 根因是下面那個 listener 原本**無條件**對任何 <script>/<link> 失敗就整頁重載——
    // 擋廣告外掛擋掉的第三方腳本（分析、廣告）失敗也算，而分頁切回來時會補載一批
    // 延遲資源，於是幾乎每次都重整一次。
    //
    // 這個機制的用意只有一個：新版部署後，舊分頁載不到已被刪除的 chunk 就自動重整。
    // 對象只有我們自己的 bundle。第三方資源失敗與版本無關，重整救不了，卻會把使用者
    // 的捲動位置與已載入的對話歷史全部沖掉——是實害，不是不便。
    const isOwnAssetUrl = (url) => {
        if (!url) return false;
        try {
            const u = new URL(String(url), location.href);
            if (u.origin !== location.origin) return false;
            // 只認建置產物路徑；同源的第三方注入腳本不算。
            return /\/(static|assets)\//.test(u.pathname);
        } catch (err) {
            return false;
        }
    };
    // 1. <script>/<link> 標籤 onerror (capture phase 才能抓到 resource error)
    window.addEventListener('error', (e) => {
        const t = e && e.target;
        if (!t || (t.tagName !== 'SCRIPT' && t.tagName !== 'LINK')) return;
        if (!isOwnAssetUrl(t.src || t.href)) return;
        tryReload();
    }, true);
    // 2. Promise unhandledrejection (uni-app 沒攔到的 dynamic import / fetch fail)
    //    正則涵蓋 webpack / Vite / native ESM / Safari / Chrome / Firefox 各家錯誤訊息
    window.addEventListener('unhandledrejection', (e) => {
        const msg = String((e && e.reason && (e.reason.message || e.reason)) || '');
        if (/Loading chunk \S+ failed|Failed to fetch dynamically imported|error loading dynamically imported|Importing a module script failed|Failed to load module script|Unable to preload (CSS|module)|ChunkLoadError/i.test(msg)) {
            tryReload();
        }
    });
    // 3. **核心修復**:uni-app 自己 catch dynamic import reject 後 render
    //    .uni-async-error component,promise 不會 leak 到 window。
    //    監測 DOM 出現該元素就 reload。
    const observeAsyncError = () => {
        try {
            if (document.querySelector('.uni-async-error')) {
                tryReload();
                return;
            }
            const obs = new MutationObserver(() => {
                if (document.querySelector('.uni-async-error')) {
                    obs.disconnect();
                    tryReload();
                }
            });
            obs.observe(document.documentElement, { childList: true, subtree: true });
        } catch (e) { /* 老瀏覽器無 MutationObserver,fallback 靠上面兩個 listener */ }
    };
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', observeAsyncError);
    } else {
        observeAsyncError();
    }
    // 4. App 進入任一頁正常 mount 後 60s 清 flag,視同新版穩定可再次救援
    window.addEventListener('load', () => {
        setTimeout(() => sessionStorage.removeItem(FLAG), FLAG_TTL_MS);
    });
})();

// 禁用瀏覽器自動還原滾動位置。Safari 預設在刷新 / 返回時會嘗試還原前一次的 scrollTop,
// 對 chat 頁這類「首載要 scrollToBottom」的場景會打架,呈現「先跳到底、立刻被彈回中間」的閃動。
try {
    if (typeof window !== 'undefined' && window.history && 'scrollRestoration' in window.history) {
        window.history.scrollRestoration = 'manual';
    }
} catch (e) { /* 老瀏覽器無此 API,忽略 */ }
// #endif

let currentLocale;
const supportedLocales = ['en', 'zh-Hans', 'zh-Hant', 'ja', 'ko'];

// H5平台下，优先从URL参数或路径中获取语言设置

// 从 URL 查询参数中获取语言代码 (SEO友好)
	// 1. 从 ?lang=xx 获取
const params = new URLSearchParams(window.location.search);
const langFromQuery = params.get('lang');
// 2. 从路径中获取语言前缀
const pathSegments = window.location.pathname.split('/').filter(Boolean);
const langFromPath = pathSegments[0];

const langFromUrl = supportedLocales.find(locale => langFromQuery?.toLowerCase() === locale.toLowerCase()) ||
	supportedLocales.find(locale => langFromPath?.toLowerCase() === locale.toLowerCase());

if (langFromUrl) {
	// 仅当用户通过 ?lang=xx 显式指定语言时，才覆盖已储存的偏好
	// 路径前缀 (/en/pages/...) 可能是路由器自动添加的，不应覆盖用户选择
	if (langFromQuery) {
		uni.setStorageSync('user_fallback_language', langFromUrl);
		console.log('[main.js] 從 URL 查詢參數取得語言:', langFromUrl);
	} else {
		console.log('[main.js] 從 URL 路徑偵測到語言前綴:', langFromUrl, '(不覆蓋已儲存的偏好)');
	}
	currentLocale = langFromUrl;
} else {
	// 优先从本地存储读取语言（这是后端同步下来的最新语言）
	// 同时使用 uni.getStorageSync 和原生 localStorage 双重读取，防止 uni 运行时未初始化导致读取失败
	let langFromStorage = uni.getStorageSync('user_fallback_language');
	if (!langFromStorage && typeof localStorage !== 'undefined') {
		try {
			const raw = localStorage.getItem('user_fallback_language');
			if (raw) {
				// uni.setStorageSync 对字符串直接存储，无需 JSON.parse
				langFromStorage = raw;
				// 尝试 JSON 解析（兼容 uni 内部格式）
				try {
					const parsed = JSON.parse(raw);
					if (parsed && parsed.data) langFromStorage = parsed.data;
				} catch (_) {}
			}
		} catch (_) {}
	}
	// 兜底：从 Vuex 持久化的 app_data 中恢复语言
	if (!langFromStorage && typeof localStorage !== 'undefined') {
		try {
			const raw = localStorage.getItem('app_data');
			if (raw) {
				const appData = typeof raw === 'string' ? JSON.parse(raw) : raw;
				// vuex-persistedstate 通过 uni.getStorageSync 存储，可能有包装层
				const data = appData?.data ?? appData;
				if (data?.userInfo?.language) {
					langFromStorage = data.userInfo.language;
					console.log('[main.js] 從 Vuex 持久化資料恢復語言:', langFromStorage);
				}
			}
		} catch (_) {}
	}
	console.log('[main.js] 從本地儲存讀取語言:', langFromStorage);
	if (langFromStorage && supportedLocales.includes(langFromStorage)) {
		currentLocale = langFromStorage;
	}
}

// 如果仍然没有确定语言，则从系统/浏览器设置中获取
if (!currentLocale) {
	currentLocale = uni.getLocale();
	console.log('[main.js] 從系統取得語言:', currentLocale);
}

// 最后确保所选语言是受支持的，否则回退到默认语言
if (!supportedLocales.includes(currentLocale)) {
	console.log('[main.js] 語言不支援，使用預設語言 en');
	currentLocale = 'en'; // 默认语言
}

console.log('[main.js] 最終使用的語言:', currentLocale);

// 动态更新HTML lang属性的函数
const updateHtmlLang = (locale) => {
	// #ifdef H5
	if (typeof document !== 'undefined') {
		document.documentElement.lang = locale;
	}
	// #endif
};

// 初始化时设置HTML lang属性
updateHtmlLang(currentLocale);

let i18nConfig = {
	locale: currentLocale,
	messages
}

// 請求層（host、loading／toast、bearer、401 換 token）搬到 src/api/http-setup.js，
// 舞台套件與 playground 共用同一份；這裡只是把 playground 的實作餵進去。
setupHttp(http, {
	host: API_BASE,
	loading,
	toast,
	getLocale: () => uni.getLocale(),
	getFreshAccessToken,
	refreshAccessToken,
	clearTokens,
	redirectToLogin,
})

// 開放 API v1（`${host}/open/v1/**`）。這份清單就是這個客戶端能碰的全部——
// 不在上面的端點不屬於開放契約，頁面不該有那個功能。

// #ifdef VUE3
import {
	createSSRApp
} from 'vue'
import { createI18n } from 'vue-i18n'
import { createPinia } from 'pinia'
const i18n = createI18n(i18nConfig)
export function createApp() {
	const app = createSSRApp(App)
	app.use(i18n)
	app.use(store)
	app.use(createPinia())
	app.use(Antd)
	app.config.globalProperties.fui = fui;
	app.config.globalProperties.http = http;
	app.config.globalProperties.requestUrl = requestUrl;
	app.config.globalProperties.$loading = loading;
	app.config.globalProperties.$toast = toast;

	// 设置国际化文案
	const t = i18n.global.t;
	loading.setTexts({
		loading: t('main.loading_text') || '載入中',
		submitting: t('main.submitting') || '提交中',
		saving: t('main.saving') || '儲存中',
		uploading: t('main.uploading') || '上傳中',
	});
	toast.setTexts({
		success: t('main.save_success') || '操作成功',
		error: t('main.save_failed') || '操作失敗',
		networkError: t('main.network_error') || '網路錯誤，請檢查網路連線',
		timeout: t('main.request_timeout') || '請求逾時，請重試',
		serverError: t('main.server_error') || '伺服器錯誤，請稍後重試',
		unauthorized: t('main.unauthorized') || '登入已過期，請重新登入',
	});

	uni.setLocale(currentLocale);
	return {
		app
	}
}
// #endif
