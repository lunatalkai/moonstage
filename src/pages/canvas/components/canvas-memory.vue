<template>
  <div class="memory-scope">
  <!--
    AI 記事本／永久記憶：AI 自己每輪記下的記錄（記憶原子），玩家看得到、刪得掉。
    mobile 的 memoryPage 搬過來的，同一份規則（重要度排序、來源標籤、相對時間、
    長內容收行）。

    元件不打 API：清單、展開狀態、正在刪哪一條都由頁面餵進來，文案也由頁面翻好餵進來；
    這裡只負責畫，按鍵只發事件。刪除的確認也不在這裡——頁面用畫布自己的確認框問，
    問完再把這一片開回來。

    外面那層 `.u-popup__content` 是 MMD 的殼，作者對它寫的底色與圓角照樣生效；
    這一片的字色全部 inherit，底色與邊框都從殼的文字色調出來——作者的亮色卡只改文字色，
    寫死的深底在那上面就是一塊黑膏藥。

    刪除是常駐鍵而不是 mobile 的左滑：桌機沒有左滑手勢；觸屏上把它視覺降權
    （CSS 用 pointer: coarse 判斷），不放成這頁的主要用途。
  -->
    <div class="mem-top">
      <div class="mem-heading">
        <div class="mem-title">{{ labels.title }}</div>
        <div class="mem-subtitle">{{ labels.subtitle }}</div>
      </div>
      <div class="mem-close" role="button" tabindex="0"
           :aria-label="labels.close"
           @click="$emit('close')"
           @keydown.enter.prevent="$emit('close')">×</div>
    </div>

    <!-- 載入中：骨架（不是蒙層；光帶走 transform）。 -->
    <div v-if="loading && !sorted.length" class="mem-loading" aria-live="polite">
      <div class="mem-loading-row"></div>
      <div class="mem-loading-row"></div>
      <div class="mem-loading-row"></div>
    </div>

    <div v-else-if="loadFailed && !sorted.length" class="mem-error">
      <span class="mem-error-text">{{ labels.loadFailed }}</span>
      <span class="mem-retry" role="button" tabindex="0"
            @click="$emit('retry')"
            @keydown.enter.prevent="$emit('retry')">{{ labels.retry }}</span>
    </div>

    <!-- 空態要同時回答「為什麼是空的」與「接下來能做什麼」——文案由頁面依身分挑。 -->
    <div v-else-if="!sorted.length" class="mem-empty">
      <span class="mem-empty-text">{{ labels.empty }}</span>
    </div>

    <div v-else class="mem-list">
      <div v-for="atom in sorted" :key="atom.atomId" class="mem-card" :data-atom-id="atom.atomId"
           :class="{ 'is-deleting': deletingId === atom.atomId }">
        <div class="mem-head">
          <span class="mem-source" :class="isAgent(atom) ? 'is-agent' : 'is-auto'">
            {{ isAgent(atom) ? labels.sourceAgent : labels.sourceAuto }}
          </span>
          <span v-if="atom.createTime" class="mem-time">{{ relativeTime(atom.createTime) }}</span>
          <span class="mem-delete" role="button" tabindex="0"
                :aria-label="labels.delete"
                :aria-disabled="deletingId === atom.atomId ? 'true' : 'false'"
                :title="labels.delete"
                @click="onDelete(atom.atomId)"
                @keydown.enter.prevent="onDelete(atom.atomId)">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">
              <path d="M3 6h18" />
              <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
              <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
              <line x1="10" y1="11" x2="10" y2="17" />
              <line x1="14" y1="11" x2="14" y2="17" />
            </svg>
          </span>
        </div>

        <!-- 收行用 -webkit-line-clamp：它是文字自己的截斷，不是容器裁切，
             不會像固定高度那樣把最後一行切成半個字。 -->
        <div class="mem-value" :class="{ 'is-clamped': isLong(atom) && !expandedIds[atom.atomId] }">{{ atom.atomValue }}</div>

        <!-- 長內容一律收行：一條進度總結可以有幾百字，整份攤開會把清單變成一篇長文，
             玩家連「這頁有幾則」都看不出來。 -->
        <span v-if="isLong(atom)" class="mem-expand" role="button" tabindex="0"
              :aria-expanded="expandedIds[atom.atomId] ? 'true' : 'false'"
              @click="$emit('toggle-expand', atom.atomId)"
              @keydown.enter.prevent="$emit('toggle-expand', atom.atomId)">
          {{ expandedIds[atom.atomId] ? labels.collapse : labels.expand }}
        </span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import {
  isAgentMemoryAtom,
  isLongMemoryAtom,
  memoryRelativeTime,
  sortMemoryAtoms,
  type MemoryAtom,
  type MemoryTimeLabels,
} from '../canvas-memory'

export interface MemoryLabels {
  title: string
  subtitle: string
  close: string
  loading: string
  loadFailed: string
  retry: string
  empty: string
  delete: string
  expand: string
  collapse: string
  sourceAgent: string
  sourceAuto: string
  time: MemoryTimeLabels
}

const props = withDefaults(defineProps<{
  atoms?: MemoryAtom[]
  loading?: boolean
  loadFailed?: boolean
  /** 哪些條目展開了（頁面的狀態；換對話時由頁面清掉） */
  expandedIds?: Record<string, boolean>
  /** 正在刪的那一條；鍵先鎖住，免得連按兩次 */
  deletingId?: string
  labels?: MemoryLabels
}>(), {
  atoms: () => [],
  loading: false,
  loadFailed: false,
  expandedIds: () => ({}),
  deletingId: '',
  labels: () => ({
    title: '', subtitle: '', close: 'Close', loading: '', loadFailed: '', retry: 'Retry', empty: '',
    delete: 'Delete', expand: '', collapse: '', sourceAgent: '', sourceAuto: '',
    time: { now: '', min: '', hour: '', day: '', month: '' },
  }),
})

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'retry'): void
  (e: 'delete', atomId: string): void
  (e: 'toggle-expand', atomId: string): void
}>()

const sorted = computed(() => sortMemoryAtoms(props.atoms))

function isAgent(atom: MemoryAtom) { return isAgentMemoryAtom(atom) }
function isLong(atom: MemoryAtom) { return isLongMemoryAtom(atom) }
function relativeTime(time: string | undefined) { return memoryRelativeTime(time, props.labels.time) }

function onDelete(atomId: string) {
  if (props.deletingId === atomId) return
  emit('delete', atomId)
}
</script>
