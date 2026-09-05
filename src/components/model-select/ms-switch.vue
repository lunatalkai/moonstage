<template>
  <!--
    開關。介面跟平台元件庫那顆一樣（`v-model:checked` ＋ `@change` 拿到新值），
    只是自己畫——畫布這條路由不掛平台的元件庫：卡片的 CSS 沒有沙盒，它會打到
    那些元件而作者根本不知道它們存在。
  -->
  <span
    class="ms-switch"
    :class="{ 'is-on': checked, 'is-disabled': disabled, 'is-small': size === 'small' }"
    role="switch"
    :aria-checked="checked ? 'true' : 'false'"
    :aria-disabled="disabled ? 'true' : 'false'"
    :tabindex="disabled ? -1 : 0"
    @click="toggle"
    @keydown.enter.prevent="toggle"
    @keydown.space.prevent="toggle"
  >
    <span class="ms-switch-knob"></span>
  </span>
</template>

<script setup lang="ts">
const props = withDefaults(defineProps<{
  checked?: boolean
  disabled?: boolean
  size?: string
}>(), { checked: false, disabled: false, size: '' })

const emit = defineEmits<{
  (e: 'update:checked', v: boolean): void
  (e: 'change', v: boolean): void
}>()

function toggle() {
  if (props.disabled) return
  const next = !props.checked
  emit('update:checked', next)
  emit('change', next)
}
</script>

<style scoped>
/* 取值全走畫布的變數、規則全在 @layer 裡：作者把彈層漆成亮色時，這顆開關要跟著
   換，不能自己留一套深色（見 canvas-theme-vars.css 的彈層那一段）。 */
@layer lt-base {
  .ms-switch {
    display: inline-block;
    position: relative;
    width: 44px;
    height: 24px;
    border-radius: 9999px;
    background: var(--lt-canvas-sheet-item-bg-on);
    transition: background 150ms cubic-bezier(0.4, 0, 0.2, 1);
    cursor: pointer;
    flex-shrink: 0;
  }
  .ms-switch.is-small { width: 36px; height: 20px; }
  .ms-switch.is-on { background: var(--lt-canvas-accent); }
  .ms-switch.is-disabled { opacity: 0.4; cursor: not-allowed; }

  .ms-switch-knob {
    position: absolute;
    top: 2px;
    left: 2px;
    width: 20px;
    height: 20px;
    border-radius: 9999px;
    /* 撥柄跟主色配色：主色深就白鈕、主色亮就深鈕（--lt-canvas-accent-fg 由卡片量到的
       主色算出來）。先前用彈層的地色，那是我們的深色預設，全頁盤點裡唯一漏網的一顆。 */
    background: var(--lt-canvas-accent-fg, #ffffff);
    transition: transform 150ms cubic-bezier(0.4, 0, 0.2, 1);
  }
  .ms-switch.is-small .ms-switch-knob { width: 16px; height: 16px; }
  .ms-switch.is-on .ms-switch-knob { transform: translateX(20px); }
  .ms-switch.is-small.is-on .ms-switch-knob { transform: translateX(16px); }
}
</style>
