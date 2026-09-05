<template>
  <div class="modify-scope">
  <!-- 一疊選項（MMD 的「更換背景」就是這個形狀）：標題一行，底下每個選項一列。 -->
    <div class="modify-title">{{ title }}</div>
    <div
      v-for="item in items"
      :key="item.key"
      class="modify-item"
      :class="{ 'is-current': item.current }"
      role="button"
      tabindex="0"
      @click="$emit('pick', item.key)"
      @keydown.enter.prevent="$emit('pick', item.key)"
    >{{ item.label }}</div>
  </div>
</template>

<script setup lang="ts">
withDefaults(defineProps<{
  title?: string
  items?: Array<{ key: string; label: string; current?: boolean }>
}>(), { title: '', items: () => [] })

defineEmits<{ (e: 'pick', key: string): void }>()
</script>
