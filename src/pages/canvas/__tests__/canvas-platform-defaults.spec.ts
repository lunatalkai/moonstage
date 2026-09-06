/**
 * 非標準標籤剝除與對白上色。起點是 MMD 原站 removeSpan 的行為（2026-09-06 在它頁面上的
 * 實例實跑樣本）：<思维链>、<status> 只掉標籤、內文留下；svg 內部標籤不能被剝。
 * 白名單改成標準 HTML 全留（它沒有 hr／u／code，那是它的缺，不對齊）。
 */
import { describe, it, expect } from 'vitest'
import { stripUnknownTags, wrapDialogue } from '../canvas-platform-defaults'

describe('stripUnknownTags：非標準名字的標籤只掉標籤、內文照留', () => {
  it('中文標籤與 status 掉標籤留內文；標準元素原樣，含 MMD 白名單沒有的 u／hr／code／blockquote', () => {
    const s = '<思维链>\n思考\n</思维链><status>状态</status><u>under</u><hr><code>x</code><blockquote>q</blockquote><p class="x">段落</p><font color="#DC8333">"對白"</font>'
    expect(stripUnknownTags(s)).toBe('\n思考\n状态<u>under</u><hr><code>x</code><blockquote>q</blockquote><p class="x">段落</p><font color="#DC8333">"對白"</font>')
  })
  it('自閉合寫法與大小寫都認：<Status/> 掉，<BR/> 留', () => {
    expect(stripUnknownTags('a<Status/>b<BR/>c')).toBe('ab<BR/>c')
  })
  it('含連字號的自訂元素不碰；酒館的 custom-style 留', () => {
    expect(stripUnknownTags('<my-widget a="1">w</my-widget><custom-style>.a{}</custom-style>')).toBe('<my-widget a="1">w</my-widget><custom-style>.a{}</custom-style>')
  })
  it('svg／math 內部標籤不被剝；style／script 本體不被咬', () => {
    const svg = '<svg viewBox="0 0 1 1"><g><path d="M0 0"/></g></svg>'
    const math = '<math><mi>x</mi></math>'
    const style = '<style>.a<b{}</style>'
    const script = '<script>if(a<b){}</script>'
    expect(stripUnknownTags(svg + math + style + script)).toBe(svg + math + style + script)
  })
  it('卡片的觸發標籤在規則跑完以後才會被剝：先剝再套規則就沒了（順序的理由）', () => {
    expect(stripUnknownTags('<AC_UI>')).toBe('')
  })
})

describe('wrapDialogue：對白包成 MMD 的 <font color>', () => {
  it('引號裡的話包起來，全形／半形都認', () => {
    expect(wrapDialogue('她說"你好"，又說“再見”')).toBe('她說<font color="#DC8333">"你好"</font>，又說<font color="#DC8333">“再見”</font>')
  })
  it('markdown 轉義後的 &quot; 也認，兩句對白不會連成一句', () => {
    expect(wrapDialogue('她說&quot;你好&quot;，又說&quot;再見&quot;')).toBe(
      '她說<font color="#DC8333">&quot;你好&quot;</font>，又說<font color="#DC8333">&quot;再見&quot;</font>',
    )
  })
  it('跨行或含標籤的不包', () => {
    expect(wrapDialogue('"a\nb"')).toBe('"a\nb"')
    expect(wrapDialogue('"a<b>c"')).toBe('"a<b>c"')
  })
})
