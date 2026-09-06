/**
 * 卡片格式：這張卡是用哪一邊的寫法寫的。決定 CSS 要不要加作用域前綴（酒館的卡在原平台
 * 有沙盒，MMD 的卡靠無前綴的 <style> 換整頁）、盒模型等相容行為。
 *
 * 叫「格式」不叫「來源」（owner 2026-09-06）：卡從 MMD 格式匯進來之後就是我們的卡，
 * 它帶著的是格式，不是出身。
 */
export type CardFormat = 'mmd' | 'tavern'

/** 沒宣告時當 MMD——目前匯進來的多半是那一邊的，猜錯的代價也不對稱。 */
export function normalizeCardFormat(raw: any): CardFormat {
  const value = typeof raw === 'string' ? raw.trim().toLowerCase() : ''
  if (value === 'tavern' || value === 'sillytavern' || value === 'st') return 'tavern'
  return 'mmd'
}
