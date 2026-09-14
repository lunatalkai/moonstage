/**
 * 作者事件匯流排。
 *
 * 規則（作者的腳本依賴這些，別「順手修」）：
 *   - 事件名固定 12 個；訂閱不認得的名字不報錯、也永遠不觸發。
 *   - 沒有 once／off：訂閱活到整個會話結束（腳本來源被換掉才清）。
 *   - `message:mount` 與 `message:done` 對晚訂閱者補發（所有已發過的、氣泡還在的）；
 *     `ready` 只發一次、不補發——作者靠 mount/done 做首屏。
 *   - 回呼只拿一個實參（載荷）；第二個「氣泡根」是給訊息作用域用的，不傳給作者。
 *   - 回呼丟錯只廢它自己，其他訂閱照跑。
 */
export const SDK_EVENTS = [
  'ready',
  'message:new',
  'message:done',
  'message:stream',
  'message:mount',
  'message:unmount',
  'input:change',
  'conversation:switch',
  'theme:change',
  'back',
  'stage:close',
  'dispose',
] as const

export type SdkEventName = (typeof SDK_EVENTS)[number]

const REPLAY_EVENTS: SdkEventName[] = ['message:mount', 'message:done']

export type EventCallback = (payload?: unknown) => void

export interface EmitOptions {
  /** 這次觸發屬於哪個氣泡（給訊息作用域）。 */
  bubble?: Element | null
  /** 補發時用來找同一則訊息的鍵（換氣泡重掛時舊的補發記錄要換掉）。 */
  key?: string
}

export interface EventBus {
  on(event: string, cb: EventCallback): void
  emit(event: SdkEventName, payload?: unknown, options?: EmitOptions): void
  /** 某則訊息的氣泡沒了：它的 mount/done 補發記錄一起拿掉。 */
  forget(key: string): void
  /** 切會話：補發記錄清空（訂閱不清）。 */
  resetReplay(): void
  /** 腳本來源被換掉（預覽重跑）：訂閱清空。 */
  clear(): void
  listenerCount(event: string): number
}

export interface EventBusDeps {
  /** 在「當前氣泡」的作用域裡跑回呼（scope.ts）。沒給就直接跑。 */
  runInScope?: (bubble: Element | null, fn: () => void) => void
  onError?: (event: string, error: unknown) => void
}

export function createEventBus(deps: EventBusDeps = {}): EventBus {
  const listeners = new Map<string, EventCallback[]>()
  const replay = new Map<SdkEventName, Array<{ key: string; payload: unknown; bubble: Element | null }>>()
  for (const ev of REPLAY_EVENTS) replay.set(ev, [])

  const run = (event: string, cb: EventCallback, payload: unknown, bubble: Element | null) => {
    const invoke = () => {
      try {
        cb(payload)
      } catch (e) {
        if (deps.onError) deps.onError(event, e)
      }
    }
    if (deps.runInScope) deps.runInScope(bubble, invoke)
    else invoke()
  }

  return {
    on(event, cb) {
      if (typeof cb !== 'function') return
      const name = String(event)
      let list = listeners.get(name)
      if (!list) listeners.set(name, (list = []))
      list.push(cb)
      const history = replay.get(name as SdkEventName)
      if (history) {
        // 晚訂閱補發：只補這一個新回呼，別人已經收過。
        for (const item of history.slice()) run(name, cb, item.payload, item.bubble)
      }
    },
    emit(event, payload, options = {}) {
      const bubble = options.bubble || null
      const history = replay.get(event)
      if (history) {
        const key = options.key || ''
        // 同一則訊息重掛：舊記錄換成新的，補發時不會重複。
        const idx = key ? history.findIndex((h) => h.key === key) : -1
        if (idx >= 0) history.splice(idx, 1)
        history.push({ key, payload, bubble })
      }
      const list = listeners.get(event)
      if (!list) return
      for (const cb of list.slice()) run(event, cb, payload, bubble)
    },
    forget(key) {
      for (const history of replay.values()) {
        for (let i = history.length - 1; i >= 0; i--) if (history[i].key === key) history.splice(i, 1)
      }
    },
    resetReplay() {
      for (const history of replay.values()) history.length = 0
    },
    clear() {
      listeners.clear()
    },
    listenerCount(event) {
      return (listeners.get(String(event)) || []).length
    },
  }
}
