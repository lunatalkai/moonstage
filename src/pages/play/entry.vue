<template>
	<view class="oc-page">
		<view class="oc-card">
			<text class="oc-eyebrow">{{ $t('openChat.brand') }}</text>
			<text class="oc-title">{{ $t('openChat.entry.title') }}</text>
			<text class="oc-desc">{{ $t('openChat.entry.desc') }}</text>

			<view class="oc-field">
				<input
					class="oc-input"
					type="text"
					v-model="cardId"
					:placeholder="$t('openChat.entry.placeholder')"
					@confirm="lookup"
				/>
			</view>

			<view v-if="errorText" class="oc-alert">{{ errorText }}</view>

			<view v-if="role" class="oc-preview">
				<image v-if="role.rolePic" class="oc-avatar" :src="role.rolePic" mode="aspectFill" />
				<view class="oc-preview-body">
					<text class="oc-preview-name">{{ role.roleName || cardId }}</text>
					<text class="oc-preview-desc">{{ role.roleDesc }}</text>
				</view>
			</view>

			<view class="oc-cta" :class="{ 'is-busy': busy }" @click="role ? startPlaying() : lookup()">
				<text class="oc-cta-text">
					{{ busy ? $t('openChat.entry.loading') : (role ? $t('openChat.entry.start') : $t('openChat.entry.lookup')) }}
				</text>
			</view>

			<text class="oc-note">{{ $t('openChat.entry.note') }}</text>

			<text class="oc-signout" @click="signOut">{{ $t('openChat.entry.signOut') }}</text>
		</view>
	</view>
</template>

<script setup lang="ts">
import { getCurrentInstance, ref, watch } from 'vue'
import { onLoad } from '@dcloudio/uni-app'
import { useI18n } from 'vue-i18n'
import { useStore } from 'vuex'
import { clearTokens, isSignedIn, redirectToLogin } from '@/common/open-oauth'

const { t } = useI18n()
const proxy = getCurrentInstance()?.proxy as any
const store = useStore()

const cardId = ref('')
const role = ref<any>(null)
const busy = ref(false)
const errorText = ref('')

// 換了一張卡就必須重查，否則按下開始會進到上一張卡。
watch(cardId, () => {
	role.value = null
	errorText.value = ''
})

onLoad((options: Record<string, string> = {}) => {
	if (!isSignedIn()) {
		redirectToLogin('/pages/play/entry')
		return
	}
	if (options.roleId) {
		cardId.value = options.roleId
		lookup()
	}
})

async function lookup() {
	const id = cardId.value.trim()
	if (!id || busy.value) return
	busy.value = true
	errorText.value = ''
	role.value = null
	try {
		const res = await proxy.http.get(proxy.requestUrl.getRoleDetail, { data: { roleId: id } })
		if (res.statusCode === 200 && res.data && (res.data.roleId || res.data.roleName)) {
			role.value = res.data
		} else {
			errorText.value = t('openChat.entry.notFound')
		}
	} catch (e) {
		errorText.value = t('openChat.entry.notFound')
	} finally {
		busy.value = false
	}
}

function startPlaying() {
	const id = (role.value?.roleId || cardId.value).toString().trim()
	if (!id) return
	uni.navigateTo({ url: `/pages/canvas/canvas?roleId=${encodeURIComponent(id)}` })
}

function signOut() {
	clearTokens()
	store.commit('setSignedIn', false)
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
	max-width: 880rpx;
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
	font-size: 28px;
	font-weight: 700;
	color: #F5F7FA;
}

.oc-desc {
	margin-top: 16rpx;
	font-size: 15px;
	line-height: 1.6;
	color: rgba(232, 234, 237, 0.72);
}

.oc-field {
	margin-top: 48rpx;
}

.oc-input {
	width: 100%;
	height: 96rpx;
	padding: 0 32rpx;
	box-sizing: border-box;
	border-radius: 9999px;
	border: 1px solid rgba(255, 255, 255, 0.12);
	background: rgba(255, 255, 255, 0.04);
	font-size: 15px;
	color: #F5F7FA;
}

.oc-alert {
	margin-top: 32rpx;
	padding: 24rpx 32rpx;
	border-radius: 16px;
	font-size: 14px;
	color: #FF8A8A;
	background: rgba(255, 43, 43, 0.10);
}

.oc-preview {
	display: flex;
	align-items: center;
	margin-top: 32rpx;
	padding: 24rpx;
	border-radius: 16px;
	border: 1px solid rgba(255, 255, 255, 0.08);
	background: rgba(255, 255, 255, 0.04);
}

.oc-avatar {
	width: 112rpx;
	height: 112rpx;
	border-radius: 9999px;
	flex-shrink: 0;
}

.oc-preview-body {
	display: flex;
	flex-direction: column;
	margin-left: 24rpx;
	min-width: 0;
}

.oc-preview-name {
	font-size: 16px;
	font-weight: 600;
	color: #F5F7FA;
}

.oc-preview-desc {
	margin-top: 8rpx;
	font-size: 13px;
	line-height: 1.5;
	color: rgba(232, 234, 237, 0.60);
	display: -webkit-box;
	-webkit-line-clamp: 2;
	-webkit-box-orient: vertical;
	overflow: hidden;
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

.oc-cta.is-busy {
	opacity: 0.6;
	cursor: default;
}

.oc-cta-text {
	font-size: 16px;
	font-weight: 700;
	color: #1A1206;
}

.oc-note {
	margin-top: 32rpx;
	font-size: 13px;
	line-height: 1.6;
	color: rgba(232, 234, 237, 0.45);
}

.oc-signout {
	margin-top: 32rpx;
	align-self: flex-start;
	font-size: 13px;
	color: rgba(232, 234, 237, 0.45);
	cursor: pointer;
}

.oc-signout:hover {
	color: rgba(245, 247, 250, 0.80);
}
</style>
