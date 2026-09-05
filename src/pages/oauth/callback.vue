<template>
	<view class="oc-page">
		<view class="oc-card">
			<text class="oc-eyebrow">{{ $t('openChat.brand') }}</text>
			<text class="oc-title">{{ errorText ? $t('openChat.callback.failedTitle') : $t('openChat.callback.title') }}</text>
			<text v-if="!errorText" class="oc-desc">{{ $t('openChat.callback.desc') }}</text>
			<view v-else class="oc-alert">{{ errorText }}</view>

			<view v-if="errorText" class="oc-cta" @click="backToLogin">
				<text class="oc-cta-text">{{ $t('openChat.callback.retry') }}</text>
			</view>
		</view>
	</view>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { onLoad } from '@dcloudio/uni-app'
import { useI18n } from 'vue-i18n'
import { useStore } from 'vuex'
import { completeAuthorization } from '@/common/open-oauth'

const { t } = useI18n()
const store = useStore()
const errorText = ref('')

/**
 * 授權伺服器把 code 放在網址的查詢字串上。uni-app 的 onLoad 參數通常就夠，
 * 但某些啟動路徑拿不到，所以再讀一次真實網址當備援。
 */
function readParam(options: Record<string, string>, name: string): string {
	if (options && options[name]) return options[name]
	try {
		if (typeof window !== 'undefined') {
			const fromSearch = new URLSearchParams(window.location.search).get(name)
			if (fromSearch) return fromSearch
			const hash = window.location.hash || ''
			const at = hash.indexOf('?')
			if (at >= 0) return new URLSearchParams(hash.slice(at)).get(name) || ''
		}
	} catch (_) {
		// 非瀏覽器環境沒有 window，交給下面的錯誤分支。
	}
	return ''
}

onLoad(async (options: Record<string, string> = {}) => {
	const denied = readParam(options, 'error')
	if (denied) {
		errorText.value = t('openChat.callback.denied')
		return
	}
	const code = readParam(options, 'code')
	const state = readParam(options, 'state')
	if (!code) {
		errorText.value = t('openChat.callback.missingCode')
		return
	}
	try {
		const returnTo = await completeAuthorization(code, state)
		store.commit('setSignedIn', true)
		uni.reLaunch({ url: returnTo })
	} catch (e) {
		errorText.value = t('openChat.callback.exchangeFailed')
		console.error('[openChat] 換發身分失敗:', e)
	}
})

function backToLogin() {
	uni.reLaunch({ url: '/pages/login/login' })
}
</script>

<style scoped>
.oc-page {
	display: flex;
	align-items: center;
	justify-content: center;
	width: 100%;
	min-height: 100vh;
	padding: 48rpx;
	box-sizing: border-box;
	background: radial-gradient(120% 100% at 50% 0%, #1C2A35 0%, #0A0B0D 60%);
}

.oc-card {
	display: flex;
	flex-direction: column;
	width: 100%;
	max-width: 720rpx;
	padding: 64rpx;
	box-sizing: border-box;
	border-radius: 20px;
	border: 1px solid rgba(255, 255, 255, 0.08);
	background: rgba(15, 18, 23, 0.72);
	backdrop-filter: blur(24px) saturate(1.4);
	-webkit-backdrop-filter: blur(24px) saturate(1.4);
	box-shadow: 0 16px 40px rgba(0, 0, 0, 0.45);
}

.oc-eyebrow {
	font-size: 12px;
	font-weight: 600;
	letter-spacing: 0.08em;
	text-transform: uppercase;
	color: #F5C542;
}

.oc-title {
	margin-top: 16rpx;
	font-size: 24px;
	font-weight: 700;
	color: #F5F7FA;
}

.oc-desc {
	margin-top: 16rpx;
	font-size: 15px;
	line-height: 1.6;
	color: rgba(232, 234, 237, 0.72);
}

.oc-alert {
	margin-top: 32rpx;
	padding: 24rpx 32rpx;
	border-radius: 16px;
	font-size: 14px;
	color: #FF8A8A;
	background: rgba(255, 43, 43, 0.10);
}

.oc-cta {
	display: flex;
	align-items: center;
	justify-content: center;
	height: 96rpx;
	margin-top: 48rpx;
	border-radius: 9999px;
	cursor: pointer;
	background: linear-gradient(135deg, #FBBF24, #F59E0B, #F97316);
	box-shadow: 0 10px 30px rgba(245, 158, 11, 0.28);
	transition: opacity 150ms cubic-bezier(0.25, 0.46, 0.45, 0.94);
}

.oc-cta:hover {
	opacity: 0.92;
}

.oc-cta-text {
	font-size: 16px;
	font-weight: 700;
	color: #1A1206;
}
</style>
