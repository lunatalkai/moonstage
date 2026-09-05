<template>
  <!-- 點選單以外的地方就關掉。少了這一下，玩家長按之後只剩「挑一個動作」一條路，
       而他可能只是想看看有什麼。 -->
  <div
    ref="scopeEl"
    class="msg-option-scope"
    data-lt="message-menu"
    :class="{ 'is-open': open, 'is-anchored': anchored, 'is-editing': editing }"
    @click.self="$emit('close')"
    @keydown.esc="$emit('close')"
  >
    <div class="msg-content-box">
      <div class="mes_text" v-html="message ? message.html : ''"></div>
    </div>

    <div
      ref="boxEl"
      class="msg-options-box"
      :class="placementClass"
      data-lt="message-menu-box"
      :style="boxStyle"
    >
      <template v-for="(item, index) in actions" :key="item.key">
        <div class="option-separator" v-if="index > 0"></div>
        <div
          class="option-item"
          :class="[{ 'is-disabled': item.disabled }, 'lt-option-' + item.key]"
          :data-lt-action="item.key"
          role="button"
          tabindex="0"
          @click="pick(item)"
          @keydown.enter.prevent="pick(item)"
        >
          <component :is="'uni-image'"><div></div></component>
          <span>{{ item.label }}</span>
        </div>
      </template>
    </div>

    <!-- 編輯態。酒館是 .edit_textarea，MMD 是 .msg-modify-scope > .modify-input-box。 -->
    <div class="msg-modify-scope" :class="{ 'is-open': editing }">
      <div class="modify-input-box">
        <CanvasTextarea
          el-class="edit_textarea"
          :value="draft"
          @input="$emit('update:draft', ($event.target as HTMLTextAreaElement).value)"
        />
      </div>
      <div class="confirm-edit-scope">
        <div class="cancel-btn" role="button" tabindex="0" @click="$emit('cancel-edit')">{{ labels.cancel }}</div>
        <div class="btn-gap"></div>
        <div class="ok-btn" role="button" tabindex="0" @click="$emit('confirm-edit')">{{ labels.confirm }}</div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import CanvasTextarea from './canvas-textarea'
import { placeMessageMenu, type MenuPlacement } from '../canvas-menu-position'
import type { MessageMenuAnchor } from './canvas-message.vue'
/*
    訊息選單與編輯的覆蓋層。手機長按、桌機點三個點，兩端呼出的是同一份。
    整組節點常駐 DOM：作者的卡對這一族（.msg-option-scope / .option-item /
    .msg-modify-scope …）寫了完整的一套外觀，節點缺席就等於那套外觀從沒存在過。

    有呼出位置時（anchor）浮層貼著那個位置開：手機開在手指上方、桌機開在 ⋯ 按鈕
    下方，放不下就翻面、貼邊（canvas-menu-position.ts）。沒有位置、或進了編輯態，
    就退回置中的覆蓋層——編輯框要的是空間，不是貼著手指。
*/
const props = withDefaults(defineProps<{
  open?: boolean
  editing?: boolean
  draft?: string
  message?: { html?: string } | null
  actions?: Array<{ key: string; label: string; disabled?: boolean }>
  labels?: { cancel: string; confirm: string }
  anchor?: MessageMenuAnchor | null
}>(), {
  open: false,
  editing: false,
  draft: '',
  message: null,
  actions: () => [],
  labels: () => ({ cancel: 'Cancel', confirm: 'OK' }),
  anchor: null,
})

const emit = defineEmits<{
  (e: 'pick', key: string): void
  (e: 'close'): void
  (e: 'update:draft', v: string): void
  (e: 'cancel-edit'): void
  (e: 'confirm-edit'): void
}>()

/** 浮層開啟的時刻。剛開的那一小段時間內的點擊，多半是手指放開時的合成事件，不是玩家的選擇。 */
const MENU_ARM_MS = 400
const openedAt = ref(0)
watch(() => props.open, (open) => { if (open) openedAt.value = Date.now() }, { immediate: true })

function pick(item: { key: string; disabled?: boolean }) {
  if (!item || item.disabled) return
  if (Date.now() - openedAt.value < MENU_ARM_MS) return
  emit('pick', item.key)
}

const scopeEl = ref<HTMLElement | null>(null)
const boxEl = ref<HTMLElement | null>(null)
const placed = ref<MenuPlacement | null>(null)
/*
  覆蓋層自己在視窗裡的位置。它是 fixed inset:0，但作者的卡常把整個聊天區往右推
  （左邊留給自己的狀態面板）、或給祖先加 transform——那時 fixed 的原點就不再是視窗
  左上角。落點是用視窗座標算的，套上去之前先扣掉覆蓋層自己的偏移。
*/
const scopeOffset = ref({ left: 0, top: 0 })

const anchored = computed(() => props.open && !props.editing && !!props.anchor && !!placed.value)

const boxStyle = computed(() => {
  if (!anchored.value || !placed.value) return undefined
  return {
    left: (placed.value.left - scopeOffset.value.left) + 'px',
    top: (placed.value.top - scopeOffset.value.top) + 'px',
  }
})

const placementClass = computed(() => (anchored.value && placed.value ? 'is-' + placed.value.placement : ''))

/**
 * 量完再放。浮層開啟那一刻先讓它渲染（隱形），量出真正的寬高，再算落點——
 * 動作數量隨訊息不同，估一個固定高度會在項目多的時候撞出視窗底。
 */
async function reposition() {
  placed.value = null
  if (!props.open || props.editing || !props.anchor) return
  await nextTick()
  const el = boxEl.value
  if (!el || typeof window === 'undefined') return
  const scopeRect = scopeEl.value ? scopeEl.value.getBoundingClientRect() : null
  scopeOffset.value = scopeRect ? { left: scopeRect.left, top: scopeRect.top } : { left: 0, top: 0 }
  const rect = el.getBoundingClientRect()
  const menuWidth = rect.width || 240
  const menuHeight = rect.height || 200
  const viewportWidth = window.innerWidth
  const viewportHeight = window.innerHeight
  const anchor = props.anchor
  if (anchor.kind === 'point') {
    placed.value = placeMessageMenu({
      x: anchor.x, y: anchor.y, anchorHeight: 0,
      menuWidth, menuHeight, viewportWidth, viewportHeight,
      prefer: 'above', align: 'center',
    })
  } else {
    placed.value = placeMessageMenu({
      x: anchor.rect.left, y: anchor.rect.top, anchorHeight: anchor.rect.height,
      menuWidth, menuHeight, viewportWidth, viewportHeight,
      prefer: 'below', align: 'start',
    })
  }
}

watch(() => [props.open, props.editing, props.anchor], () => { reposition() }, { immediate: true })
</script>
