/**
 * 橫向 rail 在桌機要拉得動（用戶 2026-09-05：「滑鼠拉不動，要用鍵盤」）。
 * 滑鼠按住拖改 scrollLeft、拖過就吃掉放開那一下 click、垂直滾輪轉橫向。
 */
import { describe, it, expect } from 'vitest'
import { attachDragScroll, DRAG_SCROLL_THRESHOLD_PX } from '../canvas-drag-scroll'

function rail(): HTMLElement {
  const el = document.createElement('div')
  Object.defineProperty(el, 'scrollWidth', { value: 1000, configurable: true })
  Object.defineProperty(el, 'clientWidth', { value: 300, configurable: true })
  let left = 0
  Object.defineProperty(el, 'scrollLeft', { get: () => left, set: (v: number) => { left = Math.max(0, Math.min(700, v)) }, configurable: true })
  document.body.appendChild(el)
  return el
}

function pointer(type: string, x: number, extra: Record<string, unknown> = {}) {
  const e = new Event(type, { bubbles: true, cancelable: true }) as any
  Object.assign(e, { pointerType: 'mouse', button: 0, clientX: x }, extra)
  return e
}

describe('滑鼠拖曳捲動', () => {
  it('按住往左拖，rail 往右捲；拖過的那次 click 被吃掉', () => {
    const el = rail()
    const chip = document.createElement('span'); el.appendChild(chip)
    let chipClicked = 0; chip.addEventListener('click', () => { chipClicked++ })
    attachDragScroll(el)
    el.dispatchEvent(pointer('pointerdown', 200))
    el.dispatchEvent(pointer('pointermove', 150))
    expect(el.scrollLeft).toBe(50)
    el.dispatchEvent(pointer('pointerup', 150))
    chip.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
    expect(chipClicked).toBe(0)
    // 沒拖（動 2px）就照常點得到
    el.dispatchEvent(pointer('pointerdown', 150))
    el.dispatchEvent(pointer('pointermove', 150 + DRAG_SCROLL_THRESHOLD_PX - 2))
    el.dispatchEvent(pointer('pointerup', 150))
    chip.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
    expect(chipClicked).toBe(1)
  })

  it('觸控指標不接手（交給原生橫滑）', () => {
    const el = rail()
    attachDragScroll(el)
    el.dispatchEvent(pointer('pointerdown', 200, { pointerType: 'touch' }))
    el.dispatchEvent(pointer('pointermove', 100, { pointerType: 'touch' }))
    expect(el.scrollLeft).toBe(0)
  })

  it('垂直滾輪轉成橫向；觸控板的橫向手勢不動它', () => {
    const el = rail()
    attachDragScroll(el)
    const wheel = (deltaX: number, deltaY: number) => { const e = new Event('wheel', { bubbles: true, cancelable: true }) as any; Object.assign(e, { deltaX, deltaY }); el.dispatchEvent(e); return e }
    const e1 = wheel(0, 120)
    expect(el.scrollLeft).toBe(120)
    expect(e1.defaultPrevented).toBe(true)
    const e2 = wheel(80, 10)
    expect(el.scrollLeft).toBe(120)
    expect(e2.defaultPrevented).toBe(false)
  })

  it('沒有橫向溢出時什麼都不做', () => {
    const el = rail()
    Object.defineProperty(el, 'scrollWidth', { value: 200, configurable: true })
    attachDragScroll(el)
    el.dispatchEvent(pointer('pointerdown', 200))
    el.dispatchEvent(pointer('pointermove', 100))
    expect(el.scrollLeft).toBe(0)
  })
})
