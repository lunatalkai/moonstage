/**
 * 輸入區兩個小細節（owner 2026-09-05）：
 * 1. 快捷列與輸入框之間要有 margin——只靠 padding 頂著，作者一畫邊框兩條線就貼在一起；
 *    而 margin 只能寫在 layer 外（uni 的 *{margin:0} 不在 layer 裡）。
 * 2. 收起（單行）時幫答鍵跟那一行字垂直置中，不是貼底。
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const css = readFileSync(resolve(__dirname, '../canvas.css'), 'utf8')

describe('輸入區的間距與對齊', () => {
  it('快捷列的 margin-bottom 寫在 layer 外', () => {
    const outside = css.slice(0, css.indexOf('@layer lt-base'))
    expect(outside).toMatch(/\.shortcut-bar-wrapper \{\s*margin-bottom: 8px;\s*\}/)
  })

  it('收起時 .send-msg 置中對齊，展開才貼底', () => {
    expect(css).toMatch(/\.send-msg:not\(:has\(\.uni-textarea\.is-expanded\)\) \{\s*align-items: center;/)
    const start = css.indexOf('  .ai-assistant {')
    const body = css.slice(start, css.indexOf('}', start))
    expect(body).not.toMatch(/margin-bottom/)
  })
})

describe('手機收起態一列的對齊', () => {
  it('文字列置中，只有留著多行草稿時才貼底', () => {
    expect(css).toMatch(/\.chat-input-collapsed-row \{\s*align-items: center;\s*\}\s*\n\s*\.chat-input-scope:has\(\.chat-input-collapsed-text\) \.chat-input-collapsed-row \{\s*align-items: flex-end;/)
  })
})
