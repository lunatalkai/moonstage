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
 *   - 移除／切會話／**捲出視窗**：`message:unmount`；捲回來再 `message:mount`（補發記錄換成新的）。
 * 載荷恰好 `{ id, role, content, serverId }`，只傳一個實參。
 *
 * 重畫的做法：定稿時把那則的 Vue 應用整個拆掉重掛（同步），mount 事件才能緊接著發；
 * 串流中的更新走響應式（非同步重繪），氣泡節點不換，作者綁在上面的東西不會掉。
 *
 * 視窗化（跟 MMD 沙箱一致：氣泡捲出螢幕就被銷毀、捲回來重建）：
 *   每則訊息在列表裡永遠有一個外框（順序靠它），但只有視窗附近的外框裡真的掛著氣泡；其餘的
 *   外框是等高的空殼（高度＝拆掉時量到的，沒掛過的用平均值估）。串流中的、以及最末幾則永遠掛著。
 *   誰在視窗附近由 deps.virtualize 決定（殼用 IntersectionObserver，測試用假的）；沒給就全量掛。
 *   量到的數字（300 則、4 倍 CPU 節流）：全量掛冷啟動 11 秒、每輪串流 1 秒（每一段都對 27k 個節點排一次版）。
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

/** 視窗化的依賴：告訴列表哪個外框進出了「視窗附近」，以及捲動容器（補償捲動位置用）。 */
export interface MessageListVirtualize {
  scroller: HTMLElement
  /** 開始盯一個外框；回呼收 true＝進入視窗附近、false＝離開。回傳停止盯的函式。 */
  observe(frame: HTMLElement, onChange: (near: boolean) => void): () => void
  /** 冷啟動時同步掛最末幾則要撐滿多少高度（預設 3 個視窗高）；0＝只掛固定的最少則數。 */
  initialScreens?: number
}

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
  /** 定稿後替正文裡的前端區塊（圍欄裝的整份 HTML 文件）掛 iframe。 */
  mountFrontend?: (bubble: HTMLElement) => void
  /** 視窗化；沒給就全部掛著。 */
  virtualize?: MessageListVirtualize
}

interface EntryState {
  view: MessageView
  chat: { from: SandboxRole; state: string; msgId: string | null; generating: boolean }
}

interface Entry {
  message: SandboxMessage
  frame: HTMLElement
  app: App | null
  /** 掛著時才有；空殼（還沒掛過、或拆掉的）是 null——冷啟動幾百則不必先把每一則的正文都渲染一遍。 */
  state: EntryState | null
  article: HTMLElement
  body: HTMLElement
  activatedHtml: string
  /** 視窗化：這個外框目前在不在視窗附近（觀察者最後一次說的）。 */
  near: boolean
  unobserve: (() => void) | null
}

export interface MessageList {
  reset(messages: SandboxMessage[]): void
  add(message: SandboxMessage): void
  /** 在某則之前插入（載入更早的歷史）：不捲到底，捲動位置補償成畫面不動。 */
  insertBefore(message: SandboxMessage, beforeId: string): void
  stream(id: string, content: string, view?: MessageView): void
  done(id: string, content: string, serverId: string | null, view?: MessageView): void
  setView(id: string, view: MessageView): void
  remove(id: string): void
  /** 掛著的氣泡根；視窗化拆掉的（空殼）回 null。 */
  bubbleOf(id: string): HTMLElement | null
  ids(): string[]
  /** 目前真的掛著氣泡的 id（視窗化用；沒視窗化＝全部）。 */
  mountedIds(): string[]
  clear(): void
}

export function payloadOf(m: SandboxMessage): MessagePayload {
  return { id: m.id, role: m.role, content: m.content, serverId: m.serverId == null ? null : String(m.serverId) }
}

const SCRIPT_RE = /<script[^>]*>([\s\S]*?)<\/script>/gi
/** 最末這幾則永遠掛著（最新的 AI 回覆與玩家那句：作者的收尾邏輯、動作列都在這裡）。 */
const TAIL_PINNED = 2
/** 冷啟動時同步掛的最少則數（沒有版面資訊時，例如測試環境）。 */
const INITIAL_MIN = 4
/** 沒掛過的外框的估高（px），量到真值後改用平均。 */
const DEFAULT_HEIGHT = 160

export function createMessageList(deps: MessageListDeps): MessageList {
  const { doc, list, bus, virtualize } = deps
  const entries = new Map<string, Entry>()
  let seq = 0
  // 估高：拆過的外框量到的平均值。
  let heightSum = 0
  let heightCount = 0
  const estimate = () => (heightCount ? Math.max(24, Math.round(heightSum / heightCount)) : DEFAULT_HEIGHT)
  const learn = (h: number) => { if (h > 0) { heightSum += h; heightCount++ } }

  // 殼自己渲染正文時（宿主沒給 view）的快取：空殼重建、同內容重算狀態都不必再跑一次 markdown＋淨化。
  const rendered = new Map<string, { content: string; html: string }>()
  const renderCached = (m: SandboxMessage): string => {
    const hit = rendered.get(m.id)
    if (hit && hit.content === m.content) return hit.html
    const html = deps.render(m.content)
    rendered.set(m.id, { content: m.content, html })
    return html
  }
  const stateOf = (m: SandboxMessage): EntryState => {
    const generating = m.role === 'ai' && m.state !== 'done' && !m.content
    const view: MessageView = m.view ? { ...m.view } : {
      mesid: seq,
      role: m.role,
      name: m.role === 'ai' ? deps.roleName : deps.userName,
      avatar: m.role === 'ai' ? deps.roleAvatar : deps.userAvatar,
      html: generating ? '' : renderCached(m),
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

  // 定稿後、同一份結果只做一次：前端區塊掛 iframe、正文腳本跑一次。串流中不做（內容每秒變幾十次）。
  // 視窗化拆掉再掛回來算「重建」：activatedHtml 清掉，前端區塊的 iframe 會重掛（跟 MMD 銷毀重建一致）。
  const activate = (entry: Entry) => {
    if (!deps.runScripts && !deps.mountFrontend) return
    const html = String((entry.state && entry.state.view.html) || '')
    if (!html || entry.activatedHtml === html || entry.message.state !== 'done') return
    entry.activatedHtml = html
    if (deps.mountFrontend) deps.mountFrontend(entry.body)
    if (deps.runScripts) {
      const codes: string[] = []
      let m: RegExpExecArray | null
      SCRIPT_RE.lastIndex = 0
      while ((m = SCRIPT_RE.exec(html))) codes.push(m[1])
      if (codes.length) deps.runScripts(entry.article, codes)
    }
  }

  const mountApp = (entry: Entry, grow = true) => {
    if (!entry.state) entry.state = reactive(stateOf(entry.message)) as EntryState
    const state = entry.state
    const id = entry.message.id
    entry.frame.style.height = ''
    entry.frame.removeAttribute('data-virtual')
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
    if (grow && deps.onGrow) deps.onGrow()
  }

  const unmountApp = (entry: Entry) => {
    if (entry.app) { try { entry.app.unmount() } catch { /* 已經拆掉 */ } entry.app = null }
    entry.frame.innerHTML = ''
    entry.article = entry.frame
    entry.body = entry.frame
  }

  const mount = (entry: Entry) => {
    bus.emit('message:mount', payloadOf(entry.message), { bubble: entry.article, key: entry.message.id })
  }

  /** 變成等高空殼：拆掉氣泡、發 unmount、mount 的補發記錄拿掉（done 的留著：定稿只發一次）。 */
  const hollow = (entry: Entry) => {
    if (!entry.app) return
    const height = entry.frame.offsetHeight
    learn(height)
    bus.emit('message:unmount', payloadOf(entry.message), { bubble: entry.article })
    bus.forget(entry.message.id)
    unmountApp(entry)
    entry.state = null
    entry.activatedHtml = ''
    entry.frame.style.height = `${height || estimate()}px`
    entry.frame.setAttribute('data-virtual', '1')
  }

  /** 空殼重建成氣泡：狀態照訊息現況重算，再 mount 一次（補發記錄換成新的）。 */
  const rebuild = (entry: Entry) => {
    if (entry.app) return
    entry.state = null
    mountApp(entry, false)
    mount(entry)
  }

  const order = () => Array.from(entries.values())
  const pinned = (entry: Entry, all: Entry[]) => {
    if (entry.message.state !== 'done') return true
    const idx = all.indexOf(entry)
    return idx >= all.length - TAIL_PINNED
  }

  // 觀察者的回報先收著，一批一起做：掛回來的外框高度會變，畫面上方的變化要補償進 scrollTop，
  // 一批算一次才不會每則都排一次版。
  // 重建有預算：一批最多花這麼多毫秒（快速滑動時一幀會跨過好幾則），沒做完的下一個 tick 再來，
  // 先做離視窗最近的。拆掉很便宜，一批全做。
  const REBUILD_BUDGET_MS = 10
  let batchTimer: ReturnType<typeof setTimeout> | null = null
  const dirty = new Set<Entry>()
  const now = () => (typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now())
  const flush = () => {
    batchTimer = null
    if (!virtualize) return
    const all = order()
    const scroller = virtualize.scroller
    const top = scroller.scrollTop
    const atBottom = top + scroller.clientHeight >= scroller.scrollHeight - 4
    const viewRect = scroller.getBoundingClientRect()
    const viewTop = viewRect.top
    const viewMid = viewTop + (viewRect.height || scroller.clientHeight) / 2
    let delta = 0
    const rebuilds: Array<{ entry: Entry; rect: DOMRect }> = []
    for (const entry of dirty) {
      if (!entries.has(entry.message.id)) continue
      if (entry.near && !entry.app) rebuilds.push({ entry, rect: entry.frame.getBoundingClientRect() })
      else if (!entry.near && entry.app && !pinned(entry, all)) hollow(entry)
    }
    dirty.clear()
    rebuilds.sort((a, b) => Math.abs(a.rect.top + a.rect.height / 2 - viewMid) - Math.abs(b.rect.top + b.rect.height / 2 - viewMid))
    const deadline = now() + REBUILD_BUDGET_MS
    let i = 0
    for (; i < rebuilds.length; i++) {
      if (i > 0 && now() > deadline) break
      const { entry, rect } = rebuilds[i]
      rebuild(entry)
      if (rect.bottom <= viewTop) delta += entry.frame.getBoundingClientRect().height - rect.height
    }
    for (; i < rebuilds.length; i++) dirty.add(rebuilds[i].entry)
    if (atBottom) scroller.scrollTop = scroller.scrollHeight
    else if (delta) scroller.scrollTop = top + delta
    if (dirty.size && batchTimer == null) batchTimer = setTimeout(flush, 0)
  }
  const queue = (entry: Entry) => {
    dirty.add(entry)
    if (batchTimer == null) batchTimer = setTimeout(flush, 0)
  }
  const observe = (entry: Entry) => {
    if (!virtualize || entry.unobserve) return
    entry.unobserve = virtualize.observe(entry.frame, (near) => { entry.near = near; queue(entry) })
  }
  /** 釘住的集合變了（新訊息進來、定稿）：已經不在視窗附近又不再釘住的，下一批拆掉。 */
  const reconcile = () => {
    if (!virtualize) return
    const all = order()
    for (const entry of all) if (entry.app && !entry.near && !pinned(entry, all)) queue(entry)
  }

  const remove = (id: string) => {
    const entry = entries.get(String(id))
    if (!entry) return
    entries.delete(String(id))
    rendered.delete(String(id))
    if (entry.unobserve) { entry.unobserve(); entry.unobserve = null }
    dirty.delete(entry)
    if (entry.app) bus.emit('message:unmount', payloadOf(entry.message), { bubble: entry.article })
    bus.forget(entry.message.id)
    bus.forget(`${entry.message.id}:done`)
    unmountApp(entry)
    entry.frame.remove()
  }

  const makeEntry = (message: SandboxMessage): Entry => {
    const id = String(message.id)
    const m: SandboxMessage = { ...message, id }
    if (!m.state) m.state = m.role === 'user' || m.content ? 'done' : 'pending'
    seq++
    const frame = doc.createElement('div')
    frame.setAttribute('data-chat', 'message-frame')
    return { message: m, frame, app: null, state: null, article: frame, body: frame, activatedHtml: '', near: false, unobserve: null }
  }

  /**
   * 加一則。lazy＝先當空殼（估高），觀察者說進視窗了再建；否則同步建好並 mount。
   * before＝插在那則之前（載入更早的歷史），否則接在最後。
   */
  const add = (message: SandboxMessage, opts: { cold?: boolean; lazy?: boolean; before?: Entry | null } = {}) => {
    const id = String(message.id)
    if (entries.has(id)) remove(id)
    const entry = makeEntry(message)
    if (opts.before) {
      // Map 沒有「插在中間」：重建插入順序（歷史一頁幾十則，這裡的成本可以忽略）。
      const rest = Array.from(entries.entries())
      entries.clear()
      for (const [k, v] of rest) { if (v === opts.before) entries.set(id, entry); entries.set(k, v) }
      if (!entries.has(id)) entries.set(id, entry)
    } else {
      entries.set(id, entry)
    }
    bus.emit('message:new', payloadOf(entry.message))
    if (opts.before) list.insertBefore(entry.frame, opts.before.frame)
    else list.appendChild(entry.frame)
    if (opts.lazy && virtualize) {
      entry.frame.style.height = `${estimate()}px`
      entry.frame.setAttribute('data-virtual', '1')
    } else {
      mountApp(entry, !opts.before)
      mount(entry)
    }
    observe(entry)
    // 冷啟動（歷史訊息）：已定稿的每則補一個 done，作者的收尾邏輯才會對歷史也跑一次。
    if (opts.cold && entry.message.state === 'done') {
      bus.emit('message:done', payloadOf(entry.message), { bubble: entry.app ? entry.article : null, key: `${id}:done` })
    }
    return entry
  }

  /** 換一份狀態（響應式，非同步重繪；節點不換）。 */
  const applyState = (entry: Entry, next: EntryState) => {
    if (!entry.state) return
    for (const k of Object.keys(entry.state.view)) if (!(k in next.view)) delete (entry.state.view as Record<string, unknown>)[k]
    Object.assign(entry.state.view, next.view)
    Object.assign(entry.state.chat, next.chat)
    if (deps.onGrow) deps.onGrow()
  }

  /** 冷啟動要同步掛幾則：從最末往前掛到撐滿 initialScreens 個視窗高，至少 INITIAL_MIN。 */
  const initialMounted = (messages: SandboxMessage[]): number => {
    if (!virtualize) return messages.length
    const screens = virtualize.initialScreens ?? 3
    const viewport = virtualize.scroller.clientHeight || 0
    if (!viewport || !screens) return Math.min(messages.length, INITIAL_MIN)
    return Math.min(messages.length, Math.max(INITIAL_MIN, Math.ceil((viewport * screens) / estimate())))
  }

  return {
    reset(messages) {
      for (const id of Array.from(entries.keys())) remove(id)
      bus.resetReplay()
      const eager = initialMounted(messages)
      messages.forEach((m, i) => add(m, { cold: true, lazy: i < messages.length - eager }))
      if (virtualize && deps.onGrow) deps.onGrow()
    },
    add: (m) => { add(m); reconcile() },
    insertBefore(m, beforeId) {
      const before = entries.get(String(beforeId))
      if (!before) { add(m, { cold: true }); reconcile(); return }
      const scroller = virtualize ? virtualize.scroller : null
      const heightBefore = scroller ? scroller.scrollHeight : 0
      add(m, { cold: true, lazy: true, before })
      // 插在畫面上方：捲動位置跟著長出來的高度走，玩家看的那一則不動。
      if (scroller) scroller.scrollTop += scroller.scrollHeight - heightBefore
    },
    stream(id, content, view) {
      const entry = entries.get(String(id))
      if (!entry) return
      entry.message.content = content
      entry.message.state = 'streaming'
      if (view) entry.message.view = view
      if (!entry.app) rebuild(entry)
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
      if (!entry.app) {
        // 空殼（捲出去的歷史被宿主補 done）：只記狀態，掛回來時照現況重建。
        bus.emit('message:done', payloadOf(entry.message), { bubble: null, key: `${entry.message.id}:done` })
        return
      }
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
      reconcile()
    },
    setView(id, view) {
      const entry = entries.get(String(id))
      if (!entry) return
      entry.message.view = view
      if (!entry.app) return
      applyState(entry, stateOf(entry.message))
    },
    remove,
    bubbleOf: (id) => { const e = entries.get(String(id)); return e && e.app ? e.article : null },
    ids: () => Array.from(entries.keys()),
    mountedIds: () => order().filter((e) => !!e.app).map((e) => e.message.id),
    clear() {
      for (const id of Array.from(entries.keys())) remove(id)
      if (batchTimer != null) { clearTimeout(batchTimer); batchTimer = null }
      dirty.clear()
    },
  }
}
