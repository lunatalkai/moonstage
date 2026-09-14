/**
 * 殼的控制器：把協議訊息接到 DOM、事件匯流排與 sdk 上。不碰 postMessage——那在 main.ts 的
 * 橋裡，所以這一層可以在 jsdom 裡整個跑起來測（cold start 順序、串流、晚訂閱補發…）。
 *
 * 生命週期：
 *   createShell(config) → 建骨架、裝訊息作用域、建 sdk（掛到 window.sdk）、裝卡（樣式進
 *   author-css、腳本跑一次）→ 等宿主的 `messages` → 冷啟動每則 new→mount→done → `ready`。
 */
import type { ChromeState, ChromeUiEvent, HostToShell, SandboxHelloConfig, SandboxMessage, ShellToHost, StageState } from './protocol'
import { createEventBus } from './sdk/events'
import { createSdk, type Sdk, type SdkHost } from './sdk/create-sdk'
import { SdkError, sdkErrorFromHost } from './sdk/errors'
import { installMessageScope } from './scope'
import { installCard, renderContent } from './rules'
import { runAuthorScripts, runInlineScript } from './author-scripts'
import { createMessageList } from './render/message-list'
import { createPanels } from './render/panels'
import { createApp, h } from 'vue'
import CanvasStage from '@/pages/canvas/components/canvas-stage.vue'
import CanvasHeader from '@/pages/canvas/components/canvas-header.vue'
import CanvasComposer from '@/pages/canvas/components/canvas-composer.vue'
import { reactive, ref } from 'vue'
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
  // 三種頁首／輸入區：host＝宿主畫（殼藏起來）；standard＝殼用標準元件畫（資料由宿主送來）；shell＝殼自己的陽春版。
  const standardChrome = config.chrome !== 'host' && !!config.chromeState
  refs.root.setAttribute('data-chrome', config.chrome === 'host' ? 'host' : (standardChrome ? 'standard' : 'shell'))
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

  // ── 手勢：捕獲階段記下，派送完就放掉。只認瀏覽器真的派送的事件（isTrusted）：
  //    作者腳本跟送出鍵、確認框住在同一份文件裡，用程式合成的 click 不能算玩家點過。 ──
  let gesture = false
  const onGesture = (event: Event) => {
    if (!event.isTrusted) return
    gesture = true
    win.setTimeout(() => { gesture = false }, 0)
  }
  doc.addEventListener('click', onGesture, true)
  doc.addEventListener('keydown', onGesture, true)

  let busy = false
  let composing = false
  let stageState: StageState = 'closed'
  let composerVisible = config.composer !== false

  // ── 輸入框：標準輸入區（CanvasComposer 的 textarea）或殼自己的陽春版，同一個介面給 sdk.input 用。 ──
  const chromeState = reactive<ChromeState>(config.chromeState || ({} as ChromeState))
  const inputValue = ref('')
  const composerVm = ref<{ textareaEl?: { el?: HTMLTextAreaElement; $el?: HTMLTextAreaElement } } | null>(null)
  const standardTextarea = (): HTMLTextAreaElement | null => {
    const inner = composerVm.value && composerVm.value.textareaEl
    return (inner && (inner.el || inner.$el)) || null
  }
  const input = {
    get: () => (standardChrome ? inputValue.value : refs.input.value),
    set: (t: string) => { if (standardChrome) inputValue.value = t; else refs.input.value = t },
    focus: () => { const el = standardChrome ? standardTextarea() : refs.input; if (el) el.focus() },
    blur: () => { const el = standardChrome ? standardTextarea() : refs.input; if (el) el.blur() },
    getCursor: () => { const el = standardChrome ? standardTextarea() : refs.input; return el ? (el.selectionStart ?? 0) : input.get().length },
    setCursor: (n: number) => { const el = standardChrome ? standardTextarea() : refs.input; if (!el) return; const p = Math.min(n, input.get().length); try { el.setSelectionRange(p, p) } catch { /* 沒聚焦時部分瀏覽器會丟 */ } },
  }
  // 會花玩家點數的動作（送出、繼續、幫答）只在真的手勢裡轉給宿主；作者腳本要送訊息走 sdk.message.send（有確認框）。
  const COSTLY_UI = new Set<ChromeUiEvent>(['send', 'continue', 'assist'])
  const sendUi = (event: ChromeUiEvent, key?: string) => {
    if (COSTLY_UI.has(event) && !gesture) { debug.warn('ignored: not a user gesture', event); return }
    transport.send(key == null ? { type: 'ui', event } : { type: 'ui', event, key })
  }

  const sdkHost: SdkHost = {
    input: {
      get: () => input.get(),
      set: (t) => { input.set(t); emitInput() },
      focus: () => input.focus(),
      blur: () => input.blur(),
      getCursor: () => input.getCursor(),
      setCursor: (n) => input.setCursor(n),
      composing: () => composing,
    },
    composer: {
      show: () => { composerVisible = true; setComposerVisible(refs, true); transport.send({ type: 'composer', visible: true }) },
      hide: () => { composerVisible = false; setComposerVisible(refs, false); input.blur(); transport.send({ type: 'composer', visible: false }) },
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
  // 狀態欄先掛、腳本後跑：舊頁寫法的卡把引擎零件（隱藏的 span、樣式）放在狀態欄裡，腳本一跑就去找它們，
  // 先跑腳本會找不到、功能少一半（碧藍檔案那張：導覽 13 步變 9 步、開場白裡的檔案面板不出來）。
  // 舞台與訊息列容器也已經在上面掛好了，作者腳本啟動時看得到跟舊頁一樣的骨架。
  if (refs.statusbar) refs.statusbar.innerHTML = config.card.statusbarHtml != null && config.card.statusbarHtml !== '' ? config.card.statusbarHtml : render(config.card.statusbar)
  runAuthorScripts(card.scripts, {
    doc,
    win,
    onError: (ruleName, error) => debug.error(strings.scriptError, ruleName, error),
    onExternalError: (ruleName, src) => debug.warn(strings.externalScriptFailed, ruleName, src),
  })
  // 作者腳本「同一段只跑一次」：裝卡時規則裡的 <script> 已經跑過；正文裡出現同一段（規則套上去的）不再跑，
  // 不同段（例如模型輸出裡帶的）跑一次後也記住。跟 MMD 舊頁「同段去重」的行為一致。
  const ranScripts = new Set<string>(card.scripts.filter((sc) => sc.kind === 'inline').map((sc) => (sc as { code: string }).code))
  const runMessageScripts = (bubble: HTMLElement, codes: string[]) => {
    for (const code of codes) {
      if (ranScripts.has(code)) continue
      ranScripts.add(code)
      scope.run(bubble, () => runInlineScript(code, 'message', { doc, win, onError: (name, e) => debug.error(strings.scriptError, name, e), onExternalError: () => {} }))
    }
  }
  if (refs.statusbar && config.card.statusbarHtml) runMessageScripts(refs.statusbar, Array.from(String(config.card.statusbarHtml).matchAll(/<script[^>]*>([\s\S]*?)<\/script>/gi)).map((m) => m[1]))

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
    onUi: (id, ui) => {
      // 重新生成、繼續（會花點數）同樣只認真的手勢。
      if (ui.kind === 'action' && (ui.key === 'rewrite' || ui.key === 'resume-agent') && !gesture) { debug.warn('ignored: not a user gesture', ui.key); return }
      transport.send({ type: 'message.ui', id, ...ui } as ShellToHost)
    },
    // 宿主的渲染管線保留正文裡的 <script>（跟一般卡同一套信任模型）：掛上後在那則的作用域裡跑一次。
    runScripts: runMessageScripts,
  })

  // ── 輸入區 ──
  // input:change 只在值真的變了才發：冷啟動時宿主同步一次空草稿、殼自己也有初始的空值，
  // 沒有這道去重會在 mount 與 done 之間多冒出兩則空的 input:change。
  let lastInputEmitted = input.get()
  const emitInputChange = () => {
    if (input.get() === lastInputEmitted) return
    lastInputEmitted = input.get()
    bus.emit('input:change', input.get())
  }
  const emitInput = () => {
    emitInputChange()
    transport.send({ type: 'input', value: input.get() })
  }
  refs.input.addEventListener('input', emitInput)
  refs.input.addEventListener('compositionstart', () => { composing = true })
  refs.input.addEventListener('compositionend', () => { composing = false })
  const sendFromComposer = () => {
    const text = input.get()
    if (!text.trim() || busy) return
    request('message.send', [text]).then(() => { input.set(''); emitInput() }, (e) => debug.warn('send failed', e))
  }
  refs.send.addEventListener('click', sendFromComposer)
  refs.input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey && !composing && !(e as KeyboardEvent).isComposing) { e.preventDefault(); sendFromComposer() }
  })
  refs.more.addEventListener('click', () => transport.send({ type: 'action', name: 'more' }))

  // ── 面板與訊息選單：標準元件畫在殼裡，資料由宿主的 panels 訊息送來，事件交回宿主。 ──
  const panelsMount = doc.createElement('div')
  panelsMount.setAttribute('data-chat', 'panels')
  refs.root.appendChild(panelsMount)
  const panels = standardChrome ? createPanels({ mount: panelsMount, send: (panel, event, args) => transport.send({ type: 'panel.ui', panel, event, args }) }) : null

  // ── 標準頁首與輸入區：跟一般卡同一套元件，資料由宿主送來（chrome 訊息），按鍵轉回宿主做。 ──
  let chromeApps: Array<{ unmount(): void }> = []
  const headerResize = typeof ResizeObserver === 'function'
    ? new ResizeObserver(() => refs.root.style.setProperty('--shell-header-h', `${refs.header.offsetHeight}px`))
    : null
  if (standardChrome) {
    refs.header.innerHTML = ''
    refs.composer.innerHTML = ''
    const headerApp = createApp({
      render: () => h(CanvasHeader as unknown as Parameters<typeof h>[0], {
        ...chromeState.header,
        onBack: () => { if (!handleBack()) sendUi('back') },
        onModel: () => sendUi('model'),
      } as Record<string, unknown>),
    })
    headerApp.config.warnHandler = () => {}
    headerApp.mount(refs.header)
    const composerApp = createApp({
      render: () => h(CanvasComposer as unknown as Parameters<typeof h>[0], {
        ref: composerVm,
        ...chromeState.composer,
        value: inputValue.value,
        'onUpdate:value': (v: string) => { inputValue.value = v; emitInput() },
        onSend: () => sendUi('send'),
        onStop: () => sendUi('stop'),
        onContinue: () => sendUi('continue'),
        onMore: () => sendUi('more'),
        onAssist: () => sendUi('assist'),
        onMorePick: (key: string) => sendUi('more-pick', key),
        onModel: () => sendUi('model'),
        onShortcut: (key: string) => sendUi('shortcut', key),
      } as Record<string, unknown>),
    })
    composerApp.config.warnHandler = () => {}
    composerApp.mount(refs.composer)
    chromeApps = [headerApp, composerApp]
    if (headerResize) headerResize.observe(refs.header)
  }

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
        input.set(String(message.value ?? ''))
        emitInputChange()
        return
      case 'chrome':
        Object.assign(chromeState, message.state)
        return
      case 'panels':
        if (panels) panels.set(message.state)
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
      for (const app of chromeApps) { try { app.unmount() } catch { /* 已經拆掉 */ } }
      if (panels) panels.unmount()
      if (headerResize) headerResize.disconnect()
      doc.removeEventListener('click', onGesture, true)
      doc.removeEventListener('keydown', onGesture, true)
      refs.root.remove()
      refs.authorCss.remove()
    },
  }
}
