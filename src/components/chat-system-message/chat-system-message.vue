<template>
  <view class="sys-msg-wrap" :class="['sys-tone-' + tone]">
    <view class="sys-msg-card" :class="['sys-kind-' + kind]"
          :role="liveRegionRole" :aria-live="liveRegionPoliteness"
          aria-atomic="true">
      <view class="sys-icon-box">
        <!-- model-error: alert triangle -->
        <view v-if="kind === 'model-error'" class="sys-svg" v-html="`<svg viewBox=&quot;0 0 24 24&quot; fill=&quot;none&quot; stroke=&quot;${meta.color}&quot; stroke-width=&quot;2.2&quot; stroke-linecap=&quot;round&quot; stroke-linejoin=&quot;round&quot; style=&quot;width:100%;height:100%;display:block;&quot;><path d=&quot;M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z&quot;/><line x1=&quot;12&quot; y1=&quot;9&quot; x2=&quot;12&quot; y2=&quot;13&quot;/><line x1=&quot;12&quot; y1=&quot;17&quot; x2=&quot;12.01&quot; y2=&quot;17&quot;/></svg>`"></view>
        <!-- network-error: wifi-off -->
        <view v-else-if="kind === 'network-error'" class="sys-svg" v-html="`<svg viewBox=&quot;0 0 24 24&quot; fill=&quot;none&quot; stroke=&quot;${meta.color}&quot; stroke-width=&quot;2.2&quot; stroke-linecap=&quot;round&quot; stroke-linejoin=&quot;round&quot; style=&quot;width:100%;height:100%;display:block;&quot;><line x1=&quot;1&quot; y1=&quot;1&quot; x2=&quot;23&quot; y2=&quot;23&quot;/><path d=&quot;M16.72 11.06A10.94 10.94 0 0 1 19 12.55&quot;/><path d=&quot;M5 12.55a10.94 10.94 0 0 1 5.17-2.39&quot;/><path d=&quot;M10.71 5.05A16 16 0 0 1 22.58 9&quot;/><path d=&quot;M1.42 9a15.91 15.91 0 0 1 4.7-2.88&quot;/><path d=&quot;M8.53 16.11a6 6 0 0 1 6.95 0&quot;/><line x1=&quot;12&quot; y1=&quot;20&quot; x2=&quot;12.01&quot; y2=&quot;20&quot;/></svg>`"></view>
        <!-- server-error: server rack（設計稿 icons.jsx 精確版） -->
        <view v-else-if="kind === 'server-error'" class="sys-svg" v-html="`<svg viewBox=&quot;0 0 24 24&quot; fill=&quot;none&quot; stroke=&quot;${meta.color}&quot; stroke-width=&quot;2.2&quot; stroke-linecap=&quot;round&quot; stroke-linejoin=&quot;round&quot; style=&quot;width:100%;height:100%;display:block;&quot;><rect x=&quot;2&quot; y=&quot;3&quot; width=&quot;20&quot; height=&quot;7&quot; rx=&quot;1.5&quot;/><rect x=&quot;2&quot; y=&quot;14&quot; width=&quot;20&quot; height=&quot;7&quot; rx=&quot;1.5&quot;/><path d=&quot;M6 6.5h.01M6 17.5h.01&quot;/></svg>`"></view>
        <!-- rate-limit: hourglass（設計稿 zigzag 單路徑） -->
        <view v-else-if="kind === 'rate-limit'" class="sys-svg" v-html="`<svg viewBox=&quot;0 0 24 24&quot; fill=&quot;none&quot; stroke=&quot;${meta.color}&quot; stroke-width=&quot;2.2&quot; stroke-linecap=&quot;round&quot; stroke-linejoin=&quot;round&quot; style=&quot;width:100%;height:100%;display:block;&quot;><path d=&quot;M6 2h12v4l-4 4 4 4v4H6v-4l4-4-4-4V2z&quot;/></svg>`"></view>
        <!-- quota: credit card -->
        <view v-else-if="kind === 'quota'" class="sys-svg sys-quota-icon" v-html="`<svg viewBox=&quot;0 0 24 24&quot; fill=&quot;none&quot; stroke=&quot;${meta.color}&quot; stroke-width=&quot;2.2&quot; stroke-linecap=&quot;round&quot; stroke-linejoin=&quot;round&quot; style=&quot;width:100%;height:100%;display:block;&quot;><rect x=&quot;2&quot; y=&quot;5&quot; width=&quot;20&quot; height=&quot;14&quot; rx=&quot;2&quot;/><path d=&quot;M2 10h20&quot;/><path d=&quot;M6 15h4&quot;/></svg>`"></view>
        <!-- filtered: shield -->
        <view v-else-if="kind === 'filtered'" class="sys-svg" v-html="`<svg viewBox=&quot;0 0 24 24&quot; fill=&quot;none&quot; stroke=&quot;${meta.color}&quot; stroke-width=&quot;2.2&quot; stroke-linecap=&quot;round&quot; stroke-linejoin=&quot;round&quot; style=&quot;width:100%;height:100%;display:block;&quot;><path d=&quot;M12 2l8 4v6c0 5-3.5 9-8 10-4.5-1-8-5-8-10V6l8-4z&quot;/></svg>`"></view>
        <!-- stopped: filled square（設計稿 rx=2, filled） -->
        <view v-else-if="kind === 'stopped'" class="sys-svg" v-html="`<svg viewBox=&quot;0 0 24 24&quot; fill=&quot;${meta.color}&quot; stroke=&quot;none&quot; style=&quot;width:100%;height:100%;display:block;&quot;><rect x=&quot;6&quot; y=&quot;6&quot; width=&quot;12&quot; height=&quot;12&quot; rx=&quot;2&quot;/></svg>`"></view>
        <!-- length-cap: zap（設計稿單路徑） -->
        <view v-else-if="kind === 'length-cap'" class="sys-svg" v-html="`<svg viewBox=&quot;0 0 24 24&quot; fill=&quot;${meta.color}&quot; stroke=&quot;${meta.color}&quot; stroke-width=&quot;2.2&quot; stroke-linecap=&quot;round&quot; stroke-linejoin=&quot;round&quot; style=&quot;width:100%;height:100%;display:block;&quot;><path d=&quot;M13 2L3 14h7l-1 8 10-12h-7l1-8z&quot;/></svg>`"></view>
        <!-- compact-retryable: 沿用 mobile 版同一顆 4 L-shapes compress 圖示（語意對應
             「記憶壓縮/整理」失敗），但走 failure 紅色（meta.color） -->
        <view v-else-if="kind === 'compact-retryable'" class="sys-svg" v-html="`<svg viewBox=&quot;0 0 24 24&quot; fill=&quot;none&quot; stroke=&quot;${meta.color}&quot; stroke-width=&quot;2.2&quot; stroke-linecap=&quot;round&quot; stroke-linejoin=&quot;round&quot; style=&quot;width:100%;height:100%;display:block;&quot;><path d=&quot;M4 9h6V3M20 9h-6V3M4 15h6v6M20 15h-6v6&quot;/></svg>`"></view>
        <!-- outcome-unconfirmed: clock（「還在確認」而非「已失敗」） -->
        <view v-else-if="kind === 'outcome-unconfirmed'" class="sys-svg" v-html="`<svg viewBox=&quot;0 0 24 24&quot; fill=&quot;none&quot; stroke=&quot;${meta.color}&quot; stroke-width=&quot;2.2&quot; stroke-linecap=&quot;round&quot; stroke-linejoin=&quot;round&quot; style=&quot;width:100%;height:100%;display:block;&quot;><circle cx=&quot;12&quot; cy=&quot;12&quot; r=&quot;9&quot;/><polyline points=&quot;12 7 12 12 15.5 14&quot;/></svg>`"></view>
        <!-- fallback（理論上不會命中：所有目前傳入的 kind 都有上面明確分支） -->
        <view v-else class="sys-svg" v-html="`<svg viewBox=&quot;0 0 24 24&quot; fill=&quot;none&quot; stroke=&quot;${meta.color}&quot; stroke-width=&quot;2.2&quot; stroke-linecap=&quot;round&quot; stroke-linejoin=&quot;round&quot; style=&quot;width:100%;height:100%;display:block;&quot;><path d=&quot;M4 9h6V3M20 9h-6V3M4 15h6v6M20 15h-6v6&quot;/></svg>`"></view>
      </view>

      <view class="sys-body">
        <text class="sys-label" :style="meta.neutral ? null : { color: meta.color }">{{ label }}</text>
        <text v-if="sub" class="sys-sub">
          <text v-if="tone === 'notice'" class="sys-dot" :style="{ color: meta.color + '55' }">·</text>
          <text class="sys-sub-text">{{ sub }}</text>
        </text>
      </view>

      <view v-if="resolvedCtas.length" class="sys-ctas">
        <!-- data-lt="retry" 是作者樣式契約裡的穩定選擇器（見 author-theme-vars.css）：
             重試鍵在這一端就是系統訊息卡上的那顆 CTA，作者要改它得抓得到。 -->
        <view v-for="entry in resolvedCtas" :key="entry.action"
              class="sys-cta"
              :data-lt="isRetryAction(entry.action) ? 'retry' : null"
              role="button" tabindex="0" :aria-label="entry.label"
              :class="['sys-cta-' + tone, { 'sys-cta-neutral': meta.neutral }]"
              :style="isFailure ? { background: meta.color, color: '#0F1419' } : (meta.neutral ? null : { background: meta.color + '22', border: '1px solid ' + meta.color + '55', color: meta.color })"
              @click.stop="onCta(entry.action)"
              @keydown="onCtaKeydown($event, entry.action)">
          <view v-if="showsRetryIcon(entry.action)" class="sys-cta-svg" v-html="'<svg viewBox=&quot;0 0 24 24&quot; fill=&quot;none&quot; stroke=&quot;currentColor&quot; stroke-width=&quot;2.5&quot; stroke-linecap=&quot;round&quot; stroke-linejoin=&quot;round&quot; style=&quot;width:100%;height:100%;display:block;&quot;><polyline points=&quot;23 4 23 10 17 10&quot;/><polyline points=&quot;1 20 1 14 7 14&quot;/><path d=&quot;M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15&quot;/></svg>'"></view>
          <view v-else-if="entry.action === 'open_vip'" class="sys-cta-svg" v-html="'<svg viewBox=&quot;0 0 24 24&quot; fill=&quot;none&quot; stroke=&quot;currentColor&quot; stroke-width=&quot;2.5&quot; stroke-linecap=&quot;round&quot; stroke-linejoin=&quot;round&quot; style=&quot;width:100%;height:100%;display:block;&quot;><rect x=&quot;2&quot; y=&quot;5&quot; width=&quot;20&quot; height=&quot;14&quot; rx=&quot;2&quot;/><path d=&quot;M2 10h20&quot;/></svg>'"></view>
          <view v-else class="sys-cta-svg" v-html="'<svg viewBox=&quot;0 0 24 24&quot; fill=&quot;none&quot; stroke=&quot;currentColor&quot; stroke-width=&quot;2.5&quot; stroke-linecap=&quot;round&quot; stroke-linejoin=&quot;round&quot; style=&quot;width:100%;height:100%;display:block;&quot;><polyline points=&quot;13 17 18 12 13 7&quot;/><polyline points=&quot;6 17 11 12 6 7&quot;/></svg>'"></view>
          <text class="sys-cta-text">{{ entry.label }}</text>
        </view>
      </view>
    </view>
  </view>
</template>

<script>
/**
 * 系統訊息卡片（desktop port，from mobile
 * src/components/chat-system-message/chat-system-message.vue）
 *   - failure 紅卡：model-error / network-error / server-error / rate-limit / filtered / compact-retryable
 *   - notice pill：stopped / length-cap
 *
 * 跟 mobile 版分歧：mobile 版還多帶 compressing（脈衝）/ compressed（可展開，
 * 摘要預覽 + 編輯/查看/刪除 actions）兩個 kind，但 chat.vue 目前雙端都沒有
 * 任何 finishReason 會映射到這兩個 kind（那是給另一個尚未串接的摘要卡片
 * 功能預留的）。desktop 這次只 port「finishReason 驅動的失敗/中斷提示」這個
 * 子集（跟本施工單範圍一致：覆蓋 mobile 現有全部錯誤類 + compact_retryable），
 * 不帶入未使用的 expand/summaryPreview 分支，避免引入死代碼與缺翻譯 key
 * （chat.summaryEditShort / chat.summaryView 目前不存在於 desktop locale）。
 *
 * 單位換算：mobile 版全用 rpx（750rpx = 375px 基準，1px = 2rpx），desktop
 * 是純 H5 平台（無 app-plus rpx 縮放需求），依 DESIGN.md §5.2 desktop 慣例
 * 全部換算成 px（rpx 數值 ÷ 2），視覺比例跟 mobile 版一致。
 */
const KIND_META = {
  'model-error':        { tone: 'failure', color: '#F87171', action: 'retry' },
  'network-error':      { tone: 'failure', color: '#F87171', action: 'retry' },
  'server-error':       { tone: 'failure', color: '#F87171', action: 'retry' },
  'rate-limit':         { tone: 'failure', color: '#FB923C', action: 'retry' },
  'filtered':            { tone: 'failure', color: '#FB923C', action: 'retry' },
  'compact-retryable':  { tone: 'failure', color: '#F87171', action: 'retry' },
  'quota':              { tone: 'notice',  color: '#FBBF24', action: 'open_vip' },
  // neutral：這不是「出事了」，是「停在這裡」。顏色不寫死灰，跟著卡片的文字色走
  // （作者的美化才吃得到；owner 2026-09-05 截圖裡那條黑框就是寫死的灰底）。
  'stopped':            { tone: 'notice',  color: '#9CA3AF', action: 'continue', neutral: true },
  'length-cap':         { tone: 'notice',  color: '#FBBF24', action: 'continue' },
  // 中性語氣（不是失敗），但走卡片版面而非藥丸：本 kind 帶說明文字與 CTA，
  // notice 的 border-radius:9999px 只裝得下單行短標籤，多行會被包成一顆球。
  'outcome-unconfirmed': { tone: 'notice', color: '#9CA3AF', action: 'refresh_history', neutral: true },
};

export default {
  name: 'chat-system-message',
  props: {
    kind: { type: String, required: true },
    label: { type: String, default: '' },
    sub: { type: String, default: '' },
    cta: { type: String, default: '' },
    // Capable operation rows pass the server action through verbatim. Legacy
    // callers omit this prop and keep the frozen kind-derived fallback.
    ctaAction: { type: String, default: '' },
    ctas: { type: Array, default: () => [] },
  },
  emits: ['cta'],
  computed: {
    meta() { return KIND_META[this.kind] || KIND_META['stopped']; },
    tone() { return this.meta.tone; },
    resolvedCtaAction() { return this.ctaAction || this.meta.action || 'retry'; },
    resolvedCtas() {
      const capable = Array.isArray(this.ctas)
        ? this.ctas
          .filter(entry => entry && entry.label && entry.action)
          .map(entry => ({
            label: String(entry.label),
            action: String(entry.action),
          }))
        : [];
      if (capable.length) return capable;
      if (!this.cta) return [];
      return [{ label: this.cta, action: this.resolvedCtaAction }];
    },
    isFailure() { return this.tone === 'failure'; },
    isTerminal() { return this.tone === 'failure' || this.tone === 'notice'; },
    liveRegionRole() { return this.isTerminal ? 'alert' : 'status'; },
    liveRegionPoliteness() { return this.isTerminal ? 'assertive' : 'polite'; },
  },
  methods: {
    showsRetryIcon(action) {
      return action === 'rewrite' || String(action || '').startsWith('retry');
    },
    isRetryAction(action) {
      return String(action || '').startsWith('retry');
    },
    onCta(action) {
      this.$emit('cta', action);
    },
    onCtaKeydown(event, action) {
      const key = event && event.key;
      const keyCode = Number(event && event.keyCode);
      if (
        key !== 'Enter'
        && key !== ' '
        && key !== 'Space'
        && key !== 'Spacebar'
        && keyCode !== 13
        && keyCode !== 32
      ) {
        return;
      }
      if (event && typeof event.preventDefault === 'function') event.preventDefault();
      if (event && typeof event.stopPropagation === 'function') event.stopPropagation();
      this.onCta(action);
    },
  },
};
</script>

<style scoped lang="scss">
/*
  全部進 @layer lt-base：作者的卡不在 layer 裡，永遠贏過這裡。
  底色與邊框都從 currentColor 調出來——這條狀態列住在對話流裡，文字色是作者的卡在設的
  （亮色主題設深色字）；先前寫死 rgba(22,27,34,.72) 的深色疊層，在亮色卡上就是一塊黑框
  （owner 2026-09-05 截圖）。語氣色（紅／橙／琥珀）只留給「出事了」那幾種；中性語氣
  （停止、進度留著、結果未確認）整條跟著卡片走。不寫 margin（uni 的 *{margin:0} 不在
  layer 裡會吃掉），間距用 padding。
*/
@layer lt-base {
.sys-msg-wrap {
  display: flex;
  flex-direction: column;
  align-items: center;
  width: 100%;
  padding: 10px 16px;
  color: inherit;
}

.sys-msg-card {
  display: flex;
  align-items: center;
  gap: 8px;
  max-width: 100%;
  color: inherit;
}

.sys-tone-failure .sys-msg-card {
  padding: 10px 12px;
  border-radius: 14px;
  background: color-mix(in srgb, #F87171 16%, transparent);
  border: 1px solid color-mix(in srgb, #F87171 40%, transparent);
}
.sys-kind-rate-limit .sys-msg-card,
.sys-kind-filtered .sys-msg-card {
  background: color-mix(in srgb, #FB923C 16%, transparent);
  border-color: color-mix(in srgb, #FB923C 40%, transparent);
}

.sys-tone-notice .sys-msg-card {
  padding: 7px 12px;
  border-radius: var(--lt-canvas-pill-radius, 9999px);
  background: var(--lt-canvas-block-bg, color-mix(in srgb, currentColor 7%, transparent));
  border: var(--lt-canvas-block-border, 1px solid color-mix(in srgb, currentColor 22%, transparent));
}
.sys-kind-length-cap .sys-msg-card,
.sys-kind-quota .sys-msg-card {
  background: color-mix(in srgb, #FBBF24 16%, transparent);
  border-color: color-mix(in srgb, #FBBF24 40%, transparent);
}
/* 中性語氣但走卡片版面：notice 預設的藥丸（9999px）只能容納單行短標籤，
   本 kind 有說明文字與 CTA，多行會被圓角包成一顆球並壓到按鈕。
   圓角取 14px（與 failure 卡同級，DESIGN.md 4-tier 的 medium）。 */
.sys-kind-outcome-unconfirmed .sys-msg-card {
  padding: 10px 12px;
  border-radius: 14px;
  align-items: flex-start;
}
.sys-kind-outcome-unconfirmed .sys-body {
  align-items: flex-start;
  flex-direction: column;
  gap: 2px;
}
.sys-kind-outcome-unconfirmed .sys-label { font-size: 13px; }

/* ---- icon box ---- */
.sys-icon-box {
  width: 20px;
  height: 20px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  background: color-mix(in srgb, currentColor 14%, transparent);
}
.sys-tone-failure .sys-icon-box {
  width: 24px;
  height: 24px;
  background: color-mix(in srgb, #F87171 22%, transparent);
}
.sys-kind-rate-limit .sys-icon-box,
.sys-kind-filtered .sys-icon-box {
  background: color-mix(in srgb, #FB923C 22%, transparent);
}
.sys-kind-length-cap .sys-icon-box,
.sys-kind-quota .sys-icon-box {
  background: color-mix(in srgb, #FBBF24 22%, transparent);
}
.sys-svg {
  width: 11px;
  height: 11px;
}
.sys-tone-failure .sys-svg {
  width: 13px;
  height: 13px;
}

/* ---- body ---- */
.sys-body {
  min-width: 0;
  display: flex;
  align-items: baseline;
  flex-wrap: wrap;
  gap: 0 6px;
  flex: 1;
}
.sys-label {
  font-weight: 700;
  line-height: 1.3;
  color: inherit;
}
.sys-tone-failure .sys-label { font-size: 13px; }
.sys-tone-notice .sys-label { font-size: 12px; }

.sys-sub {
  font-size: 11px;
  color: inherit;
  opacity: 0.7;
  display: inline-flex;
  align-items: baseline;
  gap: 4px;
}
.sys-dot {
  opacity: 0.5;
}
.sys-sub-text {
  font-size: 11px;
  color: inherit;
}

/* ---- CTA ---- */
.sys-ctas {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
  justify-content: flex-end;
}
.sys-cta {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  padding: 4px 10px;
  border-radius: 9999px;
  font-weight: 700;
  font-size: 11px;
  flex-shrink: 0;
  cursor: pointer;
  transition: transform 0.12s, opacity 0.15s;
}
.sys-cta-neutral {
  background: var(--lt-canvas-pill-bg, color-mix(in srgb, currentColor 7%, transparent));
  border: var(--lt-canvas-pill-border, 1px solid color-mix(in srgb, currentColor 32%, transparent));
  color: var(--lt-canvas-pill-fg, inherit);
  border-radius: var(--lt-canvas-pill-radius, 9999px);
}
/* 版面釘死：一列、標籤吃剩餘寬度、CTA 靠右不換行（owner 2026-09-05 截圖裡 CTA 被疊成直排）。 */
.sys-msg-card { flex-wrap: nowrap; }
.sys-body { flex: 1 1 auto; }
.sys-ctas { flex: 0 0 auto; }
.sys-cta { width: auto; }
.sys-cta:focus-visible {
  outline: 2px solid currentColor;
  outline-offset: 2px;
}
.sys-cta:active { transform: scale(0.94); opacity: 0.85; }
.sys-cta-svg {
  width: 11px;
  height: 11px;
}
.sys-cta-text {
  color: inherit;
  font-size: 11px;
  font-weight: 700;
}
}
</style>
