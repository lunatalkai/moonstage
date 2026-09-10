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
  /** 進頁面時 <html>／<body>／<head> 已經有的直接子節點。離開時不在這裡面的就是後來塞進來的。 */
  rootChildren: Set<Node>
  bodyChildren: Set<Node>
  headChildren: Set<Node>
}

export function captureBodySnapshot(doc: Document | null | undefined): BodySnapshot | null {
  if (!doc || !doc.body || !doc.documentElement) return null
  return {
    bodyClass: doc.body.className || '',
    bodyStyle: doc.body.style.cssText || '',
    rootClass: doc.documentElement.className || '',
    rootStyle: doc.documentElement.style.cssText || '',
    rootChildren: new Set(Array.from(doc.documentElement.childNodes)),
    bodyChildren: new Set(Array.from(doc.body.childNodes)),
    headChildren: new Set(doc.head ? Array.from(doc.head.childNodes) : []),
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

/**
 * 掃掉卡片留在頁面上的節點。
 *
 * 作者範圍（author-asset-scope）會把「在作者程式碼的視窗裡」新增的節點記下來、離開時移除。
 * 但它記不到的路徑一直存在：Promise 回呼、MutationObserver／ResizeObserver 回呼、
 * 從別的事件鏈冒出來的 appendChild——卡片在那些地方往 body 塞的浮層，退出頁面後照樣留著
 * （owner 2026-09-07：從試玩頁回到首頁，卡片的側邊欄與頭像氣泡還在）。
 *
 * 所以最後再用一個不看「是誰加的」、只看「進頁面時在不在」的掃法兜底：<html>／<body> 的直接
 * 子節點，進頁面時不在、現在在，就不是頁面本來的東西——除了裝著 App 本身的那棵（宿主的根節點）
 * 和 Vue 自己管的節點（Teleport 出去的彈層，Vue 卸載時會自己收，我們先動手它會摔）。
 * <head> 只掃樣式：卡片塞進去的 <style>／<link rel=stylesheet> 會把 body 級的規則帶到別的頁面；
 * 建置工具在開發模式注入的樣式（data-vite-dev-id）不碰。
 *
 * 時機：要在 Vue 把子元件都卸載之後（onUnmounted），不是 onBeforeUnmount。
 */
export interface SweepResult { removed: number; kept: number }

function isVueManaged(node: Node): boolean {
  const el = node as any
  return !!(el && (el.__vueParentComponent || el.__vnode))
}

function holdsAppRoot(node: Node, appRoots: Element[]): boolean {
  for (const root of appRoots) if (node === root || node.contains(root)) return true
  return false
}

export function sweepForeignNodes(doc: Document | null | undefined, snapshot: BodySnapshot | null): SweepResult {
  const result: SweepResult = { removed: 0, kept: 0 }
  if (!doc || !doc.body || !doc.documentElement || !snapshot || !snapshot.bodyChildren) return result
  const appRoots = Array.from(doc.querySelectorAll('#app, uni-app, [data-moonstage-host]'))
  const sweep = (parent: Node, known: Set<Node>, accept: (n: Node) => boolean) => {
    for (const node of Array.from(parent.childNodes)) {
      if (known.has(node)) continue
      if (!accept(node) || holdsAppRoot(node, appRoots) || isVueManaged(node)) { result.kept += 1; continue }
      try { parent.removeChild(node) } catch (e) { result.kept += 1; continue }
      result.removed += 1
    }
  }
  sweep(doc.body, snapshot.bodyChildren, (n) => n.nodeType === 1 && (n as Element).tagName !== 'SCRIPT' && (n as Element).tagName !== 'NOSCRIPT')
  sweep(doc.documentElement, snapshot.rootChildren, (n) => n.nodeType === 1 && n !== doc.head && n !== doc.body)
  if (doc.head) {
    sweep(doc.head, snapshot.headChildren, (n) => {
      if (n.nodeType !== 1) return false
      const el = n as Element
      if (el.hasAttribute('data-vite-dev-id') || el.hasAttribute('data-stage-keep')) return false
      return el.tagName === 'STYLE' || (el.tagName === 'LINK' && (el.getAttribute('rel') || '').toLowerCase() === 'stylesheet')
    })
  }
  return result
}
