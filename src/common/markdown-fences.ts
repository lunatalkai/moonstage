/**
 * Markdown 程式碼圍欄裡的東西是字面文字，不是活的 HTML。
 *
 * 訊息在進 markdown 之前會經過好幾道「看到 <style>／<script> 就動手」的處理（抽成全頁樣式、
 * 加作用域前綴、先藏起來免得被 markdown 咬）。這些處理一旦掃進圍欄裡，就把作者放在圍欄裡
 * 的整份 HTML 文件拆散了——圍欄裡的 <style> 被抽走、被加前綴、或變成一個還原不回來的佔位符
 * （2026-09-15 實卡：信紙的 <style> 不見、程式碼區塊裡冒出一個孤零零的「0」）。
 *
 * 規矩只有一條：要改訊息文字的處理，一律用這個包一層，圍欄裡的原樣不動。
 * 沒收尾的圍欄（串流中、或模型忘了關）算到字串結尾——markdown 也是這樣看它的。
 */
const FENCE_RE = /(^|\n)(`{3,}|~{3,})[^\n]*\n[\s\S]*?(?:\n[ \t]*\2[ \t]*(?=\n|$)|$)/g
const HOLE_RE = /\uE010(\d+)\uE011/g

/** 把 `transform` 套在圍欄以外的文字上；圍欄本身原樣放回。 */
export function withFencesProtected(text: string, transform: (outside: string) => string): string {
  const source = String(text == null ? '' : text)
  if (source.indexOf('```') < 0 && source.indexOf('~~~') < 0) return transform(source)
  const holes: string[] = []
  const punched = source.replace(FENCE_RE, (whole, lead: string) => {
    holes.push(whole.slice(lead.length))
    return `${lead}\uE010${holes.length - 1}\uE011`
  })
  return transform(punched).replace(HOLE_RE, (_m, i: string) => holes[Number(i)])
}
