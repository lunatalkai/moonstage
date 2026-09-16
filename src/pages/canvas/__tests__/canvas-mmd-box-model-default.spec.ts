// @vitest-environment jsdom
/**
 * MMD 內容的 content-box 只是「預設」，不是「規定」。
 *
 * 2026-09-16 玩家截圖：一張 MMD 卡的衣櫥面板在原站一列兩顆按鈕、到我們這裡一列一顆。
 * 作者給按鈕寫了 `flex: 0 0 calc(50% - 3px)` 加 `box-sizing: border-box`，我們還原 MMD
 * 預設的那條規則特異性 (0,2,0) 把作者的 (0,1,0) 壓掉，padding 加上去兩顆就擠不進一列。
 * 原站沒有任何 box-sizing 重置，作者寫什麼就是什麼——所以我們這條必須是零特異性：
 * 贏宿主的 `*{border-box}`（靠排在它後面），輸給作者任何一條宣告（靠排在作者前面）。
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const css = readFileSync(resolve(__dirname, '../canvas.css'), 'utf8')

function ruleFor(selectorPart: string): { selector: string; body: string } {
  const idx = css.indexOf(selectorPart)
  expect(idx).toBeGreaterThan(-1)
  const open = css.indexOf('{', idx)
  const close = css.indexOf('}', open)
  const selectorStart = css.lastIndexOf('*/', idx)
  return { selector: css.slice(selectorStart + 2, open).trim(), body: css.slice(open + 1, close).trim() }
}

describe('MMD 內容的 content-box 還原是零特異性的預設', () => {
  const rule = ruleFor('data-stage-author-format="mmd"]) *')

  it('兩個範圍都用 :where 包住，選擇器本身只剩 `*`', () => {
    const selectors = rule.selector.split(',').map((s) => s.trim())
    expect(selectors).toEqual([
      ':where([data-stage-author-layer][data-stage-author-format="mmd"]) *',
      ':where(.canvas-root.lt-format-mmd .lt-bubble-body) *',
    ])
    expect(rule.body).toMatch(/box-sizing:\s*content-box;/)
    expect(rule.body).not.toMatch(/!important/)
  })

  it('作者的 `.btn{box-sizing:border-box}` 與整卡 `*{}` 都贏過它；宿主排在前面的 `*{border-box}` 輸給它', () => {
    document.head.innerHTML = ''
    document.body.innerHTML = ''
    const host = document.createElement('style')
    host.textContent = '*, *::before, *::after { box-sizing: border-box; }'
    const ours = document.createElement('style')
    ours.textContent = `${rule.selector} { ${rule.body} }`
    const author = document.createElement('style')
    author.textContent = '.xiai-role-btn { box-sizing: border-box; } .reset-card * { box-sizing: border-box; }'
    document.head.append(host, ours, author)
    document.body.innerHTML = `
      <div data-stage-author-layer data-stage-author-format="mmd">
        <div class="plain"></div>
        <div class="xiai-role-btn"></div>
        <div class="reset-card"><span class="inner"></span></div>
      </div>
      <div class="canvas-root lt-format-mmd"><div class="lt-bubble-body"><p class="para"></p></div></div>`
    const box = (sel: string) => getComputedStyle(document.querySelector(sel)!).boxSizing
    expect(box('.plain')).toBe('content-box')
    expect(box('.para')).toBe('content-box')
    expect(box('.xiai-role-btn')).toBe('border-box')
    expect(box('.reset-card .inner')).toBe('border-box')
  })
})
