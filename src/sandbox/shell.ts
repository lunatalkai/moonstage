/**
 * 殼的控制器：把協議訊息接到 DOM、事件匯流排與 sdk 上。不碰 postMessage——那在 main.ts 的
 * 橋裡，所以這一層可以在 jsdom 裡整個跑起來測（cold start 順序、串流、晚訂閱補發…）。
 *
 * 生命週期：
 *   createShell(config) → 建骨架、裝訊息作用域、建 sdk（掛到 window.sdk）、裝卡（樣式進
 *   author-css、腳本跑一次）→ 等宿主的 `messages` → 冷啟動每則 new→mount→done → `ready`。
 */
import type { HostToShell, SandboxHelloConfig, SandboxMessage, ShellToHost, StageState } from './protocol'
import { createEventBus } from './sdk/events'
import { createSdk, type Sdk, type SdkHost } from './sdk/create-sdk'
import { SdkError, sdkErrorFromHost } from './sdk/errors'
import { installMessageScope } from './scope'
import { installCard, renderContent } from './rules'
import { runAuthorScripts } from './author-scripts'
import { createMessageList } from './render/message-list'
import { buildShell, confirmDialog, setComposerVisible, setStage, setTheme, setViewportHeight, type ShellRefs } from './render/shell-dom'
import { createDebugPanel } from './debug'
import { shellStrings } from './strings'

export interface ShellTransport {
  send(message: ShellToHost): void
}

export interface CreateShellOptions {
  doc: Document
  win: Window & typeof globalThis
  mount: HTMLElement
  config: SandboxHelloConfig
  transport: ShellTransport
  /** 網址上有 ?sdkDebug=1 也開面板。 */
  debugFromUrl?: boolean
}

export interface Shell {
  handle(message: HostToShell): void
  refs: ShellRefs
  sdk: Sdk
  dispose(): void
}

export function createShell(options: CreateShellOptions): Shell {
  const { doc, win, mount, config, transport } = options
  const strings = shellStrings(config.locale)
  const debug = createDebugPanel(doc, mount, !!config.debug || !!options.debugFromUrl, (level, args) => transport.send({ type: 'debug', level, args }))

  const refs = buildShell(doc, mount, {
    theme: config.theme,
    strings,
    roleName: config.role.name,
    roleAvatar: config.role.avatarUrl,
    hasStatusbar: !!String(config.card.statusbar || '').trim(),
    composerVisible: config.composer !== false,
    backgroundUrl: config.backgroundUrl,
  })
  if (config.viewportHeight) setViewportHeight(refs, config.viewportHeight)

  const scope = installMessageScope(doc)
  const bus = createEventBus({
    runInScope: (bubble, fn) => scope.run(bubble, fn),
    onError: (event, error) => debug.error(strings.scriptError, event, error),
  })

  // ── 宿主代辦的請求 ──
  let reqSeq = 0
  const pending = new Map<number, { resolve: (v: unknown) => void; reject: (e: unknown) => void }>()
  const request = (op: 'message.send' | 'message.edit' | 'save.set' | 'save.remove', args: unknown[]) =>
    new Promise<unknown>((resolve, reject) => {
      const reqId = ++reqSeq
      pending.set(reqId, { resolve, reject })
      transport.send({ type: 'request', reqId, op, args })
    })

  // ── 手勢：捕獲階段記下，派送完就放掉。 ──
  let gesture = false
  const onGesture = () => {
    gesture = true
    win.setTimeout(() => { gesture = false }, 0)
  }
  doc.addEventListener('click', onGesture, true)
  doc.addEventListener('keydown', onGesture, true)

  let busy = false
  let composing = false
  let stageState: StageState = 'closed'
  let composerVisible = config.composer !== false

  const sdkHost: SdkHost = {
    input: {
      get: () => refs.input.value,
      set: (t) => { refs.input.value = t; emitInput() },
      focus: () => refs.input.focus(),
      blur: () => refs.input.blur(),
      getCursor: () => refs.input.selectionStart ?? 0,
      setCursor: (n) => { const p = Math.min(n, refs.input.value.length); try { refs.input.setSelectionRange(p, p) } catch { /* 沒聚焦時部分瀏覽器會丟 */ } },
      composing: () => composing,
    },
    composer: {
      show: () => { composerVisible = true; setComposerVisible(refs, true); transport.send({ type: 'composer', visible: true }) },
      hide: () => { composerVisible = false; setComposerVisible(refs, false); refs.input.blur(); transport.send({ type: 'composer', visible: false }) },
      visible: () => composerVisible,
    },
    stage: {
      open: (mode) => { stageState = mode; setStage(refs, mode); transport.send({ type: 'stage', state: mode }) },
      close: () => { stageState = 'closed'; setStage(refs, 'closed'); transport.send({ type: 'stage', state: 'closed' }) },
      el: () => refs.stage,
      visible: () => stageState !== 'closed',
    },
    role: () => ({ name: config.role.name, avatarUrl: config.role.avatarUrl }),
    user: () => ({ nickname: config.user.nickname, avatarUrl: config.user.avatarUrl }),
    capabilities: { saves: !!config.capabilities.saves, edit: !!config.capabilities.edit, send: config.capabilities.send !== false },
    request,
    inGesture: () => gesture,
    askSendPermission: () => confirmDialog(doc, refs.root, { title: strings.allowSendTitle, body: strings.allowSendBody, ok: strings.allow, cancel: strings.deny }),
    busy: () => busy,
    debug: (...args) => debug.log(...args),
  }
  const controller = createSdk(sdkHost, bus)
  if (config.capabilities.saves) controller.loadSaves(config.saves || {})
  ;(win as unknown as { sdk: Sdk }).sdk = controller.sdk

  // ── 裝卡：樣式、腳本（在任何 DOM 內容之前）。 ──
  const card = installCard(config.card.rules || [])
  refs.authorCss.textContent = card.styles.join('\n')
  const macros = { user: config.user.nickname || '', char: config.role.name || '' }
  const render = (content: string) => renderContent(content, card.rules, { macros, variants: config.variants || null, doc })
  runAuthorScripts(card.scripts, {
    doc,
    win,
    onError: (ruleName, error) => debug.error(strings.scriptError, ruleName, error),
    onExternalError: (ruleName, src) => debug.warn(strings.externalScriptFailed, ruleName, src),
  })
  if (refs.statusbar) refs.statusbar.innerHTML = render(config.card.statusbar)

  const list = createMessageList({
    doc,
    list: refs.list,
    bus,
    render,
    strings,
    roleName: config.role.name,
    roleAvatar: config.role.avatarUrl,
    userName: config.user.nickname,
    userAvatar: config.user.avatarUrl,
    onGrow: () => { refs.messages.scrollTop = refs.messages.scrollHeight },
  })

  // ── 輸入區 ──
  const emitInput = () => {
    bus.emit('input:change', refs.input.value)
    transport.send({ type: 'input', value: refs.input.value })
  }
  refs.input.addEventListener('input', emitInput)
  refs.input.addEventListener('compositionstart', () => { composing = true })
  refs.input.addEventListener('compositionend', () => { composing = false })
  const sendFromComposer = () => {
    const text = refs.input.value
    if (!text.trim() || busy) return
    request('message.send', [text]).then(() => { refs.input.value = ''; emitInput() }, (e) => debug.warn('send failed', e))
  }
  refs.send.addEventListener('click', sendFromComposer)
  refs.input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey && !composing && !(e as KeyboardEvent).isComposing) { e.preventDefault(); sendFromComposer() }
  })
  refs.more.addEventListener('click', () => transport.send({ type: 'action', name: 'more' }))

  // ── 返回：舞台開著先關舞台（平台關的，發 stage:close）；否則交給宿主。 ──
  const handleBack = (): boolean => {
    if (stageState !== 'closed') {
      sdkHost.stage.close()
      bus.emit('stage:close')
      return true
    }
    bus.emit('back')
    return false
  }
  refs.headerBack.addEventListener('click', () => { if (!handleBack()) transport.send({ type: 'action', name: 'back' }) })

  let readySent = false
  const coldStart = (messages: SandboxMessage[]) => {
    list.reset(messages)
    if (!readySent) {
      readySent = true
      bus.emit('ready')
      transport.send({ type: 'ready' })
    }
  }

  const handle = (message: HostToShell) => {
    switch (message.type) {
      case 'hello':
        // 已經建好；重複的 hello 忽略（宿主重送握手時）。
        return
      case 'messages':
        coldStart(message.messages || [])
        return
      case 'message.new':
        list.add(message.message)
        return
      case 'message.stream':
        list.stream(message.id, message.content)
        return
      case 'message.done':
        list.done(message.id, message.content, message.serverId)
        return
      case 'message.remove':
        list.remove(message.id)
        return
      case 'generation':
        busy = !!message.busy
        refs.root.setAttribute('data-busy', busy ? '1' : '0')
        refs.send.disabled = busy
        return
      case 'input':
        refs.input.value = String(message.value ?? '')
        bus.emit('input:change', refs.input.value)
        return
      case 'reply': {
        const waiter = pending.get(message.reqId)
        if (!waiter) return
        pending.delete(message.reqId)
        if (message.ok) waiter.resolve(message.value)
        else waiter.reject(sdkErrorFromHost(message.error))
        return
      }
      case 'theme':
        setTheme(refs, message.theme)
        bus.emit('theme:change')
        return
      case 'viewport':
        setViewportHeight(refs, message.height)
        return
      case 'conversation.switch':
        if (stageState !== 'closed') { sdkHost.stage.close(); bus.emit('stage:close') }
        list.clear()
        bus.resetReplay()
        bus.emit('conversation:switch')
        return
      case 'back':
        transport.send({ type: 'back-handled', handled: handleBack() })
        return
      case 'dispose':
        bus.emit('dispose')
        return
      default:
        return
    }
  }

  return {
    handle,
    refs,
    sdk: controller.sdk,
    dispose() {
      bus.emit('dispose')
      for (const waiter of pending.values()) waiter.reject(new SdkError('HOST_DENIED', 'shell disposed'))
      pending.clear()
      scope.uninstall()
      doc.removeEventListener('click', onGesture, true)
      doc.removeEventListener('keydown', onGesture, true)
      refs.root.remove()
      refs.authorCss.remove()
    },
  }
}
