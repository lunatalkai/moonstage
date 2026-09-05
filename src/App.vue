<template>
	<!-- ⚠️ uni-app H5 下 App.vue template 不渲染（只 setup 跑），所以
	     全局彈窗（CheckinRemind / WinbackPopup）必須掛在 left-window.vue
	     這種會實際渲染的容器，不在這裡。GlobalLoading 也是同樣理由──但
	     loadingManager 走 uni.showLoading 原生 API，不依賴此 template。-->
	<GlobalLoading v-model="loadingState.visible" :text="loadingState.text" />
</template>

<script>

	import GlobalLoading from '@/components/GlobalLoading/index.vue'
	import { useLoading } from '@/utils/loadingManager.js'
	import { installModalDefaults } from '@/utils/modal-defaults'
	import { isSignedIn } from '@/common/open-oauth'
	import store from '@/store'

	export default {
		components: {
			GlobalLoading
		},
		setup() {
			const { state: loadingState } = useLoading();
			return { loadingState };
		},
		onLaunch: function(options) {
			// uni.showModal 品牌預設色（危險操作自傳的紅色會保留，見 modal-defaults）
			installModalDefaults(uni);
			// 身分只有一個來源：本機有沒有可用的 access token。
			store.commit('setSignedIn', isSignedIn());
			uni.$emit("setMescrollGlobalOption", {i18n: {type: uni.getLocale()}})
			console.log('App Launch')

			// Embed 模式（被 iframe 內嵌）：讓內嵌的聊天頁佔滿整個 iframe。
			// #ifdef H5
			try {
				var embed = options && options.query && options.query.embed;
				// fallback：直接解析 window.location（history 模式參數在 search、
				// hash 模式在 hash），避免 onLaunch options.query 在某些啟動路徑取不到。
				if (!embed && typeof window !== 'undefined' && window.location) {
					var loc = window.location;
					var hay = (loc.search || '') + ' ' + (loc.hash || '');
					if (/[?&]embed=1\b/.test(hay)) embed = '1';
				}
				if (embed && typeof document !== 'undefined' && document.documentElement) {
					document.documentElement.classList.add('lt-embed');
				}
			} catch (e) {
				console.warn('[App] embed 偵測失敗:', e);
			}
			// #endif
		},
		onShow: function() {
			console.log('App Show')
			store.commit('setSignedIn', isSignedIn());
		},
		onHide: function() {
			console.log('App Hide')
		}
	}
</script>

<style>
	/*每個頁面公共css */
	@import './common/uni.css';
	@import './common/fui-app.css';
	@import './components/firstui/fui-theme/fui-theme.css';
	/*自定義字體css */
	@import './static/icon/fui-custom-icon.css';
	/* HTML Card 預定義樣式 - AI 生成的 HTML 卡片使用 */
	@import './common/html-card.css';
	/* uni.showModal 全域玻璃化（覆蓋 uni-h5 內建 iOS 白底彈窗） */
	@import './common/uni-modal.css';
	/* NOTE: 此 <style> 區塊未加 scoped，是全域 CSS，不需要也不能用 :deep()
	 * （:deep() 只在 scoped 樣式裡由 Vue 編譯器處理；在非 scoped 區塊裡會
	 * 變成瀏覽器不認得的偽類，整條規則會被丟掉。）
	 * 因此以下選擇器全部用原生 CSS。
	 */

	/* uni-app 的頁面外框在這個客戶端只剩單一內容區，維持全寬即可。 */
	uni-main {
		min-width: 0 !important;
		overflow-x: hidden !important;
		width: 100% !important;
	}

	uni-page-body {
		background-color: var(--fui-bg-color-grey, #0A0B0D);
		font-size: 1rem;
		font-weight: 500;
		color: var(--fui-color-title, #181818);
		/* DESIGN §2.5 字體棧。原本只有 `-apple-system-font, Helvetica Neue…`：
		 * 既沒有品牌字體 Nunito，也沒有任何 CJK fallback —— 韓/日文會掉到系統
		 * 預設 sans-serif，在中文優先的環境裡容易被中文字形接管。
		 * --lt-font-sans 由 theme-v3-tokens.css（main.js 全域 import）提供，
		 * 這裡再寫一份字面值當 fallback，避免 token 未載入時退回舊行為。
		 * CJK 順序 TC → SC → JP → KR 是 DESIGN §2.5 明訂，勿改。 */
		font-family: var(--lt-font-sans, 'Nunito', 'Noto Sans TC', 'Noto Sans SC', 'Noto Sans JP', 'Noto Sans KR',
			-apple-system, BlinkMacSystemFont, 'Helvetica Neue', Helvetica, Arial, sans-serif);
		width: 100%;
		height: 100%;
		padding: 0 0 !important;
	}

	/* 兜底 · body 强制深色
	 * 某些页面（如 galgame/index）没有显式设置页面根背景，uni-app H5 会让
	 * body 的 background 透出来。fui-theme 的 --fui-bg-color-grey 只定义在
	 * `page` / `uni-page-body` 上，body 元素上取不到，若此前 fallback 是 #F1F4FA
	 * 就会露出一大片白。直接在 body 上 pin 住暗色，绝对不会再出现白底。 */
	html, body {
		background-color: #0A0B0D !important;
	}

	/* ===== Embed 模式 =====
	 * 當頁面被 iframe 內嵌（URL 帶 embed=1，由 onLaunch 在 <html> 加 .lt-embed），
	 * 隱藏 uni-app 全域左右側導航視窗，讓內嵌的真實頁面（例如寫卡頁的「卡片試玩」
	 * 內嵌真實聊天頁）佔滿整個 iframe。uni-main flex:1 會自動撐滿剩餘空間。 */
	.lt-embed uni-main {
		width: 100% !important;
	}

	/* ===== 沉浸模式 =====
	 * 作者宣告 pageMode=immersive 的卡：整個寬度給作者的版面。
	 *
	 * 為什麼要走到外框這一層：這類卡是照「畫布＝視窗」寫的，`position: fixed;
	 * left: 0` 在原平台等於貼欄的左緣，頁內再怎麼放寬都對不上外框吃掉的寬度。
	 *
	 * 走得掉靠聊天頁頂欄的返回鍵，不再需要邊緣的呼出條。 */
	.lt-immersive uni-main {
		width: 100% !important;
	}
</style>
