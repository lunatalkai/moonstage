/**
 * 作者看到的 `sdk`：11 個鍵、30 個能力，全部從第一版就存在——作者腳本在頂層探測它們，
 * 少一個就是「按鈕全不響應」而沒有任何報錯。每個能力有實作狀態：實作／宿主沒接（HOST_DENIED）。
 *
 * 錯誤慣例（作者的程式碼依賴）：
 *   - 同步能力直接 throw SdkError；非同步能力回 rejected Promise。作者對 save.get/keys 用 try，
 *     對 message.send/save.set 用 .catch。
 *   - `save.get`／`save.keys` 在存檔預載完成前同步丟 HOST_DENIED（「存檔未預載」）。
 *   - key 只許 `[A-Za-z0-9_-]{1,64}`；含冒號等其他字元 → INVALID_ARGS。
 *   - 限頻：save.set 20／分、message.send 手勢 3／分、自動 3／分、message.edit 10／分 → RATE_LIMITED。
 *   - 生成中再 message.send → BUSY（不排隊、不占限頻）。
 *   - 非手勢的 message.send → 殼內問使用者；拒絕 → UNAUTHORIZED。
 */
import { SdkError } from './errors'
import type { EventBus } from './events'

export const SAVE_KEY_RE = /^[A-Za-z0-9_-]{1,64}$/
export const SAVE_MAX_KEYS = 10
export const SAVE_MAX_VALUE_BYTES = 64 * 1024
export const CACHE_QUOTA_BYTES = 1024 * 1024

export const RATE_LIMITS = {
  'save.set': { count: 20, windowMs: 60_000 },
  'message.send.gesture': { count: 3, windowMs: 60_000 },
  'message.send.auto': { count: 3, windowMs: 60_000 },
  'message.edit': { count: 10, windowMs: 60_000 },
} as const

export type RateLimitKey = keyof typeof RATE_LIMITS

export interface SdkInputHost {
  get(): string
  set(text: string): void
  focus(): void
  blur(): void
  getCursor(): number
  setCursor(n: number): void
  /** 使用者正在用輸入法組字：這時改草稿會撞掉未上屏的字。 */
  composing(): boolean
}

export interface SdkComposerHost {
  show(): void
  hide(): void
  visible(): boolean
}

export interface SdkStageHost {
  open(mode: 'content' | 'full'): void
  close(): void
  el(): HTMLElement | null
  visible(): boolean
}

export interface SdkHost {
  input: SdkInputHost
  composer: SdkComposerHost
  stage: SdkStageHost
  role(): { name: string; avatarUrl: string }
  user(): { nickname: string; avatarUrl: string }
  capabilities: { saves: boolean; edit: boolean; send: boolean }
  /** 宿主代辦：送出、改寫、存檔寫入。 */
  request(op: 'message.send' | 'message.edit' | 'save.set' | 'save.remove', args: unknown[]): Promise<unknown>
  /** 現在是不是在使用者手勢裡（點擊當下）。 */
  inGesture(): boolean
  /** 非手勢送出前問使用者；回 true 表示允許。 */
  askSendPermission(text: string): Promise<boolean>
  /** 宿主正在生成回覆。 */
  busy(): boolean
  debug(...args: unknown[]): void
  now?: () => number
}

export interface Sdk {
  input: {
    get(): string; set(t: string): void; add(t: string): void; insert(t: string): void; clear(): void
    focus(): void; blur(): void; getCursor(): number; setCursor(n: number): void
  }
  composer: { show(): void; hide(): void; visible(): boolean }
  message: { send(text?: string): Promise<void>; edit(id: string, text: string): Promise<void> }
  cache: { get(key: string): unknown; set(key: string, value: unknown): void; remove(key: string): void }
  save: { get(key: string): unknown; set(key: string, value: unknown): Promise<void>; remove(key: string): Promise<void>; keys(): string[] }
  stage: { open(mode?: 'content' | 'full'): void; close(): void; el(): HTMLElement | null; visible(): boolean }
  role: { get(): { name: string; avatarUrl: string } }
  user: { get(): { nickname: string; avatarUrl: string } }
  on(event: string, cb: (payload?: unknown) => void): void
  debug: { log(...args: unknown[]): void }
  version: string
}

export interface SdkController {
  sdk: Sdk
  /** 宿主把預載存檔餵進來；之後 save.get/keys 才可用。 */
  loadSaves(data: Record<string, unknown> | null | undefined): void
  savesLoaded(): boolean
}

function bytesOf(value: unknown): number {
  try {
    return new TextEncoder().encode(JSON.stringify(value) ?? '').length
  } catch {
    return Number.POSITIVE_INFINITY
  }
}

export function createSdk(host: SdkHost, bus: EventBus): SdkController {
  const now = host.now || (() => Date.now())
  const stamps = new Map<RateLimitKey, number[]>()
  const takeSlot = (key: RateLimitKey) => {
    const limit = RATE_LIMITS[key]
    const t = now()
    const list = (stamps.get(key) || []).filter((s) => t - s < limit.windowMs)
    if (list.length >= limit.count) { stamps.set(key, list); throw new SdkError('RATE_LIMITED') }
    list.push(t)
    stamps.set(key, list)
  }

  const cache = new Map<string, unknown>()
  let cacheBytes = 0
  const saves = new Map<string, unknown>()
  let savesLoaded = false

  const requireString = (v: unknown, what: string): string => {
    if (typeof v !== 'string') throw new SdkError('INVALID_ARGS', `${what} must be a string`)
    return v
  }
  const requireSaveKey = (key: unknown): string => {
    const k = requireString(key, 'key')
    if (!SAVE_KEY_RE.test(k)) throw new SdkError('INVALID_ARGS', 'save key is not valid')
    return k
  }
  const requireSaves = () => {
    if (!host.capabilities.saves) throw new SdkError('HOST_DENIED', 'saves are not available')
    if (!savesLoaded) throw new SdkError('HOST_DENIED', 'saves are not loaded yet')
  }
  const editDraft = (fn: (draft: string, cursor: number) => string) => {
    if (host.input.composing()) throw new SdkError('INVALID_ARGS', 'input is composing')
    const draft = host.input.get()
    host.input.set(fn(draft, host.input.getCursor()))
  }

  const sdk: Sdk = {
    input: {
      get: () => host.input.get(),
      set: (t) => { requireString(t, 'text'); editDraft(() => t) },
      add: (t) => { requireString(t, 'text'); editDraft((draft) => draft + t) },
      insert: (t) => { requireString(t, 'text'); editDraft((draft, cursor) => draft.slice(0, cursor) + t + draft.slice(cursor)) },
      clear: () => editDraft(() => ''),
      focus: () => host.input.focus(),
      blur: () => host.input.blur(),
      getCursor: () => host.input.getCursor(),
      setCursor: (n) => { if (typeof n !== 'number' || !Number.isFinite(n)) throw new SdkError('INVALID_ARGS'); host.input.setCursor(Math.max(0, Math.floor(n))) },
    },
    composer: {
      show: () => host.composer.show(),
      hide: () => host.composer.hide(),
      visible: () => host.composer.visible(),
    },
    message: {
      async send(text) {
        if (!host.capabilities.send) throw new SdkError('NOT_SUPPORTED', 'send is not available here')
        const body = text == null ? host.input.get() : requireString(text, 'text')
        if (!body.trim()) throw new SdkError('INVALID_ARGS', 'message is empty')
        if (host.busy()) throw new SdkError('BUSY', 'a reply is still being generated')
        if (host.inGesture()) {
          takeSlot('message.send.gesture')
        } else {
          const ok = await host.askSendPermission(body)
          if (!ok) throw new SdkError('UNAUTHORIZED', 'the user did not allow this send')
          if (host.busy()) throw new SdkError('BUSY', 'a reply is still being generated')
          takeSlot('message.send.auto')
        }
        await host.request('message.send', [body])
      },
      async edit(id, text) {
        if (!host.capabilities.edit) throw new SdkError('HOST_DENIED', 'edit is not available')
        const target = requireString(id, 'id')
        const body = requireString(text, 'text')
        if (!target || !body.trim()) throw new SdkError('INVALID_ARGS')
        // 改寫會重送、會花點數：跟送出一樣，不在手勢裡就先問玩家。
        if (!host.inGesture()) {
          const ok = await host.askSendPermission(body)
          if (!ok) throw new SdkError('UNAUTHORIZED')
        }
        takeSlot('message.edit')
        await host.request('message.edit', [target, body])
      },
    },
    cache: {
      get: (key) => cache.get(requireString(key, 'key')),
      set: (key, value) => {
        const k = requireString(key, 'key')
        const size = bytesOf(value)
        const previous = cache.has(k) ? bytesOf(cache.get(k)) : 0
        if (cacheBytes - previous + size > CACHE_QUOTA_BYTES) throw new SdkError('INVALID_ARGS', 'cache quota exceeded')
        cacheBytes += size - previous
        cache.set(k, value)
      },
      remove: (key) => {
        const k = requireString(key, 'key')
        if (cache.has(k)) { cacheBytes -= bytesOf(cache.get(k)); cache.delete(k) }
      },
    },
    save: {
      get: (key) => { requireSaves(); return saves.get(requireSaveKey(key)) },
      keys: () => { requireSaves(); return Array.from(saves.keys()) },
      async set(key, value) {
        requireSaves()
        const k = requireSaveKey(key)
        if (bytesOf(value) > SAVE_MAX_VALUE_BYTES) throw new SdkError('INVALID_ARGS', 'save value is too large')
        if (!saves.has(k) && saves.size >= SAVE_MAX_KEYS) throw new SdkError('INVALID_ARGS', 'too many save keys')
        takeSlot('save.set')
        await host.request('save.set', [k, value])
        saves.set(k, value)
      },
      async remove(key) {
        requireSaves()
        const k = requireSaveKey(key)
        await host.request('save.remove', [k])
        saves.delete(k)
      },
    },
    stage: {
      open: (mode) => host.stage.open(mode === 'full' ? 'full' : 'content'),
      close: () => host.stage.close(),
      el: () => host.stage.el(),
      visible: () => host.stage.visible(),
    },
    role: { get: () => ({ ...host.role() }) },
    user: { get: () => ({ ...host.user() }) },
    on: (event, cb) => bus.on(event, cb),
    debug: { log: (...args) => host.debug(...args) },
    version: '1',
  }

  return {
    sdk,
    loadSaves(data) {
      saves.clear()
      if (data && typeof data === 'object') for (const [k, v] of Object.entries(data)) saves.set(k, v)
      savesLoaded = true
    },
    savesLoaded: () => savesLoaded,
  }
}
