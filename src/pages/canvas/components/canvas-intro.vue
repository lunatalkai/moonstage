<template>
  <div
    class="item Ai avatar-body mes"
    :class="{ 'is-empty': !String(text || '').trim() }"
    data-lt="description"
    is_user="false"
    is_system="true"
  >
    <div class="touch-scope mes_block">
      <div
        class="content left mes_text intro-body"
        :class="{ 'is-open': open }"
        role="button"
        tabindex="0"
        @click="$emit('toggle')"
        @keydown.enter.prevent="$emit('toggle')"
        @keydown.space.prevent="$emit('toggle')"
      >{{ text }}</div>
    </div>
  </div>
</template>

<script setup lang="ts">
/*
 角色介紹。示範卡的作者在他的樣式裡寫著
       `.item.Ai.avatar-body{display:none}`，旁邊還留了一行註解說「要顯示就把這行刪了」。
       所以這個節點必須存在——即使沒有描述文字，也必須畫得出來，
       否則那條規則命中零個節點，作者只會覺得引擎壞了。

       但「存在」不等於「畫一個空框」：卡片沒有描述時，這一列帶 is-empty，
       由 canvas.css 收起來。作者的卡把 .content.left 漆成有邊框的氣泡時，
       一個空的介紹列就是標題底下那個莫名其妙的白色小空框（owner 2026-09-04
       回報：每個對話都有、PC 也有）。
*/
defineProps<{ text?: string; open?: boolean }>()
defineEmits<{ (e: 'toggle'): void }>()
</script>
