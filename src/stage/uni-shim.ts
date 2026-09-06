/**
 * 沒有 uni 執行時的宿主用的 `uni` 替身。
 *
 * canvas 與它的工具模組還有一百來處直接叫 `uni.*`（提示、儲存、事件匯流排、請求、socket、
 * 捲動、剪貼簿…）。逐處改寫會跟上游持續衝突，所以先在套件層補一個行為一致的 `uni`
 * 物件：每一項都轉到 StageHost 或瀏覽器原生 API。playground 有真的 uni，這裡不會被裝上。
 *
 * 只實作 canvas 實際用到的方法；沒實作的呼叫會是 undefined，寧可在測試裡炸出來，
 * 也不要靜默吞掉讓作者查不出「按了沒反應」。
 */
import type { StageHost } from '@/host/stage-host'

type Callback = (res: any) => void

export interface UniRequestOptions {
  url: string
  method?: string
  data?: any
  header?: Record<string, string>
  timeout?: number
  dataType?: string
  success?: Callback
  fail?: Callback
  complete?: Callback
}

export interface UniRequestTask { abort(): void }

/** uni.request 的 fetch 版：回 { statusCode, data, header, errMsg }，網路失敗走 fail（statusCode 缺 → 攔截器當網路錯）。 */
export function requestWithFetch(options: UniRequestOptions, fetchImpl: typeof fetch = fetch): UniRequestTask {
  const controller = typeof AbortController !== 'undefined' ? new AbortController() : null
  const method = String(options.method || 'GET').toUpperCase()
  const headers: Record<string, string> = { ...(options.header || {}) }
  let body: string | undefined
  if (method !== 'GET' && method !== 'HEAD' && options.data !== undefined) {
    const type = Object.keys(headers).find((k) => k.toLowerCase() === 'content-type')
    const contentType = type ? headers[type] : ''
    if (contentType.includes('x-www-form-urlencoded')) {
      body = new URLSearchParams(options.data as Record<string, string>).toString()
    } else {
      body = typeof options.data === 'string' ? options.data : JSON.stringify(options.data)
      if (!type) headers['content-type'] = 'application/json'
    }
  }
  let url = options.url
  if (method === 'GET' && options.data && typeof options.data === 'object') {
    const qs = new URLSearchParams()
    for (const [k, v] of Object.entries(options.data)) if (v !== undefined && v !== null) qs.set(k, String(v))
    const q = qs.toString()
    if (q) url += (url.includes('?') ? '&' : '?') + q
  }
  ;(async () => {
    try {
      const res = await fetchImpl(url, { method, headers, body, signal: controller?.signal })
      const text = await res.text()
      let data: any = text
      if ((options.dataType || 'json') === 'json') {
        try { data = text ? JSON.parse(text) : {} } catch { data = text }
      }
      const header: Record<string, string> = {}
      res.headers.forEach((v, k) => { header[k] = v })
      const out = { statusCode: res.status, data, header, errMsg: 'request:ok' }
      options.success?.(out)
      options.complete?.(out)
    } catch (err: any) {
      const out = { errMsg: 'request:fail ' + (err?.message || err) }
      options.fail?.(out)
      options.complete?.(out)
    }
  })()
  return { abort: () => controller?.abort() }
}

/** uni.connectSocket 回的 SocketTask：onOpen／onMessage／onError／onClose／send／close。 */
export function connectSocketWithWebSocket(options: { url: string }, WS: typeof WebSocket = WebSocket) {
  const ws = new WS(options.url)
  const task = {
    onOpen: (cb: Callback) => { ws.addEventListener('open', () => cb({})) },
    onMessage: (cb: Callback) => { ws.addEventListener('message', (e: MessageEvent) => cb({ data: e.data })) },
    onError: (cb: Callback) => { ws.addEventListener('error', (e) => cb({ errMsg: 'socket error', event: e })) },
    onClose: (cb: Callback) => { ws.addEventListener('close', (e: CloseEvent) => cb({ code: e.code, reason: e.reason })) },
    send: (o: { data: string; success?: Callback; fail?: Callback }) => {
      try { ws.send(o.data); o.success?.({}) } catch (err) { o.fail?.({ errMsg: String(err) }) }
    },
    close: (o: { code?: number; reason?: string } = {}) => { ws.close(o.code, o.reason) },
    readyState: () => ws.readyState,
  }
  return task
}

/** uni.createSelectorQuery 的 DOM 版：只支援 canvas 用到的 select().boundingClientRect(cb).exec()。 */
export function createSelectorQueryWithDom(doc: Document = document) {
  let scope: ParentNode = doc
  const query = {
    in: (component: any) => { const el = component?.$el; if (el && typeof el.querySelector === 'function') scope = el; return query },
    select: (selector: string) => {
      const el = scope.querySelector(selector)
      const chain = {
        boundingClientRect: (cb: Callback) => {
          const rect = el ? el.getBoundingClientRect() : null
          const exec = () => cb(rect ? { top: rect.top, left: rect.left, width: rect.width, height: rect.height, bottom: rect.bottom, right: rect.right } : null)
          return { exec }
        },
      }
      return chain
    },
  }
  return query
}

/** 組出 uni 物件。宿主自己的東西（提示、儲存、導頁、語系、剪貼簿、事件）全走 host。 */
export function createUniShim(host: StageHost, env: { win?: Window; doc?: Document; fetchImpl?: typeof fetch; WS?: typeof WebSocket } = {}) {
  const win = env.win ?? (typeof window !== 'undefined' ? window : undefined)
  const doc = env.doc ?? (typeof document !== 'undefined' ? document : undefined)
  const offs = new Map<string, Map<Callback, () => void>>()
  const uni: Record<string, any> = {
    // 提示
    showToast: (o: { title?: string } = {}) => host.ui.toast(String(o.title || '')),
    hideToast: () => {},
    showModal: (o: { title?: string; content?: string; showCancel?: boolean; confirmText?: string; cancelText?: string; success?: Callback; fail?: Callback; complete?: Callback } = {}) => {
      host.ui.confirm({ title: o.title, content: String(o.content || ''), confirmText: o.confirmText, cancelText: o.cancelText })
        .then((confirm) => { o.success?.({ confirm, cancel: !confirm }) }, (err) => { o.fail?.(err) })
        .finally(() => o.complete?.({}))
    },
    showLoading: () => host.ui.loading(true),
    hideLoading: () => host.ui.loading(false),
    // 儲存：只承諾字串
    getStorageSync: (key: string) => host.storage.get(key) ?? '',
    setStorageSync: (key: string, value: unknown) => host.storage.set(key, typeof value === 'string' ? value : JSON.stringify(value)),
    removeStorageSync: (key: string) => host.storage.remove(key),
    getStorageInfoSync: () => {
      let keys: string[] = []
      try { if (win && win.localStorage) keys = Object.keys(win.localStorage) } catch { keys = [] }
      return { keys, currentSize: 0, limitSize: 0 }
    },
    // 語系
    getLocale: () => host.locale.get(),
    setLocale: (locale: string) => { host.locale.set(locale); return true },
    // 導頁：舞台只認識三個去處
    navigateBack: () => host.nav.back(),
    reLaunch: (o: { url?: string } = {}) => routeTo(host, o.url || ''),
    navigateTo: (o: { url?: string } = {}) => routeTo(host, o.url || ''),
    redirectTo: (o: { url?: string } = {}) => routeTo(host, o.url || ''),
    switchTab: (o: { url?: string } = {}) => routeTo(host, o.url || ''),
    // 事件匯流排
    $on: (name: string, fn: Callback) => {
      const off = host.events.on(name, fn)
      if (!offs.has(name)) offs.set(name, new Map())
      offs.get(name)!.set(fn, off)
    },
    $off: (name: string, fn?: Callback) => {
      const bucket = offs.get(name)
      if (!bucket) return
      if (fn) { bucket.get(fn)?.(); bucket.delete(fn); return }
      bucket.forEach((off) => off()); bucket.clear()
    },
    $emit: (name: string, payload?: any) => host.events.emit(name, payload),
    // 剪貼簿
    setClipboardData: (o: { data: string; success?: Callback; fail?: Callback; complete?: Callback }) => {
      host.clipboard.write(o.data).then(() => o.success?.({}), (err) => o.fail?.(err)).finally(() => o.complete?.({}))
    },
    // 裝置
    getSystemInfoSync: () => ({
      platform: 'web', screenWidth: win?.innerWidth ?? 0, screenHeight: win?.innerHeight ?? 0,
      windowWidth: win?.innerWidth ?? 0, windowHeight: win?.innerHeight ?? 0, pixelRatio: win?.devicePixelRatio ?? 1,
      statusBarHeight: 0, safeAreaInsets: { top: 0, right: 0, bottom: 0, left: 0 },
    }),
    // 捲動
    createSelectorQuery: () => createSelectorQueryWithDom(doc),
    pageScrollTo: (o: { scrollTop?: number; duration?: number } = {}) => { win?.scrollTo({ top: o.scrollTop ?? 0, behavior: o.duration ? 'smooth' : 'auto' }) },
    // 網路
    request: (o: UniRequestOptions) => requestWithFetch(o, env.fetchImpl),
    connectSocket: (o: { url: string }) => connectSocketWithWebSocket(o, env.WS),
    onSocketOpen: () => {}, onSocketMessage: () => {}, onSocketError: () => {}, onSocketClose: () => {},
  }
  return uni
}

function routeTo(host: StageHost, url: string) {
  if (url.includes('/pages/login/')) {
    const m = /returnTo=([^&]+)/.exec(url)
    host.nav.toLogin(m ? decodeURIComponent(m[1]) : undefined)
    return
  }
  host.nav.toEntry()
}

/** 裝到全域。已經有 uni（playground）就不動它。 */
export function installUniShim(host: StageHost): Record<string, any> {
  const g = globalThis as any
  if (g.uni && typeof g.uni === 'object') return g.uni
  const uni = createUniShim(host)
  g.uni = uni
  if (typeof g.getCurrentPages !== 'function') g.getCurrentPages = () => []
  return uni
}
