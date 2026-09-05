/**
 * 進出畫布時 <body> / <html> 的還原點。
 *
 * 卡片沒有沙盒——它會往 body 加自己的主題 class（示範卡的腳本第一件事就是
 * `document.body.className = InitBodyClass + ' kg'`），也會往 documentElement 加
 * 狀態 class。那些 class 掛著卡片的 !important 規則；離開對話頁不收乾淨的話，
 * 玩家帶著上一張卡的美化走到別的頁面去。
 *
 * 為什麼是快照還原而不是「移除已知的 class」：我們不知道卡片會加什麼。
 * 進來時記下當時的樣子，離開時放回去，就不必列舉。
 *
 * 時機很重要：快照要在**卡片有機會動手之前**取。卡片的腳本是第一則訊息渲染
 * 出來才跑的，所以進頁面（onLoad / setup）就取，不能等 onMounted 之後。
 */

export interface BodySnapshot {
  bodyClass: string
  bodyStyle: string
  rootClass: string
  rootStyle: string
}

export function captureBodySnapshot(doc: Document | null | undefined): BodySnapshot | null {
  if (!doc || !doc.body || !doc.documentElement) return null
  return {
    bodyClass: doc.body.className || '',
    bodyStyle: doc.body.style.cssText || '',
    rootClass: doc.documentElement.className || '',
    rootStyle: doc.documentElement.style.cssText || '',
  }
}

export function restoreBodySnapshot(doc: Document | null | undefined, snapshot: BodySnapshot | null): boolean {
  if (!doc || !doc.body || !doc.documentElement || !snapshot) return false
  doc.body.className = snapshot.bodyClass
  doc.body.style.cssText = snapshot.bodyStyle
  doc.documentElement.className = snapshot.rootClass
  doc.documentElement.style.cssText = snapshot.rootStyle
  return true
}
