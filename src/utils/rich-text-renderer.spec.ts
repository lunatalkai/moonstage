import { describe, expect, test } from 'vitest'
// @ts-ignore - plain JS module without bundled declarations
import { renderRichText, isHeavyHtml, unwrapSingleHtmlFence } from './rich-text-renderer.js'

// 部分模型習慣把整張 HTML 卡包在 ```html 圍欄裡輸出，
// isHeavyHtml 原本只認「開頭是 <」，整段包圍欄時走 MD 路徑、tag 被 escape 直出成原始碼。
// 修法：整段 trim 後若剛好是「單一個 code fence」（``` 或 ~~~，lang 可為 html/xml/空），
// 且圍欄內文字以 < 開頭並命中既有 HEAVY_HTML_TAGS / CUSTOM_HC_TAGS → 解包後走 heavy path。
// 嚴格限定「整條訊息 = 單一圍欄，前後無其他有意義文字」，散文夾示範 fence 的既有保護不退。
// (mobile/tests/chat/rich-text-renderer.spec.js 同步案例 · 兩端同構修法)
describe('圍欄整段解包（AI 常見 fence-wrapped HTML 卡）', () => {
  test('① 整段 ```html 圍欄含 hc-* 卡片 → isHeavyHtml 判定為 true', () => {
    const wrapped = '```html\n<div class="hc-c hc-bg-green"><p class="hc-h1">卡片</p></div>\n```'
    expect(isHeavyHtml(wrapped)).toBe(true)
  })

  test('① renderRichText 解包渲染成卡片，不殘留圍欄標記、不被 MD escape', () => {
    const wrapped = '```html\n<div class="hc-c hc-bg-green"><p class="hc-h1">🎖️ 標題</p></div>\n```'
    const out = renderRichText(wrapped)
    expect(out).toContain('<div class="hc-c hc-bg-green">')
    expect(out).toContain('<p class="hc-h1">')
    expect(out).not.toContain('```')
    expect(out).not.toMatch(/<pre[\s>]/)
    expect(out).not.toContain('&lt;div')
  })

  test('① 圍欄無 lang（純 ```）包 <hc-*> 元件也解包', () => {
    const wrapped = '```\n<hc-btn send="hi">按鈕</hc-btn>\n```'
    expect(isHeavyHtml(wrapped)).toBe(true)
    const out = renderRichText(wrapped)
    expect(out).toContain('<hc-btn')
    expect(out).not.toContain('```')
  })

  test('① 圍欄 lang=xml 包 HTML 卡也解包', () => {
    const wrapped = '```xml\n<div class="hc-c">內容</div>\n```'
    expect(isHeavyHtml(wrapped)).toBe(true)
  })

  test('① 圍欄前後有多餘空白／換行仍視為整段圍欄', () => {
    const wrapped = '\n\n  ```html\n<div class="hc-c">內容</div>\n```\n\n  '
    expect(isHeavyHtml(wrapped)).toBe(true)
  })

  test('② 保護不退：散文 + 內嵌示範 fence（非整段圍欄）仍走 MD，tag 被 escape', () => {
    const mixed = '這是範例：\n\n```html\n<div class="hc-c">示範</div>\n```\n\n請參考上面格式。'
    expect(isHeavyHtml(mixed)).toBe(false)
    const out = renderRichText(mixed)
    expect(out).toContain('&lt;div')
    expect(out).not.toContain('<div class="hc-c">')
  })

  test('② 保護不退：圍欄後面還有文字也視為非整段圍欄', () => {
    const mixed = '```html\n<div class="hc-c">內容</div>\n```\n還有後話'
    expect(isHeavyHtml(mixed)).toBe(false)
  })

  test('③ 純 < 開頭無圍欄的舊行為不變', () => {
    const raw = '<div class="hc-c"><p>卡片</p></div>'
    expect(isHeavyHtml(raw)).toBe(true)
    const out = renderRichText(raw)
    expect(out).toContain('<div class="hc-c">')
  })

  test('④ 整段圍欄但內容非 HTML（```js）→ 仍走 MD，不誤判 heavy', () => {
    const wrapped = '```js\nconsole.log("hi")\n```'
    expect(isHeavyHtml(wrapped)).toBe(false)
    const out = renderRichText(wrapped)
    expect(out).toMatch(/<pre[\s\S]*<code/)
    expect(out).toContain('console.log')
  })

  test('④ 整段圍欄但內容是純文字（無 lang）→ 仍走 MD，不誤判 heavy', () => {
    const wrapped = '```\n純文字說明，不是 HTML\n```'
    expect(isHeavyHtml(wrapped)).toBe(false)
  })

  test('unwrapSingleHtmlFence：非圍欄內容原樣通過', () => {
    expect(unwrapSingleHtmlFence('純文字')).toBe('純文字')
    expect(unwrapSingleHtmlFence('<div>x</div>')).toBe('<div>x</div>')
    expect(unwrapSingleHtmlFence('')).toBe('')
    expect(unwrapSingleHtmlFence(null)).toBe(null)
  })

  test('unwrapSingleHtmlFence：整段圍欄 HTML 卡回傳解包後的內容', () => {
    const wrapped = '```html\n<div class="hc-c">內容</div>\n```'
    expect(unwrapSingleHtmlFence(wrapped)).toBe('<div class="hc-c">內容</div>')
  })
})
