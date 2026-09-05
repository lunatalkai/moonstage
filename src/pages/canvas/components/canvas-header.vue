<template>
  <div class="page-header-scope header-scope">
    <div id="top-bar" class="topTabbar" data-lt="header">
      <div class="header-box">
        <div
          class="icon-back"
          data-lt="back"
          role="button"
          tabindex="0"
          :aria-label="backLabel"
          @click="$emit('back')"
          @keydown.enter.prevent="$emit('back')"
          @keydown.space.prevent="$emit('back')"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"
               stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">
            <path d="M15 5l-7 7 7 7" />
          </svg>
        </div>

        <div class="header-center">
          <div class="header-role-img" data-lt="avatar">
            <!-- uni-image 這一層是作者卡打得到的名字（原平台是 uni-app，卡片照它寫）。
                 用動態元件寫成原生標籤，才不會被當成沒註冊的組件。 -->
            <component :is="'uni-image'">
              <div :style="avatar ? { backgroundImage: 'url(' + avatar + ')' } : null"></div>
            </component>
          </div>
          <div class="header-roleName" data-lt="title">{{ roleName }}</div>
        </div>

        <div class="header-icon-meun" data-lt="header-actions">
          <div class="header-meun header-meun-rating">
            <!-- 作者常把分級徽章整顆藏掉；節點不在的話那條規則會靜默失效。 -->
            <div class="header-badge"></div>
          </div>
          <div
            class="header-meun model-chip"
            role="button"
            tabindex="0"
            :aria-label="modelLabel"
            @click="$emit('model')"
            @keydown.enter.prevent="$emit('model')"
            @keydown.space.prevent="$emit('model')"
          >
            <span class="model-chip-name">{{ modelName }}</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
/*
 頂欄。作者的卡片把整條當成自己的畫布：換底色、換字體、把分級徽章整顆藏掉。
       所以這裡只放「走得掉／知道跟誰講話／換得了模型」，其餘取值全部走變數。
*/
defineProps<{
  roleName: string
  avatar: string
  modelName: string
  backLabel?: string
  modelLabel?: string
}>()

defineEmits<{
  (e: 'back'): void
  (e: 'model'): void
}>()
</script>
