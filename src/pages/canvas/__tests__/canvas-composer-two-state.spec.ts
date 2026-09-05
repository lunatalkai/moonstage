/**
 * 輸入區的兩態，照 MMD（2026-09-04 實測某張公開卡，作者也給了同一份整理）：
 *
 *   折疊態：.uni-textarea / .chat-input-scope.has-toolbar，露 .chat-input-collapsed-row
 *   展開態：兩個節點都加 .is-expanded，露 .chat-input-toolbar + 主 .chatMsgTextarea + .chat-input-bottom-row
 *   多行：.is-multiline，與展開互相獨立
 *   切換：點 .chat-input-collapsed-display 展開並聚焦主輸入框；主輸入框失焦折疊
 *
 * 作者回報「輸入框的兩個狀態是兩個不同的類名」——卡片的 CSS 按這兩個名字寫，
 * 少一個狀態就有一半的美化落空。
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { mount } from '@vue/test-utils'
import CanvasComposer from '../components/canvas-composer.vue'

function mountComposer(value = '') {
  return mount(CanvasComposer, {
    attachTo: document.body,
    props: { value, placeholder: '說點什麼', sendState: 'send', generating: false, enterSends: true },
  })
}

function visible(el: Element | null): boolean {
  return !!el && (el as HTMLElement).style.display !== 'none'
}

afterEach(() => {
  document.body.innerHTML = ''
  vi.useRealTimers()
})

describe('輸入區兩態', () => {
  it('初始是折疊態：狀態 class 掛在 .uni-textarea 與 .chat-input-scope 兩處，只露折疊列', () => {
    const wrapper = mountComposer()
    const el = wrapper.element as HTMLElement
    const outer = el.querySelector('.send-msg > .uni-textarea')!
    const scope = el.querySelector('.chat-input-scope.has-toolbar')!
    expect(outer.classList.contains('is-expanded')).toBe(false)
    expect(scope.classList.contains('is-expanded')).toBe(false)
    expect(visible(scope.querySelector('.chat-input-collapsed-row'))).toBe(true)
    expect(visible(scope.querySelector('.chat-input-toolbar'))).toBe(false)
    expect(visible(scope.querySelector('.chatMsgTextarea'))).toBe(false)
    expect(visible(scope.querySelector('.chat-input-bottom-row'))).toBe(false)
    // 折疊態的預覽露的是 placeholder
    expect(scope.querySelector('.chat-input-collapsed-placeholder')!.textContent).toBe('說點什麼')
    wrapper.unmount()
  })

  it('點折疊預覽 → 兩個節點都加 is-expanded、主輸入框拿到焦點、露工具列與底列', async () => {
    const wrapper = mountComposer()
    const el = wrapper.element as HTMLElement
    ;(el.querySelector('.chat-input-collapsed-display') as HTMLElement).click()
    await wrapper.vm.$nextTick()
    await wrapper.vm.$nextTick()
    const outer = el.querySelector('.send-msg > .uni-textarea')!
    const scope = el.querySelector('.chat-input-scope')!
    expect(outer.classList.contains('is-expanded')).toBe(true)
    expect(scope.classList.contains('is-expanded')).toBe(true)
    expect(document.activeElement).toBe(el.querySelector('textarea.uni-textarea-textarea'))
    expect(visible(scope.querySelector('.chat-input-toolbar'))).toBe(true)
    expect(visible(scope.querySelector('.chatMsgTextarea'))).toBe(true)
    expect(visible(scope.querySelector('.chat-input-bottom-row'))).toBe(true)
    expect(visible(scope.querySelector('.chat-input-collapsed-row'))).toBe(false)
    wrapper.unmount()
  })

  it('主輸入框失焦 → 折疊回去', async () => {
    vi.useFakeTimers()
    const wrapper = mountComposer()
    const el = wrapper.element as HTMLElement
    const ta = el.querySelector('textarea.uni-textarea-textarea') as HTMLTextAreaElement
    ta.dispatchEvent(new FocusEvent('focus'))
    await wrapper.vm.$nextTick()
    expect(el.querySelector('.chat-input-scope')!.classList.contains('is-expanded')).toBe(true)
    ta.dispatchEvent(new FocusEvent('blur'))
    vi.advanceTimersByTime(200)
    await wrapper.vm.$nextTick()
    expect(el.querySelector('.chat-input-scope')!.classList.contains('is-expanded')).toBe(false)
    expect(el.querySelector('.send-msg > .uni-textarea')!.classList.contains('is-expanded')).toBe(false)
    wrapper.unmount()
  })

  it('多行是獨立的狀態：內容有換行就掛 is-multiline，不管展不展開', async () => {
    const wrapper = mountComposer('第一行\n第二行')
    const el = wrapper.element as HTMLElement
    expect(el.querySelector('.send-msg > .uni-textarea')!.classList.contains('is-multiline')).toBe(true)
    expect(el.querySelector('.chat-input-scope')!.classList.contains('is-multiline')).toBe(true)
    expect(el.querySelector('.chat-input-scope')!.classList.contains('is-expanded')).toBe(false)
    // 折疊預覽露的是內容本身
    expect(el.querySelector('.chat-input-collapsed-text')!.textContent).toBe('第一行\n第二行')
    wrapper.unmount()
  })

  it('卡片腳本抓 .send-msg .btn-icon 第一顆＝隱藏代理，點它會送出（MMD 同樣把代理藏成 0×0）', async () => {
    const wrapper = mountComposer('有字')
    const el = wrapper.element as HTMLElement
    const first = el.querySelector('.send-msg .btn-icon') as HTMLElement
    expect(first.classList.contains('chat-send-proxy')).toBe(true)
    expect(first.id).toBe('send_but')
    first.click()
    await wrapper.vm.$nextTick()
    expect(wrapper.emitted('send')).toHaveLength(1)
    wrapper.unmount()
  })

  it('折疊態與展開態各有一顆看得見的主鍵，兩顆都送出', async () => {
    const wrapper = mountComposer('有字')
    const el = wrapper.element as HTMLElement
    const buttons = el.querySelectorAll('.chat-input-scope .lt-send')
    expect(buttons.length).toBe(2)
    ;(buttons[0] as HTMLElement).click()
    ;(buttons[1] as HTMLElement).click()
    await wrapper.vm.$nextTick()
    expect(wrapper.emitted('send')).toHaveLength(2)
    wrapper.unmount()
  })

  it('清空鍵把字清掉；貼上鍵在拿不到剪貼簿時不炸', async () => {
    const wrapper = mountComposer('有字')
    const el = wrapper.element as HTMLElement
    const btns = el.querySelectorAll('.chat-input-tool-btn')
    ;(btns[1] as HTMLElement).click()
    await wrapper.vm.$nextTick()
    expect(wrapper.emitted('update:value')?.[0]).toEqual([''])
    ;(btns[0] as HTMLElement).click()
    await wrapper.vm.$nextTick()
    await new Promise((r) => setTimeout(r, 0))
    expect(wrapper.emitted('update:value')).toHaveLength(1)
    wrapper.unmount()
  })

  /*
    幫答與「＋」是這一列上的鍵，不是輸入欄位的一部分。

    作者的卡把 `.uni-textarea` 跟 `input` / `textarea` / `.input-wrapper` 寫在同一條
    規則裡漆成一個欄位——那兩顆鍵住在裡面時，會被連同欄位一起漆成白色的一部分，
    而它們自己又吃到底部工具列的顏色，看起來就是白色藥丸被咬掉一角。
  */
  it('幫答與 + 在輸入欄位外面，跟欄位並排在 .send-msg 這一列上', () => {
    const wrapper = mountComposer()
    const el = wrapper.element as HTMLElement
    const field = el.querySelector('.send-msg > .uni-textarea')
    const more = el.querySelector('.send-msg > .more-options-scope')
    const assist = el.querySelector('.send-msg > .ai-assistant')
    expect(field, '輸入欄位').toBeTruthy()
    expect(more, '＋').toBeTruthy()
    expect(assist, '幫答').toBeTruthy()
    expect(field!.contains(more!), '＋ 不該在欄位裡').toBe(false)
    expect(field!.contains(assist!), '幫答不該在欄位裡').toBe(false)
    expect(el.querySelector('.chat-input-scope')!.contains(more!)).toBe(false)
    wrapper.unmount()
  })
})
