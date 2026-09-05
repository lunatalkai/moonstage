import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { composerOverhang } from '../canvas-composer-overhang'

describe('輸入區侵入捲動區的量', () => {
  it('作者把輸入區往上推 52px 時，對話欄要多 52px 底部內距', () => {
    // 實測 一張 MMD 匯入卡 卡（390×844）：捲動區 54–728，輸入區被 translateY(-52px) 推到 676
    expect(composerOverhang({ scrollBottom: 728, scrollHeight: 674, composerTop: 676, composerHeight: 117 })).toBe(52)
  })

  it('沒有被推（輸入區剛好接在捲動區底下）就是 0', () => {
    expect(composerOverhang({ scrollBottom: 728, scrollHeight: 674, composerTop: 728, composerHeight: 117 })).toBe(0)
    expect(composerOverhang({ scrollBottom: 728, scrollHeight: 674, composerTop: 740, composerHeight: 117 })).toBe(0)
  })

  it('輸入區被藏起來時沒有侵入——不然 top=0 會算出整片捲動區的高', () => {
    expect(composerOverhang({ scrollBottom: 728, scrollHeight: 674, composerTop: 0, composerHeight: 0 })).toBe(0)
  })

  it('推到畫面上半部這種極端狀況不當侵入處理', () => {
    expect(composerOverhang({ scrollBottom: 728, scrollHeight: 674, composerTop: 200, composerHeight: 117 })).toBe(0)
  })

  it('小數四捨五入成整數像素', () => {
    expect(composerOverhang({ scrollBottom: 728.4, scrollHeight: 674, composerTop: 676.1, composerHeight: 117 })).toBe(52)
  })
})

describe('對話欄的底部內距吃這個量', () => {
  const css = readFileSync(resolve(process.cwd(), 'src/pages/canvas/canvas.css'), 'utf8')
  const vue = readFileSync(resolve(process.cwd(), 'src/pages/canvas/canvas.vue'), 'utf8')

  it('桌機與手機兩條 #chat 內距都加上 --lt-canvas-composer-overhang', () => {
    const hits = css.match(/#chat \{[^}]*padding:[^;]*var\(--lt-canvas-composer-overhang, 0px\)/g) || []
    expect(hits.length).toBe(2)
  })

  it('畫布量到之後把它寫成 CSS 變數，卸載時清掉', () => {
    expect(vue).toContain("setProperty('--lt-canvas-composer-overhang'")
    expect(vue).toContain("removeProperty('--lt-canvas-composer-overhang')")
    expect(vue).toMatch(/composerOverhang\(\{/)
  })
})
