/**
 * 訊息列表：氣泡的建立、串流更新、定稿、移除，以及對應的作者事件。
 *
 * 氣泡本身用的是**標準播放器的訊息元件**（pages/canvas/components/canvas-message.vue）：
 * 同一份 DOM、同一份樣式、三個點選單與每則訊息的動作列都在，宿主算好的 HTML 直接塞進去。
 * 這樣一般卡與沙箱卡的訊息區長得一模一樣，作者對標準結構寫的美化兩邊都套得上；
 * MMD 新版契約的 `data-chat` 節點名與屬性掛在同一批節點上（元件的 chat 屬性），兩種寫法都認。
 *
 * 事件契約（作者靠這個順序寫首屏與收尾，見 docs/sandbox-chat-page.md §3）：
 *   - 新氣泡：`message:new` → 畫出來 → `message:mount`。
 *   - 串流：`message:stream`（累積內容，載荷沒有 serverId）。
 *   - 定稿：`message:done`（帶定稿內容與 serverId）→ 氣泡重畫 → `message:mount`。
 *     一則訊息只發一次 done，內容就是最終正文；一到就是定稿的（先 new 再 done、內容相同）不重畫。
 *   - 移除／切會話：`message:unmount`。
 * 載荷恰好 `{ id, role, content, serverId }`，只傳一個實參。
 *
 * 重畫的做法：定稿時把那則的 Vue 應用整個拆掉重掛（同步），mount 事件才能緊接著發；
 * 串流中的更新走響應式（非同步重繪），氣泡節點不換，作者綁在上面的東西不會掉。
 */
import { createApp, h, reactive, type App } from 'vue'
import CanvasMessage from '@/pages/canvas/components/canvas-message.vue'
import type { MessageLabels, MessageMenuAnchor, MessageView, SandboxMessage, SandboxRole } from '../protocol'
import type { EventBus } from '../sdk/events'

export interface MessagePayload {
  id: string
  role: SandboxRole
  content: string
  serverId: string | null
}

/** 殼上發生的、要交給宿主做的訊息互動：三個點選單、動作列的鍵、開場白左右切換。 */
export type MessageUi =
  | { kind: 'menu'; anchor: MessageMenuAnchor | null }
  | { kind: 'action'; key: string }
  | { kind: 'swipe'; delta: number }

export interface MessageListDeps {
  doc: Document
  list: HTMLElement
  bus: EventBus
  /** 宿主沒給 html 時（獨立殼、測試）自己渲染正文。 */
  render(content: string): string
  strings: { generating: string }
  roleName: string
  roleAvatar: string
  userName: string
  userAvatar: string
  labels?: MessageLabels
  menuLabel?: string
  /** 內容變了要捲到底。 */
  onGrow?: () => void
  onUi?: (id: string, ui: MessageUi) => void
  /** 正文裡的 <script>（宿主渲染管線保留它們）在氣泡掛上後跑一次。 */
  runScripts?: (bubble: HTMLElement, codes: string[]) => void
}

interface EntryState {
  view: MessageView
  chat: { from: SandboxRole; state: string; msgId: string | null; generating: boolean }
}

interface Entry {
  message: SandboxMessage
  frame: HTMLElement
  app: App | null
  state: EntryState
  article: HTMLElement
  body: HTMLElement
  activatedHtml: string
}

export interface MessageList {
  reset(messages: SandboxMessage[]): void
  add(message: SandboxMessage): void
  stream(id: string, content: string, view?: MessageView): void
  done(id: string, content: string, serverId: string | null, view?: MessageView): void
  setView(id: string, view: MessageView): void
  remove(id: string): void
  bubbleOf(id: string): HTMLElement | null
  ids(): string[]
  clear(): void
}

export function payloadOf(m: SandboxMessage): MessagePayload {
  return { id: m.id, role: m.role, content: m.content, serverId: m.serverId == null ? null : String(m.serverId) }
}

const SCRIPT_RE = /<script[^>]*>([\s\S]*?)<\/script>/gi

export function createMessageList(deps: MessageListDeps): MessageList {
  const { doc, list, bus } = deps
  const entries = new Map<string, Entry>()
  let seq = 0

  const stateOf = (m: SandboxMessage): EntryState => {
    const generating = m.role === 'ai' && m.state !== 'done' && !m.content
    const view: MessageView = m.view ? { ...m.view } : {
      mesid: seq,
      role: m.role,
      name: m.role === 'ai' ? deps.roleName : deps.userName,
      avatar: m.role === 'ai' ? deps.roleAvatar : deps.userAvatar,
      html: generating ? '' : deps.render(m.content),
      loading: generating,
      loadingLabel: deps.strings.generating,
      finished: m.state === 'done',
    }
    if (view.mesid == null) view.mesid = seq
    if (!view.role) view.role = m.role
    if (m.view && generating && !view.loading) view.loading = true
    if (!view.loadingLabel) view.loadingLabel = deps.strings.generating
    return { view, chat: { from: m.role, state: m.state || 'done', msgId: m.serverId == null ? null : String(m.serverId), generating } }
  }

  const activate = (entry: Entry) => {
    if (!deps.runScripts) return
    const html = String(entry.state.view.html || '')
    if (!html || entry.activatedHtml === html || entry.message.state !== 'done') return
    entry.activatedHtml = html
    const codes: string[] = []
    let m: RegExpExecArray | null
    SCRIPT_RE.lastIndex = 0
    while ((m = SCRIPT_RE.exec(html))) codes.push(m[1])
    if (codes.length) deps.runScripts(entry.article, codes)
  }

  const mountApp = (entry: Entry) => {
    const state = entry.state
    const id = entry.message.id
    entry.app = createApp({
      // 元件的 props 型別由 SFC 推導，這裡的 onXxx 事件屬性以任意物件傳入。
      render: () => h(CanvasMessage as unknown as Parameters<typeof h>[0], {
        message: state.view,
        labels: deps.labels,
        menuLabel: deps.menuLabel,
        chat: state.chat,
        onMenu: (anchor: MessageMenuAnchor | null) => { if (deps.onUi) deps.onUi(id, { kind: 'menu', anchor }) },
        onAction: (key: string) => { if (deps.onUi) deps.onUi(id, { kind: 'action', key }) },
        onSwipe: (delta: number) => { if (deps.onUi) deps.onUi(id, { kind: 'swipe', delta }) },
      } as Record<string, unknown>),
    })
    entry.app.config.warnHandler = () => {}
    entry.app.mount(entry.frame)
    entry.article = (entry.frame.querySelector('.mes') as HTMLElement) || entry.frame
    entry.body = (entry.article.querySelector('.mes_text') as HTMLElement) || entry.article
    activate(entry)
    if (deps.onGrow) deps.onGrow()
  }

  const unmountApp = (entry: Entry) => {
    if (entry.app) { try { entry.app.unmount() } catch { /* 已經拆掉 */ } entry.app = null }
    entry.frame.innerHTML = ''
  }

  const mount = (entry: Entry) => {
    bus.emit('message:mount', payloadOf(entry.message), { bubble: entry.article, key: entry.message.id })
  }

  const remove = (id: string) => {
    const entry = entries.get(String(id))
    if (!entry) return
    entries.delete(String(id))
    bus.emit('message:unmount', payloadOf(entry.message), { bubble: entry.article })
    bus.forget(entry.message.id)
    bus.forget(`${entry.message.id}:done`)
    unmountApp(entry)
    entry.frame.remove()
  }

  const add = (message: SandboxMessage, cold = false) => {
    const id = String(message.id)
    if (entries.has(id)) remove(id)
    const m: SandboxMessage = { ...message, id }
    if (!m.state) m.state = m.role === 'user' || m.content ? 'done' : 'pending'
    seq++
    const frame = doc.createElement('div')
    frame.setAttribute('data-chat', 'message-frame')
    const entry: Entry = { message: m, frame, app: null, state: reactive(stateOf(m)) as EntryState, article: frame, body: frame, activatedHtml: '' }
    entries.set(id, entry)
    bus.emit('message:new', payloadOf(m))
    list.appendChild(frame)
    mountApp(entry)
    mount(entry)
    // 冷啟動（歷史訊息）：已定稿的每則補一個 done，作者的收尾邏輯才會對歷史也跑一次。
    if (cold && m.state === 'done') {
      bus.emit('message:done', payloadOf(m), { bubble: entry.article, key: `${id}:done` })
    }
  }

  /** 換一份狀態（響應式，非同步重繪；節點不換）。 */
  const applyState = (entry: Entry, next: EntryState) => {
    for (const k of Object.keys(entry.state.view)) if (!(k in next.view)) delete (entry.state.view as Record<string, unknown>)[k]
    Object.assign(entry.state.view, next.view)
    Object.assign(entry.state.chat, next.chat)
    if (deps.onGrow) deps.onGrow()
  }

  return {
    reset(messages) {
      for (const id of Array.from(entries.keys())) remove(id)
      bus.resetReplay()
      for (const m of messages) add(m, true)
    },
    add: (m) => add(m, false),
    stream(id, content, view) {
      const entry = entries.get(String(id))
      if (!entry) return
      entry.message.content = content
      entry.message.state = 'streaming'
      if (view) entry.message.view = view
      applyState(entry, stateOf(entry.message))
      bus.emit('message:stream', { id: entry.message.id, role: entry.message.role, content }, { bubble: entry.article })
    },
    done(id, content, serverId, view) {
      const entry = entries.get(String(id))
      if (!entry) return
      // 宿主對「一到就是定稿」的訊息會先送 new（state done、內容齊）再送 done：氣泡已經畫好也 mount 過，
      // 這裡只補 done 事件，不重畫也不再 mount，作者看到的仍是 new → mount → done 一輪。
      const sameHtml = !view || !entry.message.view || view.html === entry.message.view.html
      const unchanged = entry.message.state === 'done' && entry.message.content === content && sameHtml
      entry.message.content = content
      entry.message.state = 'done'
      entry.message.serverId = serverId == null ? null : String(serverId)
      if (view) entry.message.view = view
      if (!unchanged) {
        // 定稿後氣泡重畫，作者綁在氣泡上的按鈕要重綁：整顆重掛（同步），再 mount 一次（補發記錄換成新的）。
        unmountApp(entry)
        entry.state = reactive(stateOf(entry.message)) as EntryState
        mountApp(entry)
      } else {
        applyState(entry, stateOf(entry.message))
      }
      bus.emit('message:done', payloadOf(entry.message), { bubble: entry.article, key: `${entry.message.id}:done` })
      if (!unchanged) mount(entry)
    },
    setView(id, view) {
      const entry = entries.get(String(id))
      if (!entry) return
      entry.message.view = view
      applyState(entry, stateOf(entry.message))
    },
    remove,
    bubbleOf: (id) => entries.get(String(id))?.article || null,
    ids: () => Array.from(entries.keys()),
    clear() {
      for (const id of Array.from(entries.keys())) remove(id)
    },
  }
}
