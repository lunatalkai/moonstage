<template>
  <div class="custom-instruction-scope">
  <!--
    長期指令。節點名照 MMD 實測：
      .custom-instruction-scope > .list-scope
        > .header-scope(.close-btn, .title)
        + .sub-title            「(3/10)」
        + .empty-default-show    一條都沒有時的那句話
        + .content-scope > .item(.left, .right, .gap)
      .edit-scope 底下多了 .btn-scope > .add-btn（MMD 把它放標題列；這裡跟輸入區同一區、在底部動作列）

    `.empty-default-show` 與 `.edit-scope` 常駐 DOM（用 hidden 收起來）：
    節點不存在的話作者寫的規則會命中零個，他只看得到「引擎壞了」。
  -->
    <div class="list-scope">
      <div class="header-scope">
        <div class="close-btn" role="button" tabindex="0"
             :aria-label="labels.close"
             @click="$emit('close')"
             @keydown.enter.prevent="$emit('close')">×</div>
        <div class="title">{{ labels.title }}</div>
      </div>

      <div class="sub-title">{{ countText }}</div>

      <div class="empty-default-show" :hidden="loading || list.length > 0">{{ labels.empty }}</div>

      <div class="content-scope">
        <div v-if="loading" class="ci-loading">{{ labels.loading }}</div>
        <div v-else-if="loadFailed" class="ci-error">
          <span class="ci-error-text">{{ labels.loadFailed }}</span>
          <span class="ci-retry" role="button" tabindex="0"
                @click="$emit('retry')"
                @keydown.enter.prevent="$emit('retry')">{{ labels.retry }}</span>
        </div>
        <div v-for="item in list" :key="item.sourceId" class="item">
          <div class="left">
            <template v-if="editingSourceId === item.sourceId">
              <CanvasTextField
                el-class="custom-textarea-box"
                :value="editingText"
                :maxlength="maxLength"
                @input="$emit('update:editing-text', $event)"
              />
            </template>
            <template v-else>
              <span class="item-text">{{ item.text }}</span>
              <span class="item-origin">{{ item.origin === 'manual' ? labels.originManual : labels.originAi }}</span>
            </template>
          </div>
          <div class="right">
            <template v-if="editingSourceId === item.sourceId">
              <div class="ci-btn" role="button" tabindex="0"
                   @click="$emit('cancel-edit')"
                   @keydown.enter.prevent="$emit('cancel-edit')">{{ labels.cancel }}</div>
              <div class="ci-btn ci-btn-primary" role="button" tabindex="0"
                   @click="$emit('save-edit', item.sourceId)"
                   @keydown.enter.prevent="$emit('save-edit', item.sourceId)">{{ labels.save }}</div>
            </template>
            <template v-else-if="pendingDeleteId === item.sourceId">
              <!--
                刪除的確認留在這一列上，不另開一個確認彈層：規則是「同時只有一個
                彈層」，開確認等於把這一片換掉——玩家點的那一條連同整份清單一起
                消失，回來之後不知道剛剛按到什麼。
              -->
              <div class="ci-btn" role="button" tabindex="0"
                   @click="$emit('cancel-delete')"
                   @keydown.enter.prevent="$emit('cancel-delete')">{{ labels.cancel }}</div>
              <div class="ci-btn ci-btn-danger" role="button" tabindex="0"
                   @click="$emit('confirm-delete', item.sourceId)"
                   @keydown.enter.prevent="$emit('confirm-delete', item.sourceId)">{{ labels.deleteConfirmShort }}</div>
            </template>
            <template v-else>
              <div class="ci-btn" role="button" tabindex="0"
                   @click="$emit('edit', item.sourceId)"
                   @keydown.enter.prevent="$emit('edit', item.sourceId)">{{ labels.edit }}</div>
              <div class="ci-btn ci-btn-danger" role="button" tabindex="0"
                   @click="$emit('ask-delete', item.sourceId)"
                   @keydown.enter.prevent="$emit('ask-delete', item.sourceId)">{{ labels.delete }}</div>
            </template>
          </div>
          <div class="gap"></div>
        </div>
      </div>
    </div>

    <!-- 新增／編輯用的輸入區。MMD 把它收在 `.edit-scope` 底下。 -->
    <div class="edit-scope">
      <div class="content-scope">
        <div class="form-item">
          <div class="custom-textarea-box">
            <CanvasTextField
              el-class="custom-textarea"
              :value="draft"
              :maxlength="maxLength"
              :placeholder="addPlaceholder"
              :disabled="!hasConversation"
              @input="$emit('update:draft', $event)"
            />
          </div>
          <div class="ci-count">{{ draft.length }}/{{ maxLength }}</div>
        </div>
      </div>
      <!-- 面板蓋在系統提示之上，所以回饋必須留在面板裡。 -->
      <div class="ci-add-error" :hidden="!error">{{ error }}</div>
      <!-- 「添加」跟它作用的輸入區放一起、在底部動作列——不在標題列。節點名（.btn-scope > .add-btn）照 MMD。 -->
      <div class="btn-scope">
        <div
          class="add-btn"
          role="button"
          tabindex="0"
          :class="{ 'is-disabled': !canAdd }"
          :aria-disabled="canAdd ? 'false' : 'true'"
          @click="onAdd"
          @keydown.enter.prevent="onAdd"
        >{{ labels.add }}</div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { CanvasTextField } from './canvas-field'
import type { DirectiveItem } from '../canvas-directives'

const props = withDefaults(defineProps<{
  list?: DirectiveItem[]
  countText?: string
  maxLength?: number
  loading?: boolean
  loadFailed?: boolean
  hasConversation?: boolean
  canAdd?: boolean
  draft?: string
  editingSourceId?: string
  editingText?: string
  pendingDeleteId?: string
  error?: string
  labels?: {
    title: string
    close: string
    add: string
    edit: string
    delete: string
    deleteConfirmShort: string
    save: string
    cancel: string
    empty: string
    loading: string
    loadFailed: string
    retry: string
    placeholder: string
    waitingConversation: string
    originManual: string
    originAi: string
  }
}>(), {
  list: () => [],
  countText: '',
  maxLength: 200,
  loading: false,
  loadFailed: false,
  hasConversation: true,
  canAdd: false,
  draft: '',
  editingSourceId: '',
  editingText: '',
  pendingDeleteId: '',
  error: '',
  labels: () => ({
    title: '', close: 'Close', add: 'Add', edit: 'Edit', delete: 'Delete',
    deleteConfirmShort: 'Delete', save: 'Save', cancel: 'Cancel',
    empty: '', loading: '', loadFailed: '', retry: 'Retry',
    placeholder: '', waitingConversation: '', originManual: '', originAi: '',
  }),
})

const emit = defineEmits<{
  (e: 'add'): void
  (e: 'edit', sourceId: string): void
  (e: 'save-edit', sourceId: string): void
  (e: 'cancel-edit'): void
  (e: 'ask-delete', sourceId: string): void
  (e: 'confirm-delete', sourceId: string): void
  (e: 'cancel-delete'): void
  (e: 'retry'): void
  (e: 'close'): void
  (e: 'update:draft', value: string): void
  (e: 'update:editing-text', value: string): void
}>()

// 對話還沒建立時把原因寫在輸入框裡：把鍵變灰而不說話，玩家不知道要等什麼。
const addPlaceholder = computed(() =>
  (props.hasConversation ? props.labels.placeholder : props.labels.waitingConversation))

function onAdd() {
  if (!props.canAdd) return
  emit('add')
}
</script>
