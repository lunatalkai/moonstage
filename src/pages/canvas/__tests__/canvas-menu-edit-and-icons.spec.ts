/**
 * owner 2026-09-05 三個回報：
 * 1. 點「改寫」後預覽框與選單沒收起來，三塊同時在畫面上。
 * 2. 最新一則不該有「倒回這裡」。
 * 3. 「+」面板每格的圖示槽是空的——卡片把槽畫了邊框，裡面一張圖都沒有。
 */
import { describe, it, expect, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import CanvasMessageMenu from '../components/canvas-message-menu.vue'
import CanvasComposer from '../components/canvas-composer.vue'
import { panelIconSvg, hasPanelIcon } from '../canvas-panel-icons'

const css = readFileSync(resolve(__dirname, '../canvas.css'), 'utf8')

describe('改寫態', () => {
  it('選單殼標成 is-editing，樣式把預覽與選單收起、只留編輯區', () => {
    const w = mount(CanvasMessageMenu, { props: { open: true, editing: true, actions: [{ key: 'copy', label: '複製' }], message: { html: '<p>x</p>' } } })
    expect(w.find('.msg-option-scope').classes()).toContain('is-editing')
    expect(w.find('.msg-content-box').exists()).toBe(true)
    expect(w.find('.msg-options-box').exists()).toBe(true)
    expect(css).toMatch(/\.msg-option-scope\.is-editing \.msg-content-box,\s*\.msg-option-scope\.is-editing \.msg-options-box \{\s*display: none;/)
  })
})

describe('倒回這裡', () => {
  it('開場白可以當倒回目標（不是最新一則時）：一步回到起點，長期指令與手帳留著', () => {
    const src = readFileSync(resolve(__dirname, '../canvas.vue'), 'utf8')
    expect(src).toMatch(/if \(isOpeningIndex\(talkList\.value, index\)\) \{\s*\n\s*const openingActions[^\n]*\n\s*if \(item\.id !== 0 && index !== talkList\.value\.length - 1\) \{\s*\n\s*openingActions\.push\(\{ key: 'rewind'/)
  })
  it('最新一則不給倒回', () => {
    const src = readFileSync(resolve(__dirname, '../canvas.vue'), 'utf8')
    expect(src).toMatch(/const isLatestRow = index === talkList\.value\.length - 1\s*\n\s*if \(item\.id !== 0 && !isLatestRow\) \{\s*\n\s*actions\.push\(\{ key: 'rewind'/)
  })
})

describe('「+」面板的圖示', () => {
  it('每一格的圖示槽裡有一張線條圖，stroke 走 currentColor', () => {
    const items = [
      { key: 'model', label: '模型設定' }, { key: 'persona', label: '用戶人設' }, { key: 'directives', label: '長期指令' },
      { key: 'notepad', label: '手帳' }, { key: 'new-chat', label: '存檔並開新對話' }, { key: 'conversations', label: '讀檔' },
      { key: 'background', label: '更換背景' }, { key: 'reset-chat', label: '重置聊天' }, { key: 'export', label: '匯出聊天' },
      { key: 'bottom', label: '回到最新' },
    ]
    for (const it of items) expect(hasPanelIcon(it.key), it.key).toBe(true)
    const w = mount(CanvasComposer, { props: { value: '', placeholder: '說點什麼', sendState: 'send', generating: false, moreItems: items, moreOpen: true } })
    const slots = w.findAll('.more-scope .item .item-icon')
    expect(slots.length).toBe(items.length)
    // 槽裡是 MMD 形狀的 div（背景圖），不是 inline svg：卡片統一用
    // `.item-icon div{filter:var(--icon-filter)}` 換圖示顏色，沒有 div 就一條
    // 都不命中（owner 2026-09-10 截圖）。描邊色因此是固定值，不再是 currentColor。
    for (const slot of slots) {
      const div = slot.find('div')
      expect(div.exists()).toBe(true)
      expect(div.attributes('style') || '').toContain('background-image')
    }
  })

  it('沒對到的 key 也有通用圖示，不留空框', () => {
    expect(panelIconSvg('whatever')).toMatch(/<svg[^>]*>.+<\/svg>/)
  })
})

describe('「+」面板圖示槽的尺寸壓在 layer 外', () => {
  it('uni-image 與裡面的 svg 由 canvas-theme-vars.css（layer 外）釘回槽的大小', () => {
    const vars = readFileSync(resolve(__dirname, '../../../common/canvas-theme-vars.css'), 'utf8')
    const stripped = vars.replace(/\/\*[\s\S]*?\*\//g, '')
    expect(stripped).not.toMatch(/@layer/)
    expect(stripped).toMatch(/\.more-scope \.item-icon > uni-image \{[^}]*--lt-canvas-panel-icon-image, 100%/)
    expect(stripped).toMatch(/\.more-scope \.item-icon > uni-image > div \{[^}]*width: 100%;[^}]*height: 100%;/)
  })
})

describe('選單剛開的那一小段不收點擊', () => {
  it('開啟 400ms 內點項目不發 pick，之後才發', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-09-05T00:00:00Z'))
    try {
      const w = mount(CanvasMessageMenu, { props: { open: true, actions: [{ key: 'delete', label: '刪除' }], message: { html: '' } } })
      await w.find('[data-lt-action="delete"]').trigger('click')
      expect(w.emitted('pick')).toBeUndefined()
      vi.setSystemTime(new Date('2026-09-05T00:00:01Z'))
      await w.find('[data-lt-action="delete"]').trigger('click')
      expect(w.emitted('pick')).toEqual([['delete']])
    } finally {
      vi.useRealTimers()
    }
  })
})
