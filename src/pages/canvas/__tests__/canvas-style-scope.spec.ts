/**
 * 卡片 <style> 的作用域。
 *
 * 酒館幫作者加了訊息層前綴，所以酒館卡裡寫 `p{}`、`.title{}` 是安全的。
 * 這裡沒有沙盒，同一張卡搬過來會整頁生效——「零改動全相容」在這個方向上會壞成
 * 「卡片把頁面弄壞了」。MMD 卡剛好相反：它就是靠無前綴的 <style> 換掉整個頁面。
 */
import { describe, it, expect } from 'vitest'
import { scopeCss, scopeCardHtml, normalizeCardSource, MESSAGE_SCOPE } from '../canvas-style-scope'

describe('來源判定', () => {
  it('沒宣告來源時當 MMD——目前匯進來的都是那一邊的，猜錯的代價也不對稱', () => {
    expect(normalizeCardSource(undefined)).toBe('mmd')
    expect(normalizeCardSource('')).toBe('mmd')
    expect(normalizeCardSource('mmd')).toBe('mmd')
  })

  it('酒館的幾種寫法都認得', () => {
    expect(normalizeCardSource('tavern')).toBe('tavern')
    expect(normalizeCardSource('SillyTavern')).toBe('tavern')
    expect(normalizeCardSource(' ST ')).toBe('tavern')
  })
})

describe('加作用域', () => {
  it('裸標籤選擇器被關進訊息層', () => {
    expect(scopeCss('p{color:red}', MESSAGE_SCOPE)).toBe('.mes_text p{color:red}')
  })

  it('逗號分隔的每一條都要加', () => {
    expect(scopeCss('p, .title{color:red}', MESSAGE_SCOPE)).toBe('.mes_text p, .mes_text .title{color:red}')
  })

  it('作者寫 body / :root 是想改整則訊息的字，對映到訊息層而不是丟掉', () => {
    expect(scopeCss('body{font-size:14px}', MESSAGE_SCOPE)).toBe('.mes_text{font-size:14px}')
    expect(scopeCss(':root.dark{color:#fff}', MESSAGE_SCOPE)).toBe('.mes_text.dark{color:#fff}')
  })

  it('@media 要進去處理內層，@keyframes 的內容不是選擇器不能碰', () => {
    expect(scopeCss('@media (max-width:768px){p{margin:0}}', MESSAGE_SCOPE))
      .toBe('@media (max-width:768px){.mes_text p{margin:0}}')
    expect(scopeCss('@keyframes spin{from{opacity:0}to{opacity:1}}', MESSAGE_SCOPE))
      .toBe('@keyframes spin{from{opacity:0}to{opacity:1}}')
  })

  it('已經在作用域裡的不重複加', () => {
    expect(scopeCss('.mes_text p{color:red}', MESSAGE_SCOPE)).toBe('.mes_text p{color:red}')
  })

  it('不改寫 !important、@media 與 z-index——卡片幾乎每條都寫 !important', () => {
    const css = '.panel{z-index:2147483647!important;color:red!important}'
    expect(scopeCss(css, MESSAGE_SCOPE)).toBe('.mes_text .panel{z-index:2147483647!important;color:red!important}')
  })
})

describe('整段訊息 HTML', () => {
  const html = '<div class="panel">x</div><style>p{color:red}</style>'

  it('MMD 來源原樣過——那邊的作者就是靠無前綴的 <style> 換掉整個頁面', () => {
    expect(scopeCardHtml(html, 'mmd')).toBe(html)
  })

  it('酒館來源加上訊息層前綴', () => {
    expect(scopeCardHtml(html, 'tavern'))
      .toBe('<div class="panel">x</div><style>.mes_text p{color:red}</style>')
  })

  it('沒有 <style> 的內容連掃都不用掃', () => {
    expect(scopeCardHtml('<p>hi</p>', 'tavern')).toBe('<p>hi</p>')
  })

  it('多個 <style> 都處理，屬性保留', () => {
    const out = scopeCardHtml('<style data-x="1">a{}</style><style>b{}</style>', 'tavern')
    expect(out).toBe('<style data-x="1">.mes_text a{}</style><style>.mes_text b{}</style>')
  })
})
