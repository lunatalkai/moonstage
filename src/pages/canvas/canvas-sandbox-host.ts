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
import type { HudHost, HudHostMessage } from './canvas-hud-bridge'
import {
  envelope, isSandboxEnvelope, targetOriginFor,
  type HostToShell, type SandboxHelloConfig, type SandboxMessage, type ShellAction, type ShellToHost,
} from '@/sandbox/protocol'
import type { SandboxSavesStore } from '@/host/sandbox-host'

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
  /** 殼在這段時間內沒喊 ready-shell 就視為載入失敗（預設 10 秒）。 */
  handshakeTimeoutMs?: number
  onHandshakeTimeout?(): void
}

export interface SandboxHost {
  start(): void
  /** 讀一次宿主狀態，把變化送給殼。狀態一變就呼叫（watchEffect）。 */
  sync(): void
  /** 宿主換了存檔／對話：殼清空，下一次 sync 重送全量。 */
  conversationSwitched(): void
  postTheme(theme: 'dark' | 'light'): void
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
}

const BACK_TIMEOUT_MS = 400

export function createSandboxHost(deps: SandboxHostDeps): SandboxHost {
  const { hud, iframe, win } = deps
  const tracked = new Map<string, Tracked>()
  let helloSent = false
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

  const visible = (): HudHostMessage[] => hud.read().messages.filter((m) => m.role !== 'system')
  const roleOf = (m: HudHostMessage): 'user' | 'ai' => (m.role === 'user' ? 'user' : 'ai')
  const finishedOf = (m: HudHostMessage) => m.role === 'user' || !!m.finished
  const toShell = (m: HudHostMessage, shellId: string): SandboxMessage => {
    const finished = finishedOf(m)
    return {
      id: shellId,
      role: roleOf(m),
      content: m.text,
      serverId: roleOf(m) === 'ai' && finished ? m.id : null,
      state: finished ? 'done' : (m.text ? 'streaming' : 'pending'),
    }
  }

  const coldStart = () => {
    tracked.clear()
    const list = visible()
    const messages = list.map((m, index) => {
      const shellId = index === 0 && m.opening && roleOf(m) === 'ai' ? 'greeting' : `h${m.id}`
      tracked.set(m.id, { shellId, role: roleOf(m), content: m.text, finished: finishedOf(m) })
      return toShell(m, shellId)
    })
    post({ type: 'messages', messages })
  }

  const syncMessages = () => {
    const list = visible()
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
        tracked.set(m.id, { shellId, role: roleOf(m), content: m.text, finished })
        post({ type: 'message.new', message: toShell(m, shellId) })
        if (finished && roleOf(m) === 'ai' && m.text) post({ type: 'message.done', id: shellId, content: m.text, serverId: m.id })
        continue
      }
      if (t.finished) {
        // 已定稿的內容變了（改寫）：換一顆新氣泡，done 只發一次的契約才守得住。
        if (t.content !== m.text) {
          post({ type: 'message.remove', id: t.shellId })
          const shellId = `l${++liveSeq}`
          tracked.set(m.id, { shellId, role: roleOf(m), content: m.text, finished })
          post({ type: 'message.new', message: toShell(m, shellId) })
          if (roleOf(m) === 'ai') post({ type: 'message.done', id: shellId, content: m.text, serverId: m.id })
        }
        continue
      }
      if (finished) {
        t.finished = true
        t.content = m.text
        post({ type: 'message.done', id: t.shellId, content: m.text, serverId: roleOf(m) === 'ai' ? m.id : null })
        continue
      }
      if (t.content !== m.text) {
        t.content = m.text
        post({ type: 'message.stream', id: t.shellId, content: m.text })
      }
    }
  }

  const syncGeneration = () => {
    const busy = hud.read().generation !== 'idle'
    if (busy === lastBusy) return
    lastBusy = busy
    post({ type: 'generation', busy })
  }

  const syncInput = () => {
    const value = hud.read().inputText
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
    post({
      type: 'hello',
      config: { ...base, capabilities: { saves: savesOk, edit: true, send: true }, saves },
    })
    // 殼建好之後才有東西可畫：緊接著送全量訊息，殼跑完冷啟動再喊 ready。
    coldStart()
    syncGeneration()
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
      const timeout = deps.handshakeTimeoutMs ?? 10_000
      if (deps.onHandshakeTimeout && timeout > 0) {
        handshakeTimer = setTimeout(() => { if (!helloSent && !destroyed) deps.onHandshakeTimeout!() }, timeout)
      }
    },
    sync() {
      if (!helloSent || destroyed) return
      // 先訊息後生成旗標：定稿的 done 要在 busy=false 之前到，作者「done 後才解鎖按鈕」的邏輯才順。
      syncMessages()
      syncGeneration()
      syncInput()
    },
    conversationSwitched() {
      if (!helloSent || destroyed) return
      post({ type: 'conversation.switch' })
      coldStart()
    },
    postTheme: (theme) => post({ type: 'theme', theme }),
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
      if (helloSent) { try { post({ type: 'dispose' }) } catch { /* iframe 可能已經拆了 */ } }
      destroyed = true
      win.removeEventListener('message', onMessage)
    },
  }
}
