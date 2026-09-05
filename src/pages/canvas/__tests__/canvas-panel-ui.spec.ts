/**
 * 功能面板／彈層真的掛起來之後的行為。
 *
 * 契約那一支只問「節點在不在」；這一支問的是玩家按下去會發生什麼——面板開得開、
 * 關得掉、跟輸入區的展開態互不相干，點數兩列都看得到，換模型真的送得出去。
 */
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import catalog from './fixtures/model-catalog.json'
import CanvasComposer from '../components/canvas-composer.vue'
import CanvasPopup from '../components/canvas-popup.vue'
import CanvasModelPanel from '../components/canvas-model-panel.vue'
import CanvasConfirm from '../components/canvas-confirm.vue'
import CanvasConversationList from '../components/canvas-conversation-list.vue'

const BASE = { value: '', placeholder: '說點什麼', sendState: 'send', generating: false }
const ITEMS = [
  { key: 'new-chat', label: '新的對話' },
  { key: 'model', label: '模型設定' },
]

function composer(extra: Record<string, unknown> = {}) {
  return mount(CanvasComposer, { props: { ...BASE, moreItems: ITEMS, ...extra } })
}

describe('「＋」功能面板', () => {
  it('關著的時候面板收起來，＋ 也標成關', () => {
    const el = composer().element as HTMLElement
    expect(el.querySelector('.more-scope')!.getAttribute('data-open')).toBe('off')
    expect(el.querySelector('.more-scope')!.hasAttribute('hidden')).toBe(true)
    expect(el.querySelector('.more-options-scope')!.getAttribute('data-more')).toBe('off')
  })

  it('開著的時候兩處狀態一致，格子照 moreItems 畫出來', () => {
    const el = composer({ moreOpen: true }).element as HTMLElement
    expect(el.querySelector('.more-scope')!.getAttribute('data-open')).toBe('on')
    expect(el.querySelector('.more-scope')!.hasAttribute('hidden')).toBe(false)
    expect(el.querySelector('.more-options-scope')!.getAttribute('data-more')).toBe('on')
    const titles = Array.from(el.querySelectorAll('.more-scope .item-title')).map((n) => n.textContent)
    expect(titles).toEqual(['新的對話', '模型設定'])
  })

  it('面板住在 .chat-bottom 裡——卡片寫的是帶 .chat-bottom 的完整路徑', () => {
    const el = composer({ moreOpen: true }).element as HTMLElement
    const scope = el.querySelector('.more-scope')!
    expect(el.querySelector('.chat-bottom')!.contains(scope)).toBe(true)
  })

  it('按 ＋ 是把切換這件事交出去，元件自己不記狀態', async () => {
    const wrapper = composer()
    await (wrapper.element as HTMLElement).querySelector<HTMLElement>('#options_button')!.click()
    expect(wrapper.emitted('more')?.length).toBe(1)
    // 沒有把 moreOpen 改成 true——狀態的主是頁面，不是輸入區
    expect((wrapper.element as HTMLElement).querySelector('.more-scope')!.getAttribute('data-open')).toBe('off')
  })

  it('點一格會把那一格的 key 交出去', async () => {
    const wrapper = composer({ moreOpen: true })
    const items = (wrapper.element as HTMLElement).querySelectorAll<HTMLElement>('.more-scope .item')
    items[1].click()
    await wrapper.vm.$nextTick()
    expect(wrapper.emitted('more-pick')?.[0]).toEqual(['model'])
  })

  it('面板開著跟輸入區展不展開是兩件事：面板開著時輸入區仍然是折疊態', async () => {
    const wrapper = composer({ moreOpen: true })
    const el = wrapper.element as HTMLElement
    expect(el.querySelector('.chat-input-scope')!.classList.contains('is-expanded')).toBe(false)
    // 反過來也一樣：輸入框拿到焦點讓輸入區展開，面板狀態不受影響
    const ta = el.querySelector('textarea.uni-textarea-textarea') as HTMLTextAreaElement
    ta.dispatchEvent(new Event('focus'))
    await wrapper.vm.$nextTick()
    expect(el.querySelector('.chat-input-scope')!.classList.contains('is-expanded')).toBe(true)
    expect(el.querySelector('.more-scope')!.getAttribute('data-open')).toBe('on')
  })
})

describe('輸入區的點數', () => {
  it('折疊列與展開列都看得到同一個數字', () => {
    const el = composer({ modelScore: '45' }).element as HTMLElement
    const scores = Array.from(el.querySelectorAll('.mind-type-score')).map((n) => n.textContent)
    expect(scores).toEqual(['45', '45'])
    expect(el.querySelectorAll('.mind-type .icon-box .icon-battery').length).toBe(2)
  })

  it('還不知道要花多少點時不寫一個 0 上去', () => {
    const el = composer().element as HTMLElement
    expect(el.querySelector('.mind-type-score')!.textContent).toBe('')
  })

  it('點 .mind-type 就是要開模型設定', async () => {
    const wrapper = composer({ modelScore: '45' })
    const nodes = (wrapper.element as HTMLElement).querySelectorAll<HTMLElement>('.mind-type')
    nodes[0].click()
    nodes[1].click()
    await wrapper.vm.$nextTick()
    expect(wrapper.emitted('model')?.length).toBe(2)
  })
})

describe('彈層的殼', () => {
  it('點遮罩就關', async () => {
    const wrapper = mount(CanvasPopup, { props: { open: true } })
    ;(wrapper.element as HTMLElement).querySelector<HTMLElement>('.u-mask')!.click()
    await wrapper.vm.$nextTick()
    expect(wrapper.emitted('close')?.length).toBe(1)
    wrapper.unmount()
  })

  it('ESC 掛在 document 上——焦點不在彈層裡也關得掉', async () => {
    const wrapper = mount(CanvasPopup, { props: { open: true } })
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    await wrapper.vm.$nextTick()
    expect(wrapper.emitted('close')?.length).toBe(1)
    wrapper.unmount()
  })

  it('沒開的時候不吃 ESC——卡片自己也會用這個鍵', async () => {
    const wrapper = mount(CanvasPopup, { props: { open: false } })
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    await wrapper.vm.$nextTick()
    expect(wrapper.emitted('close')).toBeUndefined()
    wrapper.unmount()
  })

  it('卸載後不留監聽', async () => {
    const wrapper = mount(CanvasPopup, { props: { open: true } })
    wrapper.unmount()
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    expect(wrapper.emitted('close')).toBeUndefined()
  })
})

const PANEL_PROPS = {
  // 模型選單掛上去就會去打伺服器要目錄。這一支問的是殼的行為（節點、事件），
  // 所以讓它保持關著；選單自己的行為由主站那一份負責，不在這裡重測一遍。
  open: false,
  title: '模型設定',
  roleId: 'r1',
  selectedValue: 'deepseek-v4-flash-ripple',
  modelName: 'DeepSeek V4 Flash · 凌波',
  scoreText: '25',
  contextValue: 3,
  thinkingDepth: 'off',
  labels: { close: '關閉', done: '完成', perTurn: '/次' },
}

describe('模型設定', () => {
  it('外殼是作者打得到的那一套名字', () => {
    const el = mount(CanvasModelPanel, { props: PANEL_PROPS }).element as HTMLElement
    expect(el.matches('.model-setting-scope')).toBe(true)
    for (const selector of ['.mp-top', '.mp-title', '.mp-close', '.mp-info-bar',
                            '.mp-model-name', '.mp-energy-pill', '.mp-ev', '.mp-el',
                            '.mp-setting-body', '.bottom .btn']) {
      expect(el.querySelector(selector), selector).toBeTruthy()
    }
  })

  it('現在用的模型與它一輪多少點就寫在那一列上', () => {
    const el = mount(CanvasModelPanel, { props: PANEL_PROPS }).element as HTMLElement
    expect(el.querySelector('.mp-model-name')!.textContent).toBe('DeepSeek V4 Flash · 凌波')
    expect(el.querySelector('.mp-ev')!.textContent).toBe('25')
    expect(el.querySelector('.mp-el')!.textContent).toBe('/次')
  })

  it('還不知道要花多少點時寫一槓，不寫 0——0 是免費，不是不知道', () => {
    const el = mount(CanvasModelPanel, {
      props: { ...PANEL_PROPS, scoreText: '' },
    }).element as HTMLElement
    expect(el.querySelector('.mp-ev')!.textContent).toBe('—')
  })

  // 線路的內部代號帶著真實供應商的名字。它出現在畫面上就是把供應商講給玩家聽，
  // 而那是產品刻意不做的事。
  it('外殼上不出現線路的內部代號', () => {
    const el = mount(CanvasModelPanel, { props: PANEL_PROPS }).element as HTMLElement
    const text = el.textContent || ''
    for (const value of ['deepseek-v4-flash-ripple', 'official-deepseek-v4-flash-provider-n']) {
      expect(text).not.toContain(value)
    }
  })

  it('右上角的 × 交出去，不自己關', async () => {
    const wrapper = mount(CanvasModelPanel, { props: PANEL_PROPS })
    ;(wrapper.element as HTMLElement).querySelector<HTMLElement>('.mp-close')!.click()
    await wrapper.vm.$nextTick()
    expect(wrapper.emitted('close')?.length).toBe(1)
  })
})

/*
  每一個入口只打開它自己那一片。

  這條守的是一種很難用眼睛抓到的錯：兩個入口指到同一個彈層時，畫面上會開一片
  「看起來很像但不是他要的」東西，而玩家只會覺得這個介面亂。
*/
describe('入口與彈層一一對應', () => {
  const source = readFileSync(resolve(__dirname, '../canvas.vue'), 'utf8')

  it('每一片彈層都有自己的名字，沒有兩片共用一個', () => {
    // 只數彈層殼上的那一個條件；殼裡面的元件也會拿同一個名字判斷要不要抓資料，
    // 那不是第二片彈層。
    const shells = Array.from(source.matchAll(/<CanvasPopup :open="panel\.sheet === '([a-z-]+)'/g))
      .map((m) => m[1])
    expect(shells.length).toBeGreaterThan(4)
    expect(new Set(shells).size, shells.join(',')).toBe(shells.length)
  })

  it('快捷／面板上的每一個 key 都有一條自己的分支，或一個同名的開啟函式', () => {
    const routing = source.slice(
      source.indexOf('function onShortcut('),
      source.indexOf('// ── 一次性確認'),
    )
    for (const key of ['model', 'persona', 'directives', 'notepad', 'new-chat',
                       'conversations', 'background', 'reset-chat', 'export', 'bottom']) {
      expect(routing, key).toContain(`key === '${key}'`)
    }
  })

  it('對話設定整片已經拿掉：模型與 Agent 模式都在模型設定裡，自動摘要不給玩家撥', () => {
    expect(source).not.toContain('chat-setting')
    expect(source).not.toContain('history-setting-scope')
    // 關掉自動摘要會改變長對話的記憶行為，那不是一個開關該承擔的後果。
    expect(source).not.toContain('compact-preference')
  })
})

/*
  輸入區上面那一排放的是「每次都會碰」的五樣，其餘全部收進「＋」。
  順序本身是產品決定：模型在最前面（它決定這一輪花多少點），新的對話在最後面
  （它會把現在這段收起來，不該跟前四樣混在一起被誤按）。
*/
describe('快捷列', () => {
  const source = readFileSync(resolve(__dirname, '../canvas.vue'), 'utf8')

  it('放的是五樣，順序固定', () => {
    const block = source.slice(
      source.indexOf('const shortcutItems = computed'),
      source.indexOf('const panel = ref<CanvasPanelState>'),
    )
    const keys = Array.from(block.matchAll(/key: '([a-z-]+)'/g)).map((m) => m[1])
    expect(keys).toEqual(['model', 'persona', 'directives', 'notepad', 'new-chat'])
  })

  it('「＋」裝得下全部——快捷列上的五樣也留著，玩家不必記得哪一樣在哪裡', () => {
    const block = source.slice(
      source.indexOf('const moreItems = computed'),
      source.indexOf('function closeCanvasSheet'),
    )
    const keys = Array.from(block.matchAll(/key: '([a-z-]+)'/g)).map((m) => m[1])
    for (const key of ['model', 'persona', 'directives', 'notepad', 'new-chat']) {
      expect(keys, key).toContain(key)
    }
    for (const key of ['conversations', 'background', 'reset-chat', 'export', 'bottom']) {
      expect(keys, key).toContain(key)
    }
  })
})

/*
  共用的表單初值裡塞著客戶端自己編的模型代號（以及一個猜出來的性別）。伺服器查不到
  那個代號，會落到未知模型的回退價；而畫面上完全看不出來，所以只有這一條在守它。
*/
describe('進場先把遊玩設定清成「還不知道」', () => {
  const source = readFileSync(resolve(__dirname, '../canvas.vue'), 'utf8')

  it('清空排在去伺服器讀設定之前', () => {
    const reset = source.indexOf('Object.assign(formData, ROLE_SETTINGS_DEFAULTS)')
    const load = source.indexOf('ensureRoleSettings().then(loadModelCatalog)')
    expect(reset).toBeGreaterThan(-1)
    expect(load).toBeGreaterThan(reset)
  })

  it('送出去的模型就是設定裡那個值，客戶端不補一個自己編的', () => {
    const script = source.slice(source.indexOf('<script'), source.indexOf('</script>'))
    expect(script).toContain("model: formData.selectModel || ''")
    expect(script).not.toContain('qwen:32b')
  })
})

describe('確認框', () => {
  it('確定與取消各自交出去，順序是確定在前（照 MMD）', async () => {
    const wrapper = mount(CanvasConfirm, {
      props: { content: '確定要重置嗎？', okText: '確定', cancelText: '取消' },
    })
    const el = wrapper.element as HTMLElement
    const buttons = Array.from(el.querySelectorAll('.confirm-bottom > *')).map((n) => n.className)
    expect(buttons).toEqual(['ok-btn', 'btn-gap', 'cancel-btn'])
    el.querySelector<HTMLElement>('.cancel-btn')!.click()
    await wrapper.vm.$nextTick()
    expect(wrapper.emitted('cancel')?.length).toBe(1)
    expect(wrapper.emitted('ok')).toBeUndefined()
  })
})

describe('歷史對話', () => {
  it('現在這一段標出來，而且點它不會再送一次', async () => {
    const wrapper = mount(CanvasConversationList, {
      props: {
        title: '歷史對話',
        currentLabel: '目前',
        items: [
          { key: 'a', name: '甲', current: true },
          { key: 'b', name: '乙' },
        ],
      },
    })
    const rows = (wrapper.element as HTMLElement).querySelectorAll<HTMLElement>('.cl-item')
    expect(rows[0].classList.contains('is-current')).toBe(true)
    rows[0].click()
    await wrapper.vm.$nextTick()
    expect(wrapper.emitted('pick')).toBeUndefined()
    rows[1].click()
    await wrapper.vm.$nextTick()
    expect(wrapper.emitted('pick')?.[0]).toEqual(['b'])
  })

  it('一段都沒有時給一句話，不是一片空白', () => {
    const el = mount(CanvasConversationList, {
      props: { items: [], emptyText: '還沒有聊過的紀錄' },
    }).element as HTMLElement
    expect(el.querySelector('.cl-empty')!.textContent).toBe('還沒有聊過的紀錄')
  })
})
