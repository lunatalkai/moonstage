/**
 * 長按判定。
 *
 * 酒館兩端是同一份 DOM、沒有長按；MMD 的訊息動作是覆蓋層，靠長按呼出。
 * 玩家的手習慣來自後者，所以觸控裝置走長按，指標裝置走懸停 + 三個點。
 *
 * 取值來自 DESIGN.md §3.4：450ms、拖動超過 8px 取消、觸發時震一下 10ms。
 * 這三個數字不要憑感覺改——它們是跟頁面其他長按（角色卡、榜單）對齊過的。
 */

export const LONG_PRESS_MS = 450
export const LONG_PRESS_CANCEL_PX = 8
export const LONG_PRESS_VIBRATE_MS = 10

export interface LongPressHandle {
  start: (event: TouchEvent | PointerEvent | MouseEvent) => void
  move: (event: TouchEvent | PointerEvent | MouseEvent) => void
  end: () => void
  cancel: () => void
  /** 這一次觸控最後有沒有變成長按。用來擋掉「長按完手指抬起又觸發一次點擊」。 */
  consumed: () => boolean
}

export interface LongPressPoint {
  x: number
  y: number
}

interface LongPressOptions {
  /** 觸發時把按下的那一點交出去：浮層要開在手指所在的位置，不是畫面中央。 */
  onTrigger: (point: LongPressPoint | null) => void
  delayMs?: number
  cancelPx?: number
  vibrate?: (ms: number) => void
  setTimer?: (fn: () => void, ms: number) => any
  clearTimer?: (handle: any) => void
}

function pointOf(event: any): { x: number; y: number } | null {
  if (!event) return null
  if (event.touches && event.touches.length) return { x: event.touches[0].clientX, y: event.touches[0].clientY }
  if (event.changedTouches && event.changedTouches.length) {
    return { x: event.changedTouches[0].clientX, y: event.changedTouches[0].clientY }
  }
  if (typeof event.clientX === 'number') return { x: event.clientX, y: event.clientY }
  return null
}

function defaultVibrate(ms: number) {
  try {
    const nav: any = typeof navigator === 'undefined' ? null : navigator
    if (nav && typeof nav.vibrate === 'function') nav.vibrate(ms)
  } catch (e) {
    // 有些瀏覽器在非使用者手勢期間呼叫會丟例外。震不了不該影響選單彈出。
  }
}

export function createLongPress(options: LongPressOptions): LongPressHandle {
  const delayMs = options.delayMs == null ? LONG_PRESS_MS : options.delayMs
  const cancelPx = options.cancelPx == null ? LONG_PRESS_CANCEL_PX : options.cancelPx
  const vibrate = options.vibrate || defaultVibrate
  const setTimer = options.setTimer || ((fn: () => void, ms: number) => setTimeout(fn, ms))
  const clearTimer = options.clearTimer || ((handle: any) => clearTimeout(handle))

  let timer: any = null
  let origin: { x: number; y: number } | null = null
  let fired = false

  function cancel() {
    if (timer != null) clearTimer(timer)
    timer = null
    origin = null
  }

  return {
    start(event) {
      cancel()
      fired = false
      origin = pointOf(event)
      const pressedAt = origin
      timer = setTimer(() => {
        timer = null
        fired = true
        // 震動在部分瀏覽器（非使用者手勢期間、或使用者關掉了）會拋例外。
        // 那不該把選單一起帶走——觸覺回饋是加分，選單是功能本身。
        try {
          vibrate(LONG_PRESS_VIBRATE_MS)
        } catch (e) { /* 震不了就算了 */ }
        options.onTrigger(pressedAt ? { x: pressedAt.x, y: pressedAt.y } : null)
      }, delayMs)
    },
    move(event) {
      if (timer == null || !origin) return
      const point = pointOf(event)
      if (!point) return
      const dx = point.x - origin.x
      const dy = point.y - origin.y
      if (Math.sqrt(dx * dx + dy * dy) > cancelPx) cancel()
    },
    end() {
      cancel()
    },
    cancel,
    consumed() {
      return fired
    },
  }
}
