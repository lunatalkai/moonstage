<template>
  <view
    class="chat-typing-indicator"
    role="status"
    aria-live="polite"
    aria-atomic="true"
    :aria-label="label"
  >
    <view class="typing-dots" aria-hidden="true">
      <view v-for="index in 3" :key="index" class="typing-dot" />
    </view>
    <text class="typing-label" aria-hidden="true">{{ label }}</text>
  </view>
</template>

<script setup lang="ts">
withDefaults(defineProps<{
  label?: string
}>(), {
  label: 'Replying',
})
</script>

<style scoped>
/*
  取值走畫布的變數、規則放在 @layer 裡：這顆藥丸住在訊息氣泡裡面，作者的卡
  把氣泡漆成亮色時它得跟著換，寫死深底白字會變成一塊貼在亮色氣泡上的黑膏藥
  （owner 2026-09-04：「這個地方沒有被覆蓋到」；09-05 再報「正在回想先前的劇情」
  那格還是黑的——變數的預設值本身就是深色，亮色卡不會改我們的變數）。
  所以底色與邊框直接從 currentColor 調、文字 inherit：卡片設了文字色，它就跟著換。
*/
@layer lt-base {
.chat-typing-indicator {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  min-height: 34px;
  padding: 7px 13px;
  box-sizing: border-box;
  border: var(--lt-canvas-pill-border, 1px solid color-mix(in srgb, currentColor 32%, transparent));
  border-radius: var(--lt-canvas-pill-radius, 9999px);
  background: var(--lt-canvas-pill-bg, color-mix(in srgb, currentColor 7%, transparent));
  color: var(--lt-canvas-pill-fg, inherit);
}

.typing-dots {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
}

.typing-dot {
  width: 5px;
  height: 5px;
  border-radius: var(--luna-r-pill, 9999px);
  background: var(--lt-canvas-accent, var(--luna-gold, #F5C542));
  opacity: 0.38;
  animation: typing-dot-lift 500ms var(--ease-in-out, cubic-bezier(0.4, 0, 0.2, 1)) infinite alternate;
}

.typing-dot:nth-child(2) {
  animation-delay: 150ms;
}

.typing-dot:nth-child(3) {
  animation-delay: 250ms;
}

.typing-label {
  font-size: var(--fs-micro, 12px);
  line-height: 1;
  font-weight: 600;
  letter-spacing: 0.02em;
  white-space: nowrap;
}

@keyframes typing-dot-lift {
  from {
    opacity: 0.38;
    transform: translateY(0);
  }
  to {
    opacity: 1;
    transform: translateY(-2px);
  }
}

@media (prefers-reduced-motion: reduce) {
  .typing-dot {
    animation: none;
    opacity: 0.72;
    transform: none;
  }
}
}
</style>
