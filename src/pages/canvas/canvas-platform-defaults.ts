/**
 * 訊息渲染的平台預設，卡片規則之外的兩件事。起點是 MMD 的 chat-sandbox 在做的事
 * （owner 2026-09-06 懷疑「它有預設的注入」，在它頁面實例上跑樣本確認），但不照抄：
 *
 * - 它把 thinking／thought／Q 這類標籤連內容刪掉；我們折進「思考過程」摺疊框，
 *   在 utils/thinking-content.ts，不在這裡。
 * - 它順手清自己逆向 API 漏出來的計費警告、「<结束无效提示>」這類殘渣；owner 裁決
 *   開源前端不替逆向 API 收拾，不做。
 * - 它白名單以外的標籤一律拿掉標籤、留內文。這件事本身是對的（瀏覽器把 <思维链>
 *   這種非 ASCII 標籤名當文字印出來，酒館的 DOMPurify 也是丟標籤留內文），但它的
 *   名單窄到沒有 hr／u／code／blockquote，那是沒維護的消毒清單不是設計。這裡改成
 *   標準 HTML 元素全留，只剝非標準名字的標籤；不看卡片來源，對誰都安全。
 *
 * 另外 wrapDialogue：MMD 把引號裡的對白包成 <font color="#DC8333">，作者的美化靠這個
 * 上色。只能對純文字節點做——先前排在括號斜體之後，把 <span style="…"> 的屬性值當
 * 對白包了，畫面上就冒出 `"color: #C4B4A3;…">` 這種字（owner 2026-09-06 截圖）。
 */

/** 標準 HTML 元素（含已棄用但瀏覽器仍渲染的 font／center 等）加上 svg／MathML 根、酒館的 custom-style。 */
export const STANDARD_HTML_TAGS = new Set((
  'a abbr address area article aside audio b base bdi bdo blockquote body br button canvas caption center cite code col colgroup ' +
  'data datalist dd del details dfn dialog div dl dt em embed fieldset figcaption figure font footer form h1 h2 h3 h4 h5 h6 head header ' +
  'hgroup hr html i iframe img input ins kbd label legend li link main map mark marquee menu meta meter nav noscript object ol optgroup ' +
  'option output p param picture pre progress q rp rt ruby s samp script search section select slot small source span strike strong ' +
  'style sub summary sup table tbody td template textarea tfoot th thead time title tr track tt u ul var video wbr ' +
  'svg math custom-style user'
).split(' '))

const PROTECTED_BLOCK_RE = /<svg[\s\S]*?<\/svg>|<math[\s\S]*?<\/math>|<style(?:\s[^>]*)?>[\s\S]*?<\/style>|<script(?:\s[^>]*)?>[\s\S]*?<\/script>/gi

/**
 * 非標準名字的標籤（<思维链>、<status>、<AC_UI>…）拿掉標籤、留內文。
 * 名字含連字號的自訂元素（<my-widget>）不碰。svg／math／style／script 整段保護。
 * 要排在卡片規則之後：<AC_UI>、<功能按钮> 這些觸發標籤正是規則要吃的東西。
 */
export function stripUnknownTags(html: string): string {
  if (!html) return html
  const stash: string[] = []
  let out = html.replace(PROTECTED_BLOCK_RE, (m) => {
    stash.push(m)
    return '\x07' + (stash.length - 1) + '\x08'
  })
  out = out.replace(/<\/?([一-龥a-zA-Z0-9_]+)(\s+[^>]*)?\/?>/g, (m, name) => (STANDARD_HTML_TAGS.has(String(name).toLowerCase()) ? m : ''))
  out = out.replace(/\x07(\d+)\x08/g, (_m, idx) => stash[Number(idx)])
  return out
}

export const MMD_DIALOGUE_COLOR = '#DC8333'

/**
 * 只能餵純文字節點的內容：屬性裡的引號會被當成對白。
 * 半形引號到這裡已經被 markdown 轉成 &quot;（原站的對白多半就是半形引號），所以三種都認：
 * 半形、全形彎引號、&quot;。內文用 tempered 寫法擋住 &quot;，免得兩句對白被連成一句。
 */
export function wrapDialogue(text: string): string {
  if (!text) return text
  return text.replace(
    /((?:"|“|&quot;)(?:(?!&quot;)[^"“”\n<>]){1,400}(?:"|”|&quot;))/g,
    '<font color="' + MMD_DIALOGUE_COLOR + '">$1</font>',
  )
}
