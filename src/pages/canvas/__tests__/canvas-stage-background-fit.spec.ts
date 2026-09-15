/**
 * 舞台背景的裁切與選圖。
 *
 * 之前照 MMD 用 `auto 100%` + `repeat`：寬螢幕上同一張圖橫向重複三次（owner 2026-09-15
 * 截圖），不是沉浸而是穿幫。改成 cover 貼滿裁邊，創作者照「安全區」慣例（重要元素放
 * 中央 75%×75%）構圖，9:21～21:9 的螢幕都只裁到邊緣。
 *
 * 背景分直、橫兩張（橫式選填）。哪張上場由螢幕方向決定：CSS media query 選
 * `--lt-bg-landscape`，沒有橫圖就退回 `--lt-bg-portrait`。元件只寫兩個變數，
 * 不再 inline 寫 background-image，作者的卡片 CSS 蓋 `.chat-scope-box` 就不必跟
 * inline 樣式比特異性。
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { mount } from '@vue/test-utils'
import CanvasStage from '../components/canvas-stage.vue'

const css = readFileSync(resolve(__dirname, '../canvas.css'), 'utf8')
const rule = (() => {
  const i = css.indexOf('.chat-scope-box {')
  return i === -1 ? '' : css.slice(i, css.indexOf('}', i))
})()

describe('.chat-scope-box 背景裁切', () => {
  it('cover 貼滿裁邊，不再貼合高度', () => {
    expect(rule).toMatch(/background-size:\s*cover/)
    expect(rule).not.toMatch(/auto 100%/)
  })

  it('置中', () => {
    expect(rule).toMatch(/background-position:\s*center center/)
  })

  it('不重複：寬螢幕靠裁切填滿，不靠平鋪', () => {
    expect(rule).toMatch(/background-repeat:\s*no-repeat/)
  })

  it('直圖走 --lt-bg-portrait 變數', () => {
    expect(rule).toMatch(/background-image:\s*var\(--lt-bg-portrait\)/)
  })

  it('橫向螢幕改用 --lt-bg-landscape，沒有就退回直圖', () => {
    const i = css.indexOf('@media (orientation: landscape)')
    expect(i).toBeGreaterThan(-1)
    const block = css.slice(i, css.indexOf('}', css.indexOf('.chat-scope-box', i)))
    expect(block).toMatch(/background-image:\s*var\(--lt-bg-landscape,\s*var\(--lt-bg-portrait\)\)/)
  })
})

describe('CanvasStage 只寫變數', () => {
  it('兩張都給：兩個變數都寫，且不 inline 寫 background-image', () => {
    const w = mount(CanvasStage, { props: { backgroundUrl: 'https://cdn/p.jpg', backgroundLandscapeUrl: 'https://cdn/l.jpg' } })
    const style = (w.find('.chat-scope-box').element as HTMLElement).style
    expect(style.getPropertyValue('--lt-bg-portrait')).toBe('url(https://cdn/p.jpg)')
    expect(style.getPropertyValue('--lt-bg-landscape')).toBe('url(https://cdn/l.jpg)')
    expect(style.backgroundImage).toBe('')
  })

  it('只有直圖：不寫橫圖變數，讓 CSS 退回直圖', () => {
    const w = mount(CanvasStage, { props: { backgroundUrl: 'https://cdn/p.jpg' } })
    const style = (w.find('.chat-scope-box').element as HTMLElement).style
    expect(style.getPropertyValue('--lt-bg-portrait')).toBe('url(https://cdn/p.jpg)')
    expect(style.getPropertyValue('--lt-bg-landscape')).toBe('')
  })

  it('沒有背景：什麼都不寫，作者 CSS 的預設值才有效', () => {
    const w = mount(CanvasStage, { props: { backgroundUrl: '' } })
    expect((w.find('.chat-scope-box').element as HTMLElement).getAttribute('style')).toBeFalsy()
  })
})
