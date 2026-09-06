import fs from 'node:fs'
import path from 'node:path'
import vm from 'node:vm'
import { describe, expect, it } from 'vitest'
import {
  isHeavyHtml,
  sanitizeHtml,
  getMarkdownIt,
  renderTaskLists,
  dedentHtmlBlockLines,
  findStableBoundary,
  getStreamCacheEntry,
  setStreamCacheEntry,
  unwrapSingleHtmlFence,
} from '../../../utils/rich-text-renderer.js'
// highlightText 現在直接呼叫這兩支（非標準標籤剝除與對白上色）；這些測試驗的是別的管線行為，
// 綁真實函式、來源給 tavern，等價於「沒有 MMD 預設」的路徑，跟改動前一樣。
import { stripUnknownTags, wrapDialogue } from '../canvas-platform-defaults'

// 工單 #65（回歸 #24）：#24 修復只改了
// rich-text-renderer.js 的 renderRichText()（chat.vue 從未呼叫的死路徑），
// 沒有同步 chat.vue 自己重複實作的 highlightText heavy 分支 → AI 把整卡包在
// 單一 ```html 圍欄輸出時，字面 ``` 標記會殘留在卡片渲染輸出的上下。
//
// chat.vue 的 setup() 巨大且吃真實 uni-app runtime，無法直接 mount（既有慣例
// 見 compact-error-honesty.spec.ts / content-filter-input-card.spec.ts 開頭
// 註解）。本檔在既有 source-slicing 慣例上更進一步：把抽取到的 highlightText
// 原始碼在 vm context 裡實際執行（自由變數綁定真實 rich-text-renderer.js
// 匯出函式），換取跟 renderRichText 既有測試同等的「輸出字串」行為級斷言，
// 而不只是靜態結構鎖 — 這是直接跑生產代碼本身，不是重寫一份邏輯。

const root = process.cwd()
const CHAT_VUE_PATH = path.join(root, 'src/pages/canvas/canvas.vue')

function extractHighlightTextSource(): string {
  const source = fs.readFileSync(CHAT_VUE_PATH, 'utf8')
  const anchor = 'const highlightText = (content, type, cacheKey) => {'
  const startIdx = source.indexOf(anchor)
  if (startIdx === -1) {
    throw new Error('highlightText 錨點找不到 — chat.vue heavy 分支結構已變，需同步更新本測試')
  }
  const braceStart = source.indexOf('{', startIdx + anchor.length - 1)
  let depth = 0
  let i = braceStart
  for (; i < source.length; i++) {
    if (source[i] === '{') depth++
    else if (source[i] === '}') {
      depth--
      if (depth === 0) { i++; break }
    }
  }
  if (depth !== 0) {
    throw new Error('highlightText 函式本體括號未配對 — 抽取失敗')
  }
  return source.slice(startIdx, i)
}

function buildHighlightText(): (content: string, type?: number, cacheKey?: string | null) => string {
  const fnSource = extractHighlightTextSource()
  const wrapped = `(function () {\n${fnSource}\nreturn highlightText;\n})()`
  const context = vm.createContext({
    isHeavyHtml,
    sanitizeHtml,
    getMarkdownIt,
    renderTaskLists,
    dedentHtmlBlockLines,
    findStableBoundary,
    getStreamCacheEntry,
    setStreamCacheEntry,
    unwrapSingleHtmlFence,
    stripUnknownTags, wrapDialogue,
    cardFormat: { value: 'tavern' },
    // 顯示字形轉換在這些測試裡是恆等：它們驗的是管線結構，不是簡繁。
    convertVisibleHtml: (html: string) => html,
    displayScript: (text: string) => text,
    // 顯示層替換：這兩支測試不驗規則行為（那在 display-rule-engine.spec.js），
    // 這裡給空資產，等價於「沒有作者資產的角色」——也就是既有卡的路徑。
    applyDisplayRules: (text: string) => ({ html: text, rollbacks: [] }),
    activeAuthorAsset: { value: { rules: [], version: 0, crossLine: false } },
    console,
  })
  const script = new vm.Script(wrapped, { filename: 'chat-vue-highlightText-extract.js' })
  return script.runInContext(context)
}

describe('工單 #65（回歸 #24）· desktop chat.vue highlightText heavy 分支不留字面 fence 標記', () => {
  it('AI 把整卡包在單一 ```html 圍欄輸出 → highlightText 渲染輸出不含字面 ``` 且卡片 HTML 完整', () => {
    const highlightText = buildHighlightText()
    const wrapped = '```html\n<div class="hc-card"><p>內容</p></div>\n```'

    const html = highlightText(wrapped, 0, undefined)

    expect(html).not.toContain('```')
    expect(html).toContain('<div class="hc-card">')
    expect(html).toContain('<p>內容</p>')
  })

  it('回歸保護：非圍欄整段的一般 heavy HTML（作者手刻卡片）渲染不受影響', () => {
    const highlightText = buildHighlightText()
    const plain = '<div class="hc-card"><p>內容</p></div>'

    const html = highlightText(plain, 0, undefined)

    expect(html).not.toContain('```')
    expect(html).toContain('<div class="hc-card">')
    expect(html).toContain('<p>內容</p>')
  })
})
