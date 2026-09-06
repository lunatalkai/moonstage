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
import { renderSummary } from '../../../utils/messageRenderer'

// 真實用戶回報（desktop 專屬，mobile 正常）：AI 回覆同時用 Markdown（## / **粗體**）
// 與 <details><summary>…</summary></details> 摺疊塊時，整段 Markdown 不解析、
// 摺疊塊標題變成瀏覽器預設「詳細資料」。
//
// 根因：src/pages/canvas/canvas.vue 本檔內 const renderMarkdown = (item) => {...}
// 用 `item.isSummary || isSummaryFormat(item.content)` 當後備判斷，isSummaryFormat
// 只是裸字串比對 `/<summary>|<analysis>/`——任何內容含 <summary> 字樣就被誤判成內部
// 總結，改走 renderSummary()（不呼叫 markdown-it，且會剝掉 <summary>/</summary>
// 只留 <details>，瀏覽器套自己的預設標籤）。mobile 沒有這段內容嗅探，只認呼叫端
// 傳入的 isSummary 旗標，所以正常。
//
// 修法：renderMarkdown 只信 item.isSummary，拿掉 isSummaryFormat(item.content) 這個
// 後備判斷（連同 isSummaryFormat 本身，因為移除這個唯一呼叫點後它變成死碼）。
//
// chat.vue 的 setup() 巨大且吃真實 uni-app runtime，無法直接 mount（既有慣例見
// chat-heavy-html-fence-unwrap.spec.ts / compact-error-honesty.spec.ts 開頭註解）。
// 本檔沿用同一份 source-slicing 慣例：把 renderMarkdown 與其依賴的 highlightText
// 從原始碼字串抽出，在 vm context 裡實際執行（自由變數綁定真實 rich-text-renderer.js
// 匯出函式與真實 messageRenderer.ts 的 renderSummary），直接跑生產代碼本身。

const root = process.cwd()
const CHAT_VUE_PATH = path.join(root, 'src/pages/canvas/canvas.vue')
const MESSAGE_RENDERER_PATH = path.join(root, 'src/utils/messageRenderer.ts')

function extractBracedFunctionSource(source: string, anchor: string, label: string): string {
  const startIdx = source.indexOf(anchor)
  if (startIdx === -1) {
    throw new Error(`${label} 錨點找不到 — 原始碼結構已變，需同步更新本測試`)
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
    throw new Error(`${label} 函式本體括號未配對 — 抽取失敗`)
  }
  return source.slice(startIdx, i)
}

function extractHighlightTextSource(chatVueSource: string): string {
  return extractBracedFunctionSource(
    chatVueSource,
    'const highlightText = (content, type, cacheKey) => {',
    'highlightText',
  )
}

function extractRenderMarkdownSource(chatVueSource: string): string {
  return extractBracedFunctionSource(
    chatVueSource,
    'const renderMarkdown = (item) => {',
    'renderMarkdown（chat.vue 本檔的 item 版本，非 messageRenderer.ts 的 content 版本）',
  )
}

// 修復前 messageRenderer.ts 的 isSummaryFormat 原樣重現，*只*用於「暫時還原修復」
// 破壞驗證那一步：修復後 isSummaryFormat 已從 messageRenderer.ts 整支移除（唯一呼叫
// 點拔掉後變成死碼），renderMarkdown 修好的版本完全不會呼叫這個自由變數；只有暫時
// 還原 chat.vue 那行 `|| isSummaryFormat(item.content)` 時才會用到它，讓 vm context
// 有真實舊行為可綁，而不是丟 ReferenceError 掩蓋掉真正的回歸現象。
const LEGACY_IS_SUMMARY_FORMAT = (content: string): boolean => /<summary>|<analysis>/.test(content)

function buildHighlightText(chatVueSource: string) {
  const fnSource = extractHighlightTextSource(chatVueSource)
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

function buildRenderMarkdown(chatVueSource: string) {
  const highlightText = buildHighlightText(chatVueSource)
  const fnSource = extractRenderMarkdownSource(chatVueSource)
  const wrapped = `(function () {\n${fnSource}\nreturn renderMarkdown;\n})()`
  const context = vm.createContext({
    highlightText,
    renderSummary,
    isSummaryFormat: LEGACY_IS_SUMMARY_FORMAT,
    nextTick: (_fn?: () => void) => {}, // 測試不驗證 script/style 副作用注入
    shouldHoistMessageAssets: () => false, // 抬升決策與執行各有自己的 spec（canvas-message-assets.spec.ts）
    runMessageAssets: () => ({ scripts: 0, styles: 0 }),
    activeAuthorAsset: { value: { rules: [], version: 0, crossLine: false } },
    console,
  })
  const script = new vm.Script(wrapped, { filename: 'chat-vue-renderMarkdown-extract.js' })
  return script.runInContext(context)
}

function readChatVueSource(): string {
  return fs.readFileSync(CHAT_VUE_PATH, 'utf8')
}

describe('desktop chat.vue renderMarkdown：<summary> 內容嗅探誤判', () => {
  const mixedContent =
    '## 標題\n\n這是**粗體**文字說明。\n\n<details><summary>詳細內容</summary>\n這裡是摺疊區塊內文\n</details>'

  it('isSummary 為 false 時必須走 markdown 管線：標題與粗體被解析，不是字面輸出', () => {
    const renderMarkdown = buildRenderMarkdown(readChatVueSource())
    const html = renderMarkdown({ content: mixedContent, isSummary: false, id: 1, type: 1 })

    expect(html).toContain('<h2>標題</h2>')
    expect(html).toContain('<strong>粗體</strong>')
    expect(html).not.toContain('##')
    expect(html).not.toContain('**')
  })

  it('isSummary 為 false 時 <summary> 標籤與其內文必須保留，不得被剝掉', () => {
    const renderMarkdown = buildRenderMarkdown(readChatVueSource())
    const html = renderMarkdown({ content: mixedContent, isSummary: false, id: 1, type: 1 })

    expect(html).toContain('<details>')
    expect(html).toMatch(/<summary>\s*詳細內容\s*<\/summary>/)
  })

  it('反向案例：isSummary 為 true 時仍走總結渲染路徑（真總結不能一起改壞）', () => {
    const renderMarkdown = buildRenderMarkdown(readChatVueSource())
    const summaryContent = '<analysis>內部思考過程，不應顯示</analysis><summary>用戶今天心情不錯</summary>'
    const html = renderMarkdown({ content: summaryContent, isSummary: true, id: 2, type: 1 })

    expect(html).not.toContain('內部思考過程')
    expect(html).not.toContain('<summary>')
    expect(html).not.toContain('</summary>')
    expect(html).toContain('用戶今天心情不錯')
  })

  it('純內部總結格式（含 <analysis>）在 isSummary 為 true 時行為不變', () => {
    const renderMarkdown = buildRenderMarkdown(readChatVueSource())
    const analysisOnly = '<analysis>純粹的內部分析內容</analysis>沒有 summary 標籤的總結文字'
    const html = renderMarkdown({ content: analysisOnly, isSummary: true, id: 3, type: 1 })

    expect(html).not.toContain('純粹的內部分析內容')
    expect(html).not.toContain('<analysis>')
    expect(html).toContain('沒有 summary 標籤的總結文字')
  })
})
