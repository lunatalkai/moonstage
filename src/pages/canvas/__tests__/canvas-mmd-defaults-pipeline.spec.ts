// highlightText 現在也綁這兩支（圍欄保護與前端區塊標記），跟頁面裡一樣是真實函式。
import { withFencesProtected } from '../../../common/markdown-fences'
import { tagFrontendBlocks } from '../../../common/frontend-block'
import { stylePolicyFor } from '../../../common/author-style-policy'
/**
 * owner 2026-09-06 截圖：AI 回覆以 <思維鏈> 開頭，畫面上不但有字面的 <思維鏈>，括號
 * 斜體的 span 屬性還被對白上色當成引號包掉，露出 `"color: #C4B4A3;…">` 這串字。
 *
 * 用既有的 source-slicing 慣例把 highlightText 抽出來跑真實管線（見
 * chat-summary-format-false-positive.spec.ts 開頭註解）。
 */
import fs from 'node:fs'
import path from 'node:path'
import vm from 'node:vm'
import { describe, it, expect } from 'vitest'
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
import { applyTavernRules } from '../canvas-rule-engine'
import { scopeCardHtml } from '../canvas-style-scope'
import { stripUnknownTags, wrapDialogue } from '../canvas-platform-defaults'

const CANVAS_VUE = path.join(process.cwd(), 'src/pages/canvas/canvas.vue')

function extractBraced(source: string, anchor: string): string {
  const startIdx = source.indexOf(anchor)
  if (startIdx === -1) throw new Error(`錨點找不到：${anchor}`)
  const braceStart = source.indexOf('{', startIdx + anchor.length - 1)
  let depth = 0
  let i = braceStart
  for (; i < source.length; i++) {
    if (source[i] === '{') depth++
    else if (source[i] === '}') { depth--; if (depth === 0) { i++; break } }
  }
  return source.slice(startIdx, i)
}

function buildHighlightText(format: 'mmd' | 'tavern', rules: any[] = []) {
  const fnSource = extractBraced(fs.readFileSync(CANVAS_VUE, 'utf8'), 'const highlightText = (content, type, cacheKey) => {')
  const context = vm.createContext({
    withFencesProtected, tagFrontendBlocks, stylePolicyFor,
    isHeavyHtml, sanitizeHtml, getMarkdownIt, renderTaskLists, dedentHtmlBlockLines,
    findStableBoundary, getStreamCacheEntry, setStreamCacheEntry, unwrapSingleHtmlFence,
    applyTavernRules, scopeCardHtml,
    stripUnknownTags, wrapDialogue,
    authorRuleOptions: () => ({}),
    cardFormat: { value: format },
    convertVisibleHtml: (html: string) => html,
    displayScript: (text: string) => text,
    activeAuthorAsset: { value: { rules, version: 0, crossLine: false } },
    console,
  })
  return new vm.Script(`(function(){\n${fnSource}\nreturn highlightText;\n})()`).runInContext(context)
}

const SCREENSHOT = [
  '<思維鏈>',
  '用戶選擇了【出言嘲諷】，我需要：',
  '',
  '1. 讓沈梔語對這句話產生強烈反應',
  '2. 這句話暗示"你見過我的"，沈梔語會聯想到可能的場景（實際她沒見過），陷入幻想',
  '</思維鏈>',
  '',
  '沈梔語微微側身："害我想找你都沒找到。"',
].join('\n')

describe('MMD 來源的畫布：平台預設與對白上色', () => {
  it('括號斜體的 span 屬性不會被對白上色當成引號包掉', () => {
    const html = buildHighlightText('mmd')(SCREENSHOT, 0, null)
    expect(html).not.toContain('color: #C4B4A3;font-style: italic;font-weight: 400;"&gt;')
    expect(html).not.toMatch(/<font color="#DC8333">"color:/)
    expect(html).toMatch(/<span style="color: #C4B4A3;font-style: italic;font-weight: 400;">（實際她沒見過）<\/span>/)
    // 半形引號經 markdown 成了 &quot;，對白仍要上色（原站的對白就是半形引號）
    expect(html).toContain('<font color="#DC8333">&quot;你見過我的&quot;</font>')
    expect(html).toContain('<font color="#DC8333">&quot;害我想找你都沒找到。&quot;</font>')
  })

  it('<思維鏈> 字面標籤消失、內文照留（跟原站一樣）', () => {
    const html = buildHighlightText('mmd')(SCREENSHOT, 0, null)
    expect(html).not.toContain('思維鏈&gt;')
    expect(html).not.toContain('<思維鏈>')
    expect(html).toContain('用戶選擇了【出言嘲諷】')
  })

  it('標準元素照留：hr／u／code 不受非標準標籤剝除影響', () => {
    const html = buildHighlightText('mmd')('<u>底線</u>與<code>碼</code>\n\n<hr>\n\n<status>狀態</status>', 0, null)
    expect(html).toContain('<u>底線</u>')
    expect(html).toContain('<code>碼</code>')
    expect(html).toContain('<hr>')
    expect(html).toContain('狀態')
    expect(html).not.toContain('<status>')
  })

  it('卡片規則先於剝標籤：<AC_UI> 這種觸發標籤先被規則換掉，不會先被剝光', () => {
    const rules = [{ id: 'ui', find: '/<AC_UI>/g', replace: '<div class="ac-ui">UI</div>' }]
    const html = buildHighlightText('mmd', rules)('<AC_UI>\n\n正文', 0, null)
    expect(html).toContain('<div class="ac-ui">UI</div>')
  })

  it('不看格式：酒館格式的卡一樣剝非標準標籤、留內文，標準元素照舊', () => {
    const html = buildHighlightText('tavern')('<u>底線</u>與<status>狀態</status>', 0, null)
    expect(html).toContain('<u>底線</u>')
    expect(html).toContain('狀態')
    expect(html).not.toContain('<status>')
  })
})

/**
 * 2026-09-16 玩家回報：MMD 搬來的卡狀態欄「爆炸」——畫面上直接印出 `DGSPANELSTART▶ts::…◀DGSPANELEND`。
 * 資料庫裡模型寫的是 `DGS_KV_PANEL_V2_START`；「遊戲對白裝飾」的 `_(.*?)_` 分支把 `_KV_`、`_V2_` 當斜體標記，
 * 而回呼只接了四個捕獲組、第五組永遠拿不到，整段被換成空字串——單字裡的底線就這樣被吃掉，
 * 作者的點火器在氣泡裡再也找不到起止標記，只好把原文攤出來。
 */
describe('底線斜體裝飾不吃掉單字裡的底線', () => {
  const panelRule = { id: 'p', find: '/((?:DGS_KV_PANEL_V2_START▶[\\s\\S]*?◀DGS_KV_PANEL_V2_END\\s*)+)/g', replace: '<div class="gt-wrap"><div class="gt-raw">$1</div></div>' }
  const line = 'DGS_KV_PANEL_V2_START▶ts::1719001;;name::甲;;identity::乙;;◀DGS_KV_PANEL_V2_END'

  it('規則抓進 .gt-raw 的機讀標記原樣保留（MMD 卡的狀態欄點火器靠它）', () => {
    const html = buildHighlightText('mmd', [panelRule])(`正文。\n\n${line}`, 0, null)
    expect(html).not.toContain('DGSPANELSTART')
    expect((html.match(/DGS_KV_PANEL_V2_START/g) || []).length).toBe(1)
    expect((html.match(/DGS_KV_PANEL_V2_END/g) || []).length).toBe(1)
  })

  it('snake_case 不動；獨立的 _心聲_ 才轉成括號斜體', () => {
    const html = buildHighlightText('mmd')('<p>檔案 file_name_here 放這。她 _輕嘆_ 一聲。</p>', 0, null)
    expect(html).toContain('file_name_here')
    expect(html).toMatch(/<span style="color: #C4B4A3;font-style: italic;font-weight: 400;">（輕嘆）<\/span>/)
    expect(html).not.toContain('_輕嘆_')
  })
})
