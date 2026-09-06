/**
 * 請求層的組裝：host、loading／toast、bearer、401 換 token 後重送。
 *
 * 從 main.js 抽出來，讓舞台套件（src/stage）與 playground 用同一份攔截器；
 * 差別只在餵進來的東西：playground 給 uni 的 loading／toast 與自己的 OAuth token，
 * 嵌進別的站台時給宿主的 toast 與宿主的 token。
 */
export function setupHttp(http, deps) {
	const {
		host,
		timeout = 30000,
		loading,
		toast,
		getLocale,
		getFreshAccessToken,
		refreshAccessToken,
		clearTokens,
		redirectToLogin,
	} = deps
	http.create({ host, timeout })

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

		header['language'] = getLocale();
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
}
