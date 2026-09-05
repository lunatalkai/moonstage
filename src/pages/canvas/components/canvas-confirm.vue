<template>
  <div class="confirm-scope">
  <!--
    一次性確認。節點名照 MMD（.confirm-scope > .confirm-content + .confirm-bottom
    裡確定在前、取消在後）——作者的卡對這一族寫了按鈕外觀，順序換掉他的
    `:first-child` 之類的規則就會上錯顆。
  -->
    <div class="confirm-content">{{ content }}</div>
    <div class="confirm-bottom">
      <div class="ok-btn" role="button" tabindex="0"
           @click="$emit('ok')"
           @keydown.enter.prevent="$emit('ok')">{{ okText }}</div>
      <div class="btn-gap"></div>
      <div class="cancel-btn" role="button" tabindex="0"
           @click="$emit('cancel')"
           @keydown.enter.prevent="$emit('cancel')">{{ cancelText }}</div>
    </div>
  </div>
</template>

<script setup lang="ts">
withDefaults(defineProps<{
  content?: string
  okText?: string
  cancelText?: string
}>(), { content: '', okText: 'OK', cancelText: 'Cancel' })

defineEmits<{ (e: 'ok'): void; (e: 'cancel'): void }>()
</script>
