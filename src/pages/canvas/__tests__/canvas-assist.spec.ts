/**
 * 幫答（.ai-assistant）：AI 替玩家寫下一句，只填進輸入框、由玩家送出。
 *
 * owner 2026-09-04 採納作者建議；跟開場選項同一條規矩——畫布上所有「替玩家準備
 * 一句話」的東西都不代送。DOM 照 MMD：.ai-assistant > .tooltip(.tooltip-arrow) + 圖示 + .beta-badge。
 */
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import CanvasComposer from '../components/canvas-composer.vue'
import { shouldRegenerateAssist, assistLabelKey } from '../canvas-assist-state'

function mountComposer(extra: Record<string, unknown> = {}) {
  return mount(CanvasComposer, {
    props: { value: '', placeholder: 'x', sendState: 'send', generating: false, assistCost: 10, ...extra },
  })
}

describe('幫答鍵', () => {
  it('結構照 MMD：.ai-assistant 裡有 .tooltip + .tooltip-arrow + .beta-badge（顯示點數）', () => {
    const el = mountComposer().element as HTMLElement
    const btn = el.querySelector('.ai-assistant')!
    expect(btn).toBeTruthy()
    expect(btn.querySelector('.tooltip')).toBeTruthy()
    expect(btn.querySelector('.tooltip .tooltip-arrow')).toBeTruthy()
    expect(btn.querySelector('.beta-badge')!.textContent).toBe('10')
    // 幫答鍵不是送出鍵：卡片腳本抓 .send-msg .btn-icon 時不能抓到它
    expect(btn.classList.contains('btn-icon')).toBe(false)
  })

  it('點了送出 assist 事件；進行中再點不重複送', async () => {
    const wrapper = mountComposer()
    ;(wrapper.element.querySelector('.ai-assistant') as HTMLElement).click()
    await wrapper.vm.$nextTick()
    expect(wrapper.emitted('assist')).toHaveLength(1)
    expect(wrapper.emitted('send')).toBeFalsy()

    const busy = mountComposer({ assistBusy: true })
    ;(busy.element.querySelector('.ai-assistant') as HTMLElement).click()
    await busy.vm.$nextTick()
    expect(busy.emitted('assist')).toBeFalsy()
    expect(busy.element.querySelector('.ai-assistant')!.classList.contains('is-busy')).toBe(true)
  })

  it('頁面把回來的句子填進輸入框，不送出', () => {
    const page = readFileSync(resolve(__dirname, '../canvas.vue'), 'utf8')
    const start = page.indexOf('async function onAssist(')
    expect(start).toBeGreaterThan(-1)
    const body = page.slice(start, page.indexOf('\n}', start))
    expect(body).toContain('chatSuggestReply')
    expect(body).toContain('fillComposer(')
    // 這一輪的那句留在伺服器：不帶 regenerate 就拿回同一句（免費）；看著那句再按才換一句。
    expect(body).toContain('regenerate:')
    expect(body).toContain('shouldRegenerateAssist(')
    expect(body).not.toContain('onActionBtnClick')
    expect(body).not.toContain('sendWebSocketMessage')
    expect(body).not.toContain('chatStart(')
  })
})

// ── 這一輪的那句留著（owner 2026-09-04）────────────────────────────────
//
// 伺服器把這一輪生成過的那句留著；前端只要分辨「輸入框此刻是不是正裝著上一次幫答、
// 玩家沒改過的那句」：是＝玩家不滿意想換（regenerate:true，會再扣點），不是＝拿回
// 這一輪的那句（regenerate:false，可能免費）。
describe('幫答：換一句的判斷', () => {
  it('輸入框空、或玩家自己的字 → 不是換一句', () => {
    expect(shouldRegenerateAssist('', '')).toBe(false)
    expect(shouldRegenerateAssist('', '上一句')).toBe(false)
    expect(shouldRegenerateAssist('我自己打的', '上一句')).toBe(false)
    // 玩家改過幫答的那句（哪怕只加一個字）＝那是他的字了
    expect(shouldRegenerateAssist('上一句！', '上一句')).toBe(false)
  })

  it('輸入框裝著上一次幫答、沒改過 → 換一句（首尾空白不算改）', () => {
    expect(shouldRegenerateAssist('上一句', '上一句')).toBe(true)
    expect(shouldRegenerateAssist('  上一句\n', '上一句')).toBe(true)
  })

  it('燈泡文案跟著狀態換：平常是「幫你起個頭」，裝著幫答那句時是「換一句」', () => {
    expect(assistLabelKey('', '')).toBe('canvas.assist.tip')
    expect(assistLabelKey('我自己打的', '上一句')).toBe('canvas.assist.tip')
    expect(assistLabelKey('上一句', '上一句')).toBe('canvas.assist.another')
  })

  it('「換一句」五語 key 都在，且不是空字串', () => {
    for (const lang of ['zh-Hant', 'zh-Hans', 'en', 'ja', 'ko']) {
      const dict = JSON.parse(readFileSync(resolve(__dirname, `../../../locale/${lang}.json`), 'utf8'))
      expect(typeof dict['canvas.assist.another'], lang).toBe('string')
      expect(dict['canvas.assist.another'].trim().length, lang).toBeGreaterThan(0)
      expect(dict['canvas.assist.another'], lang).not.toBe(dict['canvas.assist.tip'])
    }
  })

  it('燈泡 aria-label / tooltip 在「換一句」狀態下顯示換一句的文案', () => {
    const wrapper = mountComposer({ labels: { stop: 'Stop', more: 'More', send: 'Send', paste: 'Paste', clear: 'Clear', model: 'Model', assist: 'Try another line', perTurn: 'Credits per turn' } })
    const btn = wrapper.element.querySelector('.ai-assistant') as HTMLElement
    expect(btn.getAttribute('aria-label')).toBe('Try another line')
    expect(btn.querySelector('.tooltip')!.textContent).toContain('Try another line')
    expect(btn.querySelector('.beta-badge')!.textContent).toBe('10')
  })
})
