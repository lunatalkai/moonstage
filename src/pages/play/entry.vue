<template>
	<view class="ms-page">
		<view class="ms-shell">
			<!-- 字標列：品牌在左，登入狀態在右。 -->
			<view class="ms-topbar">
				<view class="ms-brand">
					<text class="ms-wordmark">{{ $t('openChat.brand') }}</text>
					<text class="ms-tagline">{{ $t('openChat.tagline') }}</text>
				</view>
				<view class="ms-account">
					<template v-if="signedIn">
						<text class="ms-pill">{{ $t('openChat.entry.signedIn') }}</text>
						<text class="ms-link" @click="signOut">{{ $t('openChat.entry.signOut') }}</text>
					</template>
					<text v-else class="ms-link is-strong" @click="goSignIn">{{ $t('openChat.entry.signIn') }}</text>
				</view>
			</view>

			<!--
				兩個欄位、一個動作。
				欄位 A：一張卡；欄位 B：一份正則檔。填了哪個決定接下來做什麼，動作列把它說出來。
			-->
			<view class="ms-stage">
				<view class="ms-columns">
					<!-- 欄位 A：角色卡 -->
					<view class="ms-panel">
						<text class="ms-panel-title">{{ $t('openChat.entry.cardTitle') }}</text>
						<text class="ms-panel-desc">{{ signedIn ? $t('openChat.entry.cardDesc') : $t('openChat.entry.cardDescSignedOut') }}</text>

						<view class="ms-field">
							<input
								class="ms-input"
								type="text"
								v-model="cardId"
								:placeholder="$t('openChat.entry.placeholder')"
								@confirm="lookup"
							/>
							<view class="ms-btn" :class="{ 'is-disabled': !cardId.trim() || busy }" @click="lookup">
								<text class="ms-btn-text">{{ busy ? $t('openChat.entry.loading') : $t('openChat.entry.lookup') }}</text>
							</view>
						</view>

						<view v-if="errorText" class="ms-alert">{{ errorText }}</view>

						<view v-if="role" class="ms-card">
							<image v-if="role.roleAvatar || role.rolePic" class="ms-card-avatar" :src="role.roleAvatar || role.rolePic" mode="aspectFill" />
							<view v-else class="ms-card-avatar"></view>
							<view class="ms-card-body">
								<text class="ms-card-name">{{ role.roleName || cardId }}</text>
								<text v-if="role.authorName" class="ms-card-author">{{ $t('openChat.entry.cardAuthor', { name: role.authorName }) }}</text>
								<text v-if="role.roleDesc" class="ms-card-desc">{{ role.roleDesc }}</text>
							</view>
						</view>
					</view>

					<!-- 欄位 B：正則檔。手機上收起，點標題展開。 -->
					<view class="ms-panel" :class="{ 'is-collapsed': !fileOpen }">
						<view class="ms-panel-head" @click="fileOpen = !fileOpen">
							<text class="ms-panel-title">{{ $t('openChat.entry.fileTitle') }}</text>
							<text class="ms-chevron" :class="{ 'is-open': fileOpen }">›</text>
						</view>
						<view class="ms-panel-body">
							<text class="ms-panel-desc">{{ $t('openChat.entry.fileDesc') }}</text>

							<view id="ms-drop" class="ms-drop" :class="{ 'is-over': dragOver }" @click="pickFile">
								<text class="ms-drop-text">{{ $t('openChat.entry.dropHint') }}</text>
								<text class="ms-drop-action">{{ $t('openChat.entry.chooseFile') }}</text>
								<text class="ms-drop-formats">{{ $t('openChat.entry.formats') }}</text>
							</view>

							<text class="ms-link ms-paste-toggle" @click="pasteOpen = !pasteOpen">{{ $t('openChat.entry.pasteToggle') }}</text>
							<view v-if="pasteOpen" class="ms-paste">
								<textarea
									class="ms-textarea"
									v-model="pasteText"
									:placeholder="$t('openChat.entry.pastePlaceholder')"
									:maxlength="-1"
								/>
								<view class="ms-btn is-small" :class="{ 'is-disabled': !pasteText.trim() }" @click="importPasted">
									<text class="ms-btn-text">{{ $t('openChat.entry.import') }}</text>
								</view>
							</view>

							<view v-if="draftError" class="ms-alert">{{ draftError }}</view>
							<view v-if="storeReady && !storePersistent" class="ms-alert is-warn">{{ $t('openChat.entry.draftNotPersistent') }}</view>

							<text class="ms-list-title">{{ $t('openChat.entry.draftRecent') }}</text>
							<text v-if="storeReady && !drafts.length" class="ms-empty">{{ $t('openChat.entry.draftEmpty') }}</text>
							<view
								v-for="d in drafts"
								:key="d.id"
								class="ms-draft"
								:class="{ 'is-selected': selectedDraftId === d.id }"
								@click="toggleDraft(d)"
							>
								<view class="ms-radio" :class="{ 'is-on': selectedDraftId === d.id }"></view>
								<view class="ms-draft-body">
									<text class="ms-draft-name">{{ draftName(d) }}</text>
									<text class="ms-draft-meta">{{ formatLabel(d) }} · {{ $t('openChat.entry.draftRules', { n: d.rules.length }) }}</text>
								</view>
								<text class="ms-draft-delete" :aria-label="$t('openChat.entry.draftDelete')" @click.stop="deleteDraft(d)">×</text>
							</view>
						</view>
					</view>
				</view>

				<!-- 動作列：一句話說明接下來會發生什麼，一顆主按鈕。手機上固定在底部。 -->
				<view class="ms-action">
					<text class="ms-summary">{{ summaryText }}</text>
					<view class="ms-cta" :class="{ 'is-disabled': !canProceed }" @click="proceed">
						<text class="ms-cta-text">{{ ctaText }}</text>
					</view>
				</view>
			</view>

			<view class="ms-footer">
				<text class="ms-footer-text">{{ $t('openChat.entry.modes') }}</text>
				<view class="ms-footer-links">
					<text class="ms-footer-text">{{ $t('openChat.entry.credit') }}</text>
					<text class="ms-link" @click="openSource">{{ $t('openChat.entry.source') }}</text>
				</view>
			</view>
		</view>
	</view>
</template>

<script setup lang="ts">
import { computed, getCurrentInstance, onMounted, onBeforeUnmount, ref, watch } from 'vue'
import { onLoad } from '@dcloudio/uni-app'
import { useI18n } from 'vue-i18n'
import { useStore } from 'vuex'
import { clearTokens, isSignedIn, redirectToLogin } from '@/common/open-oauth'
import { importAuthorDraft, DraftImportError, draftDisplayName, stripFileExtension } from '@/common/author-draft'
import type { AuthorDraft } from '@/common/author-draft'
import { getAuthorDraftStore } from '@/common/author-draft-store'

const SOURCE_URL = 'https://github.com/lunatalkai/moonstage'
// 窄於這個寬度視為手機：正則檔那一段預設收起，動作列固定在底部（CSS 同一個斷點）。
const NARROW_MAX_PX = 900

const { t } = useI18n()
const proxy = getCurrentInstance()?.proxy as any
const store = useStore()

// ── 欄位 A：角色卡 ────────────────────────────────────────────────────
const cardId = ref('')
const role = ref<any>(null)
const busy = ref(false)
const errorText = ref('')
const signedIn = ref(false)

// 換了編號就必須重查，否則按下開始會進到上一張卡。
watch(cardId, () => {
	role.value = null
	errorText.value = ''
})

// ── 欄位 B：正則檔 ────────────────────────────────────────────────────
const drafts = ref<AuthorDraft[]>([])
const selectedDraftId = ref('')
const pasteOpen = ref(false)
const pasteText = ref('')
const draftError = ref('')
const storeReady = ref(false)
const storePersistent = ref(true)
const fileOpen = ref(true)
const dragOver = ref(false)

const selectedDraft = computed(() => drafts.value.find((d) => d.id === selectedDraftId.value) || null)

// ── 接下來會發生什麼 ──────────────────────────────────────────────────
const canProceed = computed(() => !!role.value || !!selectedDraft.value || !!cardId.value.trim())

const summaryText = computed(() => {
	const draft = selectedDraft.value
	const card = role.value
	if (card && draft) return t('openChat.entry.summaryBoth', { card: card.roleName || cardId.value, draft: draftName(draft) })
	if (card) return t('openChat.entry.summaryCard', { card: card.roleName || cardId.value })
	if (draft) return t('openChat.entry.summaryDraft', { draft: draftName(draft) })
	if (cardId.value.trim()) return t('openChat.entry.summaryLookup')
	return t('openChat.entry.summaryEmpty')
})

const ctaText = computed(() => {
	const draft = selectedDraft.value
	const card = role.value
	if (card && draft) return t('openChat.entry.ctaBoth')
	if (card) return t('openChat.entry.ctaCard')
	if (draft) return t('openChat.entry.ctaDraft')
	if (cardId.value.trim()) return busy.value ? t('openChat.entry.loading') : t('openChat.entry.lookup')
	return t('openChat.entry.ctaCard')
})

function proceed() {
	if (!canProceed.value) return
	const draft = selectedDraft.value
	const card = role.value
	if (card) {
		const id = (card.roleId || cardId.value).toString().trim()
		const query = draft
			? `roleId=${encodeURIComponent(id)}&draft=${encodeURIComponent(draft.id)}`
			: `roleId=${encodeURIComponent(id)}`
		uni.navigateTo({ url: `/pages/canvas/canvas?${query}` })
		return
	}
	if (draft) {
		uni.navigateTo({ url: `/pages/canvas/canvas?draft=${encodeURIComponent(draft.id)}` })
		return
	}
	lookup()
}

onLoad((options: Record<string, string> = {}) => {
	// 沒登入也能進來：本機預覽不需要帳號。查卡時才把人送去登入。
	signedIn.value = isSignedIn()
	// #ifdef H5
	fileOpen.value = typeof window === 'undefined' || window.innerWidth > NARROW_MAX_PX
	// #endif
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

function signOut() {
	clearTokens()
	store.commit('setSignedIn', false)
	uni.reLaunch({ url: '/pages/login/login' })
}

function openSource() {
	// #ifdef H5
	window.open(SOURCE_URL, '_blank', 'noopener')
	// #endif
}

// ── 草稿 ──────────────────────────────────────────────────────────────
async function refreshDrafts() {
	try {
		const s = await getAuthorDraftStore()
		storePersistent.value = s.persistent
		drafts.value = await s.list()
		if (selectedDraftId.value && !drafts.value.some((d) => d.id === selectedDraftId.value)) selectedDraftId.value = ''
	} catch (e) {
		drafts.value = []
	} finally {
		storeReady.value = true
	}
}

function toggleDraft(d: AuthorDraft) {
	selectedDraftId.value = selectedDraftId.value === d.id ? '' : d.id
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
		.then(() => {
			// 剛匯入的那份就是使用者要試的：直接選起來，動作列立刻反映。
			selectedDraftId.value = draft.id
			pasteText.value = ''
			pasteOpen.value = false
		})
}

function importFile(file: File | null | undefined) {
	if (!file) return
	file.text().then((text) => importText(text, stripFileExtension(file.name)))
}

// uni-app 的 input 元件不做檔案；直接開一個原生的選檔器（只在瀏覽器裡跑）。
function pickFile() {
	// #ifdef H5
	const input = document.createElement('input')
	input.type = 'file'
	input.accept = '.json,application/json'
	input.onchange = () => importFile(input.files && input.files[0])
	input.click()
	// #endif
}

function importPasted() {
	if (!pasteText.value.trim()) return
	importText(pasteText.value, '')
}

function draftName(d: AuthorDraft) {
	return draftDisplayName(d) || t('openChat.entry.draftUntitled')
}

const FORMAT_LABELS: Record<string, string> = {
	'mmd-regex-list': 'MMD',
	'mmd-export': 'MMD',
	'mmd-payload': 'MMD',
	'st-regex': 'SillyTavern',
	'st-card': 'SillyTavern',
	'moonstage-asset': 'Moonstage',
}

function formatLabel(d: AuthorDraft) {
	return FORMAT_LABELS[d.format] || d.format
}

async function deleteDraft(d: AuthorDraft) {
	const s = await getAuthorDraftStore()
	await s.remove(d.id)
	await refreshDrafts()
}

// 拖放：uni-app 的 view 在 H5 不轉發 drag 事件，直接掛原生監聽。
// #ifdef H5
let dropEl: HTMLElement | null = null
const onDragOver = (e: DragEvent) => { e.preventDefault(); dragOver.value = true }
const onDragLeave = () => { dragOver.value = false }
const onDrop = (e: DragEvent) => {
	e.preventDefault()
	dragOver.value = false
	importFile(e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0])
}
onMounted(() => {
	dropEl = document.getElementById('ms-drop')
	if (!dropEl) return
	dropEl.addEventListener('dragover', onDragOver)
	dropEl.addEventListener('dragleave', onDragLeave)
	dropEl.addEventListener('drop', onDrop)
})
onBeforeUnmount(() => {
	if (!dropEl) return
	dropEl.removeEventListener('dragover', onDragOver)
	dropEl.removeEventListener('dragleave', onDragLeave)
	dropEl.removeEventListener('drop', onDrop)
})
// #endif
</script>

<style scoped>
/*
 入口頁。深色玻璃、金色只給主按鈕與選中的草稿；間距走 rpx，字級走 px（桌面優先，見 DESIGN §5.2）。
 900px 以下切成單欄：正則檔面板收起、動作列固定在底部。
*/
.ms-page {
	width: 100%;
	min-height: 100vh;
	box-sizing: border-box;
	padding: 48rpx 32rpx 160rpx;
	background: radial-gradient(120% 90% at 50% 0%, #1C2A35 0%, #0A0B0D 65%);
	color: #F5F7FA;
}

.ms-shell {
	width: 100%;
	max-width: 1120px;
	margin: 0 auto;
}

/* ── 字標列 ─────────────────────────────────────────────── */
.ms-topbar {
	display: flex;
	align-items: flex-end;
	justify-content: space-between;
	gap: 32rpx;
	padding: 16rpx 8rpx 40rpx;
}

.ms-brand {
	display: flex;
	flex-direction: column;
	gap: 8rpx;
}

.ms-wordmark {
	font-size: 26px;
	font-weight: 800;
	letter-spacing: 0.02em;
	color: #F5F7FA;
}

.ms-tagline {
	font-size: 14px;
	color: rgba(232, 234, 237, 0.6);
}

.ms-account {
	display: flex;
	align-items: center;
	gap: 24rpx;
	flex-shrink: 0;
}

.ms-pill {
	padding: 6px 12px;
	border-radius: 9999px;
	border: 1px solid rgba(255, 255, 255, 0.12);
	font-size: 12px;
	color: rgba(232, 234, 237, 0.72);
}

.ms-link {
	font-size: 13px;
	font-weight: 600;
	color: rgba(232, 234, 237, 0.6);
	cursor: pointer;
}

.ms-link:hover {
	color: #F5F7FA;
}

.ms-link.is-strong {
	color: #F5C542;
}

/* ── 舞台面板 ───────────────────────────────────────────── */
.ms-stage {
	border-radius: 20px;
	border: 1px solid rgba(255, 255, 255, 0.08);
	background: rgba(15, 18, 23, 0.72);
	backdrop-filter: blur(24px) saturate(1.4);
	-webkit-backdrop-filter: blur(24px) saturate(1.4);
	box-shadow: 0 16px 40px rgba(0, 0, 0, 0.45);
	overflow: hidden;
}

.ms-columns {
	display: grid;
	grid-template-columns: 1fr 1fr;
}

.ms-panel {
	display: flex;
	flex-direction: column;
	min-width: 0;
	padding: 48rpx;
	box-sizing: border-box;
}

.ms-panel + .ms-panel {
	border-left: 1px solid rgba(255, 255, 255, 0.08);
}

.ms-panel-head {
	display: flex;
	align-items: center;
	justify-content: space-between;
}

.ms-panel-title {
	font-size: 18px;
	font-weight: 700;
	color: #F5F7FA;
}

.ms-chevron {
	display: none;
	font-size: 22px;
	line-height: 1;
	color: rgba(232, 234, 237, 0.5);
	transform: rotate(90deg);
	transition: transform 150ms cubic-bezier(0.25, 0.46, 0.45, 0.94);
}

.ms-chevron.is-open {
	transform: rotate(-90deg);
}

.ms-panel-body {
	display: flex;
	flex-direction: column;
}

.ms-panel-desc {
	margin-top: 12rpx;
	font-size: 14px;
	line-height: 1.6;
	color: rgba(232, 234, 237, 0.62);
}

/* ── 欄位 A ─────────────────────────────────────────────── */
.ms-field {
	display: flex;
	gap: 16rpx;
	margin-top: 32rpx;
}

.ms-input {
	flex: 1 1 auto;
	min-width: 0;
	height: 88rpx;
	padding: 0 28rpx;
	box-sizing: border-box;
	border-radius: 9999px;
	border: 1px solid rgba(255, 255, 255, 0.12);
	background: rgba(255, 255, 255, 0.04);
	font-size: 15px;
	color: #F5F7FA;
}

.ms-btn {
	display: flex;
	align-items: center;
	justify-content: center;
	flex-shrink: 0;
	height: 88rpx;
	padding: 0 36rpx;
	border-radius: 9999px;
	border: 1px solid rgba(255, 255, 255, 0.16);
	background: rgba(255, 255, 255, 0.06);
	cursor: pointer;
	transition: opacity 150ms cubic-bezier(0.25, 0.46, 0.45, 0.94);
}

.ms-btn:hover {
	opacity: 0.85;
}

.ms-btn.is-small {
	height: 72rpx;
	align-self: flex-end;
	margin-top: 16rpx;
}

.ms-btn.is-disabled {
	opacity: 0.4;
	cursor: default;
}

.ms-btn-text {
	font-size: 14px;
	font-weight: 600;
	color: #F5F7FA;
	white-space: nowrap;
}

.ms-alert {
	margin-top: 24rpx;
	padding: 20rpx 28rpx;
	border-radius: 16px;
	font-size: 13px;
	line-height: 1.5;
	color: #FF8A8A;
	background: rgba(255, 43, 43, 0.10);
}

.ms-alert.is-warn {
	color: #FFD166;
	background: rgba(255, 183, 3, 0.10);
}

.ms-card {
	display: flex;
	align-items: center;
	gap: 24rpx;
	margin-top: 32rpx;
	padding: 24rpx;
	border-radius: 16px;
	border: 1px solid rgba(245, 197, 66, 0.35);
	background: rgba(245, 197, 66, 0.06);
}

.ms-card-avatar {
	width: 112rpx;
	height: 112rpx;
	border-radius: 9999px;
	flex-shrink: 0;
	background: rgba(255, 255, 255, 0.06);
}

.ms-card-body {
	display: flex;
	flex-direction: column;
	min-width: 0;
	gap: 6rpx;
}

.ms-card-name {
	font-size: 16px;
	font-weight: 700;
	color: #F5F7FA;
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
}

.ms-card-author {
	font-size: 12px;
	color: rgba(232, 234, 237, 0.55);
}

.ms-card-desc {
	font-size: 13px;
	line-height: 1.5;
	color: rgba(232, 234, 237, 0.65);
	display: -webkit-box;
	-webkit-line-clamp: 2;
	-webkit-box-orient: vertical;
	overflow: hidden;
}

/* ── 欄位 B ─────────────────────────────────────────────── */
.ms-drop {
	display: flex;
	flex-direction: column;
	align-items: center;
	justify-content: center;
	gap: 8rpx;
	min-height: 200rpx;
	margin-top: 32rpx;
	padding: 32rpx;
	box-sizing: border-box;
	border-radius: 16px;
	border: 1px dashed rgba(255, 255, 255, 0.22);
	background: rgba(255, 255, 255, 0.03);
	cursor: pointer;
	text-align: center;
	transition: border-color 150ms cubic-bezier(0.25, 0.46, 0.45, 0.94), background 150ms cubic-bezier(0.25, 0.46, 0.45, 0.94);
}

.ms-drop:hover,
.ms-drop.is-over {
	border-color: rgba(245, 197, 66, 0.7);
	background: rgba(245, 197, 66, 0.06);
}

.ms-drop-text {
	font-size: 14px;
	color: rgba(232, 234, 237, 0.72);
}

.ms-drop-action {
	font-size: 14px;
	font-weight: 700;
	color: #F5C542;
}

.ms-drop-formats {
	margin-top: 8rpx;
	font-size: 12px;
	color: rgba(232, 234, 237, 0.45);
}

.ms-paste-toggle {
	align-self: flex-start;
	margin-top: 24rpx;
}

.ms-paste {
	display: flex;
	flex-direction: column;
	margin-top: 16rpx;
}

.ms-textarea {
	width: 100%;
	height: 200rpx;
	padding: 20rpx 28rpx;
	box-sizing: border-box;
	border-radius: 16px;
	border: 1px solid rgba(255, 255, 255, 0.12);
	background: rgba(255, 255, 255, 0.04);
	font-size: 13px;
	font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
	color: #F5F7FA;
}

.ms-list-title {
	margin-top: 40rpx;
	font-size: 13px;
	font-weight: 600;
	letter-spacing: 0.04em;
	color: rgba(232, 234, 237, 0.55);
}

.ms-empty {
	margin-top: 16rpx;
	font-size: 13px;
	color: rgba(232, 234, 237, 0.45);
}

.ms-draft {
	display: flex;
	align-items: center;
	gap: 20rpx;
	margin-top: 12rpx;
	padding: 20rpx 24rpx;
	border-radius: 16px;
	border: 1px solid rgba(255, 255, 255, 0.08);
	background: rgba(255, 255, 255, 0.03);
	cursor: pointer;
	transition: border-color 150ms cubic-bezier(0.25, 0.46, 0.45, 0.94);
}

.ms-draft:hover {
	border-color: rgba(255, 255, 255, 0.2);
}

.ms-draft.is-selected {
	border-color: rgba(245, 197, 66, 0.7);
	background: rgba(245, 197, 66, 0.08);
}

.ms-radio {
	width: 32rpx;
	height: 32rpx;
	flex-shrink: 0;
	border-radius: 9999px;
	border: 2px solid rgba(255, 255, 255, 0.3);
	box-sizing: border-box;
}

.ms-radio.is-on {
	border-color: #F5C542;
	background: radial-gradient(circle, #F5C542 0 40%, transparent 42%);
}

.ms-draft-body {
	display: flex;
	flex-direction: column;
	flex: 1 1 auto;
	min-width: 0;
}

.ms-draft-name {
	font-size: 14px;
	font-weight: 600;
	color: #F5F7FA;
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
}

.ms-draft-meta {
	margin-top: 4rpx;
	font-size: 12px;
	color: rgba(232, 234, 237, 0.5);
}

.ms-draft-delete {
	flex-shrink: 0;
	width: 48rpx;
	height: 48rpx;
	line-height: 48rpx;
	text-align: center;
	border-radius: 9999px;
	font-size: 18px;
	color: rgba(232, 234, 237, 0.45);
	cursor: pointer;
}

.ms-draft-delete:hover {
	color: #F5F7FA;
	background: rgba(255, 255, 255, 0.08);
}

/* ── 動作列 ─────────────────────────────────────────────── */
.ms-action {
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: 32rpx;
	padding: 32rpx 48rpx;
	border-top: 1px solid rgba(255, 255, 255, 0.08);
	background: rgba(255, 255, 255, 0.02);
}

.ms-summary {
	flex: 1 1 auto;
	min-width: 0;
	font-size: 14px;
	line-height: 1.5;
	color: rgba(232, 234, 237, 0.75);
}

.ms-cta {
	display: flex;
	align-items: center;
	justify-content: center;
	flex-shrink: 0;
	height: 88rpx;
	min-width: 280rpx;
	padding: 0 48rpx;
	border-radius: 9999px;
	cursor: pointer;
	background: linear-gradient(135deg, #FBBF24, #F59E0B, #F97316);
	box-shadow: 0 10px 30px rgba(245, 158, 11, 0.28);
	transition: opacity 150ms cubic-bezier(0.25, 0.46, 0.45, 0.94);
}

.ms-cta:hover {
	opacity: 0.92;
}

.ms-cta.is-disabled {
	opacity: 0.35;
	box-shadow: none;
	cursor: default;
}

.ms-cta-text {
	font-size: 15px;
	font-weight: 700;
	color: #1A1206;
	white-space: nowrap;
}

/* ── 頁尾 ───────────────────────────────────────────────── */
.ms-footer {
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: 32rpx;
	padding: 32rpx 8rpx;
}

.ms-footer-links {
	display: flex;
	align-items: center;
	gap: 24rpx;
	flex-shrink: 0;
}

.ms-footer-text {
	font-size: 12px;
	line-height: 1.6;
	color: rgba(232, 234, 237, 0.45);
}

/* ── 手機 ───────────────────────────────────────────────── */
@media (max-width: 900px) {
	.ms-page {
		padding: 32rpx 24rpx 240rpx;
	}

	.ms-topbar {
		align-items: flex-start;
		flex-direction: column;
		gap: 16rpx;
	}

	.ms-wordmark {
		font-size: 22px;
	}

	.ms-columns {
		grid-template-columns: 1fr;
	}

	/* backdrop-filter 會讓底下的 fixed 動作列以面板為基準定位；手機上底色夠深，拿掉玻璃。 */
	.ms-stage {
		backdrop-filter: none;
		-webkit-backdrop-filter: none;
	}

	.ms-panel {
		padding: 40rpx 32rpx;
	}

	.ms-panel + .ms-panel {
		border-left: 0;
		border-top: 1px solid rgba(255, 255, 255, 0.08);
	}

	.ms-panel-head {
		cursor: pointer;
	}

	.ms-chevron {
		display: block;
	}

	.ms-panel.is-collapsed .ms-panel-body {
		display: none;
	}

	.ms-action {
		position: fixed;
		left: 0;
		right: 0;
		bottom: 0;
		z-index: 10;
		flex-direction: column;
		align-items: stretch;
		gap: 16rpx;
		padding: 24rpx 32rpx calc(24rpx + env(safe-area-inset-bottom));
		border-top: 1px solid rgba(255, 255, 255, 0.1);
		background: rgba(15, 18, 23, 0.9);
		backdrop-filter: blur(20px) saturate(1.4);
		-webkit-backdrop-filter: blur(20px) saturate(1.4);
	}

	.ms-summary {
		font-size: 13px;
	}

	.ms-cta {
		width: 100%;
	}

	.ms-footer {
		flex-direction: column;
		align-items: flex-start;
		gap: 16rpx;
	}
}

/* 觸控裝置沒有拖放，只留選檔。 */
@media (hover: none) {
	.ms-drop-text {
		display: none;
	}
}
</style>
