<template>
  <div ref="root" class="u-popup" popover="manual" :class="{ 'is-open': open }" :data-open="open ? 'on' : 'off'" :hidden="!open">
  <!--
    底部抽屜的殼。這一頁的每一個彈層都走這一份——不開新頁面：卡片的 CSS 只作用在
    這一頁，換頁等於卡片的裝修整個消失，而玩家會以為是壞了。

    節點名照 MMD 的 uView 彈層（`.u-popup` > 遮罩 + `.u-popup__content`），
    作者的卡對 `.u-popup__content` 寫了圓角、底色與內距，殼換名字那些規則就全落空。
    真正的內容由呼叫端放進 slot：那才是作者認得的 `.xxx-scope`。

    popover="manual"：開著的時候進瀏覽器 top layer，卡片再大的 z-index 也蓋不到它
    （見 canvas-top-layer.ts）。manual 是為了不讓瀏覽器自己因為點外面／ESC 把它關掉——
    關閉仍由這裡的遮罩與 ESC 處理，狀態才不會跟 `open` 脫鉤。
  -->
    <div
      class="u-mask u-popup__mask"
      @click="$emit('close')"
      @wheel.prevent
      @touchmove.prevent
    ></div>
    <div class="u-popup__content" role="dialog" aria-modal="true" :aria-label="title || undefined">
      <div
        class="u-popup__content__close u-popup__content__close--top-right"
        role="button"
        tabindex="0"
        :aria-label="closeLabel"
        @click="$emit('close')"
        @keydown.enter.prevent="$emit('close')"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">
          <path d="M18 6L6 18" /><path d="M6 6l12 12" />
        </svg>
      </div>
      <!--
        殼自己的標題列，只給裡面那一片沒有標題的彈層（一次性確認）。其他彈層的標題是
        它們在原平台的名字（.mp-title、.np-title…），作者的卡對著那些名字寫外觀，殼不重畫一份。
      -->
      <div v-if="heading && title" class="lt-dialog-head">
        <div class="lt-dialog-title">{{ title }}</div>
      </div>
      <slot></slot>
    </div>
  </div>
</template>

<script setup lang="ts">
import { nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { leaveTopLayer, raiseStopAboveDialogs, raiseToTopLayer } from '../canvas-top-layer'
import { syncChromeTone } from '../canvas-chrome-tone'

/*
  ESC 掛在 document 上，不是掛在殼自己身上。掛在自己身上要焦點落在裡面才收得到，
  而玩家從面板點開這一層時焦點多半還在按鈕上——那時候按 ESC 什麼都不會發生，
  看起來就是「這個東西關不掉」。
*/
const props = withDefaults(defineProps<{
  open?: boolean
  title?: string
  closeLabel?: string
  /** 殼自己畫標題列（裡面那一片沒有標題時才開）。 */
  heading?: boolean
}>(), {
  open: false,
  title: '',
  closeLabel: 'Close',
  heading: false,
})

const emit = defineEmits<{ (e: 'close'): void }>()

function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape' || event.key === 'Esc') emit('close')
}

function bind() {
  if (typeof document === 'undefined') return
  document.addEventListener('keydown', onKeydown)
}

function unbind() {
  if (typeof document === 'undefined') return
  document.removeEventListener('keydown', onKeydown)
}

const root = ref<HTMLElement | null>(null)

watch(() => props.open, (open) => {
  if (open) bind(); else unbind()
  // 等 hidden 拿掉、節點真的顯示了再進 top layer；display:none 的元素 showPopover 會丟錯
  nextTick(() => {
    if (open) { raiseToTopLayer(root.value); raiseStopAboveDialogs() } else leaveTopLayer(root.value)
    // 彈層是開的時候才在畫面上：底色被作者漆成亮色的話，字要在這一刻就變深
    if (open) syncChromeTone(root.value?.ownerDocument || document)
  })
}, { immediate: true })

onBeforeUnmount(() => { unbind(); leaveTopLayer(root.value) })
</script>
