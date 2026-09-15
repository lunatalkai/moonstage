/**
 * 作者樣式政策：卡片格式 → 它的 <style> 該怎麼落地。
 *
 * 這是唯一知道「某種格式意味著什麼」的地方。宿主頁（舊聊天頁）與沙箱殼都只拿政策來套，
 * 自己不判斷格式；之後要支援新的卡片平台，在這張表加一列就好，消費端不用改。
 *
 * ── 表 ──
 * - tavern：原平台會替訊息裡的 <style> 逐字接上訊息層前綴（`.mes_text `），作者寫
 *   `p{}`、`.title{}` 是安全的，寫 `body{}` 則從來沒生效過。這裡照做，卡在兩邊長得一樣。
 * - mmd：沒有這層改寫，卡片的 <style> 原樣生效——作者就是靠它換掉整頁的背景與輸入框。
 *   加前綴等於把那張卡的美化整套關掉。
 *
 * 格式不明時當 MMD（見 card-format）：猜錯的代價不對稱，猜成酒館會讓能用的卡變成不能用。
 */
import { type CardFormat, normalizeCardFormat } from './card-format'
import { scopeCss } from './author-style-scope'

export interface AuthorStylePolicy {
  /** 每條選擇器前面要接的作用域；null＝原樣生效。 */
  scope: string | null
}

/** 訊息層前綴。酒館用 `.mes_text `，我們兩個聊天頁的氣泡都掛著這個 class。 */
export const MESSAGE_SCOPE = '.mes_text'

const POLICIES: Record<CardFormat, AuthorStylePolicy> = {
  tavern: { scope: MESSAGE_SCOPE },
  mmd: { scope: null },
}

/** 接受原始字串（伺服器欄位）或已正規化的格式；不認得的當 MMD。 */
export function stylePolicyFor(format: CardFormat | string | null | undefined): AuthorStylePolicy {
  return POLICIES[normalizeCardFormat(format)]
}

/** 一段 CSS 依政策落地。 */
export function applyStylePolicy(css: string, policy: AuthorStylePolicy): string {
  const text = String(css == null ? '' : css)
  return policy.scope ? scopeCss(text, policy.scope) : text
}

const STYLE_TAG = /<style\b([^>]*)>([\s\S]*?)<\/style>/gi

/** 一段訊息 HTML 裡的每個 <style> 依政策落地；不需改寫的政策連掃描都不做。 */
export function applyStylePolicyToHtml(html: string, policy: AuthorStylePolicy): string {
  const text = String(html == null ? '' : html)
  if (!policy.scope || text.indexOf('<style') < 0) return text
  return text.replace(STYLE_TAG, (_whole, attrs: string, css: string) => `<style${attrs}>${scopeCss(css, policy.scope as string)}</style>`)
}
