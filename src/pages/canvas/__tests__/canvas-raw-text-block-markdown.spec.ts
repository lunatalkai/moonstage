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

/**
 * 訊息裡的 <style>／<script> 內容不得被 markdown 動到。
 *
 * 根因（2026-09-11 社群站用戶回報「狀態欄渲染錯誤、選項點不出來」追查得出）：
 * MMD 規則展開出來的狀態欄是 `<div class="jh"><style>…</style>…</div>`，CSS 裡有空行分段、
 * `content:""` 這種雙引號。訊息以敘事文字開頭時走 markdown-it：`<div` 起頭的那一行是
 * CommonMark 第 6 型 HTML 區塊，遇到空行就結束——後面的 CSS 被當成段落，插進 `<p>`、`<br>`，
 * 雙引號變成 `&quot;`。瀏覽器解析到 `<p>.jh .stage{…}` 這種選擇器就整條丟掉，`.stage` 沒了
 * position:relative，裡面 absolute 的 `.ring` 撐到整個狀態欄大、蓋住底下的選項。
 * 管線註解本來就說 style／script 在 markdown 之前已經 stash，實際上那段 stash 排在 markdown 之後。
 */

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
  if (depth !== 0) throw new Error('highlightText 括號未配對')
  return source.slice(startIdx, i)
}

function buildHighlightText(): (content: string, type?: number, cacheKey?: string | null) => string {
  const wrapped = `(function () {\n${extractHighlightTextSource()}\nreturn highlightText;\n})()`
  const context = vm.createContext({
    isHeavyHtml, sanitizeHtml, getMarkdownIt, renderTaskLists, dedentHtmlBlockLines, findStableBoundary,
    getStreamCacheEntry, setStreamCacheEntry, unwrapSingleHtmlFence, stripUnknownTags, wrapDialogue,
    cardFormat: { value: 'mmd' },
    convertVisibleHtml: (html: string) => html,
    displayScript: (text: string) => text,
    applyDisplayRules: (text: string) => ({ html: text, rollbacks: [] }),
    activeAuthorAsset: { value: { rules: [], version: 0, crossLine: false } },
    console,
  })
  return new vm.Script(wrapped, { filename: 'chat-vue-highlightText-raw-text-extract.js' }).runInContext(context)
}

const CSS = '\n.jh{--p:#ed3e81;position:relative}\n\n/* 角色卡 */\n.jh .stage{position:relative;height:668px}\n.jh .userbar:before{content:"";position:absolute}\n'
const JS = '\n(function(){var a="x";\n\nvar b=\'y\';if(a<b){}\n})()\n'

describe('畫布渲染管線：<style>／<script> 內容不被 markdown 動到', () => {
  it('敘事文字在前（非 heavy 路徑）：含空行與雙引號的 CSS 原樣保留，規則全部解析得出來', () => {
    const highlightText = buildHighlightText()
    const content = '手机震了三下。\n\n{{user}}侧躺在床上。\n\n<div class="jh"><style>' + CSS + '</style><div class="stage"><div class="ring"></div></div></div>\n\n后续叙事。'
    const html = highlightText(content, 0, null)
    const container = document.createElement('div')
    container.innerHTML = html
    // 只有掛在文件上的 <style> 才有 sheet 可以驗
    document.body.appendChild(container)
    const style = container.querySelector('.jh style')
    expect(style).not.toBeNull()
    expect(style!.textContent).toBe(CSS)
    expect(html).not.toContain('&quot;')
    const selectors = [...style!.sheet!.cssRules].map((r) => (r as CSSStyleRule).selectorText)
    expect(selectors).toEqual(['.jh', '.jh .stage', '.jh .userbar:before'])
    container.remove()
  })

  it('敘事文字在前：<script> 內容原樣保留（空行、引號、小於號）', () => {
    const highlightText = buildHighlightText()
    const content = '敘事在前。\n\n<div class="w"><script>' + JS + '</script><p>x</p></div>'
    const html = highlightText(content, 0, null)
    const container = document.createElement('div')
    container.innerHTML = html
    const script = container.querySelector('.w script')
    expect(script).not.toBeNull()
    expect(script!.textContent).toBe(JS)
  })

  it('訊息以 HTML 開頭（heavy 路徑）：同樣原樣', () => {
    const highlightText = buildHighlightText()
    const content = '<div class="jh"><style>' + CSS + '</style><div class="stage"></div></div>'
    const html = highlightText(content, 0, null)
    const container = document.createElement('div')
    container.innerHTML = html
    expect(container.querySelector('.jh style')!.textContent).toBe(CSS)
  })
})
