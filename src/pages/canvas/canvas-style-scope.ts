/**
 * 舊聊天頁對「作者樣式政策」的薄封裝：只是把格式換成政策再套上去。
 * 政策表與作用域演算法在 src/common（沙箱殼也共用同一份），這裡不再自己判斷格式。
 */
export type { CardFormat } from '@/common/card-format'
export { normalizeCardFormat } from '@/common/card-format'
export { MESSAGE_SCOPE } from '@/common/author-style-policy'
export { scopeCss } from '@/common/author-style-scope'
import type { CardFormat } from '@/common/card-format'
import { applyStylePolicyToHtml, stylePolicyFor } from '@/common/author-style-policy'

/** 把一段訊息 HTML 裡的 <style> 依卡片格式的政策落地。 */
export function scopeCardHtml(html: string, format: CardFormat | string | null | undefined): string {
  return applyStylePolicyToHtml(html, stylePolicyFor(format))
}
