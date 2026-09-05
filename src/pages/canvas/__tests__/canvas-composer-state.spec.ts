/**
 * 主行動鍵這一刻是什麼。
 *
 * 引擎算出來的狀態有五種，輸入區只認四種——中間那層轉換一旦漏了一種，
 * 畫面上就會出現「看起來是送出、按下去卻是別的意思」的鍵。
 */
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { resolveChatActionButtonState } from '../chat-operation-ui-state'
import CanvasComposer from '../components/canvas-composer.vue'

/** canvas.vue 裡的同一份對照。抽出來讓它可被斷言。 */
function composerStateFor(engineState: string) {
  if (engineState === 'stop' || engineState === 'compacting') return 'pending'
  if (engineState === 'continue') return 'continue'
  if (engineState === 'send-disabled') return 'send-disabled'
  return 'send'
}

describe('引擎狀態對到輸入區', () => {
  it('引擎算得出來的每一種都有對應，沒有一種會掉進「送出」', () => {
    for (const state of ['send-disabled', 'send', 'stop', 'compacting', 'continue']) {
      const mapped = composerStateFor(state)
      if (state === 'send') expect(mapped).toBe('send')
      else expect(mapped).not.toBe('send')
    }
  })

  it('沒收尾的上一輪讓主鍵變成「繼續」', () => {
    const engine = resolveChatActionButtonState({
      content: '打到一半的字',
      operations: [{ operationId: 'op-1', reasonCode: 'agent_progress_preserved' } as any],
    })
    expect(composerStateFor(engine)).not.toBe('send')
  })

  it('生成中主鍵不能按——停止有自己的節點', () => {
    expect(composerStateFor(resolveChatActionButtonState({ isStreamActive: true }))).toBe('pending')
  })
})

describe('主鍵按下去送出的是什麼意圖', () => {
  it('「繼續」狀態下按主鍵送的是繼續，不是新訊息', async () => {
    const wrapper = mount(CanvasComposer, {
      props: { value: '有字', placeholder: 'x', sendState: 'continue', generating: false },
    })
    ;(wrapper.element.querySelector('.send-msg .btn-icon') as HTMLElement).click()
    await wrapper.vm.$nextTick()
    expect(wrapper.emitted('continue')).toBeTruthy()
    expect(wrapper.emitted('send')).toBeFalsy()
  })

  it('桌機 Enter 送出、Shift+Enter 換行', async () => {
    const wrapper = mount(CanvasComposer, {
      props: { value: '有字', placeholder: 'x', sendState: 'send', generating: false, enterSends: true },
    })
    const ta = wrapper.element.querySelector('textarea.uni-textarea-textarea') as HTMLTextAreaElement
    ta.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    await wrapper.vm.$nextTick()
    expect(wrapper.emitted('send')).toHaveLength(1)

    ta.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', shiftKey: true, bubbles: true }))
    await wrapper.vm.$nextTick()
    expect(wrapper.emitted('send')).toHaveLength(1)
  })

  it('觸控裝置上 Enter 不送出——那一端只留送出鍵', async () => {
    const wrapper = mount(CanvasComposer, {
      props: { value: '有字', placeholder: 'x', sendState: 'send', generating: false, enterSends: false },
    })
    const ta = wrapper.element.querySelector('textarea.uni-textarea-textarea') as HTMLTextAreaElement
    ta.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    await wrapper.vm.$nextTick()
    expect(wrapper.emitted('send')).toBeFalsy()
  })

  it('輸入法組字中的 Enter 是選字，不是送出', async () => {
    const wrapper = mount(CanvasComposer, {
      props: { value: '有字', placeholder: 'x', sendState: 'send', generating: false },
    })
    const ta = wrapper.element.querySelector('textarea.uni-textarea-textarea') as HTMLTextAreaElement
    ta.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }))
    await wrapper.vm.$nextTick()
    ta.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    await wrapper.vm.$nextTick()
    expect(wrapper.emitted('send')).toBeFalsy()
  })

  it('生成中停止鍵是露出來的，而且不在卡片會整塊隱藏的地方', () => {
    const wrapper = mount(CanvasComposer, {
      props: { value: '', placeholder: 'x', sendState: 'pending', generating: true },
    })
    const stop = wrapper.element.querySelector('#mes_stop') as HTMLElement
    expect(stop.hasAttribute('hidden')).toBe(false)
    expect(wrapper.element.querySelector('.chat-bottom')!.contains(stop)).toBe(false)
  })
})

// 鍵盤規則只能有一份。舊頁面在輸入框上另外掛了一個「Shift+Enter 送出」的原生
// 監聽；跟輸入區元件的規則疊起來就是兩個鍵都送出，而且打不出換行。
describe('鍵盤只有一套規則', () => {
  it('頁面不再自己掛送出用的 keydown 到輸入框上', () => {
    const chat = readFileSync(resolve(__dirname, '../canvas.vue'), 'utf8')
    expect(chat).not.toMatch(/textareaEl\.addEventListener\('keydown'/)
    expect(chat).not.toContain("e.shiftKey && e.key === 'Enter'")
  })
})
