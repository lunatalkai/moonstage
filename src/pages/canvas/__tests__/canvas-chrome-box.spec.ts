// @vitest-environment node
import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import postcss from 'postcss'
import { render, OUTPUT, MESSAGE_LAYER } from '../../../../scripts/gen-canvas-chrome-box.mjs'

/**
 * 殼的 margin／padding 在 @layer 外要有一份副本。
 *
 * 症狀（2026-09-16，一張「精致美化」MMD 卡）：卡片開頭 `* { margin: 0; padding: 0 }`，
 * 在 MMD 只清作者自己的內容，到我們這裡把殼裡 142 條內距全清掉——快捷鍵的圖示擠到邊框上、
 * 輸入區貼邊、模型面板每一列黏死。根因：整份 canvas.css 在 @layer 裡，不分層的 `*` 永遠贏。
 */
const generated = fs.readFileSync(OUTPUT, 'utf8')

describe('canvas-chrome-box.css', () => {
  it('跟產生器的輸出一致（改了 canvas.css 的殼內距要重跑 node scripts/gen-canvas-chrome-box.mjs）', () => {
    expect(generated).toBe(render())
  })

  it('全部在 @layer 外：快捷鍵、輸入區、＋面板、彈層的內距都在，數值跟層內一樣', () => {
    const root = postcss.parse(generated)
    root.walkAtRules('layer', () => { throw new Error('副本裡不該有 @layer') })
    const find = (sel: string, prop: string) => {
      const hits: string[] = []
      root.walkRules((r) => { if (r.selectors.includes(sel)) r.walkDecls(prop, (d) => hits.push(d.value)) })
      return hits
    }
    expect(find('.shortcut-btn', 'padding')).toContain('4px 12px')
    expect(find('.shortcut-bar', 'padding')).toContain('8px 12px 0')
    expect(find('.send-msg', 'padding')).toContain('8px 12px 12px')
    expect(find('.more-scope', 'margin')).toContain('0 auto')
    expect(find('.more-scope .item', 'padding')).toContain('8px 4px')
    expect(find('.u-popup__content', 'padding')).toContain('16px')
    expect(find('.ai-assistant .beta-badge', 'padding')).toContain('0 4px')
  })

  it('訊息層不搬：作者對氣泡裡 p／img 的重置本來就該贏', () => {
    const root = postcss.parse(generated)
    root.walkRules((r) => {
      for (const s of r.selectors) expect(s, s).not.toMatch(MESSAGE_LAYER)
      for (const s of r.selectors) expect(s).not.toMatch(/\.mes_text|\.mes\b|#chat\b/)
    })
  })

  it('只搬 margin／padding，別的屬性不跟著出層', () => {
    const root = postcss.parse(generated)
    root.walkDecls((d) => { expect(d.prop, d.prop).toMatch(/^(margin|padding)/) })
  })

  it('保留 @media 包裹：手機版的內距差異照舊', () => {
    expect(generated).toMatch(/@media[^{]*\{\s*\n\s*\.send-msg \{/)
  })

  it('canvas.vue 在 canvas.css 之後載入副本（後宣告才蓋得住層內的同名規則以外的東西）', () => {
    const src = fs.readFileSync(path.resolve(__dirname, '../canvas.vue'), 'utf8')
    expect(src.indexOf("import './canvas-chrome-box.css'")).toBeGreaterThan(src.indexOf("import './canvas.css'"))
  })
})
