<script setup lang="ts">
/**
 * 舞台的元件入口：把 canvas 頁當普通元件掛在宿主的頁面裡。
 *
 * 宿主先 installMoonStage(app, { host, i18n })，再在自己的路由裡 <MoonStage :role-id="…" />。
 * 路由參數經 STAGE_ROUTE_OPTIONS provide 給 canvas 的 onLoad；rpx 由根元素的 --ms-rpx 換算；
 * 全域 loading 的畫面也在這裡（playground 是放在 App.vue）。
 */
import { onBeforeUnmount, onMounted, provide, ref } from 'vue'
import Canvas from '@/pages/canvas/canvas.vue'
import GlobalLoading from '@/components/GlobalLoading/index.vue'
import { useLoading } from '@/utils/loadingManager.js'
import { STAGE_ROUTE_OPTIONS } from './uni-app-shim'
import { installRpxVar } from './rpx'
import '@/common/uni.css'
import '@/common/fui-app.css'
import '@/components/firstui/fui-theme/fui-theme.css'
import '@/static/icon/fui-custom-icon.css'
import '@/common/html-card.css'
import '@/static/styles/luna-tokens.css'

const props = defineProps<{ roleId?: string; draft?: string; trial?: string }>()
provide(STAGE_ROUTE_OPTIONS, {
  ...(props.roleId ? { roleId: props.roleId } : {}),
  ...(props.draft ? { draft: props.draft } : {}),
  ...(props.trial ? { trial: props.trial } : {}),
})

const loadingState = useLoading()
const root = ref<HTMLElement | null>(null)
let disposeRpx: (() => void) | null = null
onMounted(() => { if (root.value) disposeRpx = installRpxVar(root.value) })
onBeforeUnmount(() => { disposeRpx?.(); disposeRpx = null })
</script>

<template>
  <div ref="root" class="ms-stage">
    <Canvas />
    <GlobalLoading v-model="loadingState.visible" :text="loadingState.text" />
  </div>
</template>
