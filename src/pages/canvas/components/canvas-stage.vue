<template>
  <div
    id="bg1"
    class="chat-scope-box"
    data-lt="page"
    :style="stageStyle"
  >
    <div
      id="scrollview"
      class="scroll-view uni-scroll-view"
      ref="scrollEl"
      @scroll="$emit('scroll', $event)"
    >
      <!-- #chat 是酒館的訊息柱，#msglistview 是 MMD 的訊息列容器。
           兩個都是 id，不能掛同一個節點，所以分成兩層——外層負責留白與寬度，
           內層是真正的列表。 -->
      <div id="chat">
        <div id="msglistview" class="chat-body" data-lt="chat">
          <slot></slot>
          <!-- 捲底哨兵：內容什麼時候撐完只有版面知道，用它替代猜延遲。 -->
          <div id="chat-scroll-anchor" class="chat-scroll-anchor" ref="anchorEl"></div>
        </div>
      </div>
    </div>
    <!-- 作者資產的根。實際容器由 author-asset-mount 建在 body 上，這個節點只是
         讓作者的 CSS 有一個可指的畫布名。 -->
    <div data-lt="canvas" class="lt-canvas-root"></div>
  </div>
</template>

<script setup lang="ts">
/*
 舞台＝背景層 + 捲動層 + 訊息列容器。
       背景分直、橫兩張（橫式選填）。元件只寫兩個 CSS 變數，由 canvas.css 依螢幕方向
       選一張畫；不 inline 寫 background-image，作者的卡片 CSS 蓋 `.chat-scope-box`
       時才不必跟 inline 樣式比特異性。沒設就不寫，讓卡片 CSS 的預設值有效。
*/
import { computed, ref } from 'vue'

const props = defineProps<{ backgroundUrl?: string; backgroundLandscapeUrl?: string }>()

const stageStyle = computed(() => {
  const style: Record<string, string> = {}
  if (props.backgroundUrl) style['--lt-bg-portrait'] = 'url(' + props.backgroundUrl + ')'
  if (props.backgroundLandscapeUrl) style['--lt-bg-landscape'] = 'url(' + props.backgroundLandscapeUrl + ')'
  return Object.keys(style).length ? style : null
})
defineEmits<{ (e: 'scroll', ev: Event): void }>()

const scrollEl = ref<HTMLElement | null>(null)
const anchorEl = ref<HTMLElement | null>(null)

defineExpose({ scrollEl, anchorEl })
</script>
