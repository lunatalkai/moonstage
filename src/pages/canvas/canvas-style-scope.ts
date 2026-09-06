/**
 * 卡片 <style> 的作用域，依卡片格式決定。
 *
 * ── 為什麼要分格式 ──
 * 酒館會替訊息裡的 <style> 加上訊息層前綴，所以酒館作者寫 `p{}`、`.title{}`
 * 這種裸選擇器是安全且常見的。同一張卡搬到這裡（沒有沙盒）就會整頁生效——
 * 「零改動全相容」在這個方向上會壞成「卡片把頁面弄壞了」。
 *
 * MMD 沒有這層改寫，卡片的 <style> 原樣生效、而且作者就是靠它換掉整個頁面的
 * 背景與輸入框。對 MMD 格式的卡加前綴等於把那張卡的美化整套關掉。
 *
 * 所以格式決定作用域，不是一個全域開關。格式不明時當 MMD——我們目前匯入的
 * 都是那一邊來的，猜錯的代價也不對稱：猜成酒館會讓能用的卡變成不能用。
 */

export type { CardFormat } from '@/common/card-format'
export { normalizeCardFormat } from '@/common/card-format'
import type { CardFormat } from '@/common/card-format'

/** 訊息層前綴。酒館用 `.mes_text `，我們的氣泡同時掛著這個 class。 */
export const MESSAGE_SCOPE = '.mes_text'

/**
 * 替一段 CSS 的每條規則加上作用域前綴。
 *
 * 刻意手寫掃描而不是丟給 CSSOM：CSSOM 會把它看不懂的規則整條丟掉，而卡片的
 * CSS 裡有大量瀏覽器前綴與新語法，丟掉的部分作者查不出去哪了。
 *
 * @media / @supports 這類條件群組要遞迴進去處理內層規則；
 * @keyframes / @font-face / @import 的內容不是選擇器，原樣保留。
 */
export function scopeCss(css: string, scope: string): string {
  const source = String(css == null ? '' : css)
  let out = ''
  let i = 0

  function skipComment() {
    if (source.startsWith('/*', i)) {
      const end = source.indexOf('*/', i + 2)
      const stop = end < 0 ? source.length : end + 2
      out += source.slice(i, stop)
      i = stop
      return true
    }
    return false
  }

  function readBlock(): string {
    // 從 '{' 開始，回傳含大括號的整塊。
    let depth = 0
    const start = i
    while (i < source.length) {
      const ch = source[i]
      if (ch === '/' && source.startsWith('/*', i)) {
        const end = source.indexOf('*/', i + 2)
        i = end < 0 ? source.length : end + 2
        continue
      }
      if (ch === '"' || ch === "'") {
        const quote = ch
        i++
        while (i < source.length && source[i] !== quote) {
          if (source[i] === '\\') i++
          i++
        }
        i++
        continue
      }
      if (ch === '{') depth++
      if (ch === '}') {
        depth--
        i++
        if (depth === 0) break
        continue
      }
      i++
    }
    return source.slice(start, i)
  }

  while (i < source.length) {
    if (skipComment()) continue
    const ch = source[i]
    if (ch === '}' || /\s/.test(ch)) {
      out += ch
      i++
      continue
    }

    // 讀到下一個 '{' 或 ';' 為止 = 前綴（選擇器或 at-rule 前導）
    const preludeStart = i
    while (i < source.length && source[i] !== '{' && source[i] !== ';') {
      if (source.startsWith('/*', i)) {
        const end = source.indexOf('*/', i + 2)
        i = end < 0 ? source.length : end + 2
        continue
      }
      i++
    }
    const prelude = source.slice(preludeStart, i)

    if (i >= source.length) {
      out += prelude
      break
    }
    if (source[i] === ';') {
      // @import / @charset 之類的單行 at-rule
      out += prelude + ';'
      i++
      continue
    }

    const block = readBlock()
    const trimmed = prelude.trim()

    if (/^@(media|supports|layer|container|scope)\b/i.test(trimmed)) {
      const inner = block.slice(1, -1)
      out += prelude + '{' + scopeCss(inner, scope) + '}'
      continue
    }
    if (trimmed.startsWith('@')) {
      // keyframes / font-face / property … 內容不是選擇器
      out += prelude + block
      continue
    }

    out += prefixSelectorList(prelude, scope) + block
  }

  return out
}

function prefixSelectorList(prelude: string, scope: string): string {
  const leading = prelude.slice(0, prelude.length - prelude.trimStart().length)
  const body = prelude.trim()
  if (!body) return prelude
  const parts = splitTopLevel(body, ',')
  const prefixed = parts.map((part) => {
    const sel = part.trim()
    if (!sel) return sel
    // 已經在作用域內的不重複加。
    if (sel === scope || sel.startsWith(scope + ' ') || sel.startsWith(scope + '.') ) return sel
    // :root / html / body 這種頁面根選擇器：酒館作者寫它是想改整個訊息的字體與色，
    // 對映到訊息層本身而不是丟掉。
    if (/^(:root|html|body)\b/i.test(sel)) {
      return scope + sel.replace(/^(:root|html|body)/i, '')
    }
    return scope + ' ' + sel
  })
  return leading + prefixed.join(', ')
}

/** 以頂層（不在括號內）的分隔字元切開。 */
function splitTopLevel(text: string, sep: string): string[] {
  const out: string[] = []
  let depth = 0
  let start = 0
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (ch === '(' || ch === '[') depth++
    else if (ch === ')' || ch === ']') depth--
    else if (ch === sep && depth === 0) {
      out.push(text.slice(start, i))
      start = i + 1
    }
  }
  out.push(text.slice(start))
  return out
}

const STYLE_TAG = /<style\b([^>]*)>([\s\S]*?)<\/style>/gi

/**
 * 把一段訊息 HTML 裡的 <style> 依來源決定要不要加作用域。
 * MMD 來源原樣回傳（連掃描都不做）。
 */
export function scopeCardHtml(html: string, format: CardFormat, scope: string = MESSAGE_SCOPE): string {
  if (format !== 'tavern') return html
  const text = String(html == null ? '' : html)
  if (text.indexOf('<style') < 0) return text
  return text.replace(STYLE_TAG, (whole, attrs, css) => `<style${attrs}>${scopeCss(css, scope)}</style>`)
}
