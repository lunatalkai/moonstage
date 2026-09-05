/**
 * 畫布的宿主選擇器契約 — 掛載後真的查得到。
 *
 * 這支不是掃字串：作者的卡片是對「渲染出來的 DOM」下手的，模板裡出現一個名字
 * 不代表它會被畫出來（v-if 沒開、包在另一層裡、被重構搬走都不會被字串比對抓到）。
 * 所以逐個區塊掛起來，用 querySelector 問。
 */
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { CANVAS_SELECTOR_CONTRACT, ALWAYS_PRESENT_SELECTORS, selectorsForRegion } from '../canvas-dom-contract'
import CanvasHeader from '../components/canvas-header.vue'
import CanvasStage from '../components/canvas-stage.vue'
import CanvasIntro from '../components/canvas-intro.vue'
import CanvasMessage from '../components/canvas-message.vue'
import CanvasPrologue from '../components/canvas-prologue.vue'
import CanvasComposer from '../components/canvas-composer.vue'
import CanvasMessageMenu from '../components/canvas-message-menu.vue'
import CanvasPopup from '../components/canvas-popup.vue'
import CanvasModelPanel from '../components/canvas-model-panel.vue'
import CanvasConfirm from '../components/canvas-confirm.vue'
import CanvasModify from '../components/canvas-modify.vue'
import CanvasConversationList from '../components/canvas-conversation-list.vue'
import CanvasPersona from '../components/canvas-persona.vue'
import CanvasDirectives from '../components/canvas-directives.vue'
import CanvasNotepad from '../components/canvas-notepad.vue'
import CanvasContextBreakdown from '../components/canvas-context-breakdown.vue'
import CanvasMemory from '../components/canvas-memory.vue'
import { normalizeServerReport } from '../canvas-context-breakdown'
import catalog from './fixtures/model-catalog.json'

const AI_MESSAGE = {
  id: 'm1',
  mesid: 0,
  role: 'ai',
  name: '示範角色',
  avatar: '',
  html: '<p>哈囉</p>',
  reasoning: '想了一下',
  finished: true,
  latest: true,
  latestAI: true,
  contextUsage: { label: '上下文 13%', tip: '這一輪用掉了目前記憶容量的 13%', level: 'low' },
  swipes: { index: 0, total: 3 },
}

const PROLOGUE = { title: '你可以選擇開場', items: ['開場一', '開場二'] }

// 組成彈窗要有資料才會畫出圓環與清單；餵兩個桶就夠契約問「節點在不在」。
const CONTEXT_BREAKDOWN_REPORT = normalizeServerReport({
  schemaVersion: 2,
  supported: true,
  status: 'ok',
  conversationId: 'conv-1',
  items: [
    { key: 'system', available: true, sourceCount: 1, charCount: 240, estimatedTokens: 60, percent: 60 },
    { key: 'history', available: true, sourceCount: 4, charCount: 160, estimatedTokens: 40, percent: 40 },
  ],
  total: { charCount: 400, estimatedTokens: 100 },
  cache: { available: false },
  billing: { available: true, totalPoints: 12, inputPoints: 4, cacheReadPoints: 1, outputPoints: 7, cacheHitRate: 50 },
})
const CONTEXT_BREAKDOWN_LABELS = {
  title: '這則回覆的組成', subtitle: '依最近一次完成的回覆估算', close: '關閉', retry: '重試',
  loadFailed: '讀不到', unsupportedModel: '不支援', notReady: '完成一輪後可看',
  totalTokens: '估算 Token', totalChars: '字元', tokenUnit: 'Tokens', pointUnit: '點', unavailable: '尚無資料',
  billingTotal: '本輪消耗', inputPoints: '輸入', cacheReadPoints: '快取讀取', outputPoints: '輸出',
  cacheHitRateFull: '快取命中率', localEstimateNote: '本機估算。',
  expandModDetails: '展開', collapseModDetails: '收起', modDetailsUnavailable: '暫無', modDetailsLegacy: '下一輪後可看',
  items: { system: '系統與策略', history: '歷史對話' } as Record<string, string>,
  sources: (n: number) => `${n} 項來源`,
  modsUsed: (n: number) => `本輪使用 ${n} 個 MOD`,
}

function mountRegion(region: string) {
  switch (region) {
    case 'header':
      return mount(CanvasHeader, {
        props: { roleName: '示範角色', avatar: '', modelName: 'Luna' },
      })
    case 'stage':
      return mount(CanvasStage, { props: { backgroundUrl: '' } })
    case 'intro':
      return mount(CanvasIntro, { props: { text: '一段卡片描述', open: false } })
    case 'message':
      // 中斷卡只在被停下的那則出現；契約要查得到它，所以掛的是被停下的那一則。
      return mount(CanvasMessage, { props: { message: { ...AI_MESSAGE, agentInterrupted: true, prepTrail: ['回想先前的劇情'] } } })
    case 'prologue':
      return mount(CanvasPrologue, { props: PROLOGUE })
    case 'composer':
      return mount(CanvasComposer, {
        props: {
          value: '', placeholder: '說點什麼', sendState: 'send', generating: false,
          shortcuts: [{ key: 'new-chat', label: '新的對話' }],
        },
      })
    case 'menu':
      return mount(CanvasMessageMenu, {
        props: {
          open: true,
          editing: true,
          message: AI_MESSAGE,
          actions: [
            { key: 'copy', label: '複製' },
            { key: 'rewrite', label: '重寫' },
          ],
        },
      })
    case 'panel':
      return mount(CanvasComposer, {
        props: {
          value: '', placeholder: '說點什麼', sendState: 'send', generating: false,
          moreOpen: true,
          moreItems: [{ key: 'new-chat', label: '新的對話' }, { key: 'model', label: '模型設定' }],
        },
      })
    case 'popup':
      return mount(CanvasPopup, { props: { open: true, title: '模型設定' } })
    case 'model-panel':
      return mount(CanvasModelPanel, { props: MODEL_PANEL_PROPS })
    case 'confirm':
      return mount(CanvasConfirm, {
        props: { content: '確定要重置嗎？', okText: '確定', cancelText: '取消' },
      })
    case 'modify':
      return mount(CanvasModify, {
        props: { title: '更換背景', items: [{ key: 'reset', label: '重置背景圖' }] },
      })
    case 'conversations':
      return mount(CanvasConversationList, {
        props: {
          title: '歷史對話',
          items: [{ key: 'c1', name: '示範角色', time: '昨天', current: true }],
          closeText: '關閉',
        },
      })
    case 'persona':
      return mount(CanvasPersona, {
        props: {
          userName: '小明',
          userSex: 'man',
          userDefine: '一個路過的人',
          sexOptions: [
            { value: 'man', label: '男' },
            { value: 'women', label: '女' },
            { value: 'other', label: '其他' },
          ],
          sandboxOptions: [
            { value: 'light', label: '輕量', hint: '最少干預' },
            { value: 'standard', label: '標準', hint: '推薦選項' },
            { value: 'immersive', label: '沉浸', hint: '加入描寫指引' },
            { value: 'deep', label: '深度', hint: '最強虛構框架' },
          ],
        },
      })
    case 'directives':
      // 一條指令都沒有時也要能查到 `.item` 那一族——但空清單本來就沒有列，
      // 所以契約用有內容的狀態掛載；空態的節點（.empty-default-show）另有
      // ALWAYS_PRESENT_SELECTORS 守著。
      return mount(CanvasDirectives, {
        props: {
          list: [{ sourceId: 's1', text: '回覆短一點', origin: 'manual' }],
          countText: '(1/10)',
        },
      })
    case 'notepad':
      return mount(CanvasNotepad, { props: { draft: '記一筆' } })
    case 'context-breakdown':
      return mount(CanvasContextBreakdown, { props: { report: CONTEXT_BREAKDOWN_REPORT, labels: CONTEXT_BREAKDOWN_LABELS } })
    case 'memory':
      // 有內容的狀態才有列；空態另有 .mem-empty，契約不問它。
      return mount(CanvasMemory, { props: { atoms: [{ atomId: 'a1', atomValue: '玩家叫小明', importance: 1, createTime: new Date().toISOString() }] } })
    default:
      throw new Error(`未知的區塊：${region}`)
  }
}

const MODEL_PANEL_PROPS = {
  // 模型清單是主站那一份選單，掛上去就會去打伺服器。契約只問「節點在不在」，
  // 所以這裡讓它保持關著——殼上的 MMD 名字不受影響。
  open: false,
  title: '模型設定',
  selectedValue: 'deepseek-v4-flash-ripple',
  modelName: 'DeepSeek V4 Flash',
  scoreText: '25',
  contextValue: 3,
  thinkingDepth: 'off',
}

const regions = Array.from(new Set(CANVAS_SELECTOR_CONTRACT.map((e) => e.region)))

describe('畫布契約：每一條宿主選擇器都查得到', () => {
  for (const region of regions) {
    describe(`區塊 ${region}`, () => {
      for (const entry of selectorsForRegion(region)) {
        it(`${entry.selector}（${entry.origin}）`, () => {
          const wrapper = mountRegion(region)
          const el = wrapper.element as HTMLElement
          // 掛載根自己也可能就是那個節點，所以兩邊都問。
          const hit = el.matches?.(entry.selector) || !!el.querySelector(entry.selector)
          expect(hit, `${entry.selector} 查不到 — ${entry.why}`).toBe(true)
          wrapper.unmount()
        })
      }
    })
  }
})

describe('畫布契約：作者會隱藏的節點必須存在', () => {
  for (const selector of ALWAYS_PRESENT_SELECTORS) {
    it(`${selector} 在 DOM 裡`, () => {
      const entry = CANVAS_SELECTOR_CONTRACT.find((e) => e.selector === selector)
      expect(entry, `${selector} 沒登記在契約表裡`).toBeTruthy()
      const wrapper = mountRegion(entry!.region)
      const el = wrapper.element as HTMLElement
      expect(el.matches?.(selector) || !!el.querySelector(selector)).toBe(true)
      wrapper.unmount()
    })
  }
})

describe('畫布契約：訊息兩層結構（列／氣泡）', () => {
  it('列是 .mes.item.Ai，氣泡是 .mes_text.content.left，且氣泡在列裡面', () => {
    const wrapper = mount(CanvasMessage, { props: { message: AI_MESSAGE } })
    const row = wrapper.element as HTMLElement
    expect(row.matches('.mes.item.Ai')).toBe(true)
    const bubble = row.querySelector('.mes_text.content.left')
    expect(bubble).toBeTruthy()
    expect(row.contains(bubble!)).toBe(true)
    // 兩者不是同一層——酒館把 .mes 當氣泡，我們取 MMD 的兩層
    expect(bubble === row).toBe(false)
  })

  it('使用者訊息是 .item.User + .content.right + is_user="true"', () => {
    const wrapper = mount(CanvasMessage, {
      props: { message: { ...AI_MESSAGE, role: 'user', mesid: 1, swipes: null, reasoning: '' } },
    })
    const row = wrapper.element as HTMLElement
    expect(row.matches('.mes.item.User')).toBe(true)
    expect(row.getAttribute('is_user')).toBe('true')
    expect(row.querySelector('.mes_text.content.right')).toBeTruthy()
  })

  it('最後一則帶 .last_mes（酒館主題靠它分辨）', () => {
    const wrapper = mount(CanvasMessage, { props: { message: AI_MESSAGE } })
    expect((wrapper.element as HTMLElement).matches('.last_mes')).toBe(true)
  })
})

// MMD 的「你可以选择开场」：訊息列之後的獨立區塊，一條一條是玩家可挑的第一句話。
// 點一條＝填進輸入框由玩家送出——不是替代開場白、不會換掉第一則訊息
// （2026-09-04 作者回報的事故正是把兩者混在一起）。
describe('畫布契約：MMD 開場選項區塊', () => {
  it('.prologue-scope > .prologue-title + .prologue-content×n 都在', () => {
    const wrapper = mount(CanvasPrologue, { props: PROLOGUE })
    const el = wrapper.element as HTMLElement
    expect(el.matches('.prologue-scope[data-lt="prologue"]')).toBe(true)
    const title = el.querySelector('.prologue-title')
    expect(title).toBeTruthy()
    expect(title!.textContent).toContain('你可以選擇開場')
    const items = el.querySelectorAll('.prologue-content')
    expect(items.length).toBe(PROLOGUE.items.length)
    expect(items[0].textContent).toBe('開場一')
    expect(items[1].textContent).toBe('開場二')
  })

  it('不住在任何一則訊息裡（MMD：.chat-body 的直接子節點，訊息列之後）', () => {
    const wrapper = mount(CanvasMessage, { props: { message: AI_MESSAGE } })
    expect((wrapper.element as HTMLElement).querySelector('.prologue-scope')).toBeNull()
  })

  it('沒有選項時整組節點不出現（不是空殼）', () => {
    const wrapper = mount(CanvasPrologue, { props: { title: 'x', items: [] } })
    expect((wrapper.element as HTMLElement).querySelector?.('.prologue-scope') ?? null).toBeNull()
    expect((wrapper.element as HTMLElement).matches?.('.prologue-scope') ?? false).toBe(false)
  })

  it('點一條送出 pick 事件帶 0-based 索引；沒有「選到哪條」的狀態，因為它不是在選開場白', async () => {
    const wrapper = mount(CanvasPrologue, { props: PROLOGUE })
    const items = wrapper.element.querySelectorAll('.prologue-content')
    ;(items[1] as HTMLElement).click()
    await wrapper.vm.$nextTick()
    expect(wrapper.emitted('pick')?.[0]).toEqual([1])
    expect(wrapper.element.querySelector('.is-active')).toBeNull()
  })
})

describe('畫布契約：輸入框是卡片腳本抓得到的形態', () => {
  it('textarea 帶 .uni-textarea-textarea 與 #send_textarea，且在 .chatMsgTextarea 裡', () => {
    const wrapper = mount(CanvasComposer, {
      props: { value: '', placeholder: 'x', sendState: 'send', generating: false },
    })
    const el = wrapper.element as HTMLElement
    const ta = el.querySelector('.chatMsgTextarea textarea') as HTMLTextAreaElement
    expect(ta).toBeTruthy()
    expect(ta.classList.contains('uni-textarea-textarea')).toBe(true)
    expect(ta.id).toBe('send_textarea')
  })

  it('placeholder 是真的 DOM 節點，不是偽元素', () => {
    const wrapper = mount(CanvasComposer, {
      props: {
          value: '', placeholder: '說點什麼', sendState: 'send', generating: false,
          shortcuts: [{ key: 'new-chat', label: '新的對話' }],
        },
    })
    const ph = wrapper.element.querySelector('.uni-textarea-placeholder.input-placeholder')
    expect(ph).toBeTruthy()
    expect(ph!.textContent).toContain('說點什麼')
  })

  it('原生 input 事件（卡片腳本寫值後 dispatch 的那個）會被聽到', async () => {
    const wrapper = mount(CanvasComposer, {
      props: { value: '', placeholder: 'x', sendState: 'send', generating: false },
    })
    const ta = wrapper.element.querySelector('textarea.uni-textarea-textarea') as HTMLTextAreaElement
    ta.value = '卡片寫進來的字'
    ta.dispatchEvent(new Event('input', { bubbles: true }))
    await wrapper.vm.$nextTick()
    expect(wrapper.emitted('update:value')?.[0]).toEqual(['卡片寫進來的字'])
  })

  it('卡片腳本點 .send-msg .btn-icon 就等於按下送出', async () => {
    const wrapper = mount(CanvasComposer, {
      props: { value: '嗨', placeholder: 'x', sendState: 'send', generating: false },
    })
    const btn = wrapper.element.querySelector('.send-msg .btn-icon') as HTMLElement
    expect(btn).toBeTruthy()
    btn.click()
    await wrapper.vm.$nextTick()
    expect(wrapper.emitted('send')).toBeTruthy()
  })

  it('停止鍵不在卡片會整塊隱藏的 .chat-bottom 裡（I-2）', () => {
    const wrapper = mount(CanvasComposer, {
      props: { value: '', placeholder: 'x', sendState: 'stop', generating: true },
    })
    const el = wrapper.element as HTMLElement
    const stop = el.querySelector('#mes_stop')
    const bottom = el.querySelector('.chat-bottom')
    expect(stop).toBeTruthy()
    expect(bottom).toBeTruthy()
    expect(bottom!.contains(stop!)).toBe(false)
  })
})

// ── 樣式契約 ────────────────────────────────────────────────────────────
//
// 卡片不寫 layer，所以卡片的規則天然高於我們的 @layer lt-base。這是「讓位」
// 唯一有效的機制：它跟先後順序、跟特異性都無關。我們一旦寫 !important 就把
// 這條路封死了——卡片得寫 !important 才蓋得掉，而它在原平台不需要。
describe('畫布契約：頁面樣式讓位', () => {
  const css = readFileSync(resolve(__dirname, '../canvas.css'), 'utf8')

  it('整份樣式包在 @layer lt-base 裡', () => {
    expect(css).toContain('@layer lt-base')
  })

  it('沒有任何 !important', () => {
    const stripped = css.replace(/\/\*[\s\S]*?\*\//g, '')
    expect(stripped).not.toMatch(/!\s*important/)
  })

  it('I-2 的停止鍵可用性規則刻意留在 layer 外', () => {
    // 用拿掉註解的版本找 @layer 開頭：註解裡本來就會提到「@layer」這個詞，
    // 字面比對找到的可能是註解而不是真正的規則邊界。
    const stripped = css.replace(/\/\*[\s\S]*?\*\//g, '')
    const outside = stripped.slice(0, stripped.indexOf('@layer lt-base'))
    expect(outside).toContain('#mes_stop')
  })

  // 預設字體對齊酒館使用者的環境（MMD 實測是系統堆疊，SillyTavern 是 Noto Sans），
  // 不能繼承主站的品牌字體 Nunito——owner 一眼就看出「我們的預設字體不對」。
  it('預設字體是系統無襯線堆疊，不是主站品牌字體', () => {
    const vars = readFileSync(resolve(__dirname, '../../../common/canvas-theme-vars.css'), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
    const match = vars.match(/--lt-canvas-font:\s*([^;]+);/)
    expect(match, '--lt-canvas-font 必須有明確的值').toBeTruthy()
    const value = match![1]
    expect(value).not.toMatch(/inherit|Nunito/)
    expect(value).toMatch(/system-ui/)
    expect(value).toMatch(/sans-serif\s*$/)
  })
})

describe('畫布契約：這條路由上沒有 Theme V3 / XMLV3', () => {
  const files = [
    '../canvas.vue',
    '../components/canvas-header.vue',
    '../components/canvas-stage.vue',
    '../components/canvas-message.vue',
    '../components/canvas-composer.vue',
    '../components/canvas-message-menu.vue',
    '../components/canvas-intro.vue',
  ]

  for (const file of files) {
    it(`${file} 不引入 theme-v3 / xmlstream`, () => {
      const source = readFileSync(resolve(__dirname, file), 'utf8')
      expect(source).not.toContain('theme-v3')
      expect(source).not.toContain('xmlstream')
      expect(source).not.toContain('TagRenderer')
      expect(source).not.toContain('StatusBar')
    })
  }
})

// uni-app 的編譯器會把模板裡的 view / text / image / textarea / input 換成它自己的
// 元件。渲染出來的節點名與層數跟我們寫的不一樣，而卡片抓的正是那些節點——
// `.uni-textarea-textarea` 若落在 uni 的外殼上，卡片腳本的 `el.value = txt` 會
// 靜默寫到 textContent，字進不了輸入框。這種錯在單元測試裡看不見（測試環境不跑
// 那層轉換），所以改成掃原始碼。
describe('畫布契約：版面不用會被平台換掉的標籤', () => {
  const files = [
    '../components/canvas-header.vue',
    '../components/canvas-stage.vue',
    '../components/canvas-intro.vue',
    '../components/canvas-message.vue',
    '../components/canvas-composer.vue',
    '../components/canvas-message-menu.vue',
  ]
  const transformed = ['view', 'text', 'image', 'textarea', 'input', 'scroll-view', 'button', 'navigator']

  for (const file of files) {
    it(`${file} 只用瀏覽器原生標籤`, () => {
      const source = readFileSync(resolve(__dirname, file), 'utf8')
      const template = source.slice(0, source.indexOf('<script'))
      for (const tag of transformed) {
        expect(template, `<${tag}> 會被平台換成它自己的元件`).not.toMatch(
          new RegExp(`<${tag}[\\s/>]`),
        )
      }
    })
  }

  it('真正的 textarea 是原生節點，卡片腳本寫得進 value', () => {
    const wrapper = mount(CanvasComposer, {
      props: { value: '', placeholder: 'x', sendState: 'send', generating: false },
    })
    const ta = wrapper.element.querySelector('.uni-textarea-textarea') as HTMLTextAreaElement
    expect(ta.tagName).toBe('TEXTAREA')
    expect(typeof ta.value).toBe('string')
  })
})

describe('畫布契約：畫布路由不夾帶其他平台 UI', () => {
  const source = readFileSync(resolve(__dirname, '../canvas.vue'), 'utf8')

  // 卡片沒有沙盒，它的 CSS 打在整份文件上。文件裡若還有別的平台介面，
  // 那些介面會被卡片弄壞，而作者根本不知道它們存在。
  for (const token of ['ant-design-vue', '<a-modal', '<a-popover', '<a-button', '<a-spin', 'element-plus']) {
    it(`不出現 ${token}`, () => {
      expect(source).not.toContain(token)
    })
  }
})

// ── 開放客戶端的邊界 ────────────────────────────────────────────────────
//
// 這幾條原本住在舊對話頁的版面契約裡。版面換掉了，但它們守的不是版面：
// 這個客戶端能碰的後端就是 docs/open-api-v1.md 那張端點表，付費、分析、
// 卡片經營、社交都明說永遠不會進 v1。名字回到原始碼裡，代表有人接了一條
// 這個客戶端打不到的後端，畫面上會多出一顆按不動的鍵。
describe('開放客戶端：主站帶進來的東西不得回來', () => {
  const source = readFileSync(resolve(__dirname, '../canvas.vue'), 'utf8')
  const script = source.slice(source.indexOf('<script'), source.indexOf('</script>'))

  // 每一條都挑「不可能誤中」的識別符：不用 story（history 會中）、
  // 不用 pay（payload 會中）、不用 share（shared 會中）。
  const banned = [
    'storyId',          // 劇情／galgame 模式
    'galgame',
    'ga4Events',        // 分析埋點
    'gtag',
    'share-utils',      // 分享／複製連結
    'resolveRoleShareUrl',
    'buildPlatformShareUrl',
    'open_vip',         // 儲值／每日報到 CTA（餘額不足仍要有誠實錯誤，只是不導購）
    'open_checkin',
    'quotaToast',
    'isPinned',         // 釘選
    'presetCmd',        // 預設指令
    'applyBubbleSkinCss', // 氣泡皮膚
    'bubble-skins',
  ]

  for (const token of banned) {
    it(`畫布的腳本不出現 ${token}`, () => {
      expect(script).not.toContain(token)
    })
  }
})

// 作者的 position:fixed 面板要相對「視窗」，不是相對「對話欄」——畫布沒有側欄，
// 對話欄本來就是整個內容區，容器若挪到對話欄位置再加 transform（建立 containing
// block），作者的 `right: 0` 會貼到內容欄邊而不是玩家看到的螢幕邊緣。這支掃的是
// under/over/cover 三個容器共用的那個函式，不是任意一處 transform：定位容器的
// 邏輯只能有「永遠滿視窗」一種分支，不能再依層級或量測結果分岔出第二種。
describe('畫布契約：作者掛載鏈不再有把 fixed 容器縮進對話欄的 containing block', () => {
  const mountSource = readFileSync(
    resolve(__dirname, '../../../utils/author-asset-mount.js'),
    'utf8',
  )

  it('applyContainerBox 不再依層級／對話欄量測分岔出非滿視窗的分支', () => {
    const fn = mountSource.slice(
      mountSource.indexOf('function applyContainerBox'),
      mountSource.indexOf('function applyContainerBox') +
        mountSource.slice(mountSource.indexOf('function applyContainerBox')).indexOf('\n  }') + 4,
    )
    expect(fn).not.toContain('columnBox')
    expect(fn).not.toContain("layer === 'cover'")
    expect(fn.match(/style\.transform\s*=\s*[^\n]+/g)).toEqual(["style.transform = ''"])
  })

  it('沒有 columnBox 狀態殘留——量測值只餵 --lt-chat-col-* 變數，不再決定容器的 left/top/width/height', () => {
    expect(mountSource).not.toContain('columnBox')
  })
})

// PC 上訊息欄與輸入框要跟 MMD 量到的欄寬一致並置中；手機維持今天的全滿版。
describe('畫布契約：PC 欄寬與置中規則', () => {
  const themeVars = readFileSync(resolve(__dirname, '../../../common/canvas-theme-vars.css'), 'utf8')
  // 拿掉註解再切規則區塊：這份檔案的註解裡會示範性地寫出 CSS 片段（含大括號），
  // 留著註解會讓「找下一個 `}`」提早在註解裡的括號收手，切出殘缺的規則。
  const rawCss = readFileSync(resolve(__dirname, '../canvas.css'), 'utf8')
  const css = rawCss.replace(/\/\*[\s\S]*?\*\//g, '')

  /*
    欄寬先前是照 MMD 在 1440 下量到的氣泡寬度反推的固定值（860px）。那個數字在
    16:9 的螢幕上兩側各留下一大片空地，而卡片的美化往往鋪滿整個視窗——欄位縮在
    中間一條，看起來像沒對齊；手機橫著拿時更明顯。改成「有多少用多少，但別寬到
    一行讀不完」：兩側各留 24px，上限 1200px。
  */
  it('--lt-canvas-column-width 跟著視窗走，兩側留白固定，並有一個讀得完的上限', () => {
    expect(themeVars).toMatch(/--lt-canvas-column-width:\s*min\(1200px,\s*calc\(100vw - 48px\)\)/)
  })

  // 置中不能用留在 @layer 裡的 margin:0 auto——uni-app H5 base.css 有一條不分層、
  // 特異性 0 的全域星號 margin 歸零規則，天然贏過我們整份 @layer lt-base，
  // margin:auto 會被歸零、欄位貼死在左邊（實測過：改完才發現的真根因，不是
  // 憑空防禦）。也不能用 transform 位移置中頂替——那會讓這個節點自己變成
  // containing block，把它裡面 v-html 出來的卡片訊息內容裡任何
  // `position: fixed` 面板都吸過來相對它定位，而不是相對視窗（跟 defect 1
  // 同一種錯，只是從掛載容器換成了訊息氣泡；MMD 卡常把整組固定面板塞在
  // 第一則訊息內文裡，不是罕見情境）。唯一乾淨的解法：margin:0 auto 搬到
  // @layer 外面，跟 #mes_stop 用同一個「layer 外面」機制贏過 base.css，
  // 特異性又不高到擋住卡片的同名覆寫。
  it('頂欄／訊息欄／輸入區共用的欄寬置中規則寫在 @layer 外面，用 margin:0 auto（不是 transform）', () => {
    // 用拿掉註解的 css（不是 rawCss）找 @layer 開頭：註解裡本來就會提到
    // 「@layer」這個詞，字面比對找到的可能是註解而不是真正的規則邊界。
    const layerAt = css.indexOf('@layer lt-base')
    const outside = css.slice(0, layerAt)
    const at = outside.indexOf('#chat')
    expect(at, '#chat 開頭的置中規則不在 @layer 外面').toBeGreaterThan(-1)
    const openBrace = outside.indexOf('{', at)
    const rule = outside.slice(at, outside.indexOf('}', openBrace))
    for (const selector of ['#chat', '.header-box', '.chat-bottom-wapper', '.shortcut-bar-wrapper']) {
      expect(rule, `置中規則沒有一起帶到 ${selector}`).toContain(selector)
    }
    expect(rule, '沒有用 --lt-canvas-column-width').toContain('var(--lt-canvas-column-width)')
    expect(rule, '沒有用 margin: 0 auto 置中').toMatch(/margin:\s*0\s*auto/)
    expect(rule, '不該用 transform 位移置中——會讓這個節點變成 fixed 子孫的 containing block')
      .not.toMatch(/transform\s*:/)
    expect(rule, '不該用 position/left 位移置中').not.toMatch(/\bleft\s*:\s*50%/)
  })

  it('@layer 裡同名選擇器不再重複宣告欄寬／置中／transform（避免兩處各說各話）', () => {
    for (const selector of ['#chat', '.header-box']) {
      const at = css.indexOf(selector + ' {', css.indexOf('@layer lt-base'))
      expect(at, `${selector} 不在 layer 裡`).toBeGreaterThan(-1)
      const openBrace = css.indexOf('{', at)
      const rule = css.slice(at, css.indexOf('}', openBrace))
      expect(rule, `${selector} 的 layer 內規則不該再有 max-width`).not.toContain('max-width')
      expect(rule, `${selector} 的 layer 內規則不該再有 margin`).not.toMatch(/\bmargin\s*:/)
      expect(rule, `${selector} 的 layer 內規則不該再有 transform`).not.toMatch(/transform\s*:/)
    }
  })

  // defect 1 的根因是「fixed 容器被挪到對話欄位置再加 transform，變成
  // containing block」。這條守的是同一件事在版面骨架層級不會重演：舞台／
  // 訊息欄／訊息列／氣泡這幾個 v-html 內容會流經的節點，都不能帶會建立
  // containing block 或 stacking/paint 隔離的屬性。
  it('舞台／訊息欄／訊息列／氣泡都不建立會吸住 v-html 內 fixed 元素的 containing block', () => {
    const watched = ['.canvas-root', '.chat-scope-box', '.scroll-view', '#chat', '.mes ', '.mes_block', '.mes_text']
    const banned = /\b(transform|filter|contain|will-change|perspective)\s*:/
    for (const selector of watched) {
      const trimmed = selector.trim()
      const at = css.indexOf(trimmed + (selector.endsWith(' ') ? ' ' : '') + '{', 0)
      const fallbackAt = at === -1 ? css.indexOf(trimmed) : at
      expect(fallbackAt, `${trimmed} 不在 canvas.css 裡`).toBeGreaterThan(-1)
      const openBrace = css.indexOf('{', fallbackAt)
      const rule = css.slice(fallbackAt, css.indexOf('}', openBrace))
      expect(rule, `${trimmed} 不該有 transform/filter/contain/will-change/perspective——會建立 containing block`)
        .not.toMatch(banned)
    }
  })

  // 100% 必須宣告在 layer 外（canvas-theme-vars.css）。先前寫在 canvas.css 的
  // @layer 斷點裡，輸給 layer 外的預設值，從來沒生效過：手機上量到欄寬 342px
  // （390 − 48），輸入欄位只剩 236px（2026-09-04 owner 截圖）。
  it('手機斷點（≤768px）收成全滿版，而且宣告在 layer 外才真的生效', () => {
    const vars = readFileSync(resolve(__dirname, '../../../common/canvas-theme-vars.css'), 'utf8')
    const mobileVars = vars.slice(vars.indexOf('@media (max-width: 768px)'))
    expect(mobileVars).toMatch(/--lt-canvas-column-width:\s*100%/)
    // 那個檔沒有任何 @layer 區塊（註解裡提到不算，先把註解剝掉再看）
    expect(vars.replace(/\/\*[\s\S]*?\*\//g, '')).not.toMatch(/@layer/)
    // canvas.css 的斷點在 @layer 裡，寫在那裡是死的——不要再寫回去
    const mobileBlock = css.slice(css.indexOf('@media (max-width: 768px)'))
    expect(mobileBlock).not.toMatch(/--lt-canvas-column-width:/)
  })
})

describe('開放客戶端：不再帶主站才需要的相依', () => {
  const pkg = readFileSync(resolve(__dirname, '../../../../package.json'), 'utf8')

  // opencc-js 不在這張清單上：正體中文介面會把簡體的回覆轉成正體再顯示，
  // 那是還活著的顯示行為，不是主站遺留。拿掉它等於讓正體使用者看到簡體。
  for (const dep of [
    '@stripe', '@openim', 'openim-uniapp-polyfill', '@tiptap', 'monaco-editor', 'cropperjs',
    'element-plus', 'vue-waterfall-easy', 'image-tools', 'mustache', 'dompurify',
    '@dcloudio/uni-mp-', '@dcloudio/uni-app-plus', '@dcloudio/uni-quickapp',
  ]) {
    it(`package.json 不再列 ${dep}`, () => {
      expect(pkg).not.toContain(dep)
    })
  }
})

// 開放客戶端不是 lunatalk.ai：它沒有主站的分析帳號、也不該把自己宣告成主站的
// 正規網址（那會讓搜尋引擎把 playground 的頁面歸給主站）。
describe('開放客戶端：入口網頁不帶主站的分析與網址宣告', () => {
  const html = readFileSync(resolve(__dirname, '../../../../index.html'), 'utf8')

  for (const token of ['googletagmanager', 'rel="canonical"', 'hreflang']) {
    it(`index.html 不再出現 ${token}`, () => {
      expect(html).not.toContain(token)
    })
  }
  it('index.html 沒有任何分析或廣告帳號 ID', () => {
    expect(html).not.toMatch(/\bG-[A-Z0-9]{8,}\b/)
    expect(html).not.toMatch(/\bAW-\d{8,}\b/)
  })
})

// 手機也要能用：單欄、頁面本身不橫向捲、輸入區避開系統手勢區。
describe('畫布：手機也要能用', () => {
  const css = readFileSync(resolve(__dirname, '../canvas.css'), 'utf8')

  it('訊息串有自己的捲動區，不靠整頁捲動', () => {
    expect(css).toMatch(/\.scroll-view\s*\{[^}]*overflow-y:\s*auto/)
  })

  it('輸入區避開系統手勢區', () => {
    expect(css).toContain('env(safe-area-inset-bottom)')
  })

  it('窄螢幕收掉桌面的欄寬', () => {
    expect(css).toContain('@media (max-width: 768px)')
  })
})

// owner 2026-09-04 回報（手機截圖）：AI 氣泡右邊幾乎貼死螢幕邊緣，左邊卻空一大塊——
// 頭像固定寬度把氣泡往右推，右邊沒有對應留白，兩側內距不對稱。改法：頭像＋名字
// 併成一排（header row），氣泡另起一排、滿版寬度，不管頭像欄多寬，氣泡容器的
// 左右邊界永遠跟訊息列本身對齊。這裡鎖結構本身（DOM 分組）；實際像素對稱要靠
// 瀏覽器量 getBoundingClientRect，jsdom 沒有 layout engine 量不出來，另外用
// Chrome DevTools 在 375 / 1440 兩個寬度跑（見 Follow-up 3 報告的截圖與量測）。
describe('畫布契約：訊息頭像＋名字併成一排，氣泡另起一排滿版寬度', () => {
  it('頭像（.mesAvatarWrapper）與名字（.ch_name）是同一個父節點底下的兄弟，不在氣泡的容器（.mes_block）裡面', () => {
    const wrapper = mount(CanvasMessage, { props: { message: AI_MESSAGE } })
    const row = wrapper.element as HTMLElement
    const avatarWrap = row.querySelector('.mesAvatarWrapper')
    const chName = row.querySelector('.ch_name')
    const mesBlock = row.querySelector('.mes_block')
    expect(avatarWrap).toBeTruthy()
    expect(chName).toBeTruthy()
    expect(mesBlock).toBeTruthy()
    // 同一排：跟頭像同一個父節點——舊結構是 .ch_name 在 .mes_block 裡面，
    // 父節點是 .mes_block；新結構要求父節點跟頭像的父節點相同。
    expect(chName!.parentElement).toBe(avatarWrap!.parentElement)
    // 不在氣泡容器裡面：.mes_block 不再包含名字列。
    expect(mesBlock!.contains(chName!)).toBe(false)
    wrapper.unmount()
  })

  it('氣泡容器（.mes_block）橫跨頭像＋名字兩欄，寬度上跟頭像／名字那排同寬（grid-area 覆蓋兩欄）', () => {
    const css = readFileSync(resolve(__dirname, '../canvas.css'), 'utf8')
    // grid-template-areas 的第二排要橫跨兩欄（"block block"），氣泡容器的
    // grid-area 才會滿版寬度，左右邊界對齊 .mes 本身，不被頭像欄擠掉左邊。
    const gridBlock = css.match(/\.mes\s*\{[\s\S]*?grid-template-areas:([\s\S]*?);/)
    expect(gridBlock, '.mes 找不到 grid-template-areas — 版面結構已變，需同步更新本測試').toBeTruthy()
    expect(gridBlock![1]).toMatch(/["']block\s+block["']/)
  })

  it('使用者訊息（.item.User）不顯示頭像／名字列，氣泡照舊靠右', () => {
    const wrapper = mount(CanvasMessage, {
      props: { message: { ...AI_MESSAGE, role: 'user', mesid: 1, swipes: null, reasoning: '' } },
    })
    const row = wrapper.element as HTMLElement
    expect(row.querySelector('.mesAvatarWrapper')).toBeTruthy()
    expect(row.querySelector('.ch_name')).toBeTruthy()
    // 節點還在（酒館主題 querySelector 得到），只是靠 CSS display:none 收起——
    // 契約在最上面「每一條宿主選擇器都查得到」那組已經鎖過，這裡只補這則訊息
    // 本身的結構沒有跳過名字列（避免有人為了對齊乾脆刪掉這個節點）。
    wrapper.unmount()
  })
})
