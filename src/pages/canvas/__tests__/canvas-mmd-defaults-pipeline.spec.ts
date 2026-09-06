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
import { removePromptTags, stripUnknownTags, wrapDialogue } from '../canvas-platform-defaults'

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

function buildHighlightText(source: 'mmd' | 'tavern', rules: any[] = []) {
  const fnSource = extractBraced(fs.readFileSync(CANVAS_VUE, 'utf8'), 'const highlightText = (content, type, cacheKey) => {')
  const context = vm.createContext({
    isHeavyHtml, sanitizeHtml, getMarkdownIt, renderTaskLists, dedentHtmlBlockLines,
    findStableBoundary, getStreamCacheEntry, setStreamCacheEntry, unwrapSingleHtmlFence,
    applyTavernRules, scopeCardHtml,
    removePromptTags, stripUnknownTags, wrapDialogue,
    authorRuleOptions: () => ({}),
    cardSource: { value: source },
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

  it('thought／Q 這類原站預設清掉的標籤連內容消失，跨越空行也清', () => {
    const html = buildHighlightText('mmd')('前面<thought>\n隱藏\n\n還是隱藏\n</thought>後面<Q>q</Q>', 0, null)
    expect(html).not.toContain('隱藏')
    expect(html).not.toContain('q</')
    expect(html).toContain('前面')
    expect(html).toContain('後面')
  })

  it('卡片規則先於剝標籤：<AC_UI> 這種觸發標籤先被規則換掉，不會先被剝光', () => {
    const rules = [{ id: 'ui', find: '/<AC_UI>/g', replace: '<div class="ac-ui">UI</div>' }]
    const html = buildHighlightText('mmd', rules)('<AC_UI>\n\n正文', 0, null)
    expect(html).toContain('<div class="ac-ui">UI</div>')
  })

  it('酒館來源不套 MMD 的白名單：<u> 與自訂標籤內文都留，標籤照舊', () => {
    const html = buildHighlightText('tavern')('<u>底線</u>與<status>狀態</status>', 0, null)
    expect(html).toContain('<u>底線</u>')
    expect(html).toContain('狀態')
  })
})
