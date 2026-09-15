/**
 * 替一段 CSS 的每條規則加上作用域前綴（純字串處理，沒有 DOM 依賴，宿主頁與沙箱殼共用）。
 *
 * 要不要加、加什麼，由 author-style-policy 決定；這裡只負責「怎麼加」。
 *
 * ── 前綴是逐字接上去的 ──
 * 酒館（SillyTavern `decodeStyleTags`）就是把 `.mes_text ` 逐字接在每條選擇器前面，
 * 所以酒館卡裡的 `body{}`、`body::before{}`、`html{}` 在原平台是死規則——作者在那邊
 * 從來沒看見它們生效過。這裡照做，讓同一張卡在兩邊長得一樣。
 * 曾經把 body/:root 對映到作用域本身（「作者是想改整則訊息」），實卡證明那是猜錯：
 * 一張卡的 `body::before{position:fixed;…}` 被對映成 `.mes_text::before` 之後，
 * 整個視口還是被它蓋住一圈漸層。
 *
 * ── 為什麼手寫掃描而不是丟給 CSSOM ──
 * CSSOM 會把它看不懂的規則整條丟掉，而卡片的 CSS 裡有大量瀏覽器前綴與新語法，
 * 丟掉的部分作者查不出去哪了。
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
    if (sel === scope || sel.startsWith(scope + ' ') || sel.startsWith(scope + '.')) return sel
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
