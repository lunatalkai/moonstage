/**
 * 殼的底色亮就用深字、暗就用淺字。
 *
 * owner 2026-09-12：作者的日間主題把頂欄與「用戶人設」彈層漆成米白，站台深色主題下
 * 返回鍵、模型 chip、欄位標題全是白字白底，什麼都看不見。
 */
import { describe, it, expect } from 'vitest'
import {
  blendOver,
  effectiveBackground,
  parseComputedColor,
  syncChromeTone,
  toneForBackground,
} from '../canvas-chrome-tone'

describe('顏色解析與混色', () => {
  it('認得 Chrome 對 color-mix 回的 color(srgb …) 與一般的 rgb／rgba', () => {
    expect(parseComputedColor('color(srgb 0.94902 0.94902 0.960784 / 0.07)')).toEqual({ r: 242, g: 242, b: 245, a: 0.07 })
    expect(parseComputedColor('rgb(248, 245, 240)')).toEqual({ r: 248, g: 245, b: 240, a: 1 })
    expect(parseComputedColor('rgba(0, 0, 0, 0)')).toEqual({ r: 0, g: 0, b: 0, a: 0 })
    expect(parseComputedColor('transparent')?.a).toBe(0)
    expect(parseComputedColor('garbage')).toBeNull()
  })
  it('半透明疊在底色上照 alpha 混', () => {
    const over = blendOver({ r: 255, g: 255, b: 255, a: 0.5 }, { r: 0, g: 0, b: 0, a: 1 })
    expect(over).toEqual({ r: 128, g: 128, b: 128, a: 1 })
  })
  it('米白是亮底、近黑是暗底', () => {
    expect(toneForBackground({ r: 248, g: 245, b: 240, a: 1 })).toBe('light')
    expect(toneForBackground({ r: 14, g: 14, b: 14, a: 1 })).toBe('dark')
    // 舞台預設頂欄：深色 78% 疊在深色頁面上 → 暗
    expect(toneForBackground(blendOver({ r: 16, g: 16, b: 19, a: 0.78 }, { r: 15, g: 18, b: 23, a: 1 }))).toBe('dark')
  })
})

describe('量實際看到的底色並標在節點上', () => {
  const mount = (html: string) => { document.body.innerHTML = html; return document.body }
  it('作者把頂欄漆成米白（!important）→ light；彈層漆成近黑 → dark', () => {
    mount(`
      <div class="ms-stage" style="background: rgb(16, 16, 19)">
        <div class="topTabbar" style="background-color: rgb(248, 245, 240)"></div>
        <div class="u-popup__content" style="background-color: rgb(14, 14, 14)"></div>
      </div>`)
    syncChromeTone(document)
    expect(document.querySelector('.topTabbar')!.getAttribute('data-lt-tone')).toBe('light')
    expect(document.querySelector('.u-popup__content')!.getAttribute('data-lt-tone')).toBe('dark')
  })
  it('殼自己透明時看祖先：淺色頁面上的透明頂欄是亮底', () => {
    mount(`<div style="background: rgb(250, 250, 250)"><div class="topTabbar" style="background: rgba(0, 0, 0, 0)"></div></div>`)
    syncChromeTone(document)
    expect(document.querySelector('.topTabbar')!.getAttribute('data-lt-tone')).toBe('light')
  })
  it('半透明的殼疊在深色頁面上仍是暗底；什麼底都量不到時當作舞台的深色預設', () => {
    mount(`<div style="background: rgb(15, 18, 23)"><div class="topTabbar" style="background: rgba(255, 255, 255, 0.08)"></div></div><div class="u-popup__content"></div>`)
    syncChromeTone(document)
    expect(document.querySelector('.topTabbar')!.getAttribute('data-lt-tone')).toBe('dark')
    expect(effectiveBackground(document.querySelector('.u-popup__content')!)).toEqual({ r: 15, g: 18, b: 23, a: 1 })
    expect(document.querySelector('.u-popup__content')!.getAttribute('data-lt-tone')).toBe('dark')
  })
  it('切換後重量會改標記', () => {
    const body = mount(`<div class="topTabbar" style="background-color: rgb(14, 14, 14)"></div>`)
    syncChromeTone(document)
    expect(body.querySelector('.topTabbar')!.getAttribute('data-lt-tone')).toBe('dark')
    ;(body.querySelector('.topTabbar') as HTMLElement).style.backgroundColor = 'rgb(248, 245, 240)'
    syncChromeTone(document)
    expect(body.querySelector('.topTabbar')!.getAttribute('data-lt-tone')).toBe('light')
  })
})
