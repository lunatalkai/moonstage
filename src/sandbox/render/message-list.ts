/**
 * 訊息列表：氣泡的建立、串流更新、定稿、移除，以及對應的作者事件。
 *
 * 事件契約（作者靠這個順序寫首屏與收尾，見 docs/sandbox-chat-page.md §3）：
 *   - 新氣泡：`message:new` → 畫出來 → `message:mount`。
 *   - 串流：`message:stream`（累積內容，載荷沒有 serverId）。
 *   - 定稿：`message:done`（帶定稿內容與 serverId）→ 氣泡重畫 → `message:mount`。
 *     一則訊息只發一次 done，內容就是最終正文。
 *   - 移除／切會話：`message:unmount`。
 * 載荷恰好 `{ id, role, content, serverId }`，只傳一個實參。
 *
 * 生成中、還沒有字時，正文放平台占位（帶 data-generating="1"），不是模型回的字。
 */
import type { SandboxMessage, SandboxRole } from '../protocol'
import type { EventBus } from '../sdk/events'

export interface MessagePayload {
  id: string
  role: SandboxRole
  content: string
  serverId: string | null
}

export interface MessageListDeps {
  doc: Document
  list: HTMLElement
  bus: EventBus
  render(content: string): string
  strings: { generating: string }
  roleName: string
  roleAvatar: string
  userName: string
  userAvatar: string
  /** 內容變了要捲到底。 */
  onGrow?: () => void
}

interface Entry {
  message: SandboxMessage
  frame: HTMLElement
  article: HTMLElement
  body: HTMLElement
}

export interface MessageList {
  reset(messages: SandboxMessage[]): void
  add(message: SandboxMessage): void
  stream(id: string, content: string): void
  done(id: string, content: string, serverId: string | null): void
  remove(id: string): void
  bubbleOf(id: string): HTMLElement | null
  ids(): string[]
  clear(): void
}

export function payloadOf(m: SandboxMessage): MessagePayload {
  return { id: m.id, role: m.role, content: m.content, serverId: m.serverId == null ? null : String(m.serverId) }
}

export function createMessageList(deps: MessageListDeps): MessageList {
  const { doc, list, bus } = deps
  const entries = new Map<string, Entry>()

  const paint = (entry: Entry) => {
    const m = entry.message
    entry.article.setAttribute('data-from', m.role)
    entry.article.setAttribute('data-state', m.state || 'done')
    if (m.serverId != null) entry.article.setAttribute('data-msg-id', String(m.serverId))
    else entry.article.removeAttribute('data-msg-id')
    const generating = m.role === 'ai' && m.state !== 'done' && !m.content
    if (generating) {
      entry.body.setAttribute('data-generating', '1')
      entry.body.textContent = deps.strings.generating
    } else {
      entry.body.removeAttribute('data-generating')
      entry.body.innerHTML = deps.render(m.content)
    }
    if (deps.onGrow) deps.onGrow()
  }

  const build = (message: SandboxMessage): Entry => {
    const frame = doc.createElement('div')
    frame.setAttribute('data-chat', 'message-frame')
    const article = doc.createElement('article')
    article.setAttribute('data-chat', 'message')
    const avatar = doc.createElement('div')
    avatar.setAttribute('data-chat', 'message-avatar')
    const src = message.role === 'ai' ? deps.roleAvatar : deps.userAvatar
    if (src) { const img = doc.createElement('img'); img.src = src; img.alt = ''; avatar.appendChild(img) }
    const name = doc.createElement('div')
    name.setAttribute('data-chat', 'message-name')
    name.textContent = message.role === 'ai' ? deps.roleName : deps.userName
    const body = doc.createElement('div')
    body.setAttribute('data-chat', 'message-body')
    const extra = doc.createElement('div')
    extra.setAttribute('data-slot', 'message-extra')
    const actions = doc.createElement('div')
    actions.setAttribute('data-chat', 'message-actions')
    article.append(avatar, name, body, extra, actions)
    frame.appendChild(article)
    return { message: { ...message }, frame, article, body }
  }

  const mount = (entry: Entry) => {
    bus.emit('message:mount', payloadOf(entry.message), { bubble: entry.article, key: entry.message.id })
  }

  const add = (message: SandboxMessage, cold = false) => {
    const id = String(message.id)
    if (entries.has(id)) { remove(id) }
    const entry = build({ ...message, id })
    if (!entry.message.state) entry.message.state = entry.message.role === 'user' || entry.message.content ? 'done' : 'pending'
    entries.set(id, entry)
    bus.emit('message:new', payloadOf(entry.message))
    paint(entry)
    list.appendChild(entry.frame)
    mount(entry)
    // 冷啟動（歷史訊息）：已定稿的每則補一個 done，作者的收尾邏輯才會對歷史也跑一次。
    if (cold && entry.message.state === 'done') {
      bus.emit('message:done', payloadOf(entry.message), { bubble: entry.article, key: `${id}:done` })
    }
  }

  const remove = (id: string) => {
    const entry = entries.get(id)
    if (!entry) return
    bus.emit('message:unmount', payloadOf(entry.message), { bubble: entry.article })
    bus.forget(id)
    bus.forget(`${id}:done`)
    entry.frame.remove()
    entries.delete(id)
  }

  return {
    reset(messages) {
      for (const id of Array.from(entries.keys())) remove(id)
      for (const m of messages) add(m, true)
    },
    add: (message) => add(message, false),
    stream(id, content) {
      const entry = entries.get(String(id))
      if (!entry) return
      entry.message.content = content
      entry.message.state = 'streaming'
      paint(entry)
      bus.emit('message:stream', { id: entry.message.id, role: entry.message.role, content }, { bubble: entry.article })
    },
    done(id, content, serverId) {
      const entry = entries.get(String(id))
      if (!entry) return
      // 宿主對「一到就是定稿」的訊息會先送 new（state done、內容齊）再送 done：氣泡已經畫好也 mount 過，
      // 這裡只補 done 事件，不重畫也不再 mount，作者看到的仍是 new → mount → done 一輪。
      const unchanged = entry.message.state === 'done' && entry.message.content === content
      entry.message.content = content
      entry.message.state = 'done'
      entry.message.serverId = serverId == null ? null : String(serverId)
      if (!unchanged) paint(entry)
      bus.emit('message:done', payloadOf(entry.message), { bubble: entry.article, key: `${entry.message.id}:done` })
      // 定稿後氣泡重畫，作者綁在氣泡上的按鈕要重綁：再 mount 一次（補發記錄換成新的）。
      if (!unchanged) mount(entry)
    },
    remove,
    bubbleOf: (id) => entries.get(String(id))?.article || null,
    ids: () => Array.from(entries.keys()),
    clear() {
      for (const id of Array.from(entries.keys())) remove(id)
    },
  }
}
