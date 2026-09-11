import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import postcss, { type Rule } from 'postcss'

/**
 * 氣泡裡的段落間距與對話欄寬度，由舞台自己定，宿主的重置改不動。
 *
 * 2026-09-11 社群站用戶拿同一張卡在 MMD 上的截圖對比：
 *   - 段落之間 MMD 有一行空白（\n\n 是段落、\n 只換行），我們這裡所有行都黏在一起——
 *     舞台從沒替氣泡的 <p> 定過間距，靠瀏覽器預設；社群站的 `h1, h2, h3, p, dl, dd { margin: 0 }`
 *     一來就把它歸零。跟氣泡圖片那條一樣：寫在層外、特異性壓過宿主的元素選擇器。
 *   - MMD 的氣泡在桌機上是滿版，作者的狀態面板照 `min(86.4vw, 1505px)` 這種尺寸設計；
 *     我們的對話欄封頂 1200px，面板被壓進去，格子變窄、字被截成「高…」。owner：照 MMD 的版面。
 */
describe('氣泡段落間距', () => {
  const css = fs.readFileSync(path.resolve(__dirname, '../canvas.css'), 'utf8')
  const root = postcss.parse(css)
  const find = (selector: string) => {
    let found: Rule | undefined
    root.walkRules((rule) => { if (rule.selectors.includes(selector)) found = rule })
    return found
  }
  const inLayer = (rule: Rule) => {
    let p = rule.parent
    while (p) { if (p.type === 'atrule' && (p as any).name === 'layer') return true; p = p.parent as any }
    return false
  }

  it('段落之間留一行：規則在 @layer 之外，margin 1em 0', () => {
    const rule = find('.canvas-root .mes_text p')
    expect(rule, '要有 .canvas-root .mes_text p').toBeDefined()
    expect(inLayer(rule!)).toBe(false)
    const decls: Record<string, string> = {}
    rule!.walkDecls((d) => { decls[d.prop] = d.value })
    expect(decls.margin).toBe('1em 0')
  })

  it('氣泡最前最後一段不多留白', () => {
    const first = find('.canvas-root .mes_text p:first-child')
    const last = find('.canvas-root .mes_text p:last-child')
    expect(first).toBeDefined()
    expect(last).toBeDefined()
    const d1: Record<string, string> = {}; first!.walkDecls((d) => { d1[d.prop] = d.value })
    const d2: Record<string, string> = {}; last!.walkDecls((d) => { d2[d.prop] = d.value })
    expect(d1['margin-top']).toBe('0')
    expect(d2['margin-bottom']).toBe('0')
  })
})

describe('對話欄寬度照 MMD：桌機不封頂', () => {
  it('--lt-canvas-column-width 只留兩側邊距，沒有 1200px 上限', () => {
    const vars = fs.readFileSync(path.resolve(__dirname, '../../../common/canvas-theme-vars.css'), 'utf8')
    const m = vars.match(/--lt-canvas-column-width:\s*([^;]+);/)
    expect(m, '變數要在').not.toBeNull()
    expect(m![1]).not.toMatch(/1200px/)
    expect(m![1]).toMatch(/calc\(100vw - 48px\)/)
  })
})
