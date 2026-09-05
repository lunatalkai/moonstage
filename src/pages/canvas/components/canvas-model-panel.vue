<template>
  <div ref="shellEl" class="model-setting-scope theme-dark">
  <!--
    模型設定。外層節點名照 MMD（`.mp-top` / `.mp-info-bar` / `.mp-setting-body` /
    `.bottom .btn`）——作者的卡對 `.model-setting-scope` 與那顆完成鍵寫了外觀。

    裡面裝的是主站那一份模型選單原封搬進來的元件：分類、排序、搜尋、線路展開、
    可用率、Agent 開關、上下文檔位、思考深度都在裡面，不重寫一份——重寫的那份
    遲早跟主站各說各話。

    這裡曾經還有一個「對話設定」切面（`.history-setting-scope`）。它被拿掉了：
    模型、上下文檔位、Agent 模式本來就都在模型選單裡，而自動摘要不該讓玩家撥
    ——關掉它會讓長對話的記憶行為整個改變，那不是一個開關該承擔的後果。
  -->
    <div class="mp-top">
      <div class="mp-title">{{ title }}</div>
      <div class="mp-close" role="button" tabindex="0"
           :aria-label="labels.close"
           @click="$emit('close')"
           @keydown.enter.prevent="$emit('close')">×</div>
    </div>

    <div class="mp-info-bar">
      <div class="mp-model-name">{{ modelName }}</div>
      <div class="mp-energy-pill" :class="{ 'is-dynamic': scoreDynamic }">
        <span class="mp-ev"><span>{{ scoreText || '—' }}</span></span>
        <span class="mp-el"><span>{{ labels.perTurn }}</span></span>
      </div>
    </div>

    <div class="mp-setting-body">
      <ModelSelectPanel
        ref="picker"
        :open="open"
        :role-id="roleId"
        :select-model="selectedValue"
        :select-model-name="modelName"
        :context="contextValue"
        :thinking-depth="thinkingDepth"
        :show-thinking-process="showThinkingProcess"
        @select="$emit('apply', $event)"
        @close="$emit('close')"
      />
    </div>

    <div class="bottom">
      <div class="btn" role="button" tabindex="0"
           @click="onDone"
           @keydown.enter.prevent="onDone">{{ labels.done }}</div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onBeforeUnmount, ref, watch, nextTick } from 'vue'
import ModelSelectPanel from '@/components/model-select/ModelSelectPanel.vue'
import { attachDragScrollAll } from '../canvas-drag-scroll'

const props = withDefaults(defineProps<{
  /** 彈層開著嗎——模型選單靠它決定要不要重抓清單 */
  open?: boolean
  title?: string
  roleId?: string
  selectedValue?: string
  modelName?: string
  scoreText?: string
  scoreDynamic?: boolean
  contextValue?: number
  thinkingDepth?: string
  showThinkingProcess?: boolean
  labels?: {
    close: string
    done: string
    perTurn: string
  }
}>(), {
  open: true,
  title: '',
  roleId: '',
  selectedValue: '',
  modelName: '',
  scoreText: '',
  scoreDynamic: false,
  contextValue: 1,
  thinkingDepth: '',
  showThinkingProcess: true,
  labels: () => ({ close: 'Close', done: 'Done', perTurn: '/turn' }),
})

const emit = defineEmits<{
  /** 模型選單按下確認：整包設定一次交出去 */
  (e: 'apply', payload: Record<string, unknown>): void
  (e: 'close'): void
}>()

const picker = ref<any>(null)
const shellEl = ref<HTMLElement | null>(null)

// 分類與排序那兩條橫向 rail 在桌機要拉得動（滑鼠沒有橫向滾輪）。每次打開重掛：
// rail 是選單重新渲染出來的節點。
let detachRails: () => void = () => {}
watch(() => props.open, async (open) => {
  detachRails(); detachRails = () => {}
  if (!open) return
  await nextTick()
  detachRails = attachDragScrollAll(shellEl.value, '.ms-rail')
}, { immediate: true })
onBeforeUnmount(() => { detachRails() })

/*
  作者的卡寫的是 `.model-setting-scope .bottom .btn`，所以完成鍵必須留在殼上。
  按它等於按選單自己的確認鍵——中間的高消費確認也走同一條路，不是兩套。
*/
function onDone() {
  const inner = picker.value
  if (inner && typeof inner.sure === 'function') {
    inner.sure()
    return
  }
  emit('close')
}
</script>
