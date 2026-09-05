<template>
  <div v-if="items.length" class="prologue-scope" data-lt="prologue">
    <div class="prologue-title"><span>{{ title }}</span></div>
    <div
      v-for="(item, pi) in items"
      :key="'prologue-' + pi"
      class="prologue-content"
      role="button"
      tabindex="0"
      @click.stop="$emit('pick', pi)"
      @keydown.enter.prevent.stop="$emit('pick', pi)"
      @keydown.space.prevent.stop="$emit('pick', pi)"
    >{{ item }}</div>
  </div>
</template>

<script setup lang="ts">
/*
  MMD 的「你可以选择开场」。

  節點名與位置照 MMD 的 DOM 來：`.prologue-scope > .prologue-title + .prologue-content×n`，
  住在 .chat-body 裡、訊息列之後，是獨立區塊而不是某一則訊息的一部分（卡片的 CSS
  寫 `.prologue-scope .prologue-content{…}`，位置錯了樣式照樣打得到，但版面會跟作者
  在 MMD 上看到的不一樣）。

  點一條的語義由頁面決定（填進輸入框，由玩家送出）；這裡只負責把索引送出去。
  沒有「目前選到哪一條」的狀態——MMD 沒有，因為它不是在選開場白，是在挑一句話說。
*/
defineProps<{
  title: string
  items: string[]
}>()

defineEmits<{
  (e: 'pick', index: number): void
}>()
</script>
