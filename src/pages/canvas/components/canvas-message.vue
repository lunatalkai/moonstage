<template>
  <div
    class="mes item"
    :class="[roleClass, { last_mes: message.latest, 'is-loading': message.loading }]"
    :mesid="String(message.mesid)"
    :is_user="message.role === 'user' ? 'true' : 'false'"
    :is_system="message.role === 'system' ? 'true' : 'false'"
    :ch_name="message.name || ''"
    :swipeid="message.swipes ? String(message.swipes.index) : '0'"
    data-lt="message"
    :data-lt-role="message.role"
    @touchstart.passive="longPress.start"
    @touchmove.passive="longPress.move"
    @touchend="onTouchEnd"
    @touchcancel="longPress.cancel"
  >
    <div class="mesAvatarWrapper">
      <div class="avatar">
        <component :is="'uni-image'">
          <div :style="message.avatar ? { backgroundImage: 'url(' + message.avatar + ')' } : null"></div>
          <span></span>
          <img v-if="message.avatar" :src="message.avatar" draggable="false" alt="" />
        </component>
      </div>
    </div>

    <!--
      名字列搬到跟頭像同一個 grid row（見 canvas.css 的 .mes grid-template-areas
      "avatar name" / "block block"）：頭像＋名字一排、氣泡另起一排、滿版寬度。
      舊版把 .ch_name 放在 .mes_block 裡面、跟頭像同一橫排——手機窄螢幕上頭像那欄
      的固定寬度會把氣泡整個往右推，右邊卻沒有對應的留白，兩側內距不對稱
      （owner 2026-09-04 回報：AI 氣泡右邊幾乎貼死螢幕邊緣，左邊卻空一大塊）。
      .ch_name 本身的 class／子節點（.name_text／.timestamp）不變，酒館主題找
      得到的東西一個都沒少，只是換了外層排位。
    -->
    <div class="ch_name">
      <span class="name_text">{{ message.name }}</span>
      <span class="timestamp"></span>
    </div>

    <div class="touch-scope mes_block" :id="'item' + message.mesid">
      <!-- 這一輪 Agent 做了什麼。跟思考過程同一種形態：預設收起，但留得住——
           用戶付了錢等了一分多鐘，過程是他唯一能判斷「有沒有在幹活」的依據。 -->
      <details v-if="message.prepTrail && message.prepTrail.length" class="mes_reasoning_details lt-prep-trail">
        <summary>{{ labels.prepTrail }}（{{ message.prepTrail.length }}）</summary>
        <div class="mes_reasoning">
          <div v-for="(line, li) in message.prepTrail" :key="'pt-' + li">{{ line }}</div>
        </div>
      </details>

      <!-- 思考過程。酒館用 details.mes_reasoning_details > .mes_reasoning，照它。 -->
      <details v-if="message.reasoning" class="mes_reasoning_details">
        <summary>{{ labels.reasoning }}</summary>
        <div class="mes_reasoning">{{ message.reasoning }}</div>
      </details>

      <div
        class="mes_text content"
        :class="bubbleClass"
        :id="'q-' + message.mesid"
        data-lt="bubble"
        :data-lt-role="message.role"
      >
        <!--
          等回覆時的準備軌跡（Agent 模式）。每一步都留著，不蓋掉上一步：做過的壓暗、
          當下這步亮著。跟 mobile 同一份呈現；完成後這份清單搬進上面那個可展開的
          「準備過程」面板，不會消失。
        -->
        <!-- 中斷之後的出路（照 mobile）：上面的軌跡說「發生了什麼」，這張說「現在能做什麼」。 -->
        <div v-if="message.agentInterrupted" class="agent-resume-card" data-lt="agent-resume">
          <div class="agent-resume-card__body">
            <div class="agent-resume-card__text">{{ labels.interruptedNotice }}</div>
            <div class="agent-resume-card__sub">{{ labels.interruptedNoticeSub }}</div>
          </div>
          <div class="agent-resume-card__btn" role="button" tabindex="0"
               @click.stop="$emit('action', 'resume-agent')"
               @keydown.enter.prevent.stop="$emit('action', 'resume-agent')">{{ labels.continueAction }}</div>
        </div>
        <template v-if="message.loading">
          <div v-if="message.prepSteps && message.prepSteps.length" class="lt-prep-live" data-lt="prep-live">
            <div
              v-for="(line, li) in message.prepSteps"
              :key="'live-' + li"
              class="lt-prep-live-line"
              :class="{ 'is-past': li < message.prepSteps.length - 1 }"
            >
              <span class="lt-prep-live-dot" aria-hidden="true"></span>
              <span class="lt-prep-live-text">{{ line }}</span>
            </div>
          </div>
          <ChatTypingIndicator :label="message.loadingLabel" />
        </template>
        <div v-else class="lt-bubble-body" v-html="message.html"></div>
      </div>

      <!--
        動作列：住在 .mes_block 的文流裡、緊接氣泡之後，常駐 DOM。

        為什麼不再絕對定位在氣泡右上角：MMD 卡的作者 HTML 常把整組面板蓋在那個角落，
        長按又被卡片自己的互動吃掉——玩家看得到氣泡，卻找不到任何一個動作
        （owner 2026-09-04 回報）。放進文流，作者的內容再怎麼疊都疊不到它上面。

        節點名沿用 MMD 的 .select-box 與酒館的 .mes_buttons／.extraMesButtonsHint／
        .extraMesButtons／.mes_copy／.mes_edit：兩邊的作者都對這一族寫過外觀，
        名字不能換。酒館的三個點在這裡是「更多」，展開的是我們的浮層而不是
        .extraMesButtons（那一組留著給作者，畫面上收起）。
      -->
      <div class="select-box mes_buttons ai-hover-toolbar" data-lt="message-actions">
        <div
          v-if="message.latestAI && message.role === 'ai'"
          class="lt-msg-regen hover-pill"
          data-lt="message-regenerate"
          role="button"
          tabindex="0"
          :aria-label="labels.regenerate"
          @click.stop="$emit('action', 'rewrite')"
          @keydown.enter.prevent.stop="$emit('action', 'rewrite')"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">
            <path d="M20 12a8 8 0 1 1-2.34-5.66" /><path d="M20 4v5h-5" />
          </svg>
          <span class="hover-pill-label">{{ labels.regenerate }}</span>
        </div>

        <div
          v-if="message.contextUsage"
          class="lt-context-chip hover-pill"
          :class="'is-' + message.contextUsage.level"
          data-lt="context-usage"
          role="button"
          tabindex="0"
          :title="message.contextUsage.tip"
          :aria-label="message.contextUsage.tip"
          @click.stop="$emit('action', 'context-usage')"
          @keydown.enter.prevent.stop="$emit('action', 'context-usage')"
        >{{ message.contextUsage.label }}</div>

        <div
          ref="hintEl"
          class="extraMesButtonsHint icon"
          role="button"
          tabindex="0"
          :aria-label="menuLabel"
          @click.stop="openMenuFromHint"
          @keydown.enter.prevent.stop="openMenuFromHint"
          @keydown.space.prevent.stop="openMenuFromHint"
        >
          <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" focusable="false">
            <circle cx="5" cy="12" r="1.8" /><circle cx="12" cy="12" r="1.8" /><circle cx="19" cy="12" r="1.8" />
          </svg>
        </div>
        <div class="extraMesButtons">
          <div class="mes_copy" role="button" tabindex="0" @click.stop="$emit('action', 'copy')">
            <span>{{ labels.copy }}</span>
          </div>
          <div class="mes_edit" role="button" tabindex="0" @click.stop="$emit('action', 'edit')">
            <span>{{ labels.edit }}</span>
          </div>
        </div>
      </div>

      <!-- 開場白的左右切換。酒館的玩家習慣：第一則訊息可以換一條開場白再開始。
           只有真的有替代開場白時才畫箭頭，沒有就整組不出現。 -->
      <div v-if="message.swipes && message.swipes.total > 1" class="swipeRightBlock">
        <div class="swipe_left" role="button" tabindex="0" :aria-label="labels.prev"
             @click.stop="$emit('swipe', -1)"
             @keydown.enter.prevent.stop="$emit('swipe', -1)">‹</div>
        <div class="swipes-counter">{{ message.swipes.index + 1 }} / {{ message.swipes.total }}</div>
        <div class="swipe_right" role="button" tabindex="0" :aria-label="labels.next"
             @click.stop="$emit('swipe', 1)"
             @keydown.enter.prevent.stop="$emit('swipe', 1)">›</div>
      </div>
      <!-- 沒有替代開場白時仍留一組空節點：酒館主題會抓 .swipe_left / .swipes-counter，
           節點不在的話規則靜默失效。畫面上由樣式收起。 -->
      <div v-else class="swipeRightBlock is-empty" aria-hidden="true">
        <div class="swipe_left"></div>
        <div class="swipes-counter"></div>
        <div class="swipe_right"></div>
      </div>

      <!-- MMD 的「你可以选择开场」不在這裡：它是訊息列之後的獨立區塊（canvas-prologue.vue），
           而且點了是填輸入框，不是換這則訊息。 -->

      <!-- 這一則的系統訊息（誠實的失敗與下一步）掛在它自己底下，不另開一個
           玩家得去別處找的地方。 -->
      <slot></slot>
    </div>
  </div>
</template>

<script setup lang="ts">
/*
    一則訊息。兩層結構：列（.mes.item.Ai/.User）與氣泡（.mes_text.content.left/.right）。

    酒館把 .mes 自己當氣泡，MMD 分成列與氣泡兩層。取 MMD 的兩層，因為 MMD 卡對
    這件事有硬需求（它直接改 .content.left 的底色與邊框），而酒館卡打不到宿主
    chrome、對此無所謂。

    AI／使用者同時用 class（MMD 語彙）與屬性（酒館語彙）分辨：兩邊的卡各認一種。

*/
import { computed, ref } from 'vue'
import { createLongPress, type LongPressPoint } from '../canvas-longpress'
import ChatTypingIndicator from '@/components/chat-typing-indicator/chat-typing-indicator.vue'

/**
 * 浮層從哪裡呼出。
 * point：手機長按，手指按下的那一點；anchor：桌機的 ⋯ 按鈕，給它的框。
 * 浮層貼著這個位置開（canvas-menu-position.ts）。
 */
export type MessageMenuAnchor =
  | { kind: 'point'; x: number; y: number }
  | { kind: 'anchor'; rect: { left: number; top: number; width: number; height: number } }

const props = withDefaults(defineProps<{
  message: {
    id?: string
    mesid: number
    role: 'ai' | 'user' | 'system'
    name?: string
    avatar?: string
    html?: string
    reasoning?: string
    finished?: boolean
    loading?: boolean
    loadingLabel?: string
    prepSteps?: string[] | null
    prepTrail?: string[] | null
    /** Agent 準備到一半被停下：軌跡已固定，底下給一張「進度留著／繼續」的卡 */
    agentInterrupted?: boolean
    /** 列表的最後一則（酒館的 last_mes），可能是使用者說的 */
    latest?: boolean
    /** 最新的那一則 AI 回覆——只有它能重新生成、改寫、繼續 */
    latestAI?: boolean
    /** 這一輪的上下文用量，已經是給玩家看的字；沒有資料就不畫 */
    contextUsage?: { label: string; tip: string; level: string } | null
    swipes?: { index: number; total: number } | null
  }
  labels?: { copy: string; edit: string; regenerate: string; reasoning: string; prepTrail: string; prev: string; next: string; interruptedNotice?: string; interruptedNoticeSub?: string; continueAction?: string }
  menuLabel?: string
}>(), {
  labels: () => ({ copy: 'Copy', edit: 'Edit', regenerate: 'Regenerate', reasoning: 'Reasoning', prepTrail: 'Steps', prev: 'Previous', next: 'Next', interruptedNotice: '', interruptedNoticeSub: '', continueAction: 'Continue' }),
  menuLabel: 'More',
})

const emit = defineEmits<{
  (e: 'menu', anchor: MessageMenuAnchor | null): void
  (e: 'action', key: string): void
  (e: 'swipe', delta: number): void
}>()

const roleClass = computed(() => (props.message.role === 'user' ? 'User' : 'Ai'))
const bubbleClass = computed(() => (props.message.role === 'user' ? 'right' : 'left'))

const hintEl = ref<HTMLElement | null>(null)

function openMenuFromHint() {
  const el = hintEl.value
  const rect = el && typeof el.getBoundingClientRect === 'function' ? el.getBoundingClientRect() : null
  emit('menu', rect
    ? { kind: 'anchor', rect: { left: rect.left, top: rect.top, width: rect.width, height: rect.height } }
    : null)
}

const longPress = createLongPress({
  onTrigger: (point: LongPressPoint | null) => {
    emit('menu', point ? { kind: 'point', x: point.x, y: point.y } : null)
  },
})

/*
  長按觸發之後，手指放開時瀏覽器還會在同一個點合成一下 click——浮層正好開在手指下面，
  那一下就落在選單的某一項上，玩家還沒選就「選好了」（owner 2026-09-05：一長按就跳出刪除確認）。
  這裡把那一次 touchend 的預設行為擋掉，合成的 click 就不會發。不是長按的觸控照常。
*/
function onTouchEnd(event: TouchEvent) {
  const fired = longPress.consumed()
  longPress.end()
  if (fired && event && typeof event.preventDefault === 'function' && event.cancelable !== false) {
    event.preventDefault()
  }
}
</script>
