/**
 * 每則氣泡底下那一列動作。
 *
 * owner 2026-09-04：「AI 回覆的訊息我都沒辦法編輯、改寫或複製了，氣泡底下什麼都沒有。」
 * 舊版把動作列絕對定位在氣泡右上角、觸控裝置整組 display:none；MMD 卡的作者 HTML
 * 蓋住右上角、長按又被卡片自己的互動吃掉，玩家就什麼都找不到。
 * 這裡釘住：動作列在 .mes_block 的文流裡、緊接氣泡之後；重新生成只有最新一則 AI 有；
 * 上下文 chip 有資料才畫。
 */
import { describe, it, expect, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import CanvasMessage from '../components/canvas-message.vue'
import { LONG_PRESS_MS } from '../canvas-longpress'

const BASE = {
  id: 'm1',
  mesid: 3,
  role: 'ai' as const,
  name: '示範角色',
  avatar: '',
  html: '<p>哈囉</p>',
  finished: true,
  latest: true,
  latestAI: true,
  swipes: null,
}

function mountMessage(overrides: Record<string, unknown> = {}, props: Record<string, unknown> = {}) {
  return mount(CanvasMessage, { props: { message: { ...BASE, ...overrides }, ...props } })
}

describe('動作列在文流裡', () => {
  it('住在 .mes_block 裡、緊接 .mes_text 之後，不是絕對定位在氣泡角落', () => {
    const w = mountMessage()
    const block = w.element.querySelector('.mes_block')!
    const bubble = block.querySelector('.mes_text')!
    const actions = block.querySelector('.select-box.mes_buttons')!
    expect(actions).toBeTruthy()
    expect(actions.getAttribute('data-lt')).toBe('message-actions')
    // 氣泡在前、動作列在後（同一個容器的文流順序）
    expect(bubble.compareDocumentPosition(actions) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    // 不再是列（.mes）的直接子節點
    expect(w.element.querySelector(':scope > .select-box')).toBeNull()
  })

  it('三個點永遠在，點了帶著按鈕的框呼出浮層', async () => {
    const w = mountMessage()
    const hint = w.find('.extraMesButtonsHint')
    expect(hint.exists()).toBe(true)
    await hint.trigger('click')
    const [payload] = w.emitted('menu')![0] as any[]
    expect(payload.kind).toBe('anchor')
    expect(payload.rect).toBeTruthy()
  })
})

describe('重新生成', () => {
  it('最新一則 AI 才有', () => {
    expect(mountMessage({ latestAI: true }).find('[data-lt="message-regenerate"]').exists()).toBe(true)
    expect(mountMessage({ latestAI: false }).find('[data-lt="message-regenerate"]').exists()).toBe(false)
    expect(mountMessage({ role: 'user', latestAI: false }).find('[data-lt="message-regenerate"]').exists()).toBe(false)
  })

  it('點了送出 rewrite 動作（＝重新跑這一輪）', async () => {
    const w = mountMessage({ latestAI: true })
    await w.find('[data-lt="message-regenerate"]').trigger('click')
    expect(w.emitted('action')![0]).toEqual(['rewrite'])
  })
})

describe('上下文 chip', () => {
  it('有資料才畫，顯示的就是給它的那一句', () => {
    const w = mountMessage({ contextUsage: { label: '上下文 13%', tip: '說明', level: 'low' } })
    const chip = w.find('[data-lt="context-usage"]')
    expect(chip.exists()).toBe(true)
    expect(chip.text()).toBe('上下文 13%')
    expect(chip.attributes('title')).toBe('說明')
    expect(chip.classes()).toContain('is-low')
  })

  it('沒有資料整顆不畫', () => {
    expect(mountMessage({ contextUsage: null }).find('[data-lt="context-usage"]').exists()).toBe(false)
    expect(mountMessage({}).find('[data-lt="context-usage"]').exists()).toBe(false)
  })
})

describe('手機長按', () => {
  it('按住 450ms 在按下的位置呼出浮層', () => {
    vi.useFakeTimers()
    try {
      const w = mountMessage()
      const bubble = w.find('.mes_text')
      bubble.element.dispatchEvent(Object.assign(new Event('touchstart', { bubbles: true }), {
        touches: [{ clientX: 120, clientY: 500 }],
      }))
      vi.advanceTimersByTime(LONG_PRESS_MS + 5)
      const [payload] = w.emitted('menu')![0] as any[]
      expect(payload.kind).toBe('point')
      expect(payload.x).toBe(120)
      expect(payload.y).toBe(500)
    } finally {
      vi.useRealTimers()
    }
  })
})

/*
  owner 2026-09-05：「重新生成」「上下文」太淺、完全沒吃到美化；下面的「模型設定」吃到了。
  兩個原因：那兩顆寫死了自己的淺灰（卡片把這一列的字設成深色，淺灰在白底上看不見）；
  而且節點名是新的，作者對舊頁面寫的外觀對不上。
*/
describe('動作列的顏色跟著卡片走', () => {
  it('列與兩顆按鈕帶舊聊天頁的節點名，作者對那套寫的外觀對得上', () => {
    const w = mountMessage({ contextUsage: { label: '上下文 13%', tip: '說明', level: 'low' } })
    expect(w.find('[data-lt="message-actions"]').classes()).toContain('ai-hover-toolbar')
    expect(w.find('[data-lt="message-regenerate"]').classes()).toContain('hover-pill')
    expect(w.find('[data-lt="context-usage"]').classes()).toContain('hover-pill')
  })

  it('兩顆按鈕的文字色與邊框都從 currentColor 來，不寫死自己的灰', () => {
    const css = readFileSync(resolve(__dirname, '../canvas.css'), 'utf8')
    for (const sel of ['.lt-msg-regen {', '.lt-context-chip {']) {
      const start = css.indexOf(sel)
      expect(start, sel).toBeGreaterThan(-1)
      const body = css.slice(start, css.indexOf('}', start))
      expect(body).toMatch(/color: var\(--lt-canvas-pill-fg, inherit\);/)
      expect(body).toMatch(/border: var\(--lt-canvas-pill-border, 1px solid color-mix\(in srgb, currentColor/)
      expect(body).not.toMatch(/--lt-canvas-muted/)
    }
  })

  it('上下文 chip 點了送出 context-usage 動作（開這則回覆的組成）', async () => {
    const w = mountMessage({ contextUsage: { label: '上下文 13%', tip: '說明', level: 'low' } })
    await w.find('[data-lt="context-usage"]').trigger('click')
    expect(w.emitted('action')).toEqual([['context-usage']])
  })
})

/*
  「⋯」浮層每一格被撐到 266px 高、字擠成直排：格子裡留給作者的圖示槽是 uni-image，
  uni 對它的基礎樣式（320×240）不在任何 layer 裡，canvas.css 裡 layer 內的 display:none
  永遠輸。壓它的那條必須寫在 layer 外，而且特異度要高過 `uni-image`。
*/
describe('「⋯」浮層的圖示槽', () => {
  it('壓掉 uni-image 尺寸的規則在 layer 外、特異度高過元素選擇器', () => {
    const vars = readFileSync(resolve(__dirname, '../../../common/canvas-theme-vars.css'), 'utf8')
    const stripped = vars.replace(/\/\*[\s\S]*?\*\//g, '')
    expect(stripped).not.toMatch(/@layer/)
    expect(stripped).toMatch(/\.msg-option-scope \.option-item > uni-image \{[^}]*display: none;[^}]*height: 0;/)
  })
})

/*
  owner 2026-09-05：狀態列（「這一輪還沒跑完，進度已經留著」）與重新生成的確認框都是黑的，
  完全沒吃到美化。狀態列寫死了深色疊層；確認框走的是 uni.showModal，卡片對它寫不了規則。
*/
describe('狀態列與確認框跟著卡片走', () => {
  it('狀態列的樣式全在 @layer lt-base、沒有寫死的深色疊層、中性語氣從 currentColor 調色', () => {
    const src = readFileSync(resolve(__dirname, '../../../components/chat-system-message/chat-system-message.vue'), 'utf8')
    const style = src.slice(src.indexOf('<style'), src.indexOf('</style>'))
    expect(style).toMatch(/@layer lt-base \{/)
    expect(style).not.toMatch(/rgba\(22, 27, 34/)
    expect(style).not.toMatch(/box-shadow/)
    expect(style).toMatch(/\.sys-tone-notice \.sys-msg-card \{[^}]*var\(--lt-canvas-block-bg, color-mix\(in srgb, currentColor/)
    expect(style).toMatch(/\.sys-cta-neutral \{[^}]*color: var\(--lt-canvas-pill-fg, inherit\)/)
    expect(src).toMatch(/'stopped':[^\n]*neutral: true/)
  })

  it('這一頁沒有任何 uni.showModal：二次確認一律走畫布自己的確認框', () => {
    const src = readFileSync(resolve(__dirname, '../canvas.vue'), 'utf8')
    const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
    expect(code).not.toMatch(/uni\.showModal\(/)
    expect(code).toMatch(/confirm: \(opts: any\) => askConfirm\(/)
  })

  it('串流進行中，舊的最新一則不再是「可重新生成」', () => {
    const src = readFileSync(resolve(__dirname, '../canvas.vue'), 'utf8')
    expect(src).toMatch(/latestAI: [^\n]*!isStreamActive\.value[^\n]*isLatestCanonicalAIIndex\(index\)/)
  })
})

/*
  owner 2026-09-05 第二次：「正在回想先前的劇情」那格（準備軌跡）、等待指示器、思考過程
  都還是黑的。它們用的是彈層的深色變數，而亮色卡片不會改我們的變數——只會改文字色。
  所以這三塊一律 color: inherit，底色與邊框從 currentColor 調。
*/
describe('氣泡文流裡的三塊跟著卡片文字色走', () => {
  it('準備軌跡與思考過程不再用彈層的深色變數', () => {
    const css = readFileSync(resolve(__dirname, '../canvas.css'), 'utf8')
    for (const sel of ['.lt-prep-live {', '.mes_reasoning_details {']) {
      const start = css.indexOf(sel)
      expect(start, sel).toBeGreaterThan(-1)
      const body = css.slice(start, css.indexOf('}', start))
      expect(body).toMatch(/color: inherit;/)
      expect(body).toMatch(/background: var\(--lt-canvas-block-bg, color-mix\(in srgb, currentColor/)
      expect(body).not.toMatch(/--lt-canvas-sheet-bg|--lt-canvas-sheet-fg/)
    }
  })

  it('等待指示器同樣從 currentColor 調色', () => {
    const src = readFileSync(resolve(__dirname, '../../../components/chat-typing-indicator/chat-typing-indicator.vue'), 'utf8')
    const start = src.indexOf('.chat-typing-indicator {')
    const body = src.slice(start, src.indexOf('}', start))
    expect(body).toMatch(/color: var\(--lt-canvas-pill-fg, inherit\);/)
    expect(body).toMatch(/background: var\(--lt-canvas-pill-bg, color-mix\(in srgb, currentColor/)
    expect(body).not.toMatch(/--lt-canvas-bubble-user-bg/)
  })
})

/*
  owner 2026-09-05：Agent 準備到一半按停止，氣泡整個消失，只剩輸入框旁的「繼續」——
  玩家看不到停在哪一步。mobile 是把氣泡留著、軌跡固定、底下一張「進度留著／繼續」的卡。
  根因：keepInterruptedAgentBubble 把氣泡留下之後，durable 結算又把這一輪的氣泡整組移除。
*/
import { settleOptimisticDurableUserStop, keepInterruptedAgentBubble } from '../chat-operation-ui-state'

describe('Agent 準備中按停止', () => {
  it('留下的中斷氣泡不會被結算整組移除', () => {
    const user = { id: 'u1', type: 1, content: '看向窗外', chatFinish: true }
    const ai = { id: 'a1', type: 0, content: '', chatLoading: true, chatFinish: false }
    expect(keepInterruptedAgentBubble(ai, ['回想先前的劇情', '寫這則回覆的草稿'])).toBe(true)
    const after = settleOptimisticDurableUserStop([user, ai], { operationKind: 'send', userBubbleId: 'u1', aiBubbleId: 'a1' }, false)
    expect(after.map(m => m.id)).toEqual(['u1', 'a1'])
    expect(after[1].agentInterrupted).toBe(true)
    expect(after[1].prepTrail).toEqual(['回想先前的劇情', '寫這則回覆的草稿'])
  })

  it('沒有軌跡的空氣泡照舊移除', () => {
    const user = { id: 'u1', type: 1, content: '嗯', chatFinish: true }
    const ai = { id: 'a1', type: 0, content: '', chatLoading: true, chatFinish: false }
    expect(keepInterruptedAgentBubble(ai, [])).toBe(false)
    const after = settleOptimisticDurableUserStop([user, ai], { operationKind: 'send', userBubbleId: 'u1', aiBubbleId: 'a1' }, false)
    expect(after).toEqual([])
  })

  it('中斷的那則畫出「進度留著／繼續」卡，按了送 resume-agent', async () => {
    const w = mountMessage({ agentInterrupted: true, finished: false, loading: false, prepTrail: ['回想先前的劇情'], html: '' },
      { labels: { copy: '', edit: '', regenerate: '', reasoning: '', prepTrail: '準備過程', prev: '', next: '', interruptedNotice: '這一輪還沒跑完，進度已經留著', interruptedNoticeSub: '可以按繼續接著跑', continueAction: '繼續說' } })
    const card = w.find('[data-lt="agent-resume"]')
    expect(card.exists()).toBe(true)
    expect(card.text()).toContain('進度已經留著')
    expect(w.find('.lt-prep-trail').exists()).toBe(true)
    await w.find('.agent-resume-card__btn').trigger('click')
    expect(w.emitted('action')).toEqual([['resume-agent']])
    expect(mountMessage({}).find('[data-lt="agent-resume"]').exists()).toBe(false)
  })
})

describe('等待指示器', () => {
  it('在氣泡裡橫排、寬度照內容，三個點不會疊成直排', () => {
    const css = readFileSync(resolve(__dirname, '../canvas.css'), 'utf8')
    const start = css.indexOf('.mes_text .chat-typing-indicator {')
    expect(start).toBeGreaterThan(-1)
    const body = css.slice(start, css.indexOf('}', start))
    expect(body).toMatch(/flex-direction: row;/)
    expect(body).toMatch(/min-width: max-content;/)
  })

  it('Agent 準備中指示器寫「思考中」，不是光三個點', () => {
    const src = readFileSync(resolve(__dirname, '../canvas.vue'), 'utf8')
    expect(src).toMatch(/const loadingLabel = liveSteps\s*\n\s*\? t\('chat\.thinkingInProgress'\)/)
  })
})

/*
  owner 2026-09-05：長按一放開就直接觸發了選單裡的「刪除」。長按觸發後手指放開，瀏覽器會在
  同一點合成一下 click，浮層正好開在手指下面。兩道保險：touchend 擋掉預設行為；選單剛開
  400ms 內不收點擊。
*/
describe('長按放開不會誤點到選單', () => {
  it('長按觸發後，那一次 touchend 的預設行為被擋掉；沒長按的觸控不擋', () => {
    vi.useFakeTimers()
    try {
      const w = mountMessage()
      const bubble = w.find('.mes_text')
      const start = () => bubble.element.dispatchEvent(Object.assign(new Event('touchstart', { bubbles: true }), { touches: [{ clientX: 120, clientY: 500 }] }))
      const end = () => { const e = new Event('touchend', { bubbles: true, cancelable: true }); bubble.element.dispatchEvent(e); return e }
      start(); vi.advanceTimersByTime(LONG_PRESS_MS + 5)
      expect(end().defaultPrevented).toBe(true)
      start(); vi.advanceTimersByTime(100)
      expect(end().defaultPrevented).toBe(false)
    } finally {
      vi.useRealTimers()
    }
  })
})
