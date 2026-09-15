/**
 * 規則 → 畫面的管線，與裝卡時的抽取。
 *
 * 裝卡：把每條規則替換內容裡的 `<style>` 與 `<script>` 抽出來（不論那條規則有沒有命中），
 * 樣式依卡片格式的政策落地（酒館卡加訊息層前綴、MMD 卡原樣）後合成一張全頁樣式表、
 * 腳本按規則順序整卡只跑一次。抽走之後規則本身照常參與替換。
 *
 * 渲染一則內容：巨集（{{user}}／{{char}}）→ 顯示規則（重用 display-rule-engine：同一份預算與
 * 回滾邏輯）→ Markdown（`*x*` 是斜體；四個空格不當程式碼塊）→ 對白引號上色 → 淨化。
 * 這裡只作用在玩家看到的內容，送給模型的原文不經過這裡。
 */
import MarkdownIt from 'markdown-it'
import { applyDisplayRules } from '@/utils/display-rule-engine.js'
import type { SandboxRule } from './protocol'
import { sanitizeAuthorHtml, stripUnknownTags } from './sanitize'
import { applyStylePolicy, type AuthorStylePolicy } from '@/common/author-style-policy'
import { withFencesProtected } from '@/common/markdown-fences'
import { tagFrontendBlocks } from '@/common/frontend-block'

export interface InstalledCard {
  /** 替換內容已抽掉 style/script 的規則，給渲染用。 */
  rules: SandboxRule[]
  /** 各規則抽出、已依政策落地的樣式，按規則順序。 */
  styles: string[]
  /** 各規則抽出的腳本，按規則順序；外鏈與內聯都在。 */
  scripts: AuthorScript[]
}

export type AuthorScript =
  | { kind: 'inline'; code: string; ruleName: string }
  | { kind: 'external'; src: string; ruleName: string }

const STYLE_RE = /<style\b[^>]*>([\s\S]*?)<\/style\s*>/gi
const SCRIPT_RE = /<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi
const SRC_RE = /\bsrc\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i

export function installCard(rules: SandboxRule[], policy: AuthorStylePolicy): InstalledCard {
  const styles: string[] = []
  const scripts: AuthorScript[] = []
  const stripped: SandboxRule[] = []
  for (const rule of Array.isArray(rules) ? rules : []) {
    if (!rule || rule.enabled === false) { if (rule) stripped.push(rule); continue }
    const ruleName = String(rule.name || rule.id || '')
    // 程式碼圍欄裡的 <style>／<script> 是字面文字：那是一整份要放進自己 iframe 的前端文件（前端區塊協議），
    // 抽出來當全頁樣式會把整個聊天頁弄壞、文件本身也少了樣式。
    const replace = withFencesProtected(String(rule.replace == null ? '' : rule.replace), (outside) => outside
      .replace(STYLE_RE, (_m, css: string) => { styles.push(applyStylePolicy(css, policy)); return '' })
      .replace(SCRIPT_RE, (_m, attrs: string, code: string) => {
        const src = SRC_RE.exec(attrs || '')
        const url = src ? (src[1] || src[2] || src[3] || '') : ''
        if (url) {
          // 只認 https；http 直接跳過（不跑、不報錯，除錯面板留一行由呼叫端處理）。
          if (/^https:\/\//i.test(url)) scripts.push({ kind: 'external', src: url, ruleName })
        } else if (code.trim()) {
          scripts.push({ kind: 'inline', code, ruleName })
        }
        return ''
      }))
    stripped.push({ ...rule, replace })
  }
  return { rules: stripped, styles, scripts }
}

export interface RenderMacros {
  user: string
  char: string
}

export interface RenderOptions {
  macros: RenderMacros
  variants?: Record<string, string> | null
  doc?: Document
  /** 圍欄裡的整份 HTML 文件怎麼畫（格式政策的 fencedDocument）；沒給＝inline，原樣留成程式碼區塊。 */
  fencedDocument?: 'iframe' | 'inline'
}

const md = new MarkdownIt({ html: true, breaks: true, linkify: false, typographer: false })
// 四個空格縮排不當程式碼塊：作者的 HTML 常常有縮排，當成程式碼會把整塊版面印成原始碼。
md.disable(['code'])

export function expandMacros(text: string, macros: RenderMacros): string {
  return String(text == null ? '' : text)
    .replace(/\{\{\s*user\s*\}\}/gi, macros.user)
    .replace(/\{\{\s*char\s*\}\}/gi, macros.char)
}

/** 對白引號上色：只動文字節點，不碰 pre/code，也不碰標籤裡的引號。 */
export function colorDialogueQuotes(root: Element) {
  const doc = root.ownerDocument
  const walker = doc.createTreeWalker(root, 4 /* NodeFilter.SHOW_TEXT */)
  const texts: Text[] = []
  let node = walker.nextNode()
  while (node) { texts.push(node as Text); node = walker.nextNode() }
  for (const text of texts) {
    const parent = text.parentElement
    if (!parent || parent.closest('pre, code, script, style, textarea')) continue
    const value = text.nodeValue || ''
    if (!/[“"]/.test(value)) continue
    const replaced = value.replace(/“([^”]+)”|"([^"\n]+)"/g, (m) => `<font color="#DC8333">${m}</font>`)
    if (replaced === value) continue
    const span = doc.createElement('span')
    span.innerHTML = replaced
    const frag = doc.createDocumentFragment()
    while (span.firstChild) frag.appendChild(span.firstChild)
    text.replaceWith(frag)
  }
}

/** 一則內容（訊息正文或功能欄）→ 可放進 innerHTML 的 HTML。 */
export function renderContent(content: string, rules: SandboxRule[], options: RenderOptions): string {
  const doc = options.doc || document
  const expanded = expandMacros(content, options.macros)
  const applied = applyDisplayRules(expanded, rules, { variants: options.variants || null }).html as string
  // 不在白名單的標籤（含中文尖括號那種）在進 markdown 之前就剝殼：markdown 會把它們跳脫成文字，
  // 之後的淨化就看不到、玩家會看到「<状态>」原樣印出來。反引號裡的原樣保留（stripUnknownTags 自己護）。
  const html = md.render(stripUnknownTags(applied))
  const clean = sanitizeAuthorHtml(html, doc)
  const holder = doc.createElement('div')
  holder.innerHTML = clean
  colorDialogueQuotes(holder)
  // 圍欄裡裝著整份 HTML 文件的區塊標起來，定稿後由殼掛成各自的 iframe（前端區塊協議）——只在格式政策這麼說時。
  return options.fencedDocument === 'iframe' ? tagFrontendBlocks(holder.innerHTML) : holder.innerHTML
}
