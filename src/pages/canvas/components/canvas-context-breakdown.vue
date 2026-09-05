<template>
  <div class="context-breakdown-scope">
  <!--
    這則回覆的組成：上下文由哪些部分組成、各占多少。mobile 聊天頁那份彈窗搬過來的，
    同一份口徑（估算 token、字元、百分比、快取命中率、本輪點數、MOD 明細）。

    元件不打 API：資料由頁面整理好餵進來（canvas-context-breakdown.ts 正規化過，
    內部欄位進不來），文案也由頁面翻好餵進來，這裡只負責畫。
    外面那層 `.u-popup__content` 是 MMD 的殼，作者對它寫的底色與圓角照樣生效；
    這一片的字色全部 inherit，底色與分隔線都從殼的文字色調出來。
  -->
    <div class="cb-top">
      <div class="cb-heading">
        <div class="cb-title">{{ labels.title }}</div>
        <div class="cb-subtitle">{{ statusText }}</div>
      </div>
      <div class="cb-close" role="button" tabindex="0"
           :aria-label="labels.close"
           @click="$emit('close')"
           @keydown.enter.prevent="$emit('close')">×</div>
    </div>

    <div v-if="loading && !report" class="cb-loading" aria-live="polite">
      <div class="cb-loading-row"></div>
      <div class="cb-loading-row"></div>
      <div class="cb-loading-row"></div>
    </div>

    <div v-else-if="loadFailed && !report" class="cb-empty">
      <span class="cb-empty-text">{{ labels.loadFailed }}</span>
      <span class="cb-retry" role="button" tabindex="0"
            @click="$emit('retry')"
            @keydown.enter.prevent="$emit('retry')">{{ labels.retry }}</span>
    </div>

    <div v-else-if="!report" class="cb-empty">
      <span class="cb-empty-text">{{ labels.notReady }}</span>
    </div>

    <!-- 模型／策略不支援統計：明確空狀態，不畫全 0 的圓環讓人以為壞了 -->
    <div v-else-if="report.supported === false" class="cb-empty">
      <span class="cb-empty-text">{{ labels.unsupportedModel }}</span>
    </div>

    <template v-else>
      <div class="cb-overview">
        <div class="cb-donut">
          <svg class="cb-donut-svg" viewBox="0 0 100 100" fill="none" aria-hidden="true" focusable="false">
            <path
              v-for="segment in donutSegments"
              :key="segment.key"
              class="cb-donut-segment"
              :class="{ 'is-active': segment.isActive }"
              :data-key="segment.key"
              :d="segment.path"
              :fill="segment.color"
              :transform="segment.transform || undefined"
              @click.stop="onSelect(segment.key)"
              @mousemove.stop="onSelect(segment.key)"
            ></path>
          </svg>
          <div class="cb-donut-inner">
            <span class="cb-donut-value">{{ formatNumber(activeItem.estimatedTokens) }}</span>
            <span class="cb-donut-label">{{ itemLabel(activeItem.key) }}</span>
            <span class="cb-donut-percent">{{ activeItem.percent }}%</span>
          </div>
        </div>
        <div class="cb-metrics">
          <div class="cb-metric">
            <span class="cb-metric-value">{{ formatNumber(report.total.estimatedTokens) }}</span>
            <span class="cb-metric-label">{{ labels.totalTokens }}</span>
          </div>
          <div class="cb-metric">
            <span class="cb-metric-value">{{ formatNumber(report.total.charCount) }}</span>
            <span class="cb-metric-label">{{ labels.totalChars }}</span>
          </div>
        </div>
      </div>

      <!-- 選中 MOD 時：那一格可以展開看每個 MOD 各占多少 -->
      <div v-if="activeItem.key === 'mod'" class="cb-mod-section">
        <div class="cb-mod-head cb-active-detail"
             :class="{ 'is-expandable': canExpandMod, 'is-expanded': canExpandMod && modDetailsExpanded }"
             :role="canExpandMod ? 'button' : undefined"
             :tabindex="canExpandMod ? 0 : undefined"
             :aria-expanded="canExpandMod ? (modDetailsExpanded ? 'true' : 'false') : undefined"
             :aria-label="canExpandMod ? (modDetailsExpanded ? labels.collapseModDetails : labels.expandModDetails) : undefined"
             @click="onToggleMod"
             @keydown.enter.prevent="onToggleMod"
             @keydown.space.prevent="onToggleMod">
          <div class="cb-row-main">
            <span class="cb-dot" :style="{ background: activeItem.color }"></span>
            <div class="cb-row-text">
              <span class="cb-row-title">{{ itemLabel('mod') }}</span>
              <span class="cb-row-sub cb-mod-subtitle">{{ modStatusText }}</span>
            </div>
          </div>
          <div class="cb-row-value">
            <span class="cb-row-tokens">{{ formatNumber(activeItem.estimatedTokens) }} {{ labels.tokenUnit }}</span>
            <span class="cb-row-percent">{{ activeItem.percent }}%</span>
          </div>
          <span v-if="canExpandMod" class="cb-mod-chevron" aria-hidden="true"></span>
        </div>
        <div v-if="canExpandMod && modDetailsExpanded" class="cb-mod-details" aria-live="polite">
          <div v-for="detail in activeItem.details" :key="detail.modId" class="cb-mod-detail-row">
            <span class="cb-mod-detail-name">{{ modDisplayName(detail) }}</span>
            <span class="cb-mod-detail-tokens">{{ formatNumber(detail.estimatedTokens) }} {{ labels.tokenUnit }}</span>
          </div>
        </div>
      </div>
      <div v-else class="cb-active-detail">
        <div class="cb-row-main">
          <span class="cb-dot" :style="{ background: activeItem.color }"></span>
          <div class="cb-row-text">
            <span class="cb-row-title">{{ itemLabel(activeItem.key) }}</span>
            <span class="cb-row-sub">{{ sourceLabel(activeItem) }}</span>
          </div>
        </div>
        <div class="cb-row-value">
          <span class="cb-row-tokens">{{ formatNumber(activeItem.estimatedTokens) }} {{ labels.tokenUnit }}</span>
          <span class="cb-row-percent">{{ activeItem.percent }}%</span>
        </div>
      </div>

      <div class="cb-list">
        <div
          v-for="item in report.items"
          :key="item.key"
          class="cb-row"
          :class="{ 'is-unavailable': !item.available, 'is-active': activeItem.key === item.key, 'is-selectable': selectable(item) }"
          :role="selectable(item) ? 'button' : undefined"
          :tabindex="selectable(item) ? 0 : undefined"
          :aria-pressed="selectable(item) ? (activeItem.key === item.key ? 'true' : 'false') : undefined"
          @click="onSelect(item.key)"
          @keydown.enter.prevent="onSelect(item.key)"
          @keydown.space.prevent="onSelect(item.key)"
        >
          <div class="cb-row-main">
            <span class="cb-dot" :style="{ background: item.color }"></span>
            <div class="cb-row-text">
              <span class="cb-row-title">{{ itemLabel(item.key) }}</span>
              <span class="cb-row-sub">{{ sourceLabel(item) }}</span>
            </div>
          </div>
          <div class="cb-row-value">
            <span class="cb-row-tokens">{{ formatNumber(item.estimatedTokens) }} {{ labels.tokenUnit }}</span>
            <span class="cb-row-percent">{{ item.percent }}%</span>
          </div>
        </div>
      </div>

      <div class="cb-billing" :class="{ 'is-unavailable': !report.billing.available }">
        <div class="cb-billing-head">
          <div class="cb-billing-total">
            <span class="cb-billing-label">{{ labels.billingTotal }}</span>
            <span v-if="report.billing.available" class="cb-billing-total-value">{{ formatNumber(report.billing.totalPoints) }} {{ labels.pointUnit }}</span>
            <span v-else class="cb-billing-total-value is-empty">{{ labels.unavailable }}</span>
          </div>
          <span v-if="report.billing.available" class="cb-billing-hit">
            {{ labels.cacheHitRateFull }} {{ report.billing.cacheHitRate == null ? '--' : report.billing.cacheHitRate }}%
          </span>
        </div>
        <div v-if="report.billing.available" class="cb-billing-grid">
          <div class="cb-billing-item">
            <span class="cb-billing-item-label">{{ labels.inputPoints }}</span>
            <span class="cb-billing-item-value">{{ formatNumber(report.billing.inputPoints) }}</span>
          </div>
          <div class="cb-billing-item is-cache">
            <span class="cb-billing-item-label">{{ labels.cacheReadPoints }}</span>
            <span class="cb-billing-item-value">{{ formatNumber(report.billing.cacheReadPoints) }}</span>
          </div>
          <div class="cb-billing-item">
            <span class="cb-billing-item-label">{{ labels.outputPoints }}</span>
            <span class="cb-billing-item-value">{{ formatNumber(report.billing.outputPoints) }}</span>
          </div>
        </div>
      </div>
      <div class="cb-note">{{ labels.localEstimateNote }}</div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import {
  buildPromptDonutSegments,
  formatPromptNumber,
  promptBreakdownItemSelectable,
  promptBreakdownModDisplayName,
  resolvePromptBreakdownActiveItem,
  type PromptBreakdownItem,
  type PromptBreakdownReport,
  type PromptModUsageDetail,
} from '../canvas-context-breakdown'

export interface ContextBreakdownLabels {
  title: string
  subtitle: string
  close: string
  retry: string
  loadFailed: string
  unsupportedModel: string
  notReady: string
  totalTokens: string
  totalChars: string
  tokenUnit: string
  pointUnit: string
  unavailable: string
  billingTotal: string
  inputPoints: string
  cacheReadPoints: string
  outputPoints: string
  cacheHitRateFull: string
  localEstimateNote: string
  expandModDetails: string
  collapseModDetails: string
  modDetailsUnavailable: string
  modDetailsLegacy: string
  /** 每個桶的名字，key 對 PromptBreakdownKey */
  items: Record<string, string>
  sources: (n: number) => string
  modsUsed: (n: number) => string
}

const props = withDefaults(defineProps<{
  report?: PromptBreakdownReport | null
  loading?: boolean
  loadFailed?: boolean
  /** 玩家點過的桶；沒點過就退到第一個可選的 */
  activeKey?: string
  modDetailsExpanded?: boolean
  locale?: string
  labels?: ContextBreakdownLabels
}>(), {
  report: null,
  loading: false,
  loadFailed: false,
  activeKey: '',
  modDetailsExpanded: false,
  locale: '',
  labels: () => ({
    title: '', subtitle: '', close: 'Close', retry: 'Retry',
    loadFailed: '', unsupportedModel: '', notReady: '',
    totalTokens: '', totalChars: '', tokenUnit: '', pointUnit: '', unavailable: '',
    billingTotal: '', inputPoints: '', cacheReadPoints: '', outputPoints: '',
    cacheHitRateFull: '', localEstimateNote: '',
    expandModDetails: '', collapseModDetails: '', modDetailsUnavailable: '', modDetailsLegacy: '',
    items: {},
    sources: (n: number) => String(n),
    modsUsed: (n: number) => String(n),
  }),
})

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'retry'): void
  (e: 'select', key: string): void
  (e: 'toggle-mod-details'): void
}>()

const statusText = computed(() => {
  const report = props.report
  if (report && (report.supported === false || report.status === 'unsupportedModel')) return props.labels.unsupportedModel
  if (report && report.status === 'notReady') return props.labels.notReady
  return props.labels.subtitle
})

const activeItem = computed(() => resolvePromptBreakdownActiveItem(props.report ? props.report.items : [], props.activeKey))

const donutSegments = computed(() => buildPromptDonutSegments(props.report ? props.report.items : [], activeItem.value.key))

const canExpandMod = computed(() => {
  const item = activeItem.value
  return !!(item && item.key === 'mod' && item.available && item.detailsAvailable && Array.isArray(item.details) && item.details.length > 0)
})

const modStatusText = computed(() => {
  const item = activeItem.value
  if (canExpandMod.value) return props.labels.modsUsed(item.details.length)
  if (item && item.detailsUnavailableReason === 'legacy_snapshot') return props.labels.modDetailsLegacy
  return props.labels.modDetailsUnavailable
})

function selectable(item: PromptBreakdownItem) {
  return promptBreakdownItemSelectable(item)
}

function itemLabel(key: string) {
  return props.labels.items[key] || key
}

function sourceLabel(item: PromptBreakdownItem) {
  if (!item || !item.available) return props.labels.unavailable
  return props.labels.sources(item.sourceCount || 0)
}

function formatNumber(value: unknown) {
  return formatPromptNumber(value)
}

function modDisplayName(detail: PromptModUsageDetail) {
  return promptBreakdownModDisplayName(detail, props.locale)
}

function onSelect(key: string) {
  const items = props.report ? props.report.items : []
  const item = items.find((entry) => entry.key === key)
  if (!item || !selectable(item)) return
  emit('select', key)
}

function onToggleMod() {
  if (!canExpandMod.value) return
  emit('toggle-mod-details')
}
</script>
