// @vitest-environment jsdom
/**
 * 作者 HTML 裡縮排的註解（`        <!-- 常规事件面板 -->`）不能變成程式碼區塊。
 *
 * 症狀（2026-09-16 玩家回報，MMD 匯入的大世界卡）：開場的面板 HTML 是排版過的，區塊之間
 * 空一行、下一行是縮排八格的 `<!-- … -->`。CommonMark 把「空行之後縮排 ≥4 格」當縮排程式碼
 * 區塊，於是註解被印成一行 `<!-- 常规事件面板 -->` 紅字，MMD 那邊什麼都看不到。
 * dedentHtmlBlockLines 已經替縮排的區塊 tag 砍掉行首空白，註解也要算進去——它跟區塊 tag 一樣
 * 是 CommonMark 的 HTML 區塊起始條件（type 2），只是縮排要 <4 才算。
 */
import { withFencesProtected } from '../../../common/markdown-fences'
import { tagFrontendBlocks } from '../../../common/frontend-block'
import { stylePolicyFor } from '../../../common/author-style-policy'
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
import { stripUnknownTags, wrapDialogue } from '../canvas-platform-defaults'

const root = process.cwd()
const CHAT_VUE_PATH = path.join(root, 'src/pages/canvas/canvas.vue')

function extractHighlightTextSource(): string {
  const source = fs.readFileSync(CHAT_VUE_PATH, 'utf8')
  const anchor = 'const highlightText = (content, type, cacheKey) => {'
  const startIdx = source.indexOf(anchor)
  if (startIdx === -1) throw new Error('highlightText 錨點找不到')
  const braceStart = source.indexOf('{', startIdx + anchor.length - 1)
  let depth = 0
  let i = braceStart
  for (; i < source.length; i++) {
    if (source[i] === '{') depth++
    else if (source[i] === '}') { depth--; if (depth === 0) { i++; break } }
  }
  return source.slice(startIdx, i)
}

function buildHighlightText(format: string): (content: string, type?: number, cacheKey?: string | null) => string {
  const wrapped = `(function () {\n${extractHighlightTextSource()}\nreturn highlightText;\n})()`
  const context = vm.createContext({
    withFencesProtected, tagFrontendBlocks, stylePolicyFor,
    isHeavyHtml, sanitizeHtml, getMarkdownIt, renderTaskLists, dedentHtmlBlockLines,
    findStableBoundary, getStreamCacheEntry, setStreamCacheEntry, unwrapSingleHtmlFence,
    stripUnknownTags, wrapDialogue,
    cardFormat: { value: format },
    convertVisibleHtml: (html: string) => html,
    displayScript: (text: string) => text,
    applyDisplayRules: (text: string) => ({ html: text, rollbacks: [] }),
    activeAuthorAsset: { value: { rules: [], version: 0, crossLine: false } },
    console,
  })
  return new vm.Script(wrapped, { filename: 'canvas-highlightText-indented-comment.js' }).runInContext(context)
}

function render(content: string, format = 'mmd'): HTMLElement {
  const html = buildHighlightText(format)(content, 0, null)
  const el = document.createElement('div')
  el.innerHTML = html
  return el
}

// 玩家回報那張卡的形狀：敘事在前（非重 HTML 路徑）、面板 HTML 排版過、空行後接縮排的註解。
const PANEL =
  '九天之上，仙域的宫阙里。\n\n' +
  '<div class="panel-unified">\n' +
  '    <div class="event-tabs">\n' +
  '        <div class="event-nav"><label>常规事件</label></div>\n' +
  '\n' +
  '        <!-- 常规事件面板 -->\n' +
  '        <div class="event-panel panel-regular">开局大事件</div>\n' +
  '\n' +
  '        <!-- 特殊事件面板 -->\n' +
  '        <div class="event-panel panel-special">特殊事件</div>\n' +
  '    </div>\n' +
  '</div>'

describe('縮排的 HTML 註解', () => {
  it('空行之後縮排的 <!-- --> 不會變成程式碼區塊，也不會印成文字', () => {
    const el = render(PANEL)
    expect(el.querySelector('pre')).toBeNull()
    expect(el.querySelector('code')).toBeNull()
    expect(el.textContent).not.toContain('<!--')
    expect(el.textContent).not.toContain('常规事件面板')
    // 面板本身還在
    expect(el.querySelector('.panel-regular')?.textContent).toBe('开局大事件')
    expect(el.querySelector('.panel-special')?.textContent).toBe('特殊事件')
  })

  it('dedentHtmlBlockLines 替縮排的註解行砍掉行首空白', () => {
    expect(dedentHtmlBlockLines('a\n\n        <!-- x -->\n')).toBe('a\n\n<!-- x -->\n')
    // 圍欄裡的不動：那是字面文字
    expect(dedentHtmlBlockLines('```\n        <!-- x -->\n```')).toBe('```\n        <!-- x -->\n```')
  })
})
