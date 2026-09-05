<template>
  <div class="notepad-scope">
  <!--
    AI 筆記：只有玩家看得到的一份記錄，AI 每一輪都會讀。

    這個名字是我們自己的——MMD 沒有這個功能，所以沒有作者會打的名字可以對齊。
    外面那層 `.u-popup__content` 仍然是 MMD 的殼，作者的圓角、底色、內距照樣生效。

    所有確認都留在這一片裡，不另開彈層：規則是「同時只有一個彈層」，開確認等於把
    這一片換掉——玩家剛寫的字連同整個面板一起消失，回來之後不知道發生過什麼。
  -->
    <div class="np-top">
      <div class="np-title">{{ labels.title }}</div>
      <div class="np-close" role="button" tabindex="0"
           :aria-label="labels.close"
           @click="onClose"
           @keydown.enter.prevent="onClose">×</div>
    </div>
    <div class="np-subtitle">{{ labels.subtitle }}</div>

    <div v-if="loading" class="np-loading">{{ labels.loading }}</div>

    <!--
      載入失敗時不給編輯入口。伺服器上那份筆記還在，編輯區卻是空的——開放編輯
      等於讓玩家用一片空白覆蓋掉自己的記錄。
    -->
    <div v-else-if="loadFailed" class="np-error">
      <span class="np-error-text">{{ labels.loadFailed }}</span>
      <span class="np-retry" role="button" tabindex="0"
            @click="$emit('retry')"
            @keydown.enter.prevent="$emit('retry')">{{ labels.retry }}</span>
    </div>

    <template v-else>
      <div class="np-input-wrap">
        <CanvasTextField
          el-class="np-textarea"
          :value="draft"
          :maxlength="maxLength"
          :placeholder="hasConversation ? labels.placeholder : labels.waitingConversation"
          :disabled="!hasConversation"
          @input="$emit('update:draft', $event)"
        />
      </div>

      <!--
        門檻以下完全不顯示計數：不要只為了告知而打斷。
        「原本沒有的東西出現了」本身就是狀態變化的信號。
      -->
      <div v-if="noticeLevel !== 'none'" class="np-footnote" :class="{ 'is-over': noticeLevel === 'over' }">
        <span class="np-count">{{ draft.length }} / {{ maxLength }}</span>
        <span class="np-hint">{{ noticeText }}</span>
      </div>

      <!-- 從別段對話把筆記抄過來。這一份是跟著對話走的，換了一張卡就要重寫，
           而多數人的第一份筆記是上一段對話那份的延續。 -->
      <div class="np-copy" :hidden="!copyOpen">
        <div v-if="!conversations.length" class="np-copy-empty">{{ labels.copyEmpty }}</div>
        <div v-for="row in conversations" :key="row.key" class="np-copy-item">
          <span class="np-copy-name">{{ row.name || labels.untitled }}</span>
          <template v-if="pendingCopyKey === row.key">
            <!-- 覆蓋是不可逆的：先問一次，而且問句就留在這一列上。 -->
            <span class="np-copy-confirm-text">{{ labels.copyOverwrite }}</span>
            <span class="np-copy-cancel" role="button" tabindex="0"
                  @click="pendingCopyKey = ''"
                  @keydown.enter.prevent="pendingCopyKey = ''">{{ labels.keepEditing }}</span>
            <span class="np-copy-ok" role="button" tabindex="0"
                  @click="confirmCopy(row.key)"
                  @keydown.enter.prevent="confirmCopy(row.key)">{{ labels.copyOverwriteOk }}</span>
          </template>
          <span v-else class="np-copy-pick" role="button" tabindex="0"
                @click="askCopy(row.key)"
                @keydown.enter.prevent="askCopy(row.key)">{{ labels.copyPick }}</span>
        </div>
      </div>

      <!-- 範本是次要動作：把常用的骨架存起來，開新對話時直接填進來。 -->
      <div class="np-templates" :hidden="!templatesOpen">
        <!-- 匯入：貼上別人分享的碼。放最前面——社群分享是模板庫的主要入口（同 mobile）。
             打錯一個字當場就說得出是哪一種問題，不必等伺服器。 -->
        <div class="np-import">
          <CanvasInput
            el-class="np-code-input"
            :value="code"
            :placeholder="labels.codePlaceholder"
            @input="$emit('update:code', $event)"
          />
          <span class="np-code-btn" role="button" tabindex="0"
                :class="{ 'is-disabled': codeStatus !== 'ok' || previewing }"
                :aria-disabled="codeStatus !== 'ok' || previewing ? 'true' : 'false'"
                @click="previewCode"
                @keydown.enter.prevent="previewCode">{{ labels.codePreview }}</span>
        </div>
        <div class="np-code-hint" :hidden="!codeHint">{{ codeHint }}</div>

        <!-- 套用前先看：不可逆的覆蓋之前，讓玩家看到自己將要接受什麼。 -->
        <div class="np-preview" :hidden="!previewOpen">
          <div class="np-preview-title">{{ previewTitle || labels.templateUntitled }}</div>
          <div class="np-preview-body">{{ previewContent }}</div>
          <div class="np-preview-actions">
            <span class="np-preview-cancel" role="button" tabindex="0"
                  @click="$emit('cancel-preview')"
                  @keydown.enter.prevent="$emit('cancel-preview')">{{ labels.cancel }}</span>
            <span class="np-preview-ok" role="button" tabindex="0"
                  :class="{ 'is-disabled': importing }"
                  @click="!importing && $emit('confirm-import')"
                  @keydown.enter.prevent="!importing && $emit('confirm-import')">{{ labels.importToLibrary }}</span>
          </div>
        </div>

        <!-- 分享碼：內容是產生那一刻的樣子；停止分享只擋還沒匯入的人。 -->
        <div class="np-share" :hidden="!shareOpen">
          <div class="np-share-code" role="button" tabindex="0"
               @click="$emit('copy-share-code')"
               @keydown.enter.prevent="$emit('copy-share-code')">{{ shareCode }}</div>
          <div class="np-share-hint">{{ labels.shareHint }}</div>
          <div class="np-share-actions">
            <span class="np-share-revoke" role="button" tabindex="0"
                  @click="$emit('revoke-share')"
                  @keydown.enter.prevent="$emit('revoke-share')">{{ labels.revoke }}</span>
            <span class="np-share-copy" role="button" tabindex="0"
                  @click="$emit('copy-share-code')"
                  @keydown.enter.prevent="$emit('copy-share-code')">{{ labels.copyCode }}</span>
            <span class="np-share-close" role="button" tabindex="0"
                  @click="$emit('close-share')"
                  @keydown.enter.prevent="$emit('close-share')">{{ labels.done }}</span>
          </div>
        </div>

        <div v-if="!templates.length" class="np-template-empty">{{ labels.templateEmpty }}</div>
        <div v-for="tpl in templates" :key="tpl.templateId" class="np-template-item">
          <span class="np-template-name">{{ tpl.title || labels.templateUntitled }}</span>
          <template v-if="pendingDeleteId === tpl.templateId">
            <!-- 刪除不可逆：問一次，問句就留在這一列上（同抄筆記那列）。 -->
            <span class="np-template-delete-text">{{ labels.templateDeleteConfirm }}</span>
            <span class="np-template-delete-cancel" role="button" tabindex="0"
                  @click="pendingDeleteId = ''"
                  @keydown.enter.prevent="pendingDeleteId = ''">{{ labels.cancel }}</span>
            <span class="np-template-delete-ok" role="button" tabindex="0"
                  @click="confirmDelete(tpl.templateId)"
                  @keydown.enter.prevent="confirmDelete(tpl.templateId)">{{ labels.templateDelete }}</span>
          </template>
          <template v-else>
            <span class="np-template-apply" role="button" tabindex="0"
                  @click="$emit('apply-template', tpl.templateId)"
                  @keydown.enter.prevent="$emit('apply-template', tpl.templateId)">{{ labels.templateApply }}</span>
            <span class="np-template-share" role="button" tabindex="0"
                  @click="$emit('share-template', tpl.templateId)"
                  @keydown.enter.prevent="$emit('share-template', tpl.templateId)">{{ labels.templateShare }}</span>
            <span class="np-template-delete" role="button" tabindex="0"
                  @click="pendingDeleteId = tpl.templateId"
                  @keydown.enter.prevent="pendingDeleteId = tpl.templateId">{{ labels.templateDelete }}</span>
          </template>
        </div>
      </div>
    </template>

    <!-- 關掉時還有沒存的字：問一次。這一段留在面板裡，不叫系統對話框——
         那種框不吃作者的主題，而且會把玩家的注意力帶離他正在寫的東西。 -->
    <div class="np-discard" :hidden="!discardAsked">
      <span class="np-discard-text">{{ labels.discardTitle }}</span>
      <span class="np-discard-keep" role="button" tabindex="0"
            @click="discardAsked = false"
            @keydown.enter.prevent="discardAsked = false">{{ labels.keepEditing }}</span>
      <span class="np-discard-ok" role="button" tabindex="0"
            @click="$emit('close')"
            @keydown.enter.prevent="$emit('close')">{{ labels.discardOk }}</span>
    </div>

    <div class="np-actions">
      <div class="np-copy-btn" role="button" tabindex="0"
           :class="{ 'is-disabled': loading || loadFailed }"
           @click="$emit('toggle-copy')"
           @keydown.enter.prevent="$emit('toggle-copy')">{{ labels.copyFrom }}</div>
      <div class="np-template-btn" role="button" tabindex="0"
           :class="{ 'is-disabled': loading || loadFailed }"
           @click="$emit('toggle-templates')"
           @keydown.enter.prevent="$emit('toggle-templates')">{{ labels.templateEntry }}</div>
      <div class="np-save-template-btn" role="button" tabindex="0"
           :hidden="!templatesOpen"
           @click="$emit('save-template')"
           @keydown.enter.prevent="$emit('save-template')">{{ labels.templateSaveCurrent }}</div>
      <div class="np-save-btn" role="button" tabindex="0"
           :class="{ 'is-disabled': saveDisabled }"
           :aria-disabled="saveDisabled ? 'true' : 'false'"
           @click="onSave"
           @keydown.enter.prevent="onSave">{{ labels.save }}</div>
    </div>

    <div class="np-message" :hidden="!error">{{ error }}</div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { CanvasInput, CanvasTextField } from './canvas-field'
import { validateShareCodeInput } from '../../../utils/share-code'

const props = withDefaults(defineProps<{
  draft?: string
  /** 伺服器上目前存著的那份。跟草稿不一樣就代表有沒存的修改。 */
  savedContent?: string
  maxLength?: number
  /** 超過這個長度，這段對話就不再吃長對話的積分優惠 */
  discountThreshold?: number
  loading?: boolean
  loadFailed?: boolean
  saving?: boolean
  hasConversation?: boolean
  templatesOpen?: boolean
  templates?: Array<{ templateId: string; title?: string }>
  /** 分享碼輸入框的內容（由外面持有，匯入成功後外面清掉） */
  code?: string
  previewing?: boolean
  previewOpen?: boolean
  previewTitle?: string
  previewContent?: string
  importing?: boolean
  shareOpen?: boolean
  shareCode?: string
  copyOpen?: boolean
  conversations?: Array<{ key: string; name?: string }>
  error?: string
  labels?: {
    title: string
    subtitle: string
    close: string
    save: string
    loading: string
    loadFailed: string
    retry: string
    placeholder: string
    waitingConversation: string
    costNotice: string
    overBy: string
    templateEntry: string
    templateApply: string
    templateEmpty: string
    templateUntitled: string
    templateSaveCurrent: string
    templateShare: string
    templateDelete: string
    templateDeleteConfirm: string
    codePlaceholder: string
    codePreview: string
    codeMalformed: string
    codeChecksum: string
    cancel: string
    importToLibrary: string
    shareHint: string
    revoke: string
    copyCode: string
    done: string
    copyFrom: string
    copyEmpty: string
    copyPick: string
    copyOverwrite: string
    copyOverwriteOk: string
    untitled: string
    discardTitle: string
    discardOk: string
    keepEditing: string
  }
}>(), {
  draft: '',
  savedContent: '',
  maxLength: 10000,
  discountThreshold: 2000,
  loading: false,
  loadFailed: false,
  saving: false,
  hasConversation: true,
  templatesOpen: false,
  templates: () => [],
  code: '',
  previewing: false,
  previewOpen: false,
  previewTitle: '',
  previewContent: '',
  importing: false,
  shareOpen: false,
  shareCode: '',
  copyOpen: false,
  conversations: () => [],
  error: '',
  labels: () => ({
    title: '', subtitle: '', close: 'Close', save: 'Save',
    loading: '', loadFailed: '', retry: 'Retry',
    placeholder: '', waitingConversation: '',
    costNotice: '', overBy: '',
    templateEntry: '', templateApply: '', templateEmpty: '',
    templateUntitled: '', templateSaveCurrent: '',
    templateShare: '', templateDelete: '', templateDeleteConfirm: '',
    codePlaceholder: '', codePreview: '', codeMalformed: '', codeChecksum: '',
    cancel: 'Cancel', importToLibrary: '', shareHint: '', revoke: '', copyCode: '', done: 'Done',
    copyFrom: '', copyEmpty: '', copyPick: '', copyOverwrite: '', copyOverwriteOk: '',
    untitled: '', discardTitle: '', discardOk: '', keepEditing: '',
  }),
})

const emit = defineEmits<{
  (e: 'save'): void
  (e: 'retry'): void
  (e: 'close'): void
  (e: 'toggle-templates'): void
  (e: 'apply-template', templateId: string): void
  (e: 'save-template'): void
  (e: 'update:code', value: string): void
  (e: 'preview-code', canonical: string): void
  (e: 'cancel-preview'): void
  (e: 'confirm-import'): void
  (e: 'share-template', templateId: string): void
  (e: 'delete-template', templateId: string): void
  (e: 'copy-share-code'): void
  (e: 'revoke-share'): void
  (e: 'close-share'): void
  (e: 'toggle-copy'): void
  (e: 'copy-from', key: string): void
  (e: 'update:draft', value: string): void
}>()

const pendingCopyKey = ref('')
const pendingDeleteId = ref('')
const discardAsked = ref(false)

// 分享碼在打完的當下就分得出「還沒打」「形狀不對」「抄錯一個字」——三者的下一步不同。
const codeParsed = computed(() => validateShareCodeInput(props.code))
const codeStatus = computed(() => codeParsed.value.status)
const codeHint = computed(() => {
  if (codeStatus.value === 'malformed') return props.labels.codeMalformed
  if (codeStatus.value === 'checksum') return props.labels.codeChecksum
  return ''
})

function previewCode() {
  const parsed = codeParsed.value
  if (parsed.status !== 'ok' || props.previewing) return
  emit('preview-code', parsed.canonical)
}

function confirmDelete(templateId: string) {
  pendingDeleteId.value = ''
  emit('delete-template', templateId)
}

watch(() => props.copyOpen, (open) => { if (!open) pendingCopyKey.value = '' })

const noticeLevel = computed<'none' | 'notice' | 'over'>(() => {
  if (props.draft.length > props.maxLength) return 'over'
  if (props.discountThreshold > 0 && props.draft.length > props.discountThreshold) return 'notice'
  return 'none'
})

const noticeText = computed(() =>
  (noticeLevel.value === 'over' ? props.labels.overBy : props.labels.costNotice))

const saveDisabled = computed(() =>
  props.saving || props.loading || props.loadFailed || !props.hasConversation
  || props.draft.length > props.maxLength)

const hasUnsaved = computed(() => props.draft !== props.savedContent)

function onSave() {
  if (saveDisabled.value) return
  emit('save')
}

function askCopy(key: string) {
  pendingCopyKey.value = key
}

function confirmCopy(key: string) {
  pendingCopyKey.value = ''
  emit('copy-from', key)
}

/*
  關掉之前先看有沒有沒存的字。直接關掉的話那幾行字就沒了，而玩家通常是點到旁邊
  才關掉的——他沒有要放棄。
*/
function onClose() {
  if (hasUnsaved.value && !props.loading && !props.loadFailed) {
    discardAsked.value = true
    return
  }
  emit('close')
}

defineExpose({ hasUnsaved })
</script>
