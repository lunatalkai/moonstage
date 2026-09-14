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
 * 新版沙箱卡（pageMode=sandbox）在播放器接上沙箱殼之前的契約：
 *   1. 舊頁的規則引擎與作者程式碼一律不啟動——那些規則是寫給沙箱殼的固定節點與 sdk 的，硬套只會壞。
 *   2. 畫面上有一行提示，讓玩家知道為什麼跟作者說的不一樣。
 *   3. 五語都有這句提示。
 * 之後接上殼（docs/sandbox-chat-page.md P3）時，第 1 點改成「掛殼」，這支測試要跟著改。
 */
describe('新版沙箱卡：接上殼之前先提示、不套舊頁規則', () => {
  it('applyAuthorAsset 看到 sandbox 就停在提示，不建規則執行環境', () => {
    const body = functionBody('function applyAuthorAsset(asset)')
    const guard = body.indexOf("pageMode === 'sandbox'")
    const runtime = body.indexOf('createAuthorAssetRuntime(')
    expect(guard).toBeGreaterThan(-1)
    expect(runtime).toBeGreaterThan(guard)
    // 守衛與建立執行環境之間必須有一個 return
    expect(body.slice(guard, runtime)).toMatch(/\breturn\b/)
  })

  it('模板裡有提示節點，且只在 sandboxCard 時出現', () => {
    expect(CANVAS).toMatch(/<div v-if="sandboxCard" class="canvas-sandbox-notice" data-lt="sandbox-notice"/)
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
