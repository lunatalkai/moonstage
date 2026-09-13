/**
 * 橫向 rail 在桌機也要拉得動。
 *
 * 觸控裝置的橫滑是原生的；桌機的滑鼠只有垂直滾輪，`overflow-x: auto` 的 rail 對它
 * 等於死的——「滑鼠拉不動，要用鍵盤」（用戶 2026-09-05 回報）。這裡補兩件事：
 *   1. 滑鼠按住拖：pointerdown 記起點，move 改 scrollLeft；拖超過 4px 就把放開時的
 *      那一下 click 吃掉，否則拖到某顆 chip 上放手會順便選到它。
 *   2. 垂直滾輪：rail 有橫向溢出時，把 deltaY 轉成 scrollLeft（觸控板本來就給 deltaX，
 *      不動它）。滾輪的單位照 deltaMode 換算：Firefox 給的是「行」，一格只有 3，
 *      不換算就是每格捲 3px，玩家的體感是「滾輪沒反應」（Windows 用戶 2026-09-13）。
 * 只管 pointerType 是 mouse 的那一種；觸控與筆照原生。
 *
 * 兩種掛法：
 *   - attachDragScroll(el)：掛在 rail 本身（輸入區的快捷列，節點常駐）。
 *   - attachDelegatedDragScroll(root, selector)：掛在外殼，事件冒泡上來再找最近的 rail。
 *     模型選單的 rail 是資料到了才長出來、換分頁又重畫的節點，逐個掛會掛在已經不在
 *     畫面上的那一批；掛在殼上就不用管節點的生滅。
 */

export const DRAG_SCROLL_THRESHOLD_PX = 4

/** deltaMode 是「行」時一行當多少像素；瀏覽器的預設行高附近。 */
export const WHEEL_LINE_PX = 16

export interface DragScrollHandle {
  detach: () => void
}

/** 把滾輪的 deltaY 換成像素（deltaMode 0＝像素、1＝行、2＝頁）。 */
export function wheelDeltaPx(e: WheelEvent, pageWidth: number): number {
  const mode = (e as any).deltaMode ?? 0
  if (mode === 1) return e.deltaY * WHEEL_LINE_PX
  if (mode === 2) return e.deltaY * Math.max(pageWidth, 1)
  return e.deltaY
}

function scrollable(el: HTMLElement): boolean {
  return el.scrollWidth > el.clientWidth
}

function handleWheel(el: HTMLElement, e: WheelEvent) {
  if (!scrollable(el)) return
  if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) return
  if (!e.deltaY) return
  const before = el.scrollLeft
  el.scrollLeft = before + wheelDeltaPx(e, el.clientWidth)
  if (el.scrollLeft !== before) e.preventDefault()
}

interface DragState {
  el: HTMLElement | null
  pressed: boolean
  dragged: boolean
  startX: number
  startLeft: number
}

function makeDragHandlers(resolve: (target: EventTarget | null) => HTMLElement | null) {
  const s: DragState = { el: null, pressed: false, dragged: false, startX: 0, startLeft: 0 }
  const onPointerDown = (e: PointerEvent) => {
    if (e.pointerType && e.pointerType !== 'mouse') return
    if (e.button !== 0) return
    const el = resolve(e.target)
    if (!el || !scrollable(el)) return
    s.el = el
    s.pressed = true
    s.dragged = false
    s.startX = e.clientX
    s.startLeft = el.scrollLeft
  }
  const onPointerMove = (e: PointerEvent) => {
    if (!s.pressed || !s.el) return
    const dx = e.clientX - s.startX
    if (!s.dragged && Math.abs(dx) > DRAG_SCROLL_THRESHOLD_PX) s.dragged = true
    if (s.dragged) {
      s.el.scrollLeft = s.startLeft - dx
      e.preventDefault()
    }
  }
  const onPointerUp = () => { s.pressed = false }
  // 拖過就把這一次 click 吃掉（capture 階段，先於 chip 自己的 click）。
  const onClickCapture = (e: MouseEvent) => {
    if (!s.dragged) return
    s.dragged = false
    e.stopPropagation()
    e.preventDefault()
  }
  const onWheel = (e: WheelEvent) => {
    const el = resolve(e.target)
    if (el) handleWheel(el, e)
  }
  return { onPointerDown, onPointerMove, onPointerUp, onClickCapture, onWheel }
}

function bind(target: HTMLElement, h: ReturnType<typeof makeDragHandlers>): () => void {
  target.addEventListener('pointerdown', h.onPointerDown)
  target.addEventListener('pointermove', h.onPointerMove)
  target.addEventListener('pointerup', h.onPointerUp)
  target.addEventListener('pointercancel', h.onPointerUp)
  target.addEventListener('pointerleave', h.onPointerUp)
  target.addEventListener('click', h.onClickCapture, true)
  target.addEventListener('wheel', h.onWheel, { passive: false })
  return () => {
    target.removeEventListener('pointerdown', h.onPointerDown)
    target.removeEventListener('pointermove', h.onPointerMove)
    target.removeEventListener('pointerup', h.onPointerUp)
    target.removeEventListener('pointercancel', h.onPointerUp)
    target.removeEventListener('pointerleave', h.onPointerUp)
    target.removeEventListener('click', h.onClickCapture, true)
    target.removeEventListener('wheel', h.onWheel)
  }
}

export function attachDragScroll(el: HTMLElement): DragScrollHandle {
  const detach = bind(el, makeDragHandlers(() => el))
  el.style.cursor = el.style.cursor || 'grab'
  return { detach }
}

/** 掛在外殼上：事件從裡面的 rail 冒上來，找最近的 selector 節點處理。rail 之後才長出來也一樣管用。 */
export function attachDelegatedDragScroll(root: HTMLElement | null | undefined, selector: string): DragScrollHandle {
  if (!root) return { detach() {} }
  const resolve = (target: EventTarget | null): HTMLElement | null => {
    const node = target instanceof Element ? target : null
    const el = node?.closest?.(selector) as HTMLElement | null
    return el && root.contains(el) ? el : null
  }
  const detach = bind(root, makeDragHandlers(resolve))
  return { detach }
}

export function attachDragScrollAll(root: ParentNode | null | undefined, selector: string): () => void {
  if (!root) return () => {}
  const handles = [...(root as ParentNode).querySelectorAll<HTMLElement>(selector)].map(attachDragScroll)
  return () => { for (const h of handles) h.detach() }
}
