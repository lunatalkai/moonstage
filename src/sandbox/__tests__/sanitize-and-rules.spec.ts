// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { sanitizeAuthorHtml, stripUnknownTags } from '../sanitize'
import { stylePolicyFor } from '@/common/author-style-policy'
import { installCard, renderContent, expandMacros } from '../rules'
import { topLevelNames, wrapInlineScript } from '../author-scripts'

const opts = { macros: { user: '小明', char: '露娜' }, doc: document }

describe('淨化：跟原站同形的兩道閘', () => {
  it('中文尖括號標籤被剝殼、文字保留；反引號裡的 HTML 原樣', () => {
    expect(stripUnknownTags('<状态>體力 10</状态>')).toBe('體力 10')
    expect(stripUnknownTags('<content>正文</content>')).toBe('正文')
    expect(stripUnknownTags('看 `<状态>` 這個')).toBe('看 `<状态>` 這個')
    expect(stripUnknownTags('<b>粗</b>')).toBe('<b>粗</b>')
  })

  it('iframe／form 剝殼留子節點，script／style 整個拿掉', () => {
    const out = sanitizeAuthorHtml('<form><input class="i"></form><iframe src="x">inside</iframe><script>alert(1)</script><style>b{}</style><p>ok</p>')
    expect(out).toContain('<input class="i">')
    expect(out).not.toContain('<form')
    expect(out).not.toContain('<iframe')
    expect(out).toContain('inside')
    expect(out).not.toContain('alert(1)')
    expect(out).not.toContain('b{}')
    expect(out).toContain('<p>ok</p>')
  })

  it('作者的 data-*／aria-*／role 刪；HTML 元素上的 on* 留；svg 內的 on* 刪', () => {
    const out = sanitizeAuthorHtml('<b data-mine="1" aria-label="x" role="button" onclick="tap()" onmouseenter="h()">b</b><svg><circle onclick="c()" r="1"></circle></svg><a href="https://x.y">l</a><font color="#DC8333">q</font><del>d</del>')
    expect(out).not.toContain('data-mine')
    expect(out).not.toContain('aria-label')
    expect(out).not.toContain('role=')
    expect(out).toContain('onclick="tap()"')
    expect(out).toContain('onmouseenter="h()"')
    expect(out).not.toContain('onclick="c()"')
    expect(out).toContain('<circle r="1">')
    expect(out).toContain('href="https://x.y"')
    expect(out).toContain('<font color="#DC8333">q</font>')
    expect(out).toContain('<del>d</del>')
  })

  it('屬性值含 ]> 之類閉合串整條刪；javascript: 網址刪', () => {
    const out = sanitizeAuthorHtml('<b onclick="if(a[0]>1)x()" title="a[0] > 1">b</b><a href="javascript:alert(1)">j</a>')
    expect(out).not.toContain('onclick')
    expect(out).toContain('title="a[0] > 1"')
    expect(out).not.toContain('javascript:')
  })
})

describe('裝卡：抽 style／script', () => {
  it('不論規則有沒有命中都抽；抽走後規則照常參與替換；http 外鏈跳過、https 留', () => {
    const card = installCard([
      { id: 1, name: 'kit', find: '{{eg-kit}}', replace: '<style>.x{color:red}</style><script>function tap(){}</script><script src="http://a/b.js"></script><script src="https://a/c.js"></script>剩下' },
      { id: 2, name: 'hp', find: '/體力/', replace: '<b>HP</b>' },
      { id: 3, name: 'off', find: 'x', replace: '<style>.no{}</style>', enabled: false },
    ], stylePolicyFor('mmd'))
    expect(card.styles).toEqual(['.x{color:red}'])
    expect(card.scripts).toEqual([
      { kind: 'inline', code: 'function tap(){}', ruleName: 'kit' },
      { kind: 'external', src: 'https://a/c.js', ruleName: 'kit' },
    ])
    expect(card.rules[0].replace).toBe('剩下')
    expect(card.rules[1].replace).toBe('<b>HP</b>')
    expect(card.rules[2].replace).toBe('<style>.no{}</style>')
  })
})

describe('裝卡：樣式依格式政策落地', () => {
  // 一張酒館卡的正文美化規則把 `body{display:flex;justify-content:center}` 與
  // `body::before{position:fixed;…}` 寫在 <style> 裡；在原平台這些是死規則（逐字前綴），
  // 我們的殼曾把它原樣裝進 iframe，整個聊天頁變成一條窄柱、外圈一環漸層。
  const rules = [{ id: 1, name: 'beautify', find: '/x/', replace: '<style>body{display:flex}body::before{position:fixed;inset:0}.letter{color:red}</style>' }]
  it('酒館格式：逐字接訊息層前綴，body 類規則跟原平台一樣不會碰到頁面', () => {
    const card = installCard(rules, stylePolicyFor('tavern'))
    expect(card.styles).toEqual(['.mes_text body{display:flex}.mes_text body::before{position:fixed;inset:0}.mes_text .letter{color:red}'])
  })
  it('MMD 格式：原樣——作者就是靠它換整頁', () => {
    expect(installCard(rules, stylePolicyFor('mmd')).styles).toEqual(['body{display:flex}body::before{position:fixed;inset:0}.letter{color:red}'])
  })
  it('沒宣告格式當 MMD', () => {
    expect(installCard(rules, stylePolicyFor(undefined)).styles[0]).toMatch(/^body\{/)
  })
})

describe('渲染管線', () => {
  it('巨集 → 規則 → Markdown（*x* 斜體、四空格不當程式碼塊）→ 引號上色 → 淨化', () => {
    const rules = [{ id: 1, find: '/體力/', replace: '<b class="hp">HP</b>' }]
    const html = renderContent('{{char}}對{{user}}說：“你好”\n    縮排四格\n*斜*體力<状态>x</状态>', rules, opts)
    expect(html).toContain('露娜對小明說')
    expect(html).toContain('<font color="#DC8333">“你好”</font>')
    expect(html).not.toContain('<pre')
    expect(html).toContain('縮排四格')
    expect(html).toContain('<em>斜</em>')
    expect(html).toContain('<b class="hp">HP</b>')
    expect(html).not.toContain('<状态>')
    // 剝殼發生在 markdown 之前：不是被跳脫成文字印出來，而是真的只剩內容
    expect(html).not.toContain('&lt;状态')
    expect(html).toContain('</b>x</p>')
  })

  it('裸字面量與 /…/ 都生效；引號在標籤屬性裡不上色', () => {
    const html = renderContent('靈力 體力 <a title="“q”">x</a>', [{ id: 1, find: '體力', replace: 'A' }, { id: 2, find: '/靈力/', replace: 'B' }], opts)
    expect(html).toContain('B A')
    expect(html).toContain('title="“q”"')
    expect(html).not.toContain('<font color="#DC8333">“q”</font>')
  })

  it('expandMacros 大小寫與空白都認', () => {
    expect(expandMacros('{{ User }}/{{CHAR}}', opts.macros)).toBe('小明/露娜')
  })
})

describe('作者腳本：頂層宣告回掛 window、非嚴格、this===window', () => {
  it('topLevelNames 只認最淺縮排的行', () => {
    const code = `  const store = {};\n  class Counter {}\n  function tap() {\n    const inner = 1;\n  }\n  let n = 0;\n  async function go() {}`
    expect(topLevelNames(code)).toEqual(['store', 'Counter', 'tap', 'n', 'go'])
  })

  it('wrap 後 const／class 從 onclick 找得到，且腳本頂層 this 是 window', () => {
    const code = `const store = { n: 1 };\nclass Counter {}\nfunction tap() { return store.n; }\nvar topThis = this;`
    ;(0, eval)(wrapInlineScript(code))
    const w = window as unknown as Record<string, unknown>
    expect(typeof w.tap).toBe('function')
    expect(typeof w.Counter).toBe('function')
    expect((w.store as { n: number }).n).toBe(1)
    expect(w.topThis).toBe(window)
    expect((w.tap as () => number)()).toBe(1)
  })
})
