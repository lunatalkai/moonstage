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

			<view v-if="signedIn" class="oc-cta" :class="{ 'is-busy': busy }" @click="role ? startPlaying() : lookup()">
				<text class="oc-cta-text">
					{{ busy ? $t('openChat.entry.loading') : (role ? $t('openChat.entry.start') : $t('openChat.entry.lookup')) }}
				</text>
			</view>
			<view v-else class="oc-cta" @click="goSignIn">
				<text class="oc-cta-text">{{ $t('openChat.entry.signIn') }}</text>
			</view>

			<text class="oc-note">{{ signedIn ? $t('openChat.entry.note') : $t('openChat.entry.signInNote') }}</text>

			<!-- 本機檔案預覽：不需要登入、不上傳。作者把正則檔丟進來就能看畫出來的樣子。 -->
			<view class="oc-divider"></view>
			<text class="oc-subtitle">{{ $t('openChat.entry.draftTitle') }}</text>
			<text class="oc-desc">{{ $t('openChat.entry.draftDesc') }}</text>

			<view class="oc-row">
				<view class="oc-btn" @click="pickFile">
					<text class="oc-btn-text">{{ $t('openChat.entry.draftPick') }}</text>
				</view>
			</view>
			<textarea
				class="oc-textarea"
				v-model="pasteText"
				:placeholder="$t('openChat.entry.draftPaste')"
				:maxlength="-1"
				auto-height
			/>
			<view v-if="pasteText.trim()" class="oc-row">
				<view class="oc-btn is-primary" @click="importPasted">
					<text class="oc-btn-text">{{ $t('openChat.entry.draftImport') }}</text>
				</view>
			</view>

			<view v-if="draftError" class="oc-alert">{{ draftError }}</view>
			<view v-if="storeReady && !storePersistent" class="oc-alert is-warn">{{ $t('openChat.entry.draftNotPersistent') }}</view>

			<text class="oc-subtitle is-small">{{ $t('openChat.entry.draftRecent') }}</text>
			<text v-if="storeReady && !drafts.length" class="oc-note">{{ $t('openChat.entry.draftEmpty') }}</text>
			<view v-for="d in drafts" :key="d.id" class="oc-draft">
				<view class="oc-draft-body">
					<text class="oc-draft-name">{{ draftName(d) }}</text>
					<text class="oc-draft-meta">{{ formatLabel(d) }} · {{ $t('openChat.entry.draftRules', { n: d.rules.length }) }}</text>
				</view>
				<view class="oc-draft-actions">
					<text class="oc-link" @click="previewDraft(d)">{{ $t('openChat.entry.draftPreview') }}</text>
					<text v-if="role" class="oc-link" @click="previewDraft(d, true)">{{ $t('openChat.entry.draftWithCard') }}</text>
					<text class="oc-link is-danger" @click="deleteDraft(d)">{{ $t('openChat.entry.draftDelete') }}</text>
				</view>
			</view>

			<text v-if="signedIn" class="oc-signout" @click="signOut">{{ $t('openChat.entry.signOut') }}</text>
		</view>
	</view>
</template>

<script setup lang="ts">
import { getCurrentInstance, ref, watch } from 'vue'
import { onLoad } from '@dcloudio/uni-app'
import { useI18n } from 'vue-i18n'
import { useStore } from 'vuex'
import { clearTokens, isSignedIn, redirectToLogin } from '@/common/open-oauth'
import { importAuthorDraft, DraftImportError, draftDisplayName, stripFileExtension } from '@/common/author-draft'
import type { AuthorDraft } from '@/common/author-draft'
import { getAuthorDraftStore } from '@/common/author-draft-store'

const { t } = useI18n()
const proxy = getCurrentInstance()?.proxy as any
const store = useStore()

const cardId = ref('')
const role = ref<any>(null)
const busy = ref(false)
const errorText = ref('')
const signedIn = ref(false)

// ── 本機草稿 ──────────────────────────────────────────────────────────
const drafts = ref<AuthorDraft[]>([])
const pasteText = ref('')
const draftError = ref('')
const storeReady = ref(false)
const storePersistent = ref(true)

// 換了一張卡就必須重查，否則按下開始會進到上一張卡。
watch(cardId, () => {
	role.value = null
	errorText.value = ''
})

onLoad((options: Record<string, string> = {}) => {
	// 沒登入也能進來：本機預覽不需要帳號。卡片那一段在需要時才把人送去登入。
	signedIn.value = isSignedIn()
	refreshDrafts()
	if (options.roleId) {
		cardId.value = options.roleId
		if (signedIn.value) lookup()
	}
})

function goSignIn() {
	redirectToLogin('/pages/play/entry')
}

async function lookup() {
	const id = cardId.value.trim()
	if (!id || busy.value) return
	if (!signedIn.value) {
		goSignIn()
		return
	}
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

async function refreshDrafts() {
	try {
		const s = await getAuthorDraftStore()
		storePersistent.value = s.persistent
		drafts.value = await s.list()
	} catch (e) {
		drafts.value = []
	} finally {
		storeReady.value = true
	}
}

function importText(text: string, fallbackName: string) {
	draftError.value = ''
	let draft: AuthorDraft
	try {
		draft = importAuthorDraft(text, fallbackName)
	} catch (e) {
		const reason = e instanceof DraftImportError ? e.reason : 'unknown-format'
		draftError.value = t(
			reason === 'invalid-json' ? 'openChat.entry.draftInvalidJson'
				: reason === 'empty' ? 'openChat.entry.draftEmptyFile'
					: 'openChat.entry.draftUnknownFormat',
		)
		return
	}
	getAuthorDraftStore()
		.then((s) => s.put(draft))
		.then(refreshDrafts)
		.then(() => { pasteText.value = '' })
}

// uni-app 的 input 元件不做檔案；直接開一個原生的選檔器（只在瀏覽器裡跑）。
function pickFile() {
	// #ifdef H5
	const input = document.createElement('input')
	input.type = 'file'
	input.accept = '.json,application/json'
	input.onchange = () => {
		const file = input.files && input.files[0]
		if (!file) return
		file.text().then((text) => importText(text, stripFileExtension(file.name)))
	}
	input.click()
	// #endif
}

function importPasted() {
	importText(pasteText.value, '')
}

function draftName(d: AuthorDraft) {
	return draftDisplayName(d) || t('openChat.entry.draftUntitled')
}

const FORMAT_LABELS: Record<string, string> = {
	'mmd-regex-list': 'MMD',
	'mmd-payload': 'MMD',
	'st-regex': 'SillyTavern',
	'st-card': 'SillyTavern',
	'moonstage-asset': 'Moonstage',
}

function formatLabel(d: AuthorDraft) {
	return FORMAT_LABELS[d.format] || d.format
}

function previewDraft(d: AuthorDraft, withCard = false) {
	const id = withCard ? (role.value?.roleId || cardId.value).toString().trim() : ''
	const query = id
		? `roleId=${encodeURIComponent(id)}&draft=${encodeURIComponent(d.id)}`
		: `draft=${encodeURIComponent(d.id)}`
	uni.navigateTo({ url: `/pages/canvas/canvas?${query}` })
}

async function deleteDraft(d: AuthorDraft) {
	const s = await getAuthorDraftStore()
	await s.remove(d.id)
	await refreshDrafts()
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

.oc-divider {
	height: 1px;
	margin-top: 48rpx;
	background: rgba(255, 255, 255, 0.08);
}

.oc-subtitle {
	margin-top: 48rpx;
	font-size: 18px;
	font-weight: 700;
	color: #F5F7FA;
}

.oc-subtitle.is-small {
	margin-top: 40rpx;
	font-size: 14px;
	font-weight: 600;
	color: rgba(232, 234, 237, 0.72);
}

.oc-row {
	display: flex;
	gap: 16rpx;
	margin-top: 24rpx;
}

.oc-btn {
	display: flex;
	align-items: center;
	justify-content: center;
	height: 80rpx;
	padding: 0 32rpx;
	border-radius: 9999px;
	border: 1px solid rgba(255, 255, 255, 0.16);
	background: rgba(255, 255, 255, 0.06);
	cursor: pointer;
	transition: opacity 150ms cubic-bezier(0.25, 0.46, 0.45, 0.94);
}

.oc-btn:hover {
	opacity: 0.85;
}

.oc-btn.is-primary {
	border-color: transparent;
	background: linear-gradient(135deg, #FBBF24, #F59E0B, #F97316);
}

.oc-btn-text {
	font-size: 14px;
	font-weight: 600;
	color: #F5F7FA;
}

.oc-btn.is-primary .oc-btn-text {
	color: #1A1206;
}

.oc-textarea {
	width: 100%;
	min-height: 160rpx;
	max-height: 480rpx;
	margin-top: 24rpx;
	padding: 24rpx 32rpx;
	box-sizing: border-box;
	border-radius: 20px;
	border: 1px solid rgba(255, 255, 255, 0.12);
	background: rgba(255, 255, 255, 0.04);
	font-size: 13px;
	font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
	color: #F5F7FA;
}

.oc-alert.is-warn {
	color: #FFD166;
	background: rgba(255, 183, 3, 0.10);
}

.oc-draft {
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: 24rpx;
	margin-top: 16rpx;
	padding: 24rpx;
	border-radius: 16px;
	border: 1px solid rgba(255, 255, 255, 0.08);
	background: rgba(255, 255, 255, 0.04);
}

.oc-draft-body {
	display: flex;
	flex-direction: column;
	min-width: 0;
}

.oc-draft-name {
	font-size: 15px;
	font-weight: 600;
	color: #F5F7FA;
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
}

.oc-draft-meta {
	margin-top: 4rpx;
	font-size: 12px;
	color: rgba(232, 234, 237, 0.55);
}

.oc-draft-actions {
	display: flex;
	flex-shrink: 0;
	gap: 24rpx;
}

.oc-link {
	font-size: 13px;
	font-weight: 600;
	color: #F5C542;
	cursor: pointer;
}

.oc-link.is-danger {
	color: rgba(232, 234, 237, 0.55);
}

.oc-link:hover {
	opacity: 0.8;
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
