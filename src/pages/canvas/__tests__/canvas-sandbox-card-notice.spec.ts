import fs from 'node:fs'
import path from 'node:path'
import { describe, it, expect } from 'vitest'

const ROOT = process.cwd()
const CANVAS = fs.readFileSync(path.join(ROOT, 'src/pages/canvas/canvas.vue'), 'utf8')

/** 用錨點＋括號配平抓出具名函式的完整本體（跟其他 canvas 契約測試同一套慣例）。 */
function functionBody(anchor: string): string {
  const start = CANVAS.indexOf(anchor)
  if (start === -1) throw new Error(`錨點「${anchor}」找不到——canvas.vue 結構變了，請同步這支測試`)
  const braceStart = CANVAS.indexOf('{', start + anchor.length - 1)
  let depth = 0
  let i = braceStart
  for (; i < CANVAS.length; i++) {
    if (CANVAS[i] === '{') depth++
    else if (CANVAS[i] === '}' && --depth === 0) { i++; break }
  }
  return CANVAS.slice(start, i)
}

/**
 * 新版沙箱卡（pageMode=sandbox）的畫布契約（docs/sandbox-chat-page.md §5）：
 *   1. 舊頁的規則引擎與作者程式碼一律不啟動——那些規則是寫給沙箱殼的固定節點與 sdk 的，硬套只會壞；
 *      改成掛殼（mountSandbox）。
 *   2. 原生訊息列表與輸入區讓位給 iframe；殼沒握手上才顯示提示。
 *   3. 五語都有這句提示。
 */
describe('新版沙箱卡：掛殼、不套舊頁規則', () => {
  it('applyAuthorAsset 看到 sandbox 就掛殼並 return，不建規則執行環境', () => {
    const body = functionBody('function applyAuthorAsset(asset)')
    const guard = body.indexOf("pageMode === 'sandbox'")
    const mountCall = body.indexOf('mountSandbox(')
    const runtime = body.indexOf('createAuthorAssetRuntime(')
    expect(guard).toBeGreaterThan(-1)
    expect(mountCall).toBeGreaterThan(guard)
    expect(runtime).toBeGreaterThan(mountCall)
    expect(body.slice(guard, runtime)).toMatch(/\breturn\b/)
  })

  it('模板：沙箱卡時只有訊息列表換成 iframe；頁首與輸入區仍是宿主的（作者開全螢幕舞台或收起輸入區才藏）；握手失敗才顯示提示', () => {
    expect(CANVAS).toMatch(/<div v-if="sandboxCard" class="canvas-sandbox-frame"/)
    // 提示蓋在 iframe 上而不是取代它：殼晚到仍能接上
    expect(CANVAS).toMatch(/<iframe\s+ref="sandboxFrame"/)
    expect(CANVAS).toContain("onHandshake: () => { sandboxFailed.value = false; }")
    expect(CANVAS).toMatch(/<CanvasStage v-if="!sandboxCard"/)
    // 頁首與輸入區在沙箱模式下由殼用同一套標準元件畫（資料走 hud.read().chrome）；這一頁自己的只藏不拆
    expect(CANVAS).not.toMatch(/<CanvasComposer\s+v-if=/)
    expect(CANVAS).toMatch(/<CanvasComposer\s+v-show="!sandboxCard"/)
    expect(CANVAS).toMatch(/<CanvasHeader\s+v-show="!sandboxCard"/)
    expect(CANVAS).toContain("chrome: 'shell' as const")
    expect(CANVAS).toContain('chrome: sandboxCard.value ? buildChromeState() : undefined')
    expect(CANVAS).toMatch(/<div v-if="sandboxFailed" class="canvas-sandbox-notice" data-lt="sandbox-notice"/)
    expect(CANVAS).toContain("t('canvas.sandbox.unsupported')")
  })

  it('五語都有提示文案', () => {
    for (const loc of ['zh-Hant', 'zh-Hans', 'en', 'ja', 'ko']) {
      const messages = JSON.parse(fs.readFileSync(path.join(ROOT, `src/locale/${loc}.json`), 'utf8'))
      expect(typeof messages['canvas.sandbox.unsupported'], loc).toBe('string')
      expect(messages['canvas.sandbox.unsupported'].length, loc).toBeGreaterThan(10)
    }
  })
})
