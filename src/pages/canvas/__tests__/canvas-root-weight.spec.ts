/**
 * 正文字重（owner 2026-09-06：「我們的字重是不是對的？」）。
 *
 * 殼的頁面基底（fui-app.css 的 uni-page-body）把字重設成 500；畫布根沒有自己宣告，
 * 於是整段正文繼承了 500。MMD 與酒館的正文都是 400——作者的美化只對對白、標題等
 * 個別元素寫字重，正文靠預設。PingFang 的 500 是 Medium，肉眼就比 Regular 重一級，
 * 在 playground 量到敘事段落 500、原站 400。畫布根要把字重釘回 400，讓作者的
 * 規則接手其餘。
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

describe('畫布正文字重', () => {
  const css = readFileSync(resolve(__dirname, '../canvas.css'), 'utf8')
  const start = css.indexOf('.canvas-root {')
  const block = css.slice(start, css.indexOf('}', start))

  it('畫布根自己宣告 font-weight: 400，不繼承殼頁面的 500', () => {
    expect(start).toBeGreaterThan(-1)
    expect(block).toMatch(/font-weight:\s*400;/)
  })
})
