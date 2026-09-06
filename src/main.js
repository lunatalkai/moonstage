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

// 所有請求都走開放 API v1，同源相對路徑由 dev proxy / 反向代理接。
var host = API_BASE;
http.create({
	host: host,
	timeout: 30000, // 默认 30 秒超时
})

// 不需要顯示 loading 的接口（輪詢、背景請求）
const silentApis = [
	'/conversation/operations',
	'/conversation/replay',
	'/conversation/ws-ticket',
];

const isSilentRequest = (url) => {
	return silentApis.some(api => url && url.includes(api));
};

// 呼叫端會自己呈現錯誤的背景 API，不再彈全域 toast
const silentErrorApis = [
	'/conversation/operations',   // 背景恢復查詢；拿不到就靜默回退，不打擾使用者
	'/conversation/rewrite-by-id', // 重寫的錯誤由聊天頁的系統訊息卡呈現，避免重複 toast
	'/role/author-asset/serve',   // 玩家路徑：沒有資產就是「這張卡沒裝修」，不是使用者要處理的錯誤
	'/trial-cards',               // 試玩卡：入口頁自己開視窗講清楚是哪一段、哪一條超限，不要再疊一個 toast
];

const isSilentErrorRequest = (url) => {
	return silentErrorApis.some(api => url && url.includes(api));
};

// 請求攔截：身分只有 Bearer 一個來源，沒有站台金鑰、沒有帳號識別標頭、不帶 cookie。
http.interceptors.request.use(async config => {
	const showLoading = config.showLoading !== false && !isSilentRequest(config.url);
	if (showLoading) {
		loading.show(config.loadingText || '');
	}
	config._showedLoading = showLoading;

	const header = (config.header && typeof config.header === 'object') ? config.header : {};
	config.header = header;

	header['language'] = uni.getLocale();
	header['from'] = 'web';
	// 伺服器依此決定內容可見範圍。不送的話會被保守判定為 APP，分級較高的卡會被濾掉。
	header['X-Client-Platform'] = 'web';
	header['X-API-Version'] = '2';

	const accessToken = await getFreshAccessToken();
	if (accessToken) {
		header['Authorization'] = `Bearer ${accessToken}`;
	} else {
		delete header['Authorization'];
	}
	return config
})

//响应拦截
http.interceptors.response.use(response => {
	// 隐藏 Loading
	loading.hide();

	// 处理不同状态码
	const statusCode = response.statusCode;
	const shouldSilenceError = isSilentErrorRequest(response._requestUrl);

	// 超时或取消的请求
	//
	// 傳輸層失敗（逾時 / 斷線 / 401）一律呈現，不受 silentErrorApis 影響。
	// 那份清單的前提是「這支 API 的錯誤由呼叫端自己呈現」——對業務錯誤成立
	// （例如 rewriteChatById 的操作層失敗會變成 chat 的系統訊息卡），但傳輸層
	// 根本沒走到 server 回應那一步，沒有任何替代呈現。無條件靜默的結果是
	// 按下去毫無反應，使用者只會重複按（對計費型產品是實害），我們在日誌裡
	// 也看不到。2026-08-01 兩位使用者回報「按了沒反應、重整就好」即卡在此。
	if (statusCode === -9999) {
		toast.timeout();
		return Promise.reject(response);
	}

	// 被阻止的重复请求
	if (statusCode === -9998) {
		return Promise.reject(response);
	}

	// 网络错误（傳輸層，理由同上：一律呈現）
	if (statusCode === -1 || !statusCode) {
		toast.networkError();
		return Promise.reject(response);
	}

	// 服务器错误 5xx
	if (statusCode >= 500) {
		if (!shouldSilenceError) {
			toast.serverError(response.data?.error || response.data?.message);
		}
		return Promise.reject(response);
	}

	// 401：先當成 access token 過期，換一張重送一次；換不到才是真的要重新登入。
	if (statusCode === 401) {
		const original = response._requestConfig;
		if (original && !original._openAuthRetried) {
			original._openAuthRetried = true;
			return refreshAccessToken().then(token => {
				if (token) return http.request(original);
				clearTokens();
				toast.unauthorized();
				redirectToLogin();
				return Promise.reject(response);
			});
		}
		clearTokens();
		toast.unauthorized();
		redirectToLogin();
		return Promise.reject(response);
	}

	// 其他客户端错误 4xx (除了 400，因为可能是业务错误需要特殊处理)
	if (statusCode >= 402 && statusCode < 500) {
		if (!shouldSilenceError) {
			toast.error(response.data?.error || response.data?.message);
		}
		return Promise.reject(response);
	}

	return response;
})

// 開放 API v1（`${host}/open/v1/**`）。這份清單就是這個客戶端能碰的全部——
// 不在上面的端點不屬於開放契約，頁面不該有那個功能。
const V1 = '/open/v1';
const requestUrl = {
	// 對話核心迴圈
	chatStart: `${V1}/conversation/start`,
	chatStop: `${V1}/conversation/stop`,
	rewriteChat: `${V1}/conversation/rewrite-by-id`,
	rewriteChatByContent: `${V1}/conversation/rewrite`,
	chatOperationStatus: `${V1}/conversation/operations`,
	getReplay: `${V1}/conversation/replay`,
	historyMessageList: `${V1}/conversation/messages`,
	chatList: `${V1}/conversation/list`,
	deleteConversation: `${V1}/conversation/delete`,
	chatDelete: `${V1}/conversation/delete-message`,
	saveAndStartNew: `${V1}/conversation/save-and-start-new`,
	// 存檔：這張卡的對話清單（依 roleId）、改名、切到某一段、在最新節點分叉。
	// 每張卡最多 20 段——save-and-start-new 與 fork 滿了回 409 conversation_limit_reached。
	conversationArchives: `${V1}/conversation/archives`,
	conversationTitle: `${V1}/conversation/title`,
	conversationSwitch: `${V1}/conversation/switch`,
	conversationFork: `${V1}/conversation/fork`,
	// 劇情回溯。路由是通的（2026-09-03 對正式站實測回 400 missing_conversation_id，
	// 不是 404）；缺的是使用者這一端的入口——原本的檢查點選單屬於對話歷史面板，
	// 這個客戶端沒有那個面板。目前只有「伺服器回傳一個沒跑完的回溯」時才會走到。
	loadConversation: `${V1}/conversation/backward`,
	chatWsTicket: `${V1}/conversation/ws-ticket`,
	// 幫答：替玩家寫下一句，填進輸入框由玩家送出。
	chatSuggestReply: `${V1}/conversation/suggest-reply`,

	// 角色與遊玩所需的讀路徑
	getRoleDetail: `${V1}/role/detail`,
	// 試玩卡：把本機的酒館卡建成一張會自動到期的私有卡（PUT/GET/DELETE …/{clientKey}）。
	trialCards: `${V1}/trial-cards`,
	authorAssetServe: `${V1}/role/author-asset/serve`,
	// 外觀偏好（桌布、字體）。送出那一輪不讀它——讀的是下面那一份。
	playerPreference: `${V1}/player/preference`,
	playerPreferenceSave: `${V1}/player/preference/save`,
	// 這張卡的遊玩設定：稱呼、自我介紹、模型／線路、上下文檔位、思考深度。
	// **送出那一輪讀的是這一份**，寫進外觀偏好不會生效。
	playerRoleSettings: `${V1}/player/role-settings`,
	playerRoleSettingsSave: `${V1}/player/role-settings/save`,
	// 深入準備（Agent 模式）與劇情摘要偏好
	playerAgentMode: `${V1}/player/agent-mode`,
	playerCompactPreference: `${V1}/player/compact-preference`,
	getModelListV2: `${V1}/models`,
	modelUptimeHistory: `${V1}/models/uptime-history`,
	// 長期指令（這段對話一直有效的要求）
	conversationDirectives: `${V1}/conversation/directives`,
	conversationDirectiveAdd: `${V1}/conversation/directive/add`,
	conversationDirectiveUpdate: `${V1}/conversation/directive/update`,
	conversationDirectiveDelete: `${V1}/conversation/directive/delete`,
	// 手帳（只有玩家看得到的筆記）與它的範本
	// 這則回覆的組成（上下文 chip 點開的那一片；回的是這段對話最近一次完成的回覆）
	promptDiagnostics: `${V1}/conversation/prompt-diagnostics`,
	// AI 記事本／永久記憶：路徑參數用 {conversationId}／{atomId}，呼叫端自己 replace（同 mobile）
	memoryAtoms: `${V1}/conversation/memory/{conversationId}/atoms`,
	memoryDeleteAtom: `${V1}/conversation/memory/{conversationId}/atoms/{atomId}`,
	conversationNotepad: `${V1}/conversation/notepad`,
	conversationNotepadSave: `${V1}/conversation/notepad/save`,
	notepadTemplates: `${V1}/notepad/templates`,
	notepadTemplate: `${V1}/notepad/template`,
	notepadTemplateSave: `${V1}/notepad/template/save`,
	notepadTemplateDelete: `${V1}/notepad/template/delete`,
	notepadTemplateShare: `${V1}/notepad/template/share`,
	notepadTemplateShareRevoke: `${V1}/notepad/template/share/revoke`,
	shareCodePreview: `${V1}/share/preview`,
	shareCodeImport: `${V1}/share/import`,
	worldbookDetail: `${V1}/worldbook/detail`,
	worldbookEntryList: `${V1}/worldbook/entry/list`,
}

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
