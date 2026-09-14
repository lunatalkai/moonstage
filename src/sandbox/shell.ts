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
import { createApp, h } from 'vue'
import CanvasStage from '@/pages/canvas/components/canvas-stage.vue'
// 標準播放器的樣式表整份帶進殼：訊息區的每一條規則跟一般卡同一份。頁首與輸入區的規則在殼裡沒有對應節點，不礙事。
import '@/pages/canvas/canvas.css'
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
  // 宿主接管頁首與輸入區時，殼只畫訊息區：樣式看 data-chrome 藏掉自己的那兩塊（節點留著，作者的 sdk.input 仍有東西可讀）。
  refs.root.setAttribute('data-chrome', config.chrome === 'host' ? 'host' : 'shell')
  // 殼的根同時是標準畫布的根（.canvas-root.chat）：canvas.css 的變數與訊息區規則才套得上。
  refs.root.classList.add('canvas-root', 'chat', 'lt-format-mmd')
  const applyThemeVars = (vars?: Record<string, string>) => {
    if (!vars) return
    for (const [k, v] of Object.entries(vars)) if (/^--lt-canvas-[\w-]+$/.test(k)) refs.root.style.setProperty(k, v)
  }
  applyThemeVars(config.themeVars)
  // 訊息區的容器用標準的舞台元件（#scrollview／#chat／#msglistview 這些作者打得到的名字都在）。
  const stageApp = createApp({ render: () => h(CanvasStage, { backgroundUrl: config.backgroundUrl || undefined }) })
  stageApp.config.warnHandler = () => {}
  stageApp.mount(refs.messages)
  const scrollView = (refs.messages.querySelector('#scrollview') as HTMLElement) || refs.messages
  const listHost = (refs.messages.querySelector('#msglistview') as HTMLElement) || refs.list
  const listAnchor = listHost.querySelector('#chat-scroll-anchor')
  // 氣泡插在捲底哨兵之前：哨兵永遠在最末端。
  const listMount = doc.createElement('div')
  listMount.setAttribute('data-chat', 'list')
  if (listAnchor) listHost.insertBefore(listMount, listAnchor); else listHost.appendChild(listMount)
  refs.list.remove()
  refs.list = listMount
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
    labels: config.labels,
    menuLabel: config.menuLabel,
    onGrow: () => { scrollView.scrollTop = scrollView.scrollHeight },
    // 三個點、動作列、開場白切換：殼只負責畫，做事的是宿主。
    onUi: (id, ui) => transport.send({ type: 'message.ui', id, ...ui } as ShellToHost),
    // 宿主的渲染管線保留正文裡的 <script>（跟一般卡同一套信任模型）：掛上後在那則的作用域裡跑一次。
    runScripts: (bubble, codes) => {
      for (const code of codes) {
        try { scope.run(bubble, () => { (0, eval)(code) }) } catch (e) { debug.error(strings.scriptError, 'message', e) }
      }
    },
  })

  // ── 輸入區 ──
  // input:change 只在值真的變了才發：冷啟動時宿主同步一次空草稿、殼自己也有初始的空值，
  // 沒有這道去重會在 mount 與 done 之間多冒出兩則空的 input:change。
  let lastInputEmitted = refs.input.value
  const emitInputChange = () => {
    if (refs.input.value === lastInputEmitted) return
    lastInputEmitted = refs.input.value
    bus.emit('input:change', refs.input.value)
  }
  const emitInput = () => {
    emitInputChange()
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
        list.stream(message.id, message.content, message.view)
        return
      case 'message.done':
        list.done(message.id, message.content, message.serverId, message.view)
        return
      case 'message.view':
        list.setView(message.id, message.view)
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
        emitInputChange()
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
        applyThemeVars(message.vars)
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
      try { stageApp.unmount() } catch { /* 已經拆掉 */ }
      doc.removeEventListener('click', onGesture, true)
      doc.removeEventListener('keydown', onGesture, true)
      refs.root.remove()
      refs.authorCss.remove()
    },
  }
}
