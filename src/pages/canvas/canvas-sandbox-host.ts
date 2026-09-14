/**
 * 沙箱卡的宿主橋：把畫布的真實狀態（HudHost.read()）翻成協議訊息餵給 iframe 裡的殼，
 * 把殼的請求（送出、改寫、存檔）接回畫布既有的動作。
 *
 * 跟 canvas-hud-bridge 同一個原則：不 import Vue、不抓 DOM（只碰傳進來的 iframe），
 * 吃純資料的 HudHost，所以可以用假宿主完整測試。
 *
 * 差分：橋自己記「殼已經知道哪些訊息」，每次 sync() 讀一次宿主狀態，只送變化——
 * 新氣泡 message.new、內容長了 message.stream、定稿 message.done、消失 message.remove。
 * 訊息 id 給殼看的是 `h<宿主id>`（冷啟動的歷史）與 `l<n>`（之後長出來的），serverId 是宿主 id
 * （只有 AI 定稿後才給；玩家訊息永遠 null）——作者的契約說 id 不穩、持久化用 serverId。
 *
 * 安全：只認 `event.source === iframe.contentWindow` 且 origin 相符的訊息；送出去也只送給
 * 那個 origin（不透明 origin 'null' 只能用 '*'，此時靠 source 核）。
 */
import type { HudHost, HudHostMessage, HudHostState } from './canvas-hud-bridge'
import {
  envelope, isSandboxEnvelope, targetOriginFor,
  type HostToShell, type SandboxHelloConfig, type SandboxMessage, type ShellAction, type ShellToHost,
} from '@/sandbox/protocol'
import type { SandboxSavesStore } from '@/host/sandbox-host'
import type { ChromeState, ChromeUiEvent, MessageMenuAnchor, MessageView, StageState } from '@/sandbox/protocol'

export interface SandboxHostDeps {
  hud: HudHost
  iframe: HTMLIFrameElement
  win: Window
  origin: string
  roleId: string
  /** 握手時要給殼的設定（能力旗標與存檔由橋自己補）。 */
  hello(): Omit<SandboxHelloConfig, 'capabilities' | 'saves'>
  saves?: SandboxSavesStore | null
  /** 殼上的按鈕想開宿主的面板。 */
  onAction?(name: ShellAction): void
  /** 殼沒處理的返回（舞台沒開）：宿主自己導頁。 */
  onBack?(): void
  onDebug?(level: 'log' | 'warn' | 'error', args: unknown[]): void
  /** 殼的作者舞台開關（closed／content／full）：宿主接管頁首與輸入區時，full 要把它們藏起來、讓 iframe 蓋滿整頁。 */
  onStage?(state: StageState): void
  /** 作者要求顯示／隱藏輸入區（sdk.composer.show/hide）：宿主接管輸入區時由宿主藏。 */
  onComposer?(visible: boolean): void
  /** 殼裡標準訊息元件的互動，交給宿主做（hostId 是宿主的訊息 id）。anchor 是 iframe 內座標。 */
  onMessageMenu?(hostId: string, anchor: MessageMenuAnchor | null): void
  onMessageAction?(hostId: string, key: string): void
  onMessageSwipe?(hostId: string, delta: number): void
  /** 殼裡標準頁首與輸入區的按鍵。 */
  onUi?(event: ChromeUiEvent, key?: string): void
  /**
   * 握手或切會話後，宿主的訊息列表還是空的（歷史還在載）時最多等這麼久再做冷啟動（預設 10 秒，跟握手逾時一樣）。
   * 等的理由：ready 事件的契約是「歷史都掛好了才發、且不補發」，太早發作者就拿不到歷史。
   * 每個會話至少有一則開場白，列表為空實際上就是「還在載」；這個上限只擋住真的卡死的情況——
   * 手機上冷開一張卡（開對話 + 拉歷史兩趟往返）常常要 2–5 秒，設 3 秒會把正常情況打成降級。
   */
  coldStartTimeoutMs?: number
  /** 殼在這段時間內沒喊 ready-shell 就先報逾時（預設 20 秒；首次載入殼檔可能慢）。之後殼到了仍照常握手並回報 onHandshake。 */
  handshakeTimeoutMs?: number
  onHandshakeTimeout?(): void
  /** 逾時提示之後殼才到、握手完成：宿主把提示收掉。 */
  onHandshake?(): void
}

export interface SandboxHost {
  start(): void
  /** 讀一次宿主狀態，把變化送給殼。狀態一變就呼叫（watchEffect）。 */
  sync(): void
  /** 宿主換了存檔／對話：殼清空，下一次 sync 重送全量。 */
  conversationSwitched(): void
  postTheme(theme: 'dark' | 'light', vars?: Record<string, string>): void
  postViewport(height: number): void
  /** 宿主的返回鍵：殼處理了（關舞台）回 true；否則回 false 由宿主導頁。 */
  requestBack(): Promise<boolean>
  ready(): boolean
  destroy(): void
}

interface Tracked {
  shellId: string
  role: 'user' | 'ai'
  content: string
  finished: boolean
  viewKey: string
}

const BACK_TIMEOUT_MS = 400

export function createSandboxHost(deps: SandboxHostDeps): SandboxHost {
  const { hud, iframe, win } = deps
  const tracked = new Map<string, Tracked>()
  let helloSent = false
  let handshakeTimedOut = false
  let shellReady = false
  let destroyed = false
  let liveSeq = 0
  let lastBusy: boolean | null = null
  let lastInputFromShell: string | null = null
  let lastInputPosted: string | null = null
  let backWaiter: ((handled: boolean) => void) | null = null
  let handshakeTimer: ReturnType<typeof setTimeout> | null = null

  const post = (message: HostToShell) => {
    const target = iframe.contentWindow
    if (!target || destroyed) return
    target.postMessage(envelope(message), targetOriginFor(deps.origin))
  }

  const visible = (snapshot: HudHostState = hud.read()): HudHostMessage[] => snapshot.messages.filter((m) => m.role !== 'system')
  const roleOf = (m: HudHostMessage): 'user' | 'ai' => (m.role === 'user' ? 'user' : 'ai')
  const finishedOf = (m: HudHostMessage) => m.role === 'user' || !!m.finished
  const hostIdOf = (shellId: string): string | null => {
    for (const [hostId, t] of tracked.entries()) if (t.shellId === shellId) return hostId
    return null
  }
  const viewOf = (m: HudHostMessage): MessageView | undefined => (m.view ? (m.view as MessageView) : undefined)
  const viewKeyOf = (m: HudHostMessage): string => (m.view ? JSON.stringify(m.view) : '')
  const toShell = (m: HudHostMessage, shellId: string): SandboxMessage => {
    const finished = finishedOf(m)
    return {
      id: shellId,
      role: roleOf(m),
      content: m.text,
      serverId: roleOf(m) === 'ai' && finished ? m.id : null,
      state: finished ? 'done' : (m.text ? 'streaming' : 'pending'),
      view: viewOf(m),
    }
  }

  // 冷啟動要等宿主把歷史載進來：宿主一換會話，列表先是舊的或空的，這時送全量就是錯的那一包。
  // awaitingColdStart 期間不做差分；列表非空且不是切換前那一份、或等過了頭，才送 messages（殼收到才發 ready）。
  let awaitingColdStart = false
  let staleIds: Set<string> = new Set()
  let coldStartTimer: ReturnType<typeof setTimeout> | null = null
  const armColdStart = () => {
    awaitingColdStart = true
    staleIds = new Set(tracked.keys())
    if (coldStartTimer) clearTimeout(coldStartTimer)
    coldStartTimer = setTimeout(() => {
      coldStartTimer = null
      if (awaitingColdStart && !destroyed) { coldStart(hud.read()); syncGeneration(hud.read()) }
    }, deps.coldStartTimeoutMs ?? 10_000)
  }
  const tryColdStart = (snapshot: HudHostState): boolean => {
    const list = visible(snapshot)
    if (!list.length) return false
    const sameAsStale = list.length === staleIds.size && list.every((m) => staleIds.has(m.id))
    if (sameAsStale) return false
    coldStart(snapshot)
    return true
  }

  const coldStart = (snapshot: HudHostState) => {
    awaitingColdStart = false
    if (coldStartTimer) { clearTimeout(coldStartTimer); coldStartTimer = null }
    tracked.clear()
    const list = visible(snapshot)
    lastOrder = list.map((m) => m.id)
    const messages = list.map((m, index) => {
      const shellId = index === 0 && m.opening && roleOf(m) === 'ai' ? 'greeting' : `h${m.id}`
      tracked.set(m.id, { shellId, role: roleOf(m), content: m.text, finished: finishedOf(m), viewKey: viewKeyOf(m) })
      return toShell(m, shellId)
    })
    post({ type: 'messages', messages })
  }

  // 宿主的訊息 id 會換：送出時玩家那則與 AI 占位先拿暫時 id，伺服器受理／定稿後換成正式 id。
  // 對殼而言那還是同一顆氣泡——同位置、同角色，內容相同或本來就還沒定稿，就把追蹤記錄改掛到新 id 上，
  // 不發 remove + new（作者綁在氣泡上的東西會掉，串流中的 AI 也不該閃一下）。
  let lastOrder: string[] = []
  const rekeyReplacedIds = (list: HudHostMessage[]) => {
    const present = new Set(list.map((m) => m.id))
    list.forEach((m, index) => {
      if (tracked.has(m.id)) return
      const oldId = lastOrder[index]
      if (!oldId || present.has(oldId)) return
      const t = tracked.get(oldId)
      if (!t || t.role !== roleOf(m)) return
      if (t.content !== m.text && (t.finished || t.role !== 'ai')) return
      tracked.delete(oldId)
      tracked.set(m.id, t)
    })
    lastOrder = list.map((m) => m.id)
  }

  const syncMessages = (snapshot: HudHostState) => {
    const list = visible(snapshot)
    rekeyReplacedIds(list)
    const present = new Set(list.map((m) => m.id))
    for (const [hostId, t] of Array.from(tracked.entries())) {
      if (present.has(hostId)) continue
      tracked.delete(hostId)
      post({ type: 'message.remove', id: t.shellId })
    }
    for (const m of list) {
      const t = tracked.get(m.id)
      const finished = finishedOf(m)
      if (!t) {
        const shellId = `l${++liveSeq}`
        tracked.set(m.id, { shellId, role: roleOf(m), content: m.text, finished, viewKey: viewKeyOf(m) })
        post({ type: 'message.new', message: toShell(m, shellId) })
        if (finished && roleOf(m) === 'ai' && m.text) post({ type: 'message.done', id: shellId, content: m.text, serverId: m.id })
        continue
      }
      if (t.finished) {
        // 已定稿的內容變了（改寫）：換一顆新氣泡，done 只發一次的契約才守得住。
        if (t.content !== m.text) {
          post({ type: 'message.remove', id: t.shellId })
          const shellId = `l${++liveSeq}`
          tracked.set(m.id, { shellId, role: roleOf(m), content: m.text, finished, viewKey: viewKeyOf(m) })
          post({ type: 'message.new', message: toShell(m, shellId) })
          if (roleOf(m) === 'ai') post({ type: 'message.done', id: shellId, content: m.text, serverId: m.id, view: viewOf(m) })
          continue
        }
        // 正文沒變、呈現資料變了（可重生成的鍵亮起、上下文用量、思考過程…）：只換呈現。
        const key = viewKeyOf(m)
        if (key !== t.viewKey) { t.viewKey = key; if (m.view) post({ type: 'message.view', id: t.shellId, view: m.view as MessageView }) }
        continue
      }
      if (finished) {
        t.finished = true
        t.content = m.text
        t.viewKey = viewKeyOf(m)
        post({ type: 'message.done', id: t.shellId, content: m.text, serverId: roleOf(m) === 'ai' ? m.id : null, view: viewOf(m) })
        continue
      }
      if (t.content !== m.text) {
        t.content = m.text
        t.viewKey = viewKeyOf(m)
        post({ type: 'message.stream', id: t.shellId, content: m.text, view: viewOf(m) })
        continue
      }
      const key = viewKeyOf(m)
      if (key !== t.viewKey) { t.viewKey = key; if (m.view) post({ type: 'message.view', id: t.shellId, view: m.view as MessageView }) }
    }
  }

  const syncGeneration = (snapshot: HudHostState = hud.read()) => {
    const busy = snapshot.generation !== 'idle'
    if (busy === lastBusy) return
    lastBusy = busy
    post({ type: 'generation', busy })
  }

  let lastChromeKey = ''
  const chromeOf = (snapshot: HudHostState): ChromeState | undefined => (snapshot.chrome ? (snapshot.chrome as ChromeState) : undefined)
  const syncChrome = (snapshot: HudHostState) => {
    const chrome = chromeOf(snapshot)
    if (!chrome) return
    const key = JSON.stringify(chrome)
    if (key === lastChromeKey) return
    lastChromeKey = key
    post({ type: 'chrome', state: chrome })
  }

  const syncInput = (snapshot: HudHostState) => {
    const value = snapshot.inputText
    if (value === lastInputFromShell || value === lastInputPosted) return
    lastInputPosted = value
    post({ type: 'input', value })
  }

  const sendHello = async () => {
    if (helloSent || destroyed) return
    helloSent = true
    let saves: Record<string, unknown> | undefined
    let savesOk = false
    if (deps.saves) {
      try {
        saves = await deps.saves.load(deps.roleId)
        savesOk = true
      } catch (e) {
        if (deps.onDebug) deps.onDebug('warn', ['saves load failed', String(e)])
      }
    }
    if (destroyed) return
    const base = deps.hello()
    // 殼一開始的草稿是空的；宿主此刻的草稿若非空，第一次 sync 會送過去，空的就不必。
    lastInputPosted = ''
    const helloSnapshot = hud.read()
    const chrome = chromeOf(helloSnapshot)
    if (chrome) lastChromeKey = JSON.stringify(chrome)
    post({
      type: 'hello',
      config: { ...base, capabilities: { saves: savesOk, edit: true, send: true }, saves, chromeState: chrome },
    })
    // 殼建好之後才有東西可畫：歷史一到就送全量訊息，殼跑完冷啟動再喊 ready。
    armColdStart()
    const snapshot = hud.read()
    if (tryColdStart(snapshot)) syncGeneration(snapshot)
  }

  const reply = (reqId: number, ok: boolean, value?: unknown, error?: { code: string; message?: string }) => {
    post({ type: 'reply', reqId, ok, value, error })
  }

  const handleRequest = async (reqId: number, op: string, args: unknown[]) => {
    try {
      switch (op) {
        case 'message.send': {
          const text = String(args[0] ?? '')
          const ok = await hud.sendMessage(text)
          if (ok === false) return reply(reqId, false, undefined, { code: 'HOST_DENIED' })
          return reply(reqId, true)
        }
        case 'message.edit': {
          const serverId = String(args[0] ?? '')
          const text = String(args[1] ?? '')
          const target = visible().find((m) => m.id === serverId)
          if (!target) return reply(reqId, false, undefined, { code: 'INVALID_ARGS', message: 'message not found' })
          const opened = await hud.openEdit(target.id)
          if (opened === false) return reply(reqId, false, undefined, { code: 'HOST_DENIED' })
          const ok = await hud.submitEdit(target.id, text)
          if (ok === false) return reply(reqId, false, undefined, { code: 'HOST_DENIED' })
          return reply(reqId, true)
        }
        case 'save.set': {
          if (!deps.saves) return reply(reqId, false, undefined, { code: 'HOST_DENIED' })
          await deps.saves.set(deps.roleId, String(args[0]), args[1])
          return reply(reqId, true)
        }
        case 'save.remove': {
          if (!deps.saves) return reply(reqId, false, undefined, { code: 'HOST_DENIED' })
          await deps.saves.remove(deps.roleId, String(args[0]))
          return reply(reqId, true)
        }
        default:
          return reply(reqId, false, undefined, { code: 'UNKNOWN_CAPABILITY' })
      }
    } catch (e) {
      reply(reqId, false, undefined, { code: 'NETWORK', message: String((e as Error)?.message || e) })
    }
  }

  const handleAction = (name: ShellAction) => {
    switch (name) {
      case 'back':
        if (deps.onBack) deps.onBack()
        else hud.exit()
        return
      case 'stop':
        hud.stopGeneration()
        return
      case 'regenerate': {
        const latest = [...visible()].reverse().find((m) => m.canonicalLatestAI)
        if (latest) hud.regenerateMessage(latest.id)
        return
      }
      default:
        if (deps.onAction) deps.onAction(name)
    }
  }

  const onMessage = (event: MessageEvent) => {
    if (destroyed) return
    if (event.source !== iframe.contentWindow) return
    if (event.origin !== deps.origin) return
    if (!isSandboxEnvelope(event.data)) return
    const message = event.data as unknown as ShellToHost
    switch (message.type) {
      case 'ready-shell':
        if (handshakeTimer) { clearTimeout(handshakeTimer); handshakeTimer = null }
        // 逾時提示已經亮了、殼才到（首次載入殼檔慢）：照常握手，並讓宿主把提示收掉。
        if (handshakeTimedOut && !helloSent && deps.onHandshake) { handshakeTimedOut = false; deps.onHandshake() }
        void sendHello()
        return
      case 'ready':
        shellReady = true
        return
      case 'request':
        void handleRequest(message.reqId, message.op, message.args || [])
        return
      case 'input':
        lastInputFromShell = message.value
        hud.setInputText(message.value)
        return
      case 'action':
        handleAction(message.name)
        return
      case 'back-handled':
        if (backWaiter) { const w = backWaiter; backWaiter = null; w(!!message.handled) }
        return
      case 'stage':
        if (deps.onStage) deps.onStage(message.state)
        return
      case 'composer':
        if (deps.onComposer) deps.onComposer(!!message.visible)
        return
      case 'ui':
        if (deps.onUi) deps.onUi(message.event, message.key)
        return
      case 'message.ui': {
        const hostId = hostIdOf(message.id)
        if (!hostId) return
        if (message.kind === 'menu' && deps.onMessageMenu) deps.onMessageMenu(hostId, message.anchor)
        else if (message.kind === 'action' && deps.onMessageAction) deps.onMessageAction(hostId, message.key)
        else if (message.kind === 'swipe' && deps.onMessageSwipe) deps.onMessageSwipe(hostId, message.delta)
        return
      }
      case 'debug':
        if (deps.onDebug) deps.onDebug(message.level, message.args)
        return
      default:
        return
    }
  }

  return {
    start() {
      win.addEventListener('message', onMessage)
      const timeout = deps.handshakeTimeoutMs ?? 20_000
      if (deps.onHandshakeTimeout && timeout > 0) {
        handshakeTimer = setTimeout(() => { if (!helloSent && !destroyed) { handshakeTimedOut = true; deps.onHandshakeTimeout!() } }, timeout)
      }
    },
    sync() {
      if (destroyed) return
      // 每次都先讀宿主狀態，再看握手完成沒：宿主是用響應式 effect 呼叫 sync 的，第一次呼叫若在
      // 握手前就空手而回，effect 什麼都沒追蹤到，之後狀態再變也不會再被叫——殼就永遠停在冷啟動那一包。
      const snapshot = hud.read()
      if (!helloSent) return
      if (awaitingColdStart) {
        syncChrome(snapshot)
        if (!tryColdStart(snapshot)) return
        syncGeneration(snapshot)
        syncInput(snapshot)
        return
      }
      // 先訊息後生成旗標：定稿的 done 要在 busy=false 之前到，作者「done 後才解鎖按鈕」的邏輯才順。
      syncMessages(snapshot)
      syncGeneration(snapshot)
      syncInput(snapshot)
      syncChrome(snapshot)
    },
    conversationSwitched() {
      if (!helloSent || destroyed) return
      post({ type: 'conversation.switch' })
      armColdStart()
      const snapshot = hud.read()
      if (tryColdStart(snapshot)) syncGeneration(snapshot)
    },
    postTheme: (theme, vars) => post({ type: 'theme', theme, vars }),
    postViewport: (height) => post({ type: 'viewport', height }),
    requestBack() {
      if (!helloSent || destroyed) return Promise.resolve(false)
      return new Promise<boolean>((resolve) => {
        backWaiter = resolve
        post({ type: 'back' })
        setTimeout(() => { if (backWaiter === resolve) { backWaiter = null; resolve(false) } }, BACK_TIMEOUT_MS)
      })
    },
    ready: () => shellReady,
    destroy() {
      if (destroyed) return
      if (handshakeTimer) clearTimeout(handshakeTimer)
      if (coldStartTimer) { clearTimeout(coldStartTimer); coldStartTimer = null }
      if (helloSent) { try { post({ type: 'dispose' }) } catch { /* iframe 可能已經拆了 */ } }
      destroyed = true
      win.removeEventListener('message', onMessage)
    },
  }
}
