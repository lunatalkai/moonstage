import { describe, it, expect } from 'vitest'
import { needsKaiFallback, aliasFontCss, resolveImports, KAI_ALIASES, fontModeCss } from '../canvas-font-fallback'

describe('楷體備援', () => {
  it('只在卡片提到楷體時才需要', () => {
    expect(needsKaiFallback('font-family:"Kaiti","STKaiti",serif')).toBe(true)
    expect(needsKaiFallback('font-family: 楷体')).toBe(true)
    expect(needsKaiFallback('font-family: "PingFang SC", sans-serif')).toBe(false)
    expect(needsKaiFallback('')).toBe(false)
  })

  it('@import 相對路徑補成 CDN 絕對路徑', () => {
    const list = resolveImports("@import url('./a.css');\n@import url(\"./b.css\");", 'https://cdn/x@1/')
    expect(list.map((p) => p.url)).toEqual(['https://cdn/x@1/a.css', 'https://cdn/x@1/b.css'])
    expect(list[0].base).toBe('https://cdn/x@1/')
  })

  it('同一份 @font-face 用每個別名各註冊一次，字型檔 url 補成絕對', () => {
    const css = "@font-face{font-family:'LXGW WenKai Screen';src:url('./files/s-1.woff2') format('woff2');unicode-range:U+4E00-4EFF;}"
    const out = aliasFontCss(css, 'https://cdn/x@1/', ['Kaiti', '楷体'])
    expect(out).toContain("font-family: 'Kaiti';")
    expect(out).toContain("font-family: '楷体';")
    expect(out).toContain("url('https://cdn/x@1/files/s-1.woff2')")
    expect(out).not.toContain("'LXGW WenKai Screen'")
    expect((out.match(/@font-face/g) || []).length).toBe(2)
  })

  it('不是這個字型的 CSS 回空字串，別名清單含卡片常用的幾種寫法', () => {
    expect(aliasFontCss('@font-face{font-family:"Other";src:url(a.woff2)}', 'https://cdn/', ['Kaiti'])).toBe('')
    expect(KAI_ALIASES).toContain('STKaiti')
    expect(KAI_ALIASES).toContain('楷体')
  })
})

describe('玩家字體模式', () => {
  it('文楷與系統各有一段帶 !important 的覆蓋，跟隨卡片是空的', () => {
    expect(fontModeCss('wenkai')).toContain("'LXGW WenKai Screen'")
    expect(fontModeCss('wenkai')).toContain('!important')
    expect(fontModeCss('wenkai')).toContain('#app .canvas-root')
    expect(fontModeCss('system')).toContain('system-ui')
    expect(fontModeCss('card')).toBe('')
  })
})
