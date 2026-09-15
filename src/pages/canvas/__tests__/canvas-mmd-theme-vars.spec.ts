/**
 * 接上 MMD 的主題變數。
 *
 * 由來（owner 2026-09-10）：一張 MMD 卡在 sexyai.ai 上長得對，搬到畫布只有作者
 * 手寫的那幾條具體選擇器生效，整體換色完全沒發生。抓了對方線上的樣式表逐條比對
 * 才看清楚：MMD 的介面是變數驅動的，卡片換色的主要手法不是選節點，是設幾個變數
 * ——`--primary-font-color` 對方讀 591 次、`--background-color` 211 次、
 * `--card-background-color` 134 次。這張卡的 `.chat{}` 設的正是這三個。
 *
 * 我們一個都不讀，所以他整套換色的主接口是斷的，剩下的落差看起來像「到處都對不上」。
 *
 * 接法是把我們的預設值改成「先讀 MMD 的名字，讀不到才用原本的值」。沒設這些變數
 * 的卡拿到的是同一個 fallback，外觀一個位元組都不變。
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const css = readFileSync(resolve(__dirname, '../../../common/canvas-theme-vars.css'), 'utf8')

/** 我方變數 → [MMD 的上游名字, 原本的值（必須原樣留作 fallback）] */
const BRIDGE: Array<[string, string, string]> = [
  ['--lt-canvas-fg', '--primary-font-color', '#e8eaed'],
  ['--lt-canvas-bg', '--background-color', '#0f1217'],
  ['--lt-canvas-panel-bg', '--card-background-color', 'rgba(24, 27, 33, 0.98)'],
  ['--lt-canvas-sheet-bg', '--card-background-color', 'rgba(24, 27, 33, 0.98)'],
  ['--lt-canvas-menu-bg', '--card-background-color', 'rgba(24, 27, 33, 0.98)'],
  ['--lt-canvas-composer-field-bg', '--input-background-color', 'rgba(255, 255, 255, 0.05)'],
  ['--lt-canvas-placeholder-color', '--input-tip-color', 'rgba(232, 234, 237, 0.38)'],
  ['--lt-canvas-line', '--border-color', 'rgba(255, 255, 255, 0.10)'],
]

describe('畫布的預設值讀得到 MMD 的主題變數', () => {
  for (const [ours, upstream, fallback] of BRIDGE) {
    it(`${ours} 以 ${upstream} 為上游，讀不到時仍是 ${fallback}`, () => {
      const decl = new RegExp(`\\${ours}:\\s*var\\(\\s*${upstream}\\s*,\\s*${fallback.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\)`)
      expect(css).toMatch(decl)
    })
  }

  it('圖示槽的底色也走 MMD 的名字', () => {
    expect(css).toMatch(/--lt-canvas-panel-icon-bg:\s*var\(\s*--more-item-bg-color\s*,/)
  })
})

/**
 * 「＋」面板每一格的圖示槽，尺寸照 MMD。
 *
 * MMD 的 `.item-icon` 是整格那塊大方塊（寬滿格、高 4.03125rem、圓角 1.25rem），
 * 圖片本身 1.71875rem。我們原本是 20×20 的小槽——作者對它寫的
 * `padding:10px 16px;border-radius:16px` 在 MMD 加在大方塊上是那塊底，
 * 加在 20×20 上就變成一顆小藥丸（owner 2026-09-10 截圖）。
 */
describe('圖示槽的尺寸只在作者接管面板時才換成 MMD 的', () => {
  const canvas = readFileSync(resolve(__dirname, '../canvas.css'), 'utf8')
  const start = canvas.indexOf('.canvas-root[data-lt-author-owns~="panel"] .more-scope .item-icon {')
  const rule = start === -1 ? '' : canvas.slice(start, canvas.indexOf('}', start))

  it('規則掛在接管開關底下', () => {
    expect(start).toBeGreaterThan(-1)
  })

  it('寬滿格、高與圓角對齊 MMD', () => {
    expect(rule).toMatch(/width:\s*100%/)
    expect(rule).toMatch(/height:\s*var\(--lt-canvas-panel-icon-size, 64\.5px\)/)
    expect(rule).toMatch(/border-radius:\s*20px/)
  })

  it('底色走 MMD 的 --more-item-bg-color 橋接變數', () => {
    expect(rule).toMatch(/background:\s*var\(--lt-canvas-panel-icon-bg\)/)
  })

  it('槽變大時圖片維持 MMD 的固定尺寸，不跟著撐', () => {
    expect(rule).toMatch(/--lt-canvas-panel-icon-image:\s*27\.5px/)
  })

  it('沒接管時仍是我們原本的小槽', () => {
    const plain = canvas.slice(canvas.indexOf('  .more-scope .item-icon {'))
    expect(plain.slice(0, plain.indexOf('}'))).toMatch(/width:\s*20px/)
  })
})

// 格式政策鎖暗色的卡：同一套暗色預設也宣告在 .canvas-root.lt-theme-dark 上，宿主寫在祖先的深淺對映在這棵子樹裡讓位。
describe('鎖暗色的畫布根再宣告一次暗色預設', () => {
  it('第一個變數區塊同時掛在 :root 與 .canvas-root.lt-theme-dark 上', () => {
    expect(css).toMatch(/:root,\s*\.canvas-root\.lt-theme-dark\s*\{[\s\S]*?--lt-canvas-bg:/)
  })
})
