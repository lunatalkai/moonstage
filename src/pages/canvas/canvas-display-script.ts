/**
 * 顯示字形轉換（簡↔繁）——只轉玩家眼睛看到的字。
 *
 * ── 為什麼在這裡、而不是伺服器 ──
 * 酒館／MMD 卡帶自己的協定：正則的觸發詞、<zzhud> 之類機讀區塊的鍵，作者都寫死成
 * 一種字形。伺服器在傳輸層整段轉換會把這些一起轉掉（2026-09-04 BA 卡的 schema 診斷：
 * 「忽略未知键『穿著』」），卡片就拒收。所以：
 *   儲存與傳輸永遠是原文；轉換排在卡片正則之後、只碰 HTML 的文字節點。
 *
 * ── 跳過什麼 ──
 *   - 機讀區塊：渲染管線先把 display:none 的資料 span 整段 stash 成 \x05N\x06 佔位符，
 *     這裡看到的只是佔位符，原文在最後一步才還原——天然不會被轉。
 *   - <script>/<style>/<code>/<pre>/<textarea>/<template>：不是給人讀的字。
 *   - 作者標了 translate="no"、class="notranslate" 或 data-lt-verbatim 的子樹：
 *     作者知道他的腳本會回頭讀那段字。
 *   - 屬性、class、id：永遠不碰——卡片 CSS／JS 靠它們。
 *
 * ── 轉換器本身 ──
 * 沿用主站聊天頁原本那套（fui.tify）：先判斷整段是不是簡體（TradOrSimp），
 * 單字落在「一簡對多繁」字表就不動，才交給 OpenCC cn→tw；反向對稱。
 * 那套比裸 OpenCC 穩：混排、已是繁體、人名裡的多義字都不會被誤轉。
 */
import * as OpenCC from 'opencc-js'
import TradOrSimp from '@/common/TradOrSimp'
import { isAmbiguousChar } from '@/common/ambiguous-chars'

export type ScriptDirection = 'none' | 's2t' | 't2s'

/** 玩家介面語言決定方向：正體看簡體卡→轉繁；簡體看繁體卡→轉簡；其他語言不動。 */
export function directionForLocale(locale: string | null | undefined): ScriptDirection {
  const l = String(locale || '').toLowerCase()
  if (l === 'zh-hant' || l.startsWith('zh-tw') || l.startsWith('zh-hk')) return 's2t'
  if (l === 'zh-hans' || l === 'zh-cn' || l === 'zh') return 't2s'
  return 'none'
}

const SKIP_TAGS = new Set(['SCRIPT', 'STYLE', 'CODE', 'PRE', 'TEXTAREA', 'TEMPLATE', 'KBD', 'SAMP'])
const HAS_CJK = /[㐀-䶿一-鿿豈-﫿]/

function isVerbatimElement(el: Element): boolean {
  const translate = (el.getAttribute('translate') || '').toLowerCase()
  if (translate === 'no') return true
  if (el.hasAttribute('data-lt-verbatim')) return true
  if (el.classList && el.classList.contains('notranslate')) return true
  return false
}

/**
 * 逐文字節點轉換一段 HTML。converter 只收純文字、回純文字。
 * 沒有 DOM（非瀏覽器）就原樣回：這一步是顯示層的加工，不是正確性。
 */
export function convertVisibleHtml(html: string, convert: (text: string) => string): string {
  if (!html || typeof DOMParser === 'undefined') return html
  if (!HAS_CJK.test(html)) return html
  const doc = new DOMParser().parseFromString('<body>' + html + '</body>', 'text/html')
  const body = doc.body
  if (!body) return html
  const walk = (node: Node) => {
    if (node.nodeType === 3) {
      const text = node.nodeValue || ''
      if (HAS_CJK.test(text)) node.nodeValue = convert(text)
      return
    }
    if (node.nodeType !== 1) return
    const el = node as Element
    if (SKIP_TAGS.has(el.tagName) || isVerbatimElement(el)) return
    for (let child = el.firstChild; child; child = child.nextSibling) walk(child)
  }
  walk(body)
  return body.innerHTML
}

/** 純文字（開場選項、角色名、介紹）走同一個出口。 */
export function convertPlainText(text: string, convert: (text: string) => string): string {
  if (!text || !HAS_CJK.test(text)) return text
  return convert(text)
}

const MEMO_LIMIT = 400

/**
 * 依方向建轉換器；同一段字重複轉會很多次（串流每個 chunk 都重畫），所以帶個小記憶。
 * OpenCC 的 Converter 建一次就好——它初始化要載字典。
 */
export function createDisplayScriptConverter(direction: ScriptDirection): (text: string) => string {
  if (direction === 'none') return (text) => text
  const converter = direction === 's2t'
    ? OpenCC.Converter({ from: 'cn', to: 'tw' })
    : OpenCC.Converter({ from: 'tw', to: 'cn' })
  const memo = new Map<string, string>()
  return (text: string) => {
    if (!text) return text
    const hit = memo.get(text)
    if (hit !== undefined) return hit
    let out = text
    // 守門與主站 fui.tify、server Tify 同一條：明確是來源字形才轉，看不出來就不碰。
    // 這裡轉的是「文字節點」，常常只有兩三個字（人名、HUD 標籤、一個 <b> 裡的詞），
    // 沒有上下文可用。2026-09-04 曾改成「不是明確繁體就轉」想救「他只有一只手」這類
    // 整句同形句，上線探測發現代價是繁體節點被詞庫的台灣預設改字（台北→臺北、
    // 周末→週末、了解→瞭解、阿里→阿裡），已回退；同形整句本來就少見。
    // 單字＋一簡對多繁 → 不動（沒有上下文，誰也判不了）。
    if (direction === 's2t') {
      if (!(text.length === 1 && isAmbiguousChar(text)) && TradOrSimp.isSimplified(text)) out = converter(text)
    } else if (TradOrSimp.isTraditional(text)) {
      out = converter(text)
    }
    if (memo.size >= MEMO_LIMIT) memo.clear()
    memo.set(text, out)
    return out
  }
}
