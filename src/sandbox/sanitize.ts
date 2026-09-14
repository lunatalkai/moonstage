/**
 * 作者 HTML 的淨化。兩道閘，跟原站同形，作者的卡才能原樣搬過來：
 *
 *   1. 標籤白名單（正則剝殼）：不在名單裡的標籤只刪標籤、文字保留。字元類含漢字，
 *      所以 `<状态>…</状态>` 這種中文尖括號標記也會被剝掉——模型側的協議標記要用方括號。
 *      反引號裡的東西（`` `…` `` 與 ``` 圍欄）先保護起來，剝完再放回，作者才能「展示」HTML 原始碼。
 *   2. DOM 掃描：`iframe`／`link`／`meta`／`base`／`form`／`object`／`embed` 剝殼留子節點；
 *      `script`／`style` 整個拿掉（它們在裝卡時已被抽出去單獨生效，訊息裡再出現不跑）；
 *      作者的 `data-*`／`aria-*`／`role` 屬性刪；`svg` 子樹裡的 `on*` 刪；`javascript:` 網址刪；
 *      屬性值含 `]>`／`-->` 或 `</script` 之類閉合串的整條屬性刪。
 *
 * 一般 HTML 元素上的 `on*`（onclick、onmouseenter…）**保留**：作者的互動按鈕就靠它們，
 * 這是功能不是漏洞（docs/trust-model.md）。真正的邊界是殼所在的跨源 iframe 與它的 CSP。
 */

export const ALLOWED_TAGS = new Set([
  'p', 'b', 'a', 'div', 'span', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'ul', 'li', 'ol', 'strong', 'em', 'br', 'img',
  'pre', 'font', 'i', 'button', 'table', 'th', 'tr', 'td', 'input', 'textarea', 'label', 'select', 'option', 'video',
  'script', 'user', 'summary', 'details', 'code', 'blockquote', 'hr', 'del', 'thead', 'tbody', 's', 'style',
  'svg', 'g', 'path', 'circle', 'ellipse', 'rect', 'line', 'polyline', 'polygon', 'text', 'tspan', 'defs', 'use',
  'linearGradient', 'radialGradient', 'stop', 'clipPath', 'title',
  // 原站名單以外、但無害且常見的：作者的卡搬過來時不該因為它們掉字。
  'audio', 'source', 'small', 'sub', 'sup', 'u', 'mark', 'caption', 'tfoot', 'progress', 'meter', 'canvas',
])

/** 剝殼留子節點。 */
const UNWRAP_TAGS = new Set(['iframe', 'link', 'meta', 'base', 'form', 'object', 'embed', 'noscript', 'template'])
/** 連內容一起拿掉。 */
const DROP_TAGS = new Set(['script', 'style'])

const TAG_RE = /<\/?([一-龥a-zA-Z0-9_-]+)(\s+[^>]*)?\s*\/?>/g
const UNSAFE_ATTR_VALUE = /((--!?|])>)|<\/(style|script|title|xmp|textarea|noscript|iframe|noembed|noframes)/i
const URL_ATTRS = ['href', 'src', 'xlink:href', 'action', 'formaction', 'poster']

const allowedLower = new Set(Array.from(ALLOWED_TAGS, (t) => t.toLowerCase()))

/** 第一道：剝掉不在白名單裡的標籤（含中文尖括號標籤），文字保留。反引號區段不動。 */
export function stripUnknownTags(html: string): string {
  const protectedChunks: string[] = []
  // 佔位用私用區字元包住序號，不會跟作者的文字撞上。
  const protect = (m: string) => {
    protectedChunks.push(m)
    return `\uE000${protectedChunks.length - 1}\uE001`
  }
  let out = html.replace(/```[\s\S]*?```/g, protect).replace(/`[^`\n]*`/g, protect)
  out = out.replace(TAG_RE, (whole, name: string) => (allowedLower.has(name.toLowerCase()) ? whole : ''))
  return out.replace(/\uE000(\d+)\uE001/g, (_m, i) => protectedChunks[Number(i)])
}

function scrubAttributes(el: Element, insideSvg: boolean) {
  for (const attr of Array.from(el.attributes)) {
    const name = attr.name.toLowerCase()
    const value = attr.value
    if (name.startsWith('data-') || name.startsWith('aria-') || name === 'role') { el.removeAttribute(attr.name); continue }
    if (UNSAFE_ATTR_VALUE.test(value)) { el.removeAttribute(attr.name); continue }
    if (/^on[a-z]+$/.test(name) && insideSvg) { el.removeAttribute(attr.name); continue }
    if (URL_ATTRS.includes(name) && /^\s*(javascript|vbscript|data:text\/html)/i.test(value)) { el.removeAttribute(attr.name); continue }
  }
}

function scrubTree(root: Element, insideSvg: boolean) {
  for (const child of Array.from(root.children)) {
    const tag = child.tagName.toLowerCase()
    if (DROP_TAGS.has(tag)) { child.remove(); continue }
    if (UNWRAP_TAGS.has(tag)) {
      const frag = child.ownerDocument.createDocumentFragment()
      while (child.firstChild) frag.appendChild(child.firstChild)
      child.replaceWith(frag)
      // 剛拉上來的子節點還沒掃，重掃這一層。
      scrubTree(root, insideSvg)
      return
    }
    const svg = insideSvg || tag === 'svg'
    scrubAttributes(child, svg)
    scrubTree(child, svg)
  }
}

/** 第二道：DOM 掃描。回傳可直接 innerHTML 的字串。 */
export function sanitizeDom(html: string, doc: Document = document): string {
  const tpl = doc.createElement('template')
  tpl.innerHTML = html
  const holder = doc.createElement('div')
  holder.appendChild(tpl.content)
  scrubTree(holder, false)
  return holder.innerHTML
}

export function sanitizeAuthorHtml(html: string, doc: Document = document): string {
  return sanitizeDom(stripUnknownTags(String(html == null ? '' : html)), doc)
}
