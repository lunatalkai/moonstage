<template>
  <div class="u-popup" :class="{ 'is-open': open }" :data-open="open ? 'on' : 'off'" :hidden="!open">
  <!--
    底部抽屜的殼。這一頁的每一個彈層都走這一份——不開新頁面：卡片的 CSS 只作用在
    這一頁，換頁等於卡片的裝修整個消失，而玩家會以為是壞了。

    節點名照 MMD 的 uView 彈層（`.u-popup` > 遮罩 + `.u-popup__content`），
    作者的卡對 `.u-popup__content` 寫了圓角、底色與內距，殼換名字那些規則就全落空。
    真正的內容由呼叫端放進 slot：那才是作者認得的 `.xxx-scope`。
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
      >×</div>
      <slot></slot>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onBeforeUnmount, watch } from 'vue'

/*
  ESC 掛在 document 上，不是掛在殼自己身上。掛在自己身上要焦點落在裡面才收得到，
  而玩家從面板點開這一層時焦點多半還在按鈕上——那時候按 ESC 什麼都不會發生，
  看起來就是「這個東西關不掉」。
*/
const props = withDefaults(defineProps<{
  open?: boolean
  title?: string
  closeLabel?: string
}>(), {
  open: false,
  title: '',
  closeLabel: 'Close',
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

watch(() => props.open, (open) => { if (open) bind(); else unbind() }, { immediate: true })

onBeforeUnmount(unbind)
</script>
