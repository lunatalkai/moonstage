import { describe, expect, it, beforeEach } from 'vitest'
// @ts-ignore - plain JS module without bundled declarations
import { readHcColorAttr, getHcColor } from '../html-card-components.js'
import '../html-card-components.js' // 註冊 hc-btn/hc-tag/hc-bar/hc-stat 等 custom elements

// 施工單：HC 組件三真 bug 修復 · 修 2 — color / txt-color 別名互通
// 社群實測：hc-btn/hc-tag 只認 txt-color、hc-stat/hc-form/hc-bar 只認 color，
// 寫錯屬性名靜默不生效；官方 HTML.txt 示例本身寫了 `hc-tag color="#000"`，
// 依修復前代碼是無效寫法。desktop 的 jsdom（vitest 環境）支援真正的
// customElements，因此本檔直接註冊 + 實例化組件、讀取 shadowRoot 內文字，
// 驗證的是真實渲染路徑，不只是原始碼字串比對。

function shadowStyleText(el: Element): string {
  const style = (el as any).shadowRoot.querySelector('style')
  return style ? (style.textContent as string) : ''
}

describe('readHcColorAttr / getHcColor — 同義顏色屬性互通（純函式）', () => {
  function makeEl(attrs: Record<string, string>) {
    const el = document.createElement('div')
    Object.entries(attrs).forEach(([k, v]) => el.setAttribute(k, v))
    document.body.appendChild(el)
    return el
  }

  it('只設別名屬性（color）對 native=txt-color 的組件也生效', () => {
    const el = makeEl({ color: '#000' })
    expect(readHcColorAttr(el, 'txt-color')).toBe('#000')
  })

  it('兩者都設定時 native 屬性優先', () => {
    const el = makeEl({ 'txt-color': '#111', color: '#222' })
    expect(readHcColorAttr(el, 'txt-color')).toBe('#111')
  })

  it('getHcColor 相容 txt-color 別名（hc-stat/hc-form 原生走 color）', () => {
    const el = makeEl({ 'txt-color': '#ff6b9d' })
    expect(getHcColor(el, '#fff')).toBe('#ff6b9d')
  })
})

describe('hc-tag 實際渲染：color 屬性生效（官方 HTML.txt 示例 <hc-tag color="#000"> 的無效寫法修復）', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
  })

  it('只設 color（未設 txt-color）時，shadow DOM 內文字色採用 color 值', () => {
    document.body.innerHTML = '<hc-tag bg="#00d4ff" color="#000">新手</hc-tag>'
    const el = document.querySelector('hc-tag') as HTMLElement
    const css = shadowStyleText(el)
    expect(css).toContain('color: #000;')
  })

  it('只設 txt-color（原生寫法）維持原本行為不變', () => {
    document.body.innerHTML = '<hc-tag bg="#00d4ff" txt-color="#111">VIP</hc-tag>'
    const el = document.querySelector('hc-tag') as HTMLElement
    const css = shadowStyleText(el)
    expect(css).toContain('color: #111;')
  })

  it('兩者都設定時 txt-color（原生）優先於 color（別名）', () => {
    document.body.innerHTML = '<hc-tag bg="#00d4ff" color="#222" txt-color="#333">雙設</hc-tag>'
    const el = document.querySelector('hc-tag') as HTMLElement
    const css = shadowStyleText(el)
    expect(css).toContain('color: #333;')
  })
})

describe('hc-btn 實際渲染：color 別名生效', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
  })

  it('只設 color（未設 txt-color）時按鈕文字色採用 color 值', () => {
    document.body.innerHTML = '<hc-btn send="go" color="#000">出發</hc-btn>'
    const el = document.querySelector('hc-btn') as HTMLElement
    const css = shadowStyleText(el)
    expect(css).toContain('color: #000;')
  })

  it('w="auto" 把 inline-block/auto 寫在 host inline style', () => {
    document.body.innerHTML = '<hc-btn w="auto">短按鈕</hc-btn>'
    const el = document.querySelector('hc-btn') as HTMLElement

    expect(el.style.display).toBe('inline-block')
    expect(el.style.width).toBe('auto')
  })

  it('未填 w 仍把 block/100% 寫在 host inline style', () => {
    document.body.innerHTML = '<hc-btn>滿版按鈕</hc-btn>'
    const el = document.querySelector('hc-btn') as HTMLElement

    expect(el.style.display).toBe('block')
    expect(el.style.width).toBe('100%')
  })

  it('hc-f 內的 w="auto" 仍維持自適應寬度', () => {
    document.body.innerHTML = '<div class="hc-f"><hc-btn w="auto">短按鈕</hc-btn></div>'
    const el = document.querySelector('hc-btn') as HTMLElement

    expect(el.parentElement?.classList.contains('hc-f')).toBe(true)
    expect(el.style.display).toBe('inline-block')
    expect(el.style.width).toBe('auto')
  })
})

describe('hc-tabs 首次連接', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
  })

  it('custom elements lifecycle 完成後立即顯示第一個 tab 內容', () => {
    document.body.innerHTML = `
      <hc-tabs>
        <hc-tab title="屬性">屬性內容</hc-tab>
        <hc-tab title="背包">背包內容</hc-tab>
      </hc-tabs>
    `

    const tabs = document.querySelectorAll('hc-tab') as NodeListOf<HTMLElement>
    expect(tabs[0].style.display).toBe('block')
    expect(tabs[1].style.display).toBe('none')
  })
})

describe('hc-bar 實際渲染：txt-color 別名也能設定進度條填色', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
  })

  it('只設 txt-color（未設 color）時進度條填色採用 txt-color 值', () => {
    document.body.innerHTML = '<hc-bar value="60" txt-color="#0f0"></hc-bar>'
    const el = document.querySelector('hc-bar') as HTMLElement
    const css = shadowStyleText(el)
    expect(css).toContain('background: #0f0;')
  })
})

describe('hc-stat 實際渲染：txt-color 別名也能設定文字色（原本完全無視 txt-color）', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
  })

  it('只設 txt-color（未設 color）時 label/value 文字色採用 txt-color 值', () => {
    document.body.innerHTML = '<hc-stat label="好感度" value="85" txt-color="#ff6b9d"></hc-stat>'
    const el = document.querySelector('hc-stat') as HTMLElement
    const css = shadowStyleText(el)
    expect(css).toContain('color: #ff6b9d;')
  })
})
