/**
 * 訊息裡的 <script> / <style> 要真的生效。
 *
 * v-html 依規範不執行 script（style 會生效，但 script 只是躺在 DOM 裡）。作者卡的開局選項、
 * 面板按鈕多半是 `onclick="fn(this)"`，而 fn 就定義在同一則訊息的 <script> 裡——script 沒跑，
 * 按下去就是 `fn is not defined`，作者只看到「點了沒反應」。
 *
 * 判斷「這則要不要抬 script」看的是**渲染結果**，不是原文：作者卡的開場白常是純文字加一個
 * 標記（`【开局选项】`），原文一個 `<` 都沒有，經顯示規則展開後才變成整塊 HTML。
 * 2026-09-06 一張真實卡就是這樣被漏掉的（原本只在「原文已是 HTML」那條路才抬）。
 */

const ASSET_TAG = /<(script|style)\b/i

/** 渲染結果裡有 script 或 style 才值得排一次抬升。 */
export function hasMessageAssets(renderedHtml: string): boolean {
  return ASSET_TAG.test(String(renderedHtml || ''))
}

/**
 * 只在訊息完成後抬一次：串流中每個 chunk 都抬會跑到寫一半的腳本，同一段也會被塞進 head 幾十次。
 * 渲染函式對同一個結果只算一次，所以這裡回 true 的次數也只有一次。
 */
export function shouldHoistMessageAssets(item: { chatFinish?: boolean } | null | undefined, renderedHtml: string): boolean {
  return !!(item && item.chatFinish) && hasMessageAssets(renderedHtml)
}

/**
 * 把一則訊息容器裡的 <script> / <style> 逐個複製成新節點掛到 head——新建的 script 節點才會執行。
 * 單一腳本拋錯不影響其餘（瀏覽器對 script 節點的錯誤本來就各自獨立）。
 */
export function runMessageAssets(messageEl: Element | null, doc: Document = document): { scripts: number; styles: number } {
  const out = { scripts: 0, styles: 0 }
  if (!messageEl || !doc || !doc.head) return out
  messageEl.querySelectorAll('script').forEach((tag) => {
    const fresh = doc.createElement('script')
    for (const attr of Array.from(tag.attributes)) fresh.setAttribute(attr.name, attr.value)
    fresh.textContent = tag.textContent
    doc.head.appendChild(fresh)
    out.scripts++
  })
  messageEl.querySelectorAll('style').forEach((tag) => {
    const fresh = doc.createElement('style')
    for (const attr of Array.from(tag.attributes)) fresh.setAttribute(attr.name, attr.value)
    fresh.textContent = tag.textContent
    doc.head.appendChild(fresh)
    out.styles++
  })
  return out
}
