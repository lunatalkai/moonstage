/**
 * 對照 MMD 原站 chat-sandbox 的 removeAiPrompt／removeSpan（2026-09-06 在它頁面上的實例
 * 實跑樣本）：thought／Q／轉義的 thinking 連內容消失；<思维链>、<status>、<u>、<hr>
 * 只掉標籤、內文留下；svg 內部標籤不能被剝。
 */
import { describe, it, expect } from 'vitest'
import { removePromptTags, stripUnknownTags, wrapDialogue } from '../canvas-platform-defaults'

describe('removePromptTags：原站連內容一起拿掉的標籤', () => {
  it('thought／Q／REALIEZ／WF／tucao／review／mission_statement 整段消失', () => {
    const s = '前<thought>藏起來</thought>中<Q>q</Q><REALIEZ>r</REALIEZ><WF>w</WF><tucao>t</tucao><review>v</review><mission_statement>m</mission_statement>後'
    expect(removePromptTags(s)).toBe('前中後')
  })
  it('轉義過的 &lt;thinking&gt; 先還原再清；跨行也清', () => {
    expect(removePromptTags('a&lt;thinking&gt;x\ny&lt;/thinking&gt;b')).toBe('ab')
    expect(removePromptTags('a<think>\n多行\n</think>b')).toBe('ab')
  })
  it('HTML 註解、[new-user-speak]、殘留字面全部拿掉', () => {
    expect(removePromptTags('a<!-- c -->b[new-user-speak]n[/new-user-speak]c<结束无效提示>d<Format:|>e')).toBe('abcde')
  })
  it('<思维链> 不在清單裡：原樣留給下一步', () => {
    expect(removePromptTags('<思维链>x</思维链>y')).toBe('<思维链>x</思维链>y')
  })
})

describe('stripUnknownTags：白名單以外只掉標籤、內文照留', () => {
  it('中文標籤與 status／u／hr 掉標籤留內文；白名單標籤原樣', () => {
    const s = '<思维链>\n思考\n</思维链><status>状态</status><u>under</u><hr><p class="x">段落</p><font color="#DC8333">"對白"</font>'
    expect(stripUnknownTags(s)).toBe('\n思考\n状态under<p class="x">段落</p><font color="#DC8333">"對白"</font>')
  })
  it('html／head／body 標籤也掉', () => {
    expect(stripUnknownTags('<html><body class="a">x</body></html>')).toBe('x')
  })
  it('svg 內部的 path／g 不被剝；style／script 本體不被咬', () => {
    const svg = '<svg viewBox="0 0 1 1"><g><path d="M0 0"/></g></svg>'
    const style = '<style>.a<b{}</style>'
    const script = '<script>if(a<b){}</script>'
    expect(stripUnknownTags(svg + style + script)).toBe(svg + style + script)
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
