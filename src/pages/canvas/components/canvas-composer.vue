<template>
  <div class="composer-scope">
    <!--
      停止鍵刻意放在 .chat-bottom 外面。
      作者的卡片會寫 `.kg .chat-bottom{…}`，也有卡片整塊藏掉底部自己畫一套；
      停止鍵若住在裡面就會跟著消失，而生成中沒有停止鍵是不能接受的（I-2）。
      它的可用性規則寫在 @layer 外，見 canvas.css 檔頭。
    -->
    <div
      id="mes_stop"
      class="lt-stop"
      data-lt="stop"
      :hidden="!generating"
      role="button"
      tabindex="0"
      :aria-label="labels.stop"
      @click="$emit('stop')"
      @keydown.enter.prevent="$emit('stop')"
      @keydown.space.prevent="$emit('stop')"
    >
      <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" focusable="false">
        <rect x="6" y="6" width="12" height="12" rx="2.5" />
      </svg>
      <span class="lt-stop-text">{{ labels.stop }}</span>
    </div>

    <div class="chat-bottom">
      <!-- 快捷功能欄。卡片實際寫的是 `.shortcut-button-scope .item`（舊名），
           MMD 現在的 DOM 是 `.shortcut-bar > .shortcut-btn`——兩套都要在，
           否則作者手上那張卡的規則會落空。 -->
      <div ref="shortcutBarEl" class="shortcut-bar-wrapper shortcut-button-scope" data-lt="function-bar">
        <div class="shortcut-bar">
          <div
            v-for="item in shortcuts"
            :key="item.key"
            class="shortcut-btn item"
            :class="{ 'is-disabled': item.disabled }"
            :aria-disabled="item.disabled ? 'true' : undefined"
            role="button"
            tabindex="0"
            @click="$emit('shortcut', item.key)"
            @keydown.enter.prevent="$emit('shortcut', item.key)"
          >
            <span class="sb-icon" aria-hidden="true"></span>
            <span class="sb-text">{{ item.label }}</span>
          </div>
        </div>
      </div>

      <div class="chat-bottom-wapper">
        <div id="send_form" class="send-msg" data-lt="composer">
          <!--
            輸入區的兩態，節點名與狀態 class 照 MMD 的 DOM（2026-09-04 實測某張公開卡）：

              .send-msg
                > .ai-assistant
                > .uni-textarea[.is-expanded][.is-multiline]
                  > #chat-input-scope.chat-input-scope.has-toolbar[.is-expanded][.is-multiline]
                    > .btn-icon.chat-send-proxy          （隱藏的送出代理，腳本抓的第一顆 .btn-icon）
                    > .chat-input-toolbar                 （展開態：貼上／清空）
                    > .chatMsgTextarea > .uni-textarea-wrapper > placeholder + textarea（展開態）
                    > .chat-input-collapsed-row           （折疊態：mind-type｜預覽｜送出鍵）
                    > .chat-input-bottom-row              （展開態：mind-type｜送出鍵）
                > .more-options-scope > .btn-icon         （右側 +）

            折疊態點預覽或聚焦輸入框→展開；輸入框失焦→折疊。
            「多行」（is-multiline）與「展開」互相獨立。
            MMD 折疊態的工具列是 v-if 拿掉的；這裡用 v-show 讓節點常駐，作者的 CSS 永遠打得到。
          -->
          <!-- 我方沒有「幫聊」。節點仍然留著且是空的：作者的卡寫
               `.ai-assistant{display:none}`，節點不在的話那條規則命中零個，
               作者會以為是引擎壞了而不是這個平台沒有這個功能。 -->
          <!--
            幫答（MMD 的「不知道怎么回答？让AI来帮你吧！」）。結構照 MMD：
            .ai-assistant > .tooltip(.tooltip-arrow) + 圖示 + .beta-badge（每次的點數）。
            點了只把 AI 替玩家寫的一句填進輸入框，不代送。
          -->
          <div
            class="ai-assistant"
            :class="{ 'is-busy': assistBusy }"
            role="button"
            tabindex="0"
            :aria-label="labels.assist"
            :aria-busy="assistBusy ? 'true' : 'false'"
            @mousedown.prevent
            @click="onAssist"
            @keydown.enter.prevent="onAssist"
          >
            <span class="tooltip">{{ labels.assist }}<span class="tooltip-arrow"></span></span>
            <span class="ai-assistant-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
                   stroke-linecap="round" stroke-linejoin="round" focusable="false">
                <path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-4 10.5c.6.6 1 1.3 1 2.1V16h6v-.4c0-.8.4-1.5 1-2.1A6 6 0 0 0 12 3z" />
              </svg>
            </span>
            <span class="beta-badge">{{ assistCost }}</span>
          </div>

          <!--
            `.uni-textarea` 只包住輸入欄位本身，不包旁邊那兩顆鍵。

            作者的卡把 `.uni-textarea` 跟 `input` / `textarea` / `.input-wrapper` 寫在
            同一條規則裡——對他來說那個名字就是「一個輸入欄位」。先前這一層還兼著
            當整列的排版容器，於是「＋」被連同欄位一起漆成白色的一部分，而它自己
            又吃到底部工具列的顏色，看起來就是白色藥丸被咬掉一角。

            排版交給 `.send-msg`：它本來就是這一列。
          -->
          <div class="uni-textarea" :class="stateClass">
            <div
              id="chat-input-scope"
              class="chat-input-scope has-toolbar"
              :class="stateClass"
              @pointerdown="onScopePointerDown"
            >
              <!--
                隱藏的送出代理。卡片腳本抓的是 `.send-msg .btn-icon` 的第一顆然後原生點擊它，
                MMD 也是這樣做的（display:none、寬高 0）；酒館腳本點的是 #send_but。
                它必須是 .send-msg 底下 DOM 順序上第一顆 .btn-icon。
              -->
              <div
                id="send_but"
                class="btn-icon chat-send-proxy"
                data-lt="send"
                :class="'is-' + sendState"
                aria-hidden="true"
                tabindex="-1"
                @click="onPrimary"
              ></div>

              <div v-show="expanded" class="chat-input-toolbar">
                <div class="chat-input-tool-btn" role="button" tabindex="0"
                     @mousedown.prevent
                     @click="onPaste"
                     @keydown.enter.prevent="onPaste">
                  <span>{{ labels.paste }}</span>
                </div>
                <div class="chat-input-tool-btn" role="button" tabindex="0"
                     @mousedown.prevent
                     @click="onClear"
                     @keydown.enter.prevent="onClear">
                  <span>{{ labels.clear }}</span>
                </div>
              </div>

              <div v-show="expanded" class="chatMsgTextarea">
                <div class="uni-textarea-wrapper">
                  <div v-show="!value" class="uni-textarea-placeholder input-placeholder">{{ placeholder }}</div>
                  <CanvasTextarea
                    ref="textareaEl"
                    el-id="send_textarea"
                    el-class="uni-textarea-textarea"
                    :value="value"
                    @input="onInput"
                    @keydown="onKeydown"
                    @compositionstart="composing = true"
                    @compositionend="composing = false"
                    @focus="onFocus"
                    @blur="onBlur"
                  />
                </div>
              </div>

              <div v-show="!expanded" class="chat-input-collapsed-row">
                <div class="chat-input-row-lead">
                  <div
                    class="mind-type"
                    role="button"
                    tabindex="0"
                    :aria-label="labels.model"
                    @click="$emit('model')"
                    @keydown.enter.prevent="$emit('model')"
                  >
                    <span class="mind-type-score">{{ modelScore }}</span>
                    <!-- 節點名照 MMD（作者的卡對 .icon-box .icon-battery 寫了外觀），
                         裡面放一道閃電：那個數字講的是這一輪要花多少點。 -->
                    <span class="icon-box"><span class="icon-battery" :title="labels.perTurn" :aria-label="labels.perTurn"><svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" focusable="false"><path d="M13 2 4.5 13.5H11l-1 8.5 8.5-11.5H12z" /></svg></span></span>
                  </div>
                </div>
                <div
                  class="chat-input-collapsed-display"
                  role="button"
                  tabindex="0"
                  :aria-label="placeholder"
                  @click="expand"
                  @keydown.enter.prevent="expand"
                >
                  <span v-if="value" class="chat-input-collapsed-text">{{ value }}</span>
                  <span v-else class="chat-input-collapsed-placeholder">{{ placeholder }}</span>
                </div>
                <div class="chat-input-row-tail">
                  <div
                    class="btn-icon lt-send"
                    :class="'is-' + sendState"
                    role="button"
                    tabindex="0"
                    :aria-label="sendAriaLabel"
                    @mousedown.prevent
                    @click="onPrimary"
                    @keydown.enter.prevent="onPrimary"
                    @keydown.space.prevent="onPrimary"
                  >
                    <CanvasSendIcon :state="sendState" />
                  </div>
                </div>
              </div>

              <div v-show="expanded" class="chat-input-bottom-row">
                <div class="chat-input-row-lead">
                  <div
                    class="mind-type"
                    role="button"
                    tabindex="0"
                    :aria-label="labels.model"
                    @click="$emit('model')"
                    @keydown.enter.prevent="$emit('model')"
                  >
                    <span class="mind-type-score">{{ modelScore }}</span>
                    <!-- 節點名照 MMD（作者的卡對 .icon-box .icon-battery 寫了外觀），
                         裡面放一道閃電：那個數字講的是這一輪要花多少點。 -->
                    <span class="icon-box"><span class="icon-battery" :title="labels.perTurn" :aria-label="labels.perTurn"><svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" focusable="false"><path d="M13 2 4.5 13.5H11l-1 8.5 8.5-11.5H12z" /></svg></span></span>
                  </div>
                </div>
                <div class="chat-input-row-tail">
                  <div
                    class="btn-icon lt-send"
                    :class="'is-' + sendState"
                    role="button"
                    tabindex="0"
                    :aria-label="sendAriaLabel"
                    @mousedown.prevent
                    @click="onPrimary"
                    @keydown.enter.prevent="onPrimary"
                    @keydown.space.prevent="onPrimary"
                  >
                    <CanvasSendIcon :state="sendState" />
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div class="more-options-scope" :data-more="moreOpen ? 'on' : 'off'">
            <div
              id="options_button"
              class="btn-icon"
              role="button"
              tabindex="0"
              :aria-expanded="moreOpen ? 'true' : 'false'"
              :aria-label="labels.more"
              @click="$emit('more')"
              @keydown.enter.prevent="$emit('more')"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
                   stroke-linecap="round" aria-hidden="true" focusable="false">
                <path d="M12 5v14M5 12h14" />
              </svg>
            </div>
          </div>
        </div>
      </div>

      <!--
        「＋」呼出的功能面板。位置照 MMD：住在 `.chat-bottom` 裡、輸入區底下，
        兩端同一份（沒有 PC 側欄——這一頁只有畫布）。
        節點常駐：作者的卡對 `.chat .chat-bottom .more-scope .item .item-icon`
        寫了圖示外觀，v-if 拿掉節點等於那套外觀從沒存在過。
      -->
      <div class="more-scope" :data-open="moreOpen ? 'on' : 'off'" :hidden="!moreOpen">
        <div
          v-for="item in moreItems"
          :key="item.key"
          class="item"
          :class="{ 'is-disabled': item.disabled }"
          :aria-disabled="item.disabled ? 'true' : undefined"
          role="button"
          tabindex="0"
          @click="$emit('more-pick', item.key)"
          @keydown.enter.prevent="$emit('more-pick', item.key)"
        >
          <!-- 圖示槽照 MMD（.item-icon > uni-image），作者對它畫邊框與底色；槽裡放我們的線條圖，
               stroke 走 currentColor 跟著卡片文字色。先前槽是空的，美化完就是一排空框。 -->
          <span class="item-icon"><component :is="'uni-image'" v-html="panelIconSvg(item.key)"></component></span>
          <span class="item-title">{{ item.label }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { panelIconSvg } from '../canvas-panel-icons'
import { attachDragScroll } from '../canvas-drag-scroll'
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import CanvasTextarea from './canvas-textarea'
import CanvasSendIcon from './canvas-send-icon.vue'

const props = withDefaults(defineProps<{
  value: string
  placeholder: string
  /** send | send-disabled | continue | pending — 停止不佔這顆鍵，它有自己的節點 */
  sendState: string
  generating: boolean
  /** 觸控裝置上不用 Enter 送出（會跟輸入法與換行打架），只留送出鍵 */
  enterSends?: boolean
  /** disabled 只管外觀與 aria：點下去仍然交給頁面，由頁面說明為什麼不能用 */
  shortcuts?: Array<{ key: string; label: string; disabled?: boolean }>
  /** 「＋」面板開著嗎。跟輸入區的展開／折疊互不相干。 */
  moreOpen?: boolean
  moreItems?: Array<{ key: string; label: string; disabled?: boolean }>
  /** 這一輪要花多少點（已格式化；動態計價是區間）。空字串＝還不知道，不顯示數字。 */
  modelScore?: string
  /** 幫答進行中：按鈕鎖住，不重複扣點 */
  assistBusy?: boolean
  /** 幫答每次的點數，顯示在 .beta-badge；空字串＝不顯示數字 */
  assistCost?: string | number
  labels?: { stop: string; more: string; send: string; paste: string; clear: string; model: string; assist: string; perTurn: string }
}>(), {
  enterSends: true,
  shortcuts: () => [],
  moreOpen: false,
  moreItems: () => [],
  modelScore: '',
  assistBusy: false,
  assistCost: '',
  labels: () => ({ stop: 'Stop', more: 'More', send: 'Send', paste: 'Paste', clear: 'Clear', model: 'Model', assist: 'Let AI draft a reply', perTurn: 'Credits per turn' }),
})

const emit = defineEmits<{
  (e: 'update:value', v: string): void
  (e: 'send'): void
  (e: 'stop'): void
  (e: 'continue'): void
  (e: 'more'): void
  (e: 'assist'): void
  (e: 'more-pick', key: string): void
  (e: 'model'): void
  (e: 'shortcut', key: string): void
  (e: 'focus'): void
  (e: 'blur'): void
}>()

const textareaEl = ref<any>(null)
const composing = ref(false)

const sendAriaLabel = computed(() => (props.sendState === 'continue' ? props.labels.more : props.labels.send))

// ── 兩態 ──────────────────────────────────────────────────────────────
//
// 展開＝輸入框有焦點。折疊態只畫一行預覽，點它就把焦點交給真的輸入框。
// 「多行」看內容不看狀態：MMD 一段長文折行也算多行，這裡以換行或長度判。
const expanded = ref(false)
const multiline = computed(() => props.value.includes('\n') || props.value.length > 60)
const stateClass = computed(() => ({ 'is-expanded': expanded.value, 'is-multiline': multiline.value }))

function textareaNode(): HTMLTextAreaElement | null {
  const inner = textareaEl.value
  return (inner && (inner.el || inner.$el)) || null
}

function focusTextarea() {
  const el = textareaNode()
  if (el && typeof el.focus === 'function') el.focus()
}

// 主輸入框跟著內容長高（MMD 的 uni-textarea 是 auto-height）。上限交給 CSS 的 max-height。
function autosize() {
  const el = textareaNode()
  if (!el) return
  el.style.height = 'auto'
  el.style.height = el.scrollHeight + 'px'
}

watch(() => props.value, () => nextTick(autosize))
watch(expanded, (open) => { if (open) nextTick(autosize) })

function expand() {
  if (!expanded.value) expanded.value = true
  nextTick(() => { autosize(); focusTextarea() })
}

function onFocus() {
  expanded.value = true
  emit('focus')
}

// 失焦不立刻折疊：使用者可能正在點同一個輸入區裡的按鈕（貼上、清空、送出），
// 折疊會讓版面在指尖底下移位、點擊落空。桌機上按鈕的 mousedown 已 preventDefault
// 不會失焦；觸控裝置的失焦晚於 touchstart，靠 holdOpen 撐過那一下。
let blurTimer: ReturnType<typeof setTimeout> | null = null
let holdTimer: ReturnType<typeof setTimeout> | null = null
let holdOpen = false

function collapseIfIdle() {
  const el = textareaNode()
  const active = typeof document !== 'undefined' ? document.activeElement : null
  if (holdOpen || (el && active === el)) return
  expanded.value = false
}

function onBlur() {
  emit('blur')
  if (blurTimer) clearTimeout(blurTimer)
  blurTimer = setTimeout(collapseIfIdle, 120)
}

function onScopePointerDown() {
  holdOpen = true
  if (holdTimer) clearTimeout(holdTimer)
  holdTimer = setTimeout(() => {
    holdOpen = false
    collapseIfIdle()
  }, 300)
}

// 底部快捷列在桌機也要拉得動（同模型選單的 rail）。
const shortcutBarEl = ref<HTMLElement | null>(null)
let detachShortcutDrag: () => void = () => {}
onMounted(() => { if (shortcutBarEl.value) detachShortcutDrag = attachDragScroll(shortcutBarEl.value).detach })
onBeforeUnmount(() => { detachShortcutDrag() })

onBeforeUnmount(() => {
  if (blurTimer) clearTimeout(blurTimer)
  if (holdTimer) clearTimeout(holdTimer)
})

// ── 工具列 ────────────────────────────────────────────────────────────

async function onPaste() {
  try {
    const clip = typeof navigator !== 'undefined' ? navigator.clipboard : undefined
    const text = clip && typeof clip.readText === 'function' ? await clip.readText() : ''
    if (text) emit('update:value', props.value + text)
  } catch (e) {
    // 瀏覽器不給讀剪貼簿就算了：焦點還在輸入框，使用者自己 Ctrl+V。
  }
  focusTextarea()
}

function onClear() {
  emit('update:value', '')
  focusTextarea()
}

// 卡片腳本寫 `el.value = txt` 之後 dispatch 一個原生 input 事件——那是它唯一
// 能把字送進輸入框的方式（它不知道我們用什麼框架）。所以這裡聽的是原生事件，
// 不是框架的雙向綁定。
function onInput(event: Event) {
  emit('update:value', (event.target as HTMLTextAreaElement).value)
}

function onKeydown(event: KeyboardEvent) {
  if (event.key !== 'Enter') return
  if (!props.enterSends) return
  // 輸入法組字中的 Enter 是「選字」，不是送出。
  if (composing.value || (event as any).isComposing) return
  if (event.shiftKey || event.altKey || event.ctrlKey || event.metaKey) return
  event.preventDefault()
  onPrimary()
}

function onPrimary() {
  if (props.sendState === 'continue') emit('continue')
  else emit('send')
}

// 幫答：進行中不重複觸發（一次一筆點數）。
function onAssist() {
  if (props.assistBusy) return
  emit('assist')
}

defineExpose({ textareaEl, expand })
</script>
