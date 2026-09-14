// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createSandboxHost } from '../canvas-sandbox-host'
import type { HudHost, HudHostMessage, HudHostState } from '../canvas-hud-bridge'
import { envelope, SANDBOX_PROTOCOL_VERSION } from '@/sandbox/protocol'

const ORIGIN = 'https://c1.example.test'

function msg(over: Partial<HudHostMessage> & { id: string }): HudHostMessage {
  return { role: 'assistant', text: '', html: '', opening: false, finished: true, canonicalLatestAI: false, ...over }
}

function makeState(over: Partial<HudHostState> = {}): HudHostState {
  return {
    character: { id: '1', name: '露娜', avatar: null },
    messages: [],
    generation: 'idle',
    streamingMessageId: null,
    inputText: '',
    previewOnly: false,
    editing: { open: false, messageId: null, text: '' },
    model: { selectedId: '', groups: [] },
    conversations: { currentId: 'c1', rows: [], full: false },
    persona: { mode: 'name_only', modes: [], name: '', genders: [], gender: '', identity: '' },
    moreItems: [],
    ...over,
  }
}

function fakeHud(state: { current: HudHostState }) {
  const calls: Array<[string, unknown[]]> = []
  const rec = (name: string) => (...args: unknown[]) => { calls.push([name, args]); return true }
  const hud = {
    labels: {},
    read: () => state.current,
    sendMessage: rec('sendMessage'), setInputText: rec('setInputText'), exit: rec('exit'), copyMessage: rec('copyMessage'),
    stopGeneration: rec('stopGeneration'), continueGeneration: rec('continueGeneration'), regenerateMessage: rec('regenerateMessage'),
    rollbackMessage: rec('rollbackMessage'), deleteMessage: rec('deleteMessage'), openEdit: rec('openEdit'), setEditText: rec('setEditText'),
    submitEdit: rec('submitEdit'), cancelEdit: rec('cancelEdit'), selectModel: rec('selectModel'), loadConversations: rec('loadConversations'),
    selectConversation: rec('selectConversation'), renameConversation: rec('renameConversation'), deleteConversation: rec('deleteConversation'),
    createConversation: rec('createConversation'), submitPersona: rec('submitPersona'), activateMoreItem: rec('activateMoreItem'),
  } as unknown as HudHost
  return { hud, calls }
}

interface Harness {
  posted: Array<Record<string, unknown>>
  fromShell(message: Record<string, unknown>, origin?: string, source?: unknown): void
  iframe: HTMLIFrameElement
}

function harness(): Harness {
  const posted: Array<Record<string, unknown>> = []
  const iframe = document.createElement('iframe')
  document.body.appendChild(iframe)
  const target = { postMessage: (data: unknown) => posted.push(data as Record<string, unknown>) }
  Object.defineProperty(iframe, 'contentWindow', { value: target, configurable: true })
  return {
    posted,
    iframe,
    fromShell(message, origin = ORIGIN, source = target) {
      window.dispatchEvent(new MessageEvent('message', { data: envelope(message as { type: string }), origin, source: source as Window }))
    },
  }
}

const hello = () => ({
  theme: 'dark' as const, locale: 'zh-Hant', role: { name: '露娜', avatarUrl: '' }, user: { nickname: '小明', avatarUrl: '' },
  card: { rules: [], statusbar: '' }, composer: true,
})

const flush = () => new Promise((r) => setTimeout(r, 0))

describe('沙箱宿主橋', () => {
  let h: Harness
  beforeEach(() => { h = harness() })
  afterEach(() => { h.iframe.remove() })

  it('只認來自 iframe 且 origin 相符的訊息；握手後送 hello + 全量訊息（開場白 id 是 greeting、歷史 h<id>）', async () => {
    const state = { current: makeState({ messages: [msg({ id: '10', text: '你好', opening: true }), msg({ id: '11', role: 'user', text: '嗨' }), msg({ id: '12', text: '哈囉', canonicalLatestAI: true })] }) }
    const { hud } = fakeHud(state)
    const host = createSandboxHost({ hud, iframe: h.iframe, win: window, origin: ORIGIN, roleId: '1', hello })
    host.start()
    h.fromShell({ type: 'ready-shell' }, 'https://evil.test')
    h.fromShell({ type: 'ready-shell' }, ORIGIN, window)
    await flush()
    expect(h.posted.length).toBe(0)
    h.fromShell({ type: 'ready-shell' })
    await flush()
    expect(h.posted[0]).toMatchObject({ ms: SANDBOX_PROTOCOL_VERSION, type: 'hello', config: { capabilities: { saves: false, edit: true, send: true }, role: { name: '露娜' } } })
    expect(h.posted[1]).toEqual({ ms: 1, type: 'messages', messages: [
      { id: 'greeting', role: 'ai', content: '你好', serverId: '10', state: 'done' },
      { id: 'h11', role: 'user', content: '嗨', serverId: null, state: 'done' },
      { id: 'h12', role: 'ai', content: '哈囉', serverId: '12', state: 'done' },
    ] })
    expect(h.posted[2]).toEqual({ ms: 1, type: 'generation', busy: false })
    host.destroy()
  })

  it('sync() 在握手前也會讀宿主狀態：宿主用響應式 effect 呼叫，第一次沒讀到就永遠不會再被叫', async () => {
    const state = { current: makeState({ messages: [] }) }
    const { hud } = fakeHud(state)
    let reads = 0
    const spyHud = { ...hud, read: () => { reads++; return state.current } }
    const host = createSandboxHost({ hud: spyHud, iframe: h.iframe, win: window, origin: ORIGIN, roleId: '1', hello })
    host.start()
    host.sync()
    expect(reads).toBe(1)
    expect(h.posted.length).toBe(0)
    h.fromShell({ type: 'ready-shell' })
    await flush()
    // 握手時列表是空的（歷史還在載）：不送全量；歷史一到，那次 sync 才做冷啟動
    expect(h.posted.map((m) => m.type)).toEqual(['hello'])
    state.current = makeState({ messages: [msg({ id: '11', role: 'user', text: '嗨' })] })
    host.sync()
    expect(h.posted.map((m) => m.type)).toEqual(['hello', 'messages', 'generation'])
    expect(h.posted[1]).toMatchObject({ messages: [{ id: 'h11', role: 'user' }] })
    host.destroy()
  })

  it('歷史一直沒到：等過 coldStartTimeoutMs 就用空列表冷啟動，殼才發得出 ready', async () => {
    const state = { current: makeState({ messages: [] }) }
    const { hud } = fakeHud(state)
    const host = createSandboxHost({ hud, iframe: h.iframe, win: window, origin: ORIGIN, roleId: '1', hello, coldStartTimeoutMs: 30 })
    host.start()
    h.fromShell({ type: 'ready-shell' })
    await flush()
    expect(h.posted.map((m) => m.type)).toEqual(['hello'])
    await new Promise((r) => setTimeout(r, 80))
    expect(h.posted.map((m) => m.type)).toEqual(['hello', 'messages', 'generation'])
    expect(h.posted[1]).toEqual({ ms: 1, type: 'messages', messages: [] })
    host.destroy()
  })

  it('差分：送出後 user new、ai new(pending)、串流 stream、定稿 done 只一次；generation 跟著變', async () => {
    const greeting = msg({ id: '10', text: '你好', opening: true })
    const state = { current: makeState({ messages: [greeting] }) }
    const { hud } = fakeHud(state)
    const host = createSandboxHost({ hud, iframe: h.iframe, win: window, origin: ORIGIN, roleId: '1', hello })
    host.start()
    h.fromShell({ type: 'ready-shell' })
    await flush()
    h.posted.length = 0
    state.current = makeState({ generation: 'starting', messages: [greeting, msg({ id: '20', role: 'user', text: '嗨' }), msg({ id: '21', text: '', finished: false })] })
    host.sync()
    state.current = makeState({ generation: 'streaming', streamingMessageId: '21', messages: [greeting, msg({ id: '20', role: 'user', text: '嗨' }), msg({ id: '21', text: '你', finished: false })] })
    host.sync()
    state.current = makeState({ generation: 'streaming', streamingMessageId: '21', messages: [greeting, msg({ id: '20', role: 'user', text: '嗨' }), msg({ id: '21', text: '你好', finished: false })] })
    host.sync()
    host.sync()
    state.current = makeState({ messages: [greeting, msg({ id: '20', role: 'user', text: '嗨' }), msg({ id: '21', text: '你好', finished: true, canonicalLatestAI: true })] })
    host.sync()
    host.sync()
    expect(h.posted.map((p) => p.type)).toEqual(['message.new', 'message.new', 'generation', 'message.stream', 'message.stream', 'message.done', 'generation'])
    expect(h.posted[0]).toMatchObject({ message: { id: 'l1', role: 'user', content: '嗨', serverId: null } })
    expect(h.posted[1]).toMatchObject({ message: { id: 'l2', role: 'ai', content: '', serverId: null, state: 'pending' } })
    expect(h.posted[5]).toEqual({ ms: 1, type: 'message.done', id: 'l2', content: '你好', serverId: '21' })
    host.destroy()
  })

  it('宿主換 id（暫時 id → 正式 id）：同位置同角色、內容相同或尚未定稿 → 追蹤改掛新 id，不發 remove/new', async () => {
    const greeting = msg({ id: '10', text: '你好', opening: true })
    const state = { current: makeState({ messages: [greeting] }) }
    const { hud } = fakeHud(state)
    const host = createSandboxHost({ hud, iframe: h.iframe, win: window, origin: ORIGIN, roleId: '1', hello })
    host.start()
    h.fromShell({ type: 'ready-shell' })
    await flush()
    h.posted.length = 0
    state.current = makeState({ generation: 'starting', messages: [greeting, msg({ id: 'tmp-u', role: 'user', text: '嗨' }), msg({ id: 'tmp-a', text: '', finished: false })] })
    host.sync()
    // 伺服器受理：AI 占位換成正式 id 並開始串流
    state.current = makeState({ generation: 'streaming', streamingMessageId: '21', messages: [greeting, msg({ id: 'tmp-u', role: 'user', text: '嗨' }), msg({ id: '21', text: '你', finished: false })] })
    host.sync()
    state.current = makeState({ messages: [greeting, msg({ id: 'tmp-u', role: 'user', text: '嗨' }), msg({ id: '21', text: '你好', finished: true, canonicalLatestAI: true })] })
    host.sync()
    // 定稿後玩家那則也換成正式 id，內容沒變 → 靜默
    state.current = makeState({ messages: [greeting, msg({ id: '20', role: 'user', text: '嗨' }), msg({ id: '21', text: '你好', finished: true, canonicalLatestAI: true })] })
    host.sync()
    expect(h.posted.map((p) => p.type)).toEqual(['message.new', 'message.new', 'generation', 'message.stream', 'message.done', 'generation'])
    expect(h.posted[3]).toEqual({ ms: 1, type: 'message.stream', id: 'l2', content: '你' })
    expect(h.posted[4]).toEqual({ ms: 1, type: 'message.done', id: 'l2', content: '你好', serverId: '21' })
    // 內容不同又已定稿的換 id 仍然是 remove + new（那是改寫）
    state.current = makeState({ messages: [greeting, msg({ id: '20', role: 'user', text: '嗨' }), msg({ id: '22', text: '換了', finished: true, canonicalLatestAI: true })] })
    host.sync()
    expect(h.posted.slice(6).map((p) => p.type)).toEqual(['message.remove', 'message.new', 'message.done'])
    host.destroy()
  })

  it('已定稿的內容變了（改寫）→ remove + new + done；訊息消失 → remove；切存檔 → conversation.switch + 全量', async () => {
    const state = { current: makeState({ messages: [msg({ id: '30', text: '舊', canonicalLatestAI: true })] }) }
    const { hud } = fakeHud(state)
    const host = createSandboxHost({ hud, iframe: h.iframe, win: window, origin: ORIGIN, roleId: '1', hello })
    host.start()
    h.fromShell({ type: 'ready-shell' })
    await flush()
    h.posted.length = 0
    state.current = makeState({ messages: [msg({ id: '30', text: '新', canonicalLatestAI: true })] })
    host.sync()
    expect(h.posted.map((p) => p.type)).toEqual(['message.remove', 'message.new', 'message.done'])
    expect(h.posted[0]).toMatchObject({ id: 'h30' })
    expect(h.posted[2]).toMatchObject({ id: 'l1', content: '新', serverId: '30' })
    h.posted.length = 0
    state.current = makeState({ messages: [] })
    host.sync()
    expect(h.posted).toEqual([{ ms: 1, type: 'message.remove', id: 'l1' }])
    h.posted.length = 0
    state.current = makeState({ messages: [msg({ id: '40', text: '另一存檔' })] })
    host.conversationSwitched()
    expect(h.posted.map((p) => p.type)).toEqual(['conversation.switch', 'messages'])
    expect(h.posted[1]).toMatchObject({ messages: [{ id: 'h40', serverId: '40' }] })
    host.destroy()
  })

  it('殼的 request：send → hud.sendMessage；edit 用 serverId 找到宿主訊息；save 沒接 → HOST_DENIED；接了走 store', async () => {
    const state = { current: makeState({ messages: [msg({ id: '50', text: 'x', canonicalLatestAI: true })] }) }
    const { hud, calls } = fakeHud(state)
    const saves = { load: vi.fn(async () => ({ hp: 1 })), set: vi.fn(async () => {}), remove: vi.fn(async () => {}) }
    const host = createSandboxHost({ hud, iframe: h.iframe, win: window, origin: ORIGIN, roleId: '7', hello, saves })
    host.start()
    h.fromShell({ type: 'ready-shell' })
    await flush()
    expect(h.posted[0]).toMatchObject({ type: 'hello', config: { capabilities: { saves: true }, saves: { hp: 1 } } })
    h.posted.length = 0
    h.fromShell({ type: 'request', reqId: 1, op: 'message.send', args: ['嗨'] })
    h.fromShell({ type: 'request', reqId: 2, op: 'message.edit', args: ['50', '改'] })
    h.fromShell({ type: 'request', reqId: 3, op: 'message.edit', args: ['99', '改'] })
    h.fromShell({ type: 'request', reqId: 4, op: 'save.set', args: ['hp', 2] })
    h.fromShell({ type: 'request', reqId: 5, op: 'nope', args: [] })
    await flush()
    expect(calls).toContainEqual(['sendMessage', ['嗨']])
    expect(calls).toContainEqual(['openEdit', ['50']])
    expect(calls).toContainEqual(['submitEdit', ['50', '改']])
    expect(saves.set).toHaveBeenCalledWith('7', 'hp', 2)
    // 存檔那筆等 store 的 Promise，回覆順序跟送出順序不同是正常的；按 reqId 排。
    const replies = h.posted.filter((p) => p.type === 'reply').sort((a, b) => Number(a.reqId) - Number(b.reqId))
    expect(replies).toEqual([
      { ms: 1, type: 'reply', reqId: 1, ok: true, value: undefined, error: undefined },
      { ms: 1, type: 'reply', reqId: 2, ok: true, value: undefined, error: undefined },
      { ms: 1, type: 'reply', reqId: 3, ok: false, value: undefined, error: { code: 'INVALID_ARGS', message: 'message not found' } },
      { ms: 1, type: 'reply', reqId: 4, ok: true, value: undefined, error: undefined },
      { ms: 1, type: 'reply', reqId: 5, ok: false, value: undefined, error: { code: 'UNKNOWN_CAPABILITY' } },
    ])
    host.destroy()
    const noSaves = createSandboxHost({ hud, iframe: h.iframe, win: window, origin: ORIGIN, roleId: '7', hello })
    noSaves.start()
    h.fromShell({ type: 'ready-shell' })
    await flush()
    h.posted.length = 0
    h.fromShell({ type: 'request', reqId: 9, op: 'save.set', args: ['hp', 2] })
    await flush()
    expect(h.posted[0]).toMatchObject({ type: 'reply', reqId: 9, ok: false, error: { code: 'HOST_DENIED' } })
    noSaves.destroy()
  })

  it('input 鏡射不回音；action 對應宿主動作；back 交涉；握手逾時回報', async () => {
    vi.useFakeTimers()
    const state = { current: makeState({ messages: [msg({ id: '60', text: 'x', canonicalLatestAI: true })] }) }
    const { hud, calls } = fakeHud(state)
    const actions: string[] = []
    let timedOut = false
    const host = createSandboxHost({ hud, iframe: h.iframe, win: window, origin: ORIGIN, roleId: '1', hello, onAction: (n) => actions.push(n), onBack: () => actions.push('host-back'), handshakeTimeoutMs: 50, onHandshakeTimeout: () => { timedOut = true } })
    host.start()
    await vi.advanceTimersByTimeAsync(60)
    expect(timedOut).toBe(true)
    h.fromShell({ type: 'ready-shell' })
    await vi.advanceTimersByTimeAsync(0)
    h.posted.length = 0
    h.fromShell({ type: 'input', value: '草稿' })
    expect(calls).toContainEqual(['setInputText', ['草稿']])
    state.current = makeState({ ...state.current, inputText: '草稿' })
    host.sync()
    expect(h.posted.filter((p) => p.type === 'input')).toEqual([])
    state.current = makeState({ ...state.current, inputText: '宿主改的' })
    host.sync()
    host.sync()
    expect(h.posted.filter((p) => p.type === 'input')).toEqual([{ ms: 1, type: 'input', value: '宿主改的' }])
    h.fromShell({ type: 'action', name: 'more' })
    h.fromShell({ type: 'action', name: 'stop' })
    h.fromShell({ type: 'action', name: 'regenerate' })
    h.fromShell({ type: 'action', name: 'back' })
    expect(actions).toEqual(['more', 'host-back'])
    expect(calls).toContainEqual(['stopGeneration', []])
    expect(calls).toContainEqual(['regenerateMessage', ['60']])
    const p1 = host.requestBack()
    h.fromShell({ type: 'back-handled', handled: true })
    await expect(p1).resolves.toBe(true)
    const p2 = host.requestBack()
    await vi.advanceTimersByTimeAsync(500)
    await expect(p2).resolves.toBe(false)
    host.destroy()
    expect(h.posted.at(-1)).toEqual({ ms: 1, type: 'dispose' })
    vi.useRealTimers()
  })
})
