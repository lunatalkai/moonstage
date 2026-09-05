/**
 * 橫向 rail 在桌機也要拉得動。
 *
 * 觸控裝置的橫滑是原生的；桌機的滑鼠只有垂直滾輪，`overflow-x: auto` 的 rail 對它
 * 等於死的——「滑鼠拉不動，要用鍵盤」（用戶 2026-09-05 回報）。這裡補兩件事：
 *   1. 滑鼠按住拖：pointerdown 記起點，move 改 scrollLeft；拖超過 4px 就把放開時的
 *      那一下 click 吃掉，否則拖到某顆 chip 上放手會順便選到它。
 *   2. 垂直滾輪：rail 有橫向溢出時，把 deltaY 轉成 scrollLeft（觸控板本來就給 deltaX，
 *      不動它）。
 * 只管 pointerType 是 mouse 的那一種；觸控與筆照原生。
 */

export const DRAG_SCROLL_THRESHOLD_PX = 4

export interface DragScrollHandle {
  detach: () => void
}

export function attachDragScroll(el: HTMLElement): DragScrollHandle {
  let pressed = false
  let dragged = false
  let startX = 0
  let startLeft = 0

  const onPointerDown = (e: PointerEvent) => {
    if (e.pointerType && e.pointerType !== 'mouse') return
    if (e.button !== 0) return
    if (el.scrollWidth <= el.clientWidth) return
    pressed = true
    dragged = false
    startX = e.clientX
    startLeft = el.scrollLeft
  }
  const onPointerMove = (e: PointerEvent) => {
    if (!pressed) return
    const dx = e.clientX - startX
    if (!dragged && Math.abs(dx) > DRAG_SCROLL_THRESHOLD_PX) dragged = true
    if (dragged) {
      el.scrollLeft = startLeft - dx
      e.preventDefault()
    }
  }
  const onPointerUp = () => { pressed = false }
  // 拖過就把這一次 click 吃掉（capture 階段，先於 chip 自己的 click）。
  const onClickCapture = (e: MouseEvent) => {
    if (!dragged) return
    dragged = false
    e.stopPropagation()
    e.preventDefault()
  }
  const onWheel = (e: WheelEvent) => {
    if (el.scrollWidth <= el.clientWidth) return
    if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) return
    if (!e.deltaY) return
    const before = el.scrollLeft
    el.scrollLeft = before + e.deltaY
    if (el.scrollLeft !== before) e.preventDefault()
  }

  el.addEventListener('pointerdown', onPointerDown)
  el.addEventListener('pointermove', onPointerMove)
  el.addEventListener('pointerup', onPointerUp)
  el.addEventListener('pointercancel', onPointerUp)
  el.addEventListener('pointerleave', onPointerUp)
  el.addEventListener('click', onClickCapture, true)
  el.addEventListener('wheel', onWheel, { passive: false })
  el.style.cursor = el.style.cursor || 'grab'

  return {
    detach() {
      el.removeEventListener('pointerdown', onPointerDown)
      el.removeEventListener('pointermove', onPointerMove)
      el.removeEventListener('pointerup', onPointerUp)
      el.removeEventListener('pointercancel', onPointerUp)
      el.removeEventListener('pointerleave', onPointerUp)
      el.removeEventListener('click', onClickCapture, true)
      el.removeEventListener('wheel', onWheel)
    },
  }
}

/** 把一個容器底下所有符合選擇器的 rail 都掛上；回傳一次拆光的函式。 */
export function attachDragScrollAll(root: ParentNode | null | undefined, selector: string): () => void {
  if (!root || typeof (root as any).querySelectorAll !== 'function') return () => {}
  const handles = [...(root as ParentNode).querySelectorAll<HTMLElement>(selector)].map(attachDragScroll)
  return () => { for (const h of handles) h.detach() }
}
