<template>
  <div class="conversation-list-scope">
  <!--
    存檔：這張卡的對話清單（owner 2026-09-04：歷史對話＝這張卡的存檔）。
    整列點是切換到那一段；鉛筆是就地改名；刪除交給頁面二次確認；滿了在清單頂端
    說一句「刪掉一段再開」。

    節點名：`.conversation-list-scope`／`.cl-item`／`.bottom .btn` 是作者的卡已經對著
    寫外觀的名字，保留；新加的節點都住在同一個 scope 底下。
  -->
    <div class="cl-title">
      <span class="cl-title-text">{{ title }}</span>
      <span v-if="countText" class="cl-title-count">{{ countText }}</span>
    </div>
    <div v-if="full && fullText" class="cl-full" role="status">{{ fullText }}</div>
    <div class="cl-list">
      <div v-if="!items.length" class="cl-empty">{{ emptyText }}</div>
      <div
        v-for="item in items"
        :key="item.key"
        class="cl-item"
        :class="{ 'is-current': item.current, 'is-editing': editingKey === item.key }"
        role="button"
        tabindex="0"
        :aria-current="item.current ? 'true' : undefined"
        @click="onRowClick(item)"
        @keydown.enter.prevent="onRowClick(item)"
      >
        <span v-if="item.avatar" class="cl-item-avatar">
          <img :src="item.avatar" alt="" />
        </span>
        <span class="cl-item-body">
          <template v-if="editingKey === item.key">
            <CanvasInput
              ref="renameInput"
              el-class="cl-rename-input"
              :value="draft"
              :aria-label="labels.rename"
              @input="draft = ($event.target as HTMLInputElement).value"
              @keydown="onRenameKeydown($event, item)"
            />
          </template>
          <template v-else>
            <span class="cl-item-name">{{ item.name }}</span>
            <span v-if="item.summary" class="cl-item-summary">{{ item.summary }}</span>
            <span class="cl-item-meta">
              <span v-if="item.time" class="cl-item-time">{{ item.time }}</span>
              <span v-if="item.countText" class="cl-item-count">{{ item.countText }}</span>
            </span>
          </template>
        </span>
        <span v-if="item.current && editingKey !== item.key" class="cl-item-tag">{{ currentLabel }}</span>
        <span class="cl-item-actions" @click.stop @keydown.enter.stop>
          <template v-if="editingKey === item.key">
            <button type="button" class="cl-action cl-action-done" @click="commitRename(item)">{{ labels.done }}</button>
            <button type="button" class="cl-action cl-action-cancel" @click="cancelRename">{{ labels.cancel }}</button>
          </template>
          <template v-else>
            <button type="button" class="cl-action cl-action-rename" :aria-label="labels.rename" :title="labels.rename" @click="startRename(item)">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">
                <path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
              </svg>
            </button>
            <button type="button" class="cl-action cl-action-delete" :aria-label="labels.delete" :title="labels.delete" @click="$emit('delete', item.key)">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">
                <path d="M3 6h18" /><path d="M8 6V4h8v2" /><path d="M19 6l-1 14H6L5 6" /><path d="M10 11v6" /><path d="M14 11v6" />
              </svg>
            </button>
          </template>
        </span>
      </div>
    </div>
    <div class="bottom">
      <div class="btn" role="button" tabindex="0"
           @click="$emit('close')"
           @keydown.enter.prevent="$emit('close')">{{ closeText }}</div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { nextTick, ref } from 'vue'
import CanvasInput from './canvas-input'

interface Row {
  key: string
  name: string
  title?: string
  avatar?: string
  summary?: string
  time?: string
  countText?: string
  current?: boolean
}

const props = withDefaults(defineProps<{
  title?: string
  /** 「N/20」那一小段；空字串不畫 */
  countText?: string
  items?: Row[]
  emptyText?: string
  currentLabel?: string
  closeText?: string
  /** 存檔滿了：清單頂端畫 fullText */
  full?: boolean
  fullText?: string
  labels?: { rename: string; delete: string; done: string; cancel: string }
}>(), {
  title: '',
  countText: '',
  items: () => [],
  emptyText: '',
  currentLabel: '',
  closeText: 'Close',
  full: false,
  fullText: '',
  labels: () => ({ rename: 'Rename', delete: 'Delete', done: 'Done', cancel: 'Cancel' }),
})

const emit = defineEmits<{
  (e: 'pick', key: string): void
  (e: 'rename', key: string, title: string): void
  (e: 'delete', key: string): void
  (e: 'close'): void
}>()

// 就地改名的狀態只有一份：同時只會有一列在改。
const editingKey = ref('')
const draft = ref('')
const renameInput = ref<any>(null)

function onRowClick(item: Row) {
  if (editingKey.value === item.key) return
  if (item.current) return
  emit('pick', item.key)
}

function startRename(item: Row) {
  editingKey.value = item.key
  draft.value = String(item.title ?? item.name ?? '')
  nextTick(() => {
    // v-for 裡的 ref 是陣列；元件 expose 的是 { el }
    const inst = Array.isArray(renameInput.value) ? renameInput.value[0] : renameInput.value
    const el = inst && inst.el ? inst.el : inst
    if (el && typeof el.focus === 'function') {
      el.focus()
      if (typeof el.select === 'function') el.select()
    }
  })
}

function onRenameKeydown(event: KeyboardEvent, item: Row) {
  if (event.key === 'Enter') { event.preventDefault(); commitRename(item); return }
  if (event.key === 'Escape' || event.key === 'Esc') { event.preventDefault(); cancelRename() }
}

function cancelRename() {
  editingKey.value = ''
  draft.value = ''
}

function commitRename(item: Row) {
  const next = draft.value.trim()
  const before = String(item.title ?? '').trim()
  editingKey.value = ''
  draft.value = ''
  if (next === before) return
  emit('rename', item.key, next)
}
</script>
