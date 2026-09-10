import { describe, it, expect, vi } from 'vitest'
import { createHudBridge, HUD_ACTIONS, type HudHost, type HudHostState } from '../canvas-hud-bridge'

function baseState(over: Partial<HudHostState> = {}): HudHostState {
  return {
    character: { id: '7', name: '小夜', avatar: null },
    messages: [
      { id: '0', role: 'assistant', text: '開場白', html: '<p>開場白</p>', opening: true, finished: true, canonicalLatestAI: false },
      { id: '11', role: 'user', text: '你好', html: '<p>你好</p>', opening: false, finished: true, canonicalLatestAI: false },
      { id: '12', role: 'assistant', text: '你好呀', html: '<p>你好呀</p>', opening: false, finished: true, canonicalLatestAI: true, canContinue: true },
    ],
    generation: 'idle',
    streamingMessageId: null,
    inputText: '',
    previewOnly: false,
    editing: { open: false, messageId: null, text: '' },
    model: { selectedId: 'm-a', groups: [{ id: 'g1', label: '一般', models: [{ id: 'm-a', name: 'A', description: '', score: '3' }, { id: 'm-b', name: 'B', description: '', score: '5' }] }] },
    conversations: { currentId: 'c1', rows: [{ id: 'c1', title: '第 1 段', preview: '…', current: true }, { id: 'c2', title: '第 2 段', preview: '…', current: false }], full: false },
    persona: { mode: 'global', modes: [{ id: 'name_only', label: '僅稱呼' }, { id: 'global', label: '全局' }, { id: 'custom', label: '單獨' }], name: '阿明', genders: [{ id: 'male', label: '男' }, { id: 'female', label: '女' }], gender: 'male', identity: '一個路人' },
    moreItems: [{ id: 'directives', label: '自訂指令', kind: 'customInstructions', destructive: false }, { id: 'reset-chat', label: '重置', kind: 'resetChat', destructive: true }],
    ...over,
  }
}

function fakeHost(state: HudHostState = baseState()): HudHost & { calls: Array<[string, unknown[]]> } {
  const calls: Array<[string, unknown[]]> = []
  const rec = (name: string) => (...args: unknown[]) => { calls.push([name, args]); return true }
  return {
    calls,
    read: () => state,
    labels: { notSupported: '這個平台沒有這項功能', generating: 'AI 正在回覆', previewOnly: '本機預覽沒有伺服器', notOpen: '尚未開啟', noTarget: '找不到目標', stale: '目標已變動', confirmRequired: '需要二次確認' },
    sendMessage: rec('sendMessage'), setInputText: rec('setInputText'), exit: rec('exit'),
    copyMessage: rec('copyMessage'), stopGeneration: rec('stopGeneration'), continueGeneration: rec('continueGeneration'),
    regenerateMessage: rec('regenerateMessage'), rollbackMessage: rec('rollbackMessage'), deleteMessage: rec('deleteMessage'),
    openEdit: rec('openEdit'), setEditText: rec('setEditText'), submitEdit: rec('submitEdit'), cancelEdit: rec('cancelEdit'),
    selectModel: rec('selectModel'),
    loadConversations: rec('loadConversations'), selectConversation: rec('selectConversation'), renameConversation: rec('renameConversation'),
    deleteConversation: rec('deleteConversation'), createConversation: rec('createConversation'),
    submitPersona: rec('submitPersona'),
    activateMoreItem: rec('activateMoreItem'),
    refreshConversation: rec('refreshConversation'),
  }
}

describe('canvas-hud-bridge：快照', () => {
  it('每個契約動作都有 capability，快照帶 revision 與 connection', async () => {
    const bridge = createHudBridge(fakeHost())
    await bridge.start()
    const snap = bridge.getSnapshot()
    expect(snap.revision).toBeGreaterThan(0)
    expect(snap.connection.status).toBe('connected')
    for (const action of HUD_ACTIONS) expect(typeof snap.capabilities[action].available).toBe('boolean')
    expect(snap.character.name).toBe('小夜')
    expect(snap.messages.map((m) => m.role)).toEqual(['assistant', 'user', 'assistant'])
    expect(snap.messages[2].capabilities.regenerate).toBe(true)
    expect(snap.messages[0].capabilities.delete).toBe(false)
  })

  it('生成中：送出、刪除、重生成關閉；停止開啟；訊息標 streaming', async () => {
    const bridge = createHudBridge(fakeHost(baseState({ generation: 'streaming', streamingMessageId: '12' })))
    await bridge.start()
    const snap = bridge.getSnapshot()
    expect(snap.generation).toEqual({ status: 'streaming', messageId: '12' })
    expect(snap.capabilities.sendMessage.available).toBe(false)
    expect(snap.capabilities.stopGeneration.available).toBe(true)
    expect(snap.capabilities.deleteMessage.available).toBe(false)
    expect(snap.messages[2].streaming).toBe(true)
  })

  it('refresh 只在內容變了才發 snapshot 事件並推進 revision', async () => {
    let state = baseState()
    const host = fakeHost(); host.read = () => state
    const bridge = createHudBridge(host)
    await bridge.start()
    const events: string[] = []
    bridge.subscribe((e) => events.push(e.type))
    const r0 = bridge.getSnapshot().revision
    bridge.refresh()
    expect(bridge.getSnapshot().revision).toBe(r0)
    state = baseState({ character: { id: '7', name: '小夜（改）', avatar: null } })
    bridge.refresh()
    expect(bridge.getSnapshot().revision).toBe(r0 + 1)
    expect(events).toEqual(['snapshot'])
  })

  it('生成開始與結束會發 generation 事件', async () => {
    let state = baseState()
    const host = fakeHost(); host.read = () => state
    const bridge = createHudBridge(host)
    await bridge.start()
    const events: string[] = []
    bridge.subscribe((e) => events.push(e.type))
    state = baseState({ generation: 'starting' }); bridge.refresh()
    state = baseState({ generation: 'streaming', streamingMessageId: '12' }); bridge.refresh()
    state = baseState(); bridge.refresh()
    expect(events).toEqual(['snapshot', 'generation-started', 'snapshot', 'generation-streaming', 'snapshot', 'generation-finished'])
  })
})

describe('canvas-hud-bridge：動作', () => {
  it('sendMessage 交給宿主；生成中回 NOT_AVAILABLE', async () => {
    const host = fakeHost()
    const bridge = createHudBridge(host)
    await bridge.start()
    const ok = await bridge.invoke('sendMessage', { text: '嗨' })
    expect(ok.ok).toBe(true)
    expect(host.calls).toContainEqual(['sendMessage', ['嗨']])
    let state = baseState({ generation: 'streaming', streamingMessageId: '12' })
    host.read = () => state
    bridge.refresh()
    const no = await bridge.invoke('sendMessage', { text: '嗨' })
    expect(no.ok).toBe(false)
    expect(no.error?.code).toBe('NOT_AVAILABLE')
    void state
  })

  it('缺 payload 回 INVALID_ARGUMENT；未知訊息回 NOT_FOUND', async () => {
    const bridge = createHudBridge(fakeHost())
    await bridge.start()
    expect((await bridge.invoke('sendMessage', {})).error?.code).toBe('INVALID_ARGUMENT')
    expect((await bridge.invoke('rollbackMessage', { messageId: 'nope' })).error?.code).toBe('NOT_FOUND')
  })

  it('deleteMessage 兩階段：先給 token，帶 token 才真的刪；token 過期或指紋變了就拒絕', async () => {
    vi.useFakeTimers()
    let state = baseState()
    const host = fakeHost(); host.read = () => state
    const bridge = createHudBridge(host)
    await bridge.start()
    const first = await bridge.invoke<any>('deleteMessage', { messageId: '12' })
    expect(first.ok).toBe(true)
    expect(first.data.phase).toBe('confirmation-required')
    const token = first.data.confirmation.confirmationToken
    expect(host.calls.find((c) => c[0] === 'deleteMessage')).toBeUndefined()

    const wrong = await bridge.invoke<any>('deleteMessage', { messageId: '12', confirmationToken: 'bogus' })
    expect(wrong.ok).toBe(false)

    const second = await bridge.invoke<any>('deleteMessage', { messageId: '12', confirmationToken: token })
    expect(second.ok).toBe(true)
    expect(second.data.phase).toBe('deleted')
    expect(host.calls).toContainEqual(['deleteMessage', ['12']])

    const again = await bridge.invoke<any>('deleteMessage', { messageId: '12' })
    const t2 = again.data.confirmation.confirmationToken
    vi.advanceTimersByTime(31_000)
    expect((await bridge.invoke('deleteMessage', { messageId: '12', confirmationToken: t2 })).error?.code).toBe('PLATFORM_CHANGED')

    const third = await bridge.invoke<any>('deleteMessage', { messageId: '12' })
    state = baseState({ messages: baseState().messages.map((m) => (m.id === '12' ? { ...m, text: '改過了', html: '改過了' } : m)) })
    bridge.refresh()
    expect((await bridge.invoke('deleteMessage', { messageId: '12', confirmationToken: third.data.confirmation.confirmationToken })).error?.code).toBe('PLATFORM_CHANGED')
    vi.useRealTimers()
  })

  it('模型面板是虛擬的：open 後快照列出模型，selectModel 交給宿主', async () => {
    const host = fakeHost()
    const bridge = createHudBridge(host)
    await bridge.start()
    expect(bridge.getSnapshot().modelPanel.open).toBe(false)
    expect(bridge.getSnapshot().capabilities.selectModel.available).toBe(false)
    expect((await bridge.invoke('openModelSettings')).ok).toBe(true)
    const snap = bridge.getSnapshot()
    expect(snap.modelPanel.open).toBe(true)
    expect(snap.modelPanel.models.map((m) => m.id)).toEqual(['m-a', 'm-b'])
    expect(snap.modelPanel.selectedModelId).toBe('m-a')
    expect(snap.capabilities.openModelSettings.available).toBe(false)
    expect((await bridge.invoke('selectModel', { modelId: 'm-b' })).ok).toBe(true)
    expect(host.calls).toContainEqual(['selectModel', ['m-b']])
    expect((await bridge.invoke('closeModelSettings')).ok).toBe(true)
    expect(bridge.getSnapshot().modelPanel.open).toBe(false)
  })

  it('會話面板：open 會叫宿主載入；選擇、改名、兩階段刪除、建立都走穩定引用', async () => {
    const host = fakeHost()
    const bridge = createHudBridge(host)
    await bridge.start()
    expect((await bridge.invoke('openConversationPanel')).ok).toBe(true)
    expect(host.calls).toContainEqual(['loadConversations', []])
    const panel = bridge.getSnapshot().conversationPanel
    expect(panel.open).toBe(true)
    const other = panel.conversations.find((c) => c.id === 'c2')!
    const ref = { conversationId: other.id, fingerprint: other.fingerprint, index: other.index }
    expect((await bridge.invoke('selectConversation', ref)).ok).toBe(true)
    expect(host.calls).toContainEqual(['selectConversation', ['c2']])
    expect((await bridge.invoke('renameConversation', { ...ref, title: '新名字' })).ok).toBe(true)
    expect(host.calls).toContainEqual(['renameConversation', ['c2', '新名字']])
    const bad = await bridge.invoke('selectConversation', { ...ref, fingerprint: 'stale' })
    expect(bad.error?.code).toBe('PLATFORM_CHANGED')
    const req = await bridge.invoke<any>('requestDeleteConversation', ref)
    expect(req.data.phase).toBe('confirmation-required')
    const del = await bridge.invoke<any>('deleteConversation', { ...ref, confirmationToken: req.data.confirmation.confirmationToken })
    expect(del.data.phase).toBe('deleted')
    expect(host.calls).toContainEqual(['deleteConversation', ['c2']])
    expect((await bridge.invoke('createConversation')).ok).toBe(true)
    expect(host.calls).toContainEqual(['createConversation', []])
  })

  it('人設面板：欄位在 bridge 裡編輯，submit 時整包交給宿主', async () => {
    const host = fakeHost()
    const bridge = createHudBridge(host)
    await bridge.start()
    expect((await bridge.invoke('openPersona')).ok).toBe(true)
    let p = bridge.getSnapshot().personaPanel
    expect(p.open).toBe(true)
    expect(p.name).toBe('阿明')
    expect(p.currentModeId).toBe('global')
    expect((await bridge.invoke('setPersonaMode', { modeId: 'custom' })).ok).toBe(true)
    expect((await bridge.invoke('setPersonaName', { name: '小華' })).ok).toBe(true)
    expect((await bridge.invoke('setPersonaGender', { genderId: 'female' })).ok).toBe(true)
    expect((await bridge.invoke('setPersonaIdentity', { identity: '劍士' })).ok).toBe(true)
    p = bridge.getSnapshot().personaPanel
    expect([p.currentModeId, p.name, p.selectedGenderId, p.identity]).toEqual(['custom', '小華', 'female', '劍士'])
    expect((await bridge.invoke('submitPersona', { name: '小華', identity: '劍士' })).ok).toBe(true)
    expect(host.calls).toContainEqual(['submitPersona', [{ mode: 'custom', name: '小華', gender: 'female', identity: '劍士' }]])
    expect(bridge.getSnapshot().personaPanel.open).toBe(false)
  })

  it('更多選單：非破壞性項目可啟用，破壞性項目擋下', async () => {
    const host = fakeHost()
    const bridge = createHudBridge(host)
    await bridge.start()
    expect((await bridge.invoke('openMoreMenu')).ok).toBe(true)
    const menu = bridge.getSnapshot().moreMenu
    expect(menu.open).toBe(true)
    expect(menu.items.map((i) => i.kind)).toEqual(['customInstructions', 'resetChat'])
    expect((await bridge.invoke('activateMoreMenuItem', { itemId: 'directives' })).ok).toBe(true)
    expect(host.calls).toContainEqual(['activateMoreItem', ['directives']])
    expect((await bridge.invoke('activateMoreMenuItem', { itemId: 'reset-chat' })).error?.code).toBe('NOT_AVAILABLE')
  })

  it('編輯：open 交給宿主並鏡像成 editPanel；submit 帶最新文字', async () => {
    let state = baseState()
    const host = fakeHost(); host.read = () => state
    const bridge = createHudBridge(host)
    await bridge.start()
    expect((await bridge.invoke('openEditMessage', { messageId: '12' })).ok).toBe(true)
    expect(host.calls).toContainEqual(['openEdit', ['12']])
    state = baseState({ editing: { open: true, messageId: '12', text: '你好呀' } }); bridge.refresh()
    expect(bridge.getSnapshot().editPanel).toMatchObject({ open: true, messageId: '12', text: '你好呀' })
    expect((await bridge.invoke('setEditText', { text: '改' })).ok).toBe(true)
    expect((await bridge.invoke('submitEditMessage', { messageId: '12', text: '改' })).ok).toBe(true)
    expect(host.calls).toContainEqual(['submitEdit', ['12', '改']])
  })

  it('沒有對應功能的動作回 NOT_AVAILABLE 並帶宿主的理由文案', async () => {
    const bridge = createHudBridge(fakeHost())
    await bridge.start()
    const r = await bridge.invoke('openChatSettings')
    expect(r.ok).toBe(false)
    expect(r.error?.message).toBe('這個平台沒有這項功能')
    expect(bridge.getRegisteredActions()).not.toContain('openChatSettings')
    expect(bridge.getRegisteredActions()).toContain('stopGeneration')
  })

  it('destroy 冪等，之後 invoke 一律 NOT_AVAILABLE', async () => {
    const bridge = createHudBridge(fakeHost())
    await bridge.start()
    bridge.destroy(); bridge.destroy()
    expect((await bridge.invoke('exit')).error?.code).toBe('NOT_AVAILABLE')
  })
})
