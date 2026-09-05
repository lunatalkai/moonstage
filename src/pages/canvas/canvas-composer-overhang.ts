/*
  輸入區「往上侵入捲動區」的量。

  MMD 卡常在畫面底部放自己的固定工具列，然後用腳本把我們的輸入區整塊往上推
  （實測某張 MMD 匯入卡：`.composer-scope` 被加了 `transform: translateY(-52px)`）。
  推是推上去了，但捲動區的高度沒有跟著縮——輸入區蓋住捲動區最底下的 52px，
  最後一則訊息的結尾永遠捲不出來（owner 2026-09-04 回報：行動端最底部沒有
  padding、內容被吃掉）。

  這裡不猜作者用的是 transform、relative 還是 margin：直接量輸入區畫出來的
  top 跟捲動區 bottom 的差，差多少就給對話欄多少底部內距。
*/
export type OverhangInput = {
  /** 捲動區（.scroll-view）畫出來的下緣 */
  scrollBottom: number
  /** 捲動區畫出來的高度；侵入量不可能比它還大 */
  scrollHeight: number
  /** 輸入區畫出來的上緣（含 transform） */
  composerTop: number
  /** 輸入區畫出來的高度；0 = 被藏起來，那就沒有侵入 */
  composerHeight: number
}

export function composerOverhang(input: OverhangInput): number {
  const { scrollBottom, scrollHeight, composerTop, composerHeight } = input
  if (!(composerHeight > 0) || !(scrollHeight > 0)) return 0
  const raw = scrollBottom - composerTop
  if (!(raw > 0)) return 0
  // 作者把輸入區整個丟到畫面上半部這種極端狀況不當侵入處理：
  // 那不是「蓋住底部」，補內距只會把對話欄撐出一大片空白。
  if (raw > scrollHeight / 2) return 0
  return Math.round(raw)
}
