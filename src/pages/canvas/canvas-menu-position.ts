/**
 * 訊息浮層落點。
 *
 * 兩種呼出方式共用同一份算法：手機長按給的是「手指按下的那一點」，桌機給的是
 * 「那顆 ⋯ 按鈕的框」。浮層要貼著呼出點出現，但永遠不能超出視窗——超出去的那
 * 半截就是玩家按不到的動作。
 *
 * 翻轉規則來自 DESIGN.md §3.4／主站 mobile 的 bubble box：先試偏好的那一側
 * （長按偏上、按鈕偏下），放不下就翻到另一側；兩側都放不下就貼著視窗邊緣塞進去。
 * 純函式、沒有 DOM：量測與套用由呼叫端負責，這裡只做幾何。
 */

export interface MenuPlacementInput {
  /** 呼出點的 x（視窗座標） */
  x: number
  /** 呼出點的 y（視窗座標）。給按鈕框時是框的上緣。 */
  y: number
  /** 呼出物的高度。長按是一個點，給 0；按鈕框給框高，浮層要跳過整顆按鈕。 */
  anchorHeight?: number
  menuWidth: number
  menuHeight: number
  viewportWidth: number
  viewportHeight: number
  /** 離視窗邊緣至少留多少 */
  margin?: number
  /** 浮層與呼出點之間留多少 */
  gap?: number
  /** 先試哪一側 */
  prefer?: 'above' | 'below'
  /** 水平對齊：以呼出點為中心、或以它為左緣／右緣 */
  align?: 'center' | 'start' | 'end'
}

export interface MenuPlacement {
  left: number
  top: number
  placement: 'above' | 'below'
}

export const MENU_EDGE_MARGIN = 8
export const MENU_ANCHOR_GAP = 8

function clamp(value: number, min: number, max: number): number {
  if (max < min) return min
  return Math.min(max, Math.max(min, value))
}

export function placeMessageMenu(input: MenuPlacementInput): MenuPlacement {
  const margin = input.margin == null ? MENU_EDGE_MARGIN : input.margin
  const gap = input.gap == null ? MENU_ANCHOR_GAP : input.gap
  const prefer = input.prefer || 'above'
  const align = input.align || 'center'
  const anchorHeight = Math.max(0, input.anchorHeight || 0)
  const menuW = Math.max(0, input.menuWidth)
  const menuH = Math.max(0, input.menuHeight)
  const vw = Math.max(0, input.viewportWidth)
  const vh = Math.max(0, input.viewportHeight)

  const aboveTop = input.y - gap - menuH
  const belowTop = input.y + anchorHeight + gap
  const fitsAbove = aboveTop >= margin
  const fitsBelow = belowTop + menuH <= vh - margin

  let placement: 'above' | 'below'
  let top: number
  if (prefer === 'above') {
    if (fitsAbove) { placement = 'above'; top = aboveTop }
    else if (fitsBelow) { placement = 'below'; top = belowTop }
    else { placement = 'above'; top = aboveTop }
  } else {
    if (fitsBelow) { placement = 'below'; top = belowTop }
    else if (fitsAbove) { placement = 'above'; top = aboveTop }
    else { placement = 'below'; top = belowTop }
  }
  // 兩側都放不下（浮層比剩餘空間還高）：貼邊塞進去，寧可蓋住呼出點也不能超出視窗。
  top = clamp(top, margin, vh - margin - menuH)

  let left: number
  if (align === 'start') left = input.x
  else if (align === 'end') left = input.x - menuW
  else left = input.x - menuW / 2
  left = clamp(left, margin, vw - margin - menuW)

  return { left: Math.round(left), top: Math.round(top), placement }
}

/** 從觸控／滑鼠事件取呼出點；沒有座標的事件回 null。 */
export function pointFromEvent(event: any): { x: number; y: number } | null {
  if (!event) return null
  if (event.touches && event.touches.length) return { x: event.touches[0].clientX, y: event.touches[0].clientY }
  if (event.changedTouches && event.changedTouches.length) {
    return { x: event.changedTouches[0].clientX, y: event.changedTouches[0].clientY }
  }
  if (typeof event.clientX === 'number') return { x: event.clientX, y: event.clientY }
  return null
}
