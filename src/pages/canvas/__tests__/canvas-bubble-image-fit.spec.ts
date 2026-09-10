import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import postcss, { type Rule } from 'postcss'

/**
 * 氣泡裡的圖片要跟著氣泡寬走。
 *
 * 這條規則原本只寫在 @layer lt-base 裡；宿主任何一條沒分層的 `img { max-width: none }`
 * 都會贏過分層的規則（層外永遠壓過層內），對話裡插的圖就以原始尺寸畫出來、把氣泡撐爆
 * （2026-09-11 社群站用戶截圖）。所以它必須寫在層外、特異性要壓過宿主慣用的
 * `body:has(.x) img`（0,1,2），宿主的重置不管往哪個方向都改不動它。
 */
describe('氣泡圖片貼合氣泡寬', () => {
  const css = fs.readFileSync(path.resolve(__dirname, '../canvas.css'), 'utf8')
  const root = postcss.parse(css)

  function findRule(selector: string): Rule | undefined {
    let found: Rule | undefined
    root.walkRules((rule) => {
      if (rule.selectors.includes(selector)) found = rule
    })
    return found
  }

  it('規則寫在任何 @layer 之外，特異性至少是兩個 class 加一個標籤', () => {
    const rule = findRule('.canvas-root .mes_text img')
    expect(rule, '要有 .canvas-root .mes_text img 這條').toBeDefined()
    let inLayer = false
    let p = rule!.parent
    while (p) {
      if (p.type === 'atrule' && (p as any).name === 'layer') inLayer = true
      p = p.parent as any
    }
    expect(inLayer).toBe(false)
  })

  it('寬度跟著容器、高度自動，不會被寫死的 height 屬性拉變形', () => {
    const rule = findRule('.canvas-root .mes_text img')!
    const decls: Record<string, string> = {}
    rule.walkDecls((d) => { decls[d.prop] = d.value })
    expect(decls['max-width']).toBe('100%')
    expect(decls['height']).toBe('auto')
  })
})
