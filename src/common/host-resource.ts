/**
 * 宿主自己的資源節點：同源的 <link>／<script>（打包器替下一頁動態掛進 <head> 的樣式表與模組），
 * 以及開發伺服器注入的 <style>。作者的程式碼產不出同源的資源（它的外鏈全在別的網域），
 * 所以這些永遠是宿主的——不論它們掛進來的時機落在誰的窗口裡、快照之前還是之後。
 *
 * 兩個「離場收乾淨」的機關都要問這一條（作者範圍 author-asset-scope、離場掃描 canvas-body-snapshot）：
 * 2026-09-15 社群站從卡片按返回回到榜單，榜單頁的樣式表被離場掃描當成卡片塞的東西拆掉、整頁無樣式；
 * 打包器記得「已載過」不會再掛，要整頁重新整理才救得回來。
 */
export function isHostResourceNode(node: Node | null | undefined, doc?: Document | null): boolean {
  if (!node || node.nodeType !== 1) return false
  const el = node as Element
  const tag = String(el.tagName || '').toUpperCase()
  if (tag === 'STYLE') return el.hasAttribute('data-vite-dev-id')
  if (tag !== 'LINK' && tag !== 'SCRIPT') return false
  const url = tag === 'LINK' ? el.getAttribute('href') : el.getAttribute('src')
  if (!url) return false
  const owner = doc || el.ownerDocument
  const base = owner && owner.location ? owner.location.href : ''
  if (!base) return false
  try {
    return new URL(url, base).origin === new URL(base).origin
  } catch {
    return false
  }
}
