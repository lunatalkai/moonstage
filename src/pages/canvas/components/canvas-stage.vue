<template>
  <div
    id="bg1"
    class="chat-scope-box"
    data-lt="page"
    :style="backgroundUrl ? { backgroundImage: 'url(' + backgroundUrl + ')' } : null"
  >
    <div
      id="scrollview"
      class="scroll-view"
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
       背景由卡片 CSS 決定（`.chat-scope-box{background-image:…}`），平台只寫預設值，
       所以這裡的 background-image 走 inline style 的「沒設就不寫」而不是 CSS 寫死。
*/
import { ref } from 'vue'

defineProps<{ backgroundUrl?: string }>()
defineEmits<{ (e: 'scroll', ev: Event): void }>()

const scrollEl = ref<HTMLElement | null>(null)
const anchorEl = ref<HTMLElement | null>(null)

defineExpose({ scrollEl, anchorEl })
</script>
