import { afterEach, describe, expect, it } from 'vitest'
import { hasMessageAssets, runMessageAssets, shouldHoistMessageAssets } from '../canvas-message-assets'

// 2026-09-06 真實卡：開場白原文是純文字 + 一個標記，規則展開後才有 <script>；
// 原本只在「原文已是 HTML」那條路抬 script，於是 handleHuChoice 從未定義，選項按了沒反應。
const OPENING_RAW = '[日期=10月16日 星期5]\n天下着小雨。\n\n【开局选项】'
const OPENING_RENDERED = '<p>[日期=10月16日 星期5]</p><div class="hu-choice" onclick="handleHuChoice(this)">直面</div><script>function handleHuChoice(el){ el.dataset.active = "1" }</script>'

afterEach(() => {
  document.head.querySelectorAll('script[data-probe], style[data-probe]').forEach((n) => n.remove())
  delete (window as any).__hoisted
})

describe('shouldHoistMessageAssets', () => {
  it('看渲染結果不看原文：純文字開場白經規則展開後有 script，完成的訊息要抬', () => {
    expect(hasMessageAssets(OPENING_RAW)).toBe(false)
    expect(shouldHoistMessageAssets({ chatFinish: true }, OPENING_RENDERED)).toBe(true)
  })

  it('串流中不抬；沒有 script／style 的結果不抬', () => {
    expect(shouldHoistMessageAssets({ chatFinish: false }, OPENING_RENDERED)).toBe(false)
    expect(shouldHoistMessageAssets({ chatFinish: true }, '<p>只有文字</p>')).toBe(false)
    expect(shouldHoistMessageAssets(null, OPENING_RENDERED)).toBe(false)
  })
})

describe('runMessageAssets', () => {
  it('把訊息裡的 script 與 style 以新節點複製到 head（新建的 script 節點瀏覽器才會執行）、屬性與內容保留', () => {
    const el = document.createElement('div')
    el.innerHTML = '<script data-probe>window.__hoisted = 42</script><style data-probe>.hu{color:red}</style><b>x</b>'
    const out = runMessageAssets(el, document)
    expect(out).toEqual({ scripts: 1, styles: 1 })
    // jsdom 預設不執行動態插入的 script，這裡驗的是節點確實被複製成新節點掛到 head；執行由瀏覽器保證。
    const script = document.head.querySelector('script[data-probe]')
    expect(script?.textContent).toBe('window.__hoisted = 42')
    expect(script).not.toBe(el.querySelector('script'))
    expect(document.head.querySelector('style[data-probe]')?.textContent).toBe('.hu{color:red}')
  })

  it('容器不存在時什麼都不做', () => {
    expect(runMessageAssets(null, document)).toEqual({ scripts: 0, styles: 0 })
  })
})
