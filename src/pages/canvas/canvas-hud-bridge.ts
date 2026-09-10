/**
 * 給「HUD 外掛」的原生橋（NativeBridge）——用畫布的真實狀態實作，不抓 DOM。
 *
 * 背景：有一類卡片外掛（如 mmd-hud-iframe）把整個聊天畫面蓋成遊戲 HUD，它需要一份
 * 「宿主的可觀察狀態」（Snapshot）加一組「經驗證的原生動作」（NativeAction）。在原平台
 * 它只能翻 DOM、認簡體文案與圖示檔名；那條路在我們這裡搆不到模型入口、編輯、重生成。
 * 所以由畫布直接提供 bridge：資料從反應式狀態來，動作直接呼叫既有函式。
 *
 * 這個模組刻意不 import Vue、不碰 DOM：它吃一個純資料的 `HudHost`（由 canvas.vue 組出來，
 * 跑在作者範圍之外），所以可以用假宿主完整測試。
 *
 * 面板是「虛擬」的：openXxx 只在 bridge 裡翻旗標、把宿主資料鏡像成面板快照，不會真的
 * 打開我們自己的彈層——HUD 蓋滿整頁時，底下開一片彈層沒有人看得到，還會搶焦點。
 * 例外是背景、自訂指令這類 HUD 鏡像不了的真實 UI，交給 activateMoreItem 開真的。
 *
 * 契約的形狀（欄位名、動作名、錯誤碼、兩階段刪除）照外掛的定義原樣照抄，讓 Frame 那側
 * 的執行期解碼器過得了關；契約本身屬於外掛，這裡不擴充也不刪。
 */

export const HUD_ACTIONS = [
  'sendMessage', 'setInputText', 'exit', 'copyMessage', 'stopGeneration', 'continueGeneration',
  'regenerateMessage', 'openEditMessage', 'setEditText', 'applyEditTransform', 'submitEditMessage',
  'cancelEditMessage', 'rollbackMessage', 'startNewStoryFromMessage', 'openComments', 'openSharePanel',
  'copyShareLink', 'closeSharePanel', 'toggleFavorite', 'refreshConversation', 'deleteMessage',
  'editMessage', 'previousBranch', 'nextBranch', 'newChat', 'openModelSettings', 'closeModelSettings',
  'selectModelFilter', 'selectModel', 'openModelConfiguration', 'setModelSetting',
  'submitModelConfiguration', 'closeModelConfiguration', 'openChatSettings', 'closeChatSettings',
  'submitChatSettings', 'openMoreMenu', 'closeMoreMenu', 'activateMoreMenuItem', 'openTutorial',
  'openBackgroundPanel', 'openCustomInstructions', 'openConversationPanel', 'selectConversation',
  'renameConversation', 'requestDeleteConversation', 'deleteConversation', 'createConversation',
  'closeConversationPanel', 'openPersona', 'setPersonaMode', 'setPersonaName', 'setPersonaGender',
  'setPersonaIdentity', 'submitPersona', 'closePersona', 'openSupplement', 'setSupplementText',
  'openSupplementPositionPicker', 'setSupplementPosition', 'confirmSupplementPosition',
  'cancelSupplementPosition', 'submitSupplement', 'closeSupplement', 'openPromptSelector',
  'closePromptSelector', 'applyInstruction',
] as const

export type HudAction = (typeof HUD_ACTIONS)[number]

export type HudMoreKind =
  | 'resetChat' | 'exportChat' | 'newChat' | 'editRole' | 'background'
  | 'customInstructions' | 'persona' | 'supplement' | 'chatSettings' | 'tutorial' | 'unknown'

// ── 宿主給的純資料 ─────────────────────────────────────────────────────

export interface HudHostMessage {
  id: string
  role: 'user' | 'assistant' | 'system'
  text: string
  html: string
  /** 作者寫的開場白：不改寫、不刪、不倒回 */
  opening: boolean
  finished: boolean
  /** 最新那一則正典 AI 回覆（只有它能重生成／改寫） */
  canonicalLatestAI: boolean
  canContinue?: boolean
}

export interface HudHostState {
  character: { id: string | null; name: string; avatar: string | null }
  messages: HudHostMessage[]
  generation: 'idle' | 'starting' | 'streaming'
  streamingMessageId: string | null
  inputText: string
  previewOnly: boolean
  editing: { open: boolean; messageId: string | null; text: string }
  model: {
    selectedId: string
    groups: Array<{ id: string; label: string; models: Array<{ id: string; name: string; description: string; score: string }> }>
  }
  conversations: {
    currentId: string
    rows: Array<{ id: string; title: string; preview: string; current: boolean }>
    full: boolean
  }
  persona: {
    mode: string
    modes: Array<{ id: string; label: string }>
    name: string
    genders: Array<{ id: string; label: string }>
    gender: string
    identity: string
  }
  moreItems: Array<{ id: string; label: string; kind: HudMoreKind; destructive: boolean }>
}

export interface HudHostLabels {
  notSupported: string
  generating: string
  previewOnly: string
  notOpen: string
  noTarget: string
  stale: string
  confirmRequired: string
}

type HostResult = boolean | void | Promise<boolean | void>

export interface HudHost {
  read(): HudHostState
  labels: Partial<HudHostLabels>
  sendMessage(text: string): HostResult
  setInputText(text: string): HostResult
  exit(): HostResult
  copyMessage(messageId: string): HostResult
  stopGeneration(): HostResult
  continueGeneration(messageId: string): HostResult
  regenerateMessage(messageId: string): HostResult
  rollbackMessage(messageId: string): HostResult
  deleteMessage(messageId: string): HostResult
  openEdit(messageId: string): HostResult
  setEditText(text: string): HostResult
  submitEdit(messageId: string, text: string): HostResult
  cancelEdit(): HostResult
  selectModel(modelId: string): HostResult
  loadConversations(): HostResult
  selectConversation(conversationId: string): HostResult
  renameConversation(conversationId: string, title: string): HostResult
  deleteConversation(conversationId: string): HostResult
  createConversation(): HostResult
  submitPersona(fields: { mode: string; name: string; gender: string; identity: string }): HostResult
  activateMoreItem(itemId: string): HostResult
  /** 從某一則分叉出新對話；沒有就不提供 startNewStoryFromMessage */
  forkFromMessage?(messageId: string): HostResult
  /** 重新讀一次歷史；沒有就不提供 refreshConversation */
  refreshConversation?(): HostResult
}

// ── 契約形狀（照外掛原樣） ─────────────────────────────────────────────

export interface HudCapability { available: boolean; reason?: string }
export type HudCapabilityMap = Record<HudAction, HudCapability>

export interface HudMessage {
  id: string
  role: 'user' | 'assistant' | 'system' | 'unknown'
  index: number
  text: string
  html: string
  streaming: boolean
  capabilities: {
    copy: boolean; edit: boolean; delete: boolean; regenerate: boolean
    rollback: boolean; startNewStory: boolean; previousBranch: boolean; nextBranch: boolean
  }
  targetFingerprint?: string
  nativeIndex?: number
}

export interface HudSnapshot {
  revision: number
  character: { id: string | null; name: string; avatar: string | null }
  messages: HudMessage[]
  generation: { status: 'idle' | 'starting' | 'streaming' | 'stopping' | 'error'; messageId: string | null }
  connection: { status: 'connecting' | 'connected' | 'disconnected'; error: string | null }
  editPanel: { open: boolean; messageId: string | null; text: string; transforms: Array<{ id: string; label: string }> }
  sharePanel: { open: boolean; title: string; subtitle: string; link: string }
  modelPanel: {
    open: boolean; title: string
    filters: Array<{ id: string; label: string; active: boolean }>
    models: Array<{ id: string; name: string; description: string; batteryCost: number | null; batteryLabel: string; permission: string; successRate: string; selected: boolean }>
    activeFilterId: string | null; selectedModelId: string | null
  }
  modelConfiguration: { open: boolean; title: string; modelName: string; energyCost: number | null; energyLabel: string; controls: unknown[] }
  moreMenu: { open: boolean; items: Array<{ id: string; label: string; icon: string; kind: HudMoreKind; available: boolean; destructive: boolean }> }
  conversationPanel: {
    open: boolean; title: string
    conversations: Array<{ id: string; fingerprint: string; index: number; title: string; preview: string; avatar: string | null; current: boolean; capabilities: { rename: boolean; delete: boolean } }>
    currentConversationId: string | null
  }
  personaPanel: {
    open: boolean; title: string
    modes: Array<{ id: string; label: string; selected: boolean; disabled: boolean }>
    currentModeId: string | null; name: string; maxLength: number; nameDisabled: boolean
    genderChoices: Array<{ id: string; label: string; selected: boolean; disabled: boolean }>
    selectedGenderId: string | null; identity: string; identityMaxLength: number; identityDisabled: boolean; restriction: string
  }
  supplementPanel: { open: boolean; title: string; text: string; maxLength: number; positionId: string | null; positionLabel: string; picker: { open: boolean; choices: unknown[]; pendingChoiceId: string | null } }
  instructionSelector: { open: boolean; empty: boolean; revision: string; instructions: unknown[] }
  chatSettings: { open: boolean; title: string; empty: boolean; controls: unknown[] }
  capabilities: HudCapabilityMap
}

export type HudErrorCode = 'NOT_FOUND' | 'NOT_AVAILABLE' | 'INVALID_ARGUMENT' | 'TIMEOUT' | 'PLATFORM_CHANGED' | 'UNKNOWN'

export interface HudActionResult<T = unknown> {
  ok: boolean
  action: HudAction
  data?: T
  error?: { code: HudErrorCode; message: string }
}

export type HudBridgeEvent =
  | { type: 'ready'; snapshot: HudSnapshot }
  | { type: 'snapshot'; snapshot: HudSnapshot }
  | { type: 'generation-started'; snapshot: HudSnapshot }
  | { type: 'generation-streaming'; snapshot: HudSnapshot; messageId: string }
  | { type: 'generation-finished'; snapshot: HudSnapshot; messageId: string | null }
  | { type: 'error'; error: { code: HudErrorCode; message: string } }

export interface HudBridge {
  start(): Promise<void>
  destroy(): void
  refresh(): void
  getSnapshot(): HudSnapshot
  getCapabilities(): HudCapabilityMap
  subscribe(listener: (event: HudBridgeEvent) => void): () => void
  invoke<T = unknown>(action: HudAction, payload?: unknown): Promise<HudActionResult<T>>
  sendMessage(text: string): Promise<HudActionResult>
  getRegisteredActions(): readonly HudAction[]
}

// ── 工具 ──────────────────────────────────────────────────────────────

const DEFAULT_LABELS: HudHostLabels = {
  notSupported: '這個平台沒有這項功能',
  generating: 'AI 正在回覆',
  previewOnly: '本機預覽沒有伺服器',
  notOpen: '面板尚未開啟',
  noTarget: '找不到目標',
  stale: '目標已變動，請重新讀取',
  confirmRequired: '需要二次確認',
}

const CONFIRM_TTL_MS = 30_000

function fingerprint(...parts: string[]): string {
  let hash = 2166136261
  const text = parts.join(' ')
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0).toString(36)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function str(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

let tokenSeq = 0
function newToken(): string {
  tokenSeq += 1
  return `hud-confirm-${Date.now().toString(36)}-${tokenSeq.toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

// ── 主體 ──────────────────────────────────────────────────────────────

export function createHudBridge(host: HudHost): HudBridge {
  const labels: HudHostLabels = { ...DEFAULT_LABELS, ...(host.labels || {}) }
  const listeners = new Set<(event: HudBridgeEvent) => void>()
  // 虛擬面板旗標與人設草稿（見檔頭）
  const local = {
    modelOpen: false,
    modelFilterId: null as string | null,
    moreOpen: false,
    conversationsOpen: false,
    personaOpen: false,
    personaDraft: null as null | { mode: string; name: string; gender: string; identity: string },
  }
  // 兩階段確認的 token：綁目標身分與指紋，短期有效
  const confirmations = new Map<string, { kind: 'message' | 'conversation'; id: string; fingerprint: string; index: number; expiresAt: number }>()
  let revision = 0
  let snapshot: HudSnapshot | null = null
  let started = false
  let destroyed = false

  const supportsFork = typeof host.forkFromMessage === 'function'
  const supportsRefresh = typeof host.refreshConversation === 'function'

  const registered: HudAction[] = [
    'sendMessage', 'setInputText', 'exit', 'copyMessage', 'stopGeneration', 'continueGeneration',
    'regenerateMessage', 'openEditMessage', 'setEditText', 'submitEditMessage', 'cancelEditMessage',
    'rollbackMessage', 'deleteMessage',
    'openModelSettings', 'closeModelSettings', 'selectModelFilter', 'selectModel',
    'openMoreMenu', 'closeMoreMenu', 'activateMoreMenuItem', 'openBackgroundPanel', 'openCustomInstructions',
    'openConversationPanel', 'selectConversation', 'renameConversation', 'requestDeleteConversation',
    'deleteConversation', 'createConversation', 'closeConversationPanel',
    'openPersona', 'setPersonaMode', 'setPersonaName', 'setPersonaGender', 'setPersonaIdentity',
    'submitPersona', 'closePersona',
    ...(supportsFork ? (['startNewStoryFromMessage'] as HudAction[]) : []),
    ...(supportsRefresh ? (['refreshConversation'] as HudAction[]) : []),
  ]

  // ── 快照 ─────────────────────────────────────────────────────────

  function messageFingerprint(m: HudHostMessage): string {
    return fingerprint(m.role, m.text)
  }

  function conversationFingerprint(row: { id: string; title: string; preview: string }): string {
    return fingerprint(row.id, row.title, row.preview)
  }

  function buildSnapshot(state: HudHostState, rev: number): HudSnapshot {
    const generating = state.generation !== 'idle'
    const preview = !!state.previewOnly
    const streamingId = state.generation === 'streaming' ? state.streamingMessageId : null
    const lastIndex = state.messages.length - 1

    const messages: HudMessage[] = state.messages.map((m, index) => {
      const isAI = m.role === 'assistant'
      const deletable = !m.opening && m.id !== '0' && !preview
      return {
        id: m.id,
        role: m.role,
        index,
        text: m.text,
        html: m.html,
        streaming: !!streamingId && streamingId === m.id,
        capabilities: {
          copy: true,
          edit: isAI && m.canonicalLatestAI && !m.opening && !preview,
          delete: deletable,
          regenerate: isAI && m.canonicalLatestAI && !m.opening && !preview,
          rollback: !m.opening && m.id !== '0' && index !== lastIndex && !preview,
          startNewStory: supportsFork && isAI && !m.opening && m.id !== '0' && !preview && !state.conversations.full,
          previousBranch: false,
          nextBranch: false,
        },
        targetFingerprint: messageFingerprint(m),
        nativeIndex: index,
      }
    })

    const groups = state.model.groups || []
    const activeGroup = local.modelFilterId ? groups.find((g) => g.id === local.modelFilterId) : null
    const modelRows = (activeGroup ? [activeGroup] : groups).flatMap((g) => g.models)
    const modelPanel: HudSnapshot['modelPanel'] = {
      open: local.modelOpen,
      title: '',
      filters: local.modelOpen ? groups.map((g) => ({ id: g.id, label: g.label, active: local.modelFilterId === g.id })) : [],
      models: local.modelOpen
        ? modelRows.map((m) => ({
          id: m.id,
          name: m.name,
          description: m.description || '',
          batteryCost: m.score !== '' && Number.isFinite(Number(m.score)) ? Number(m.score) : null,
          batteryLabel: m.score || '',
          permission: '',
          successRate: '',
          selected: m.id === state.model.selectedId,
        }))
        : [],
      activeFilterId: local.modelOpen ? local.modelFilterId : null,
      selectedModelId: local.modelOpen ? (state.model.selectedId || null) : null,
    }

    const moreMenu: HudSnapshot['moreMenu'] = {
      open: local.moreOpen,
      items: local.moreOpen
        ? state.moreItems.map((it) => ({ id: it.id, label: it.label, icon: '', kind: it.kind, available: !it.destructive, destructive: it.destructive }))
        : [],
    }

    const rows = state.conversations.rows || []
    const conversationPanel: HudSnapshot['conversationPanel'] = {
      open: local.conversationsOpen,
      title: '',
      conversations: local.conversationsOpen
        ? rows.map((r, index) => ({
          id: r.id,
          fingerprint: conversationFingerprint(r),
          index,
          title: r.title,
          preview: r.preview,
          avatar: null,
          current: r.current,
          capabilities: { rename: true, delete: !r.current },
        }))
        : [],
      currentConversationId: local.conversationsOpen ? (state.conversations.currentId || null) : null,
    }

    const draft = local.personaDraft
    const personaMode = draft ? draft.mode : state.persona.mode
    const personaPanel: HudSnapshot['personaPanel'] = {
      open: local.personaOpen,
      title: '',
      modes: local.personaOpen ? state.persona.modes.map((m) => ({ id: m.id, label: m.label, selected: m.id === personaMode, disabled: false })) : [],
      currentModeId: local.personaOpen ? personaMode : null,
      name: local.personaOpen ? (draft ? draft.name : state.persona.name) : '',
      maxLength: 0,
      nameDisabled: false,
      genderChoices: local.personaOpen
        ? state.persona.genders.map((g) => ({ id: g.id, label: g.label, selected: g.id === (draft ? draft.gender : state.persona.gender), disabled: false }))
        : [],
      selectedGenderId: local.personaOpen ? ((draft ? draft.gender : state.persona.gender) || null) : null,
      identity: local.personaOpen ? (draft ? draft.identity : state.persona.identity) : '',
      identityMaxLength: 0,
      identityDisabled: personaMode === 'name_only',
      restriction: '',
    }

    const no = (reason: string): HudCapability => ({ available: false, reason })
    const yes: HudCapability = { available: true }
    const when = (ok: boolean, reason: string): HudCapability => (ok ? yes : no(reason))
    const unsupported = no(labels.notSupported)
    const hasCanonical = messages.some((m) => m.capabilities.regenerate)
    const hasContinue = state.messages.some((m) => m.canonicalLatestAI && m.canContinue)
    const editing = state.editing.open
    const gen = labels.generating
    const hasMoreKind = (kind: HudMoreKind) => state.moreItems.some((it) => it.kind === kind)

    const capabilities: HudCapabilityMap = {
      sendMessage: when(!generating, gen),
      setInputText: yes,
      exit: yes,
      copyMessage: when(messages.length > 0, labels.noTarget),
      stopGeneration: when(generating, labels.notOpen),
      continueGeneration: when(!generating && hasContinue, generating ? gen : labels.noTarget),
      regenerateMessage: when(!generating && hasCanonical, generating ? gen : labels.noTarget),
      openEditMessage: when(!generating && !editing && hasCanonical, generating ? gen : labels.noTarget),
      setEditText: when(editing, labels.notOpen),
      applyEditTransform: unsupported,
      submitEditMessage: when(editing, labels.notOpen),
      cancelEditMessage: when(editing, labels.notOpen),
      rollbackMessage: when(!generating && messages.some((m) => m.capabilities.rollback), generating ? gen : labels.noTarget),
      startNewStoryFromMessage: supportsFork
        ? when(!generating && messages.some((m) => m.capabilities.startNewStory), generating ? gen : labels.noTarget)
        : unsupported,
      openComments: unsupported,
      openSharePanel: unsupported,
      copyShareLink: unsupported,
      closeSharePanel: unsupported,
      toggleFavorite: unsupported,
      refreshConversation: supportsRefresh ? when(!preview, labels.previewOnly) : unsupported,
      deleteMessage: when(!generating && messages.some((m) => m.capabilities.delete), generating ? gen : labels.noTarget),
      editMessage: unsupported,
      previousBranch: unsupported,
      nextBranch: unsupported,
      newChat: unsupported,
      openModelSettings: when(!preview && !local.modelOpen && !generating, preview ? labels.previewOnly : (generating ? gen : labels.notOpen)),
      closeModelSettings: when(local.modelOpen, labels.notOpen),
      selectModelFilter: when(local.modelOpen && groups.length > 0, labels.notOpen),
      selectModel: when(local.modelOpen && modelRows.length > 0 && !generating, generating ? gen : labels.notOpen),
      openModelConfiguration: unsupported,
      setModelSetting: unsupported,
      submitModelConfiguration: unsupported,
      closeModelConfiguration: unsupported,
      openChatSettings: unsupported,
      closeChatSettings: unsupported,
      submitChatSettings: unsupported,
      openMoreMenu: when(!local.moreOpen, labels.notOpen),
      closeMoreMenu: when(local.moreOpen, labels.notOpen),
      activateMoreMenuItem: when(local.moreOpen && state.moreItems.some((it) => !it.destructive), labels.notOpen),
      openTutorial: hasMoreKind('tutorial') ? yes : unsupported,
      openBackgroundPanel: hasMoreKind('background') ? yes : unsupported,
      openCustomInstructions: hasMoreKind('customInstructions') ? yes : unsupported,
      openConversationPanel: when(!preview && !local.conversationsOpen, preview ? labels.previewOnly : labels.notOpen),
      selectConversation: when(local.conversationsOpen && rows.some((r) => !r.current), labels.notOpen),
      renameConversation: when(local.conversationsOpen && rows.length > 0, labels.notOpen),
      requestDeleteConversation: when(local.conversationsOpen && rows.some((r) => !r.current), labels.notOpen),
      deleteConversation: when(local.conversationsOpen && rows.some((r) => !r.current), labels.notOpen),
      createConversation: when(!preview && !state.conversations.full, preview ? labels.previewOnly : labels.noTarget),
      closeConversationPanel: when(local.conversationsOpen, labels.notOpen),
      openPersona: when(!preview && !local.personaOpen, preview ? labels.previewOnly : labels.notOpen),
      setPersonaMode: when(local.personaOpen && state.persona.modes.length > 0, labels.notOpen),
      setPersonaName: when(local.personaOpen, labels.notOpen),
      setPersonaGender: when(local.personaOpen && state.persona.genders.length > 0, labels.notOpen),
      setPersonaIdentity: when(local.personaOpen && personaMode !== 'name_only', labels.notOpen),
      submitPersona: when(local.personaOpen, labels.notOpen),
      closePersona: when(local.personaOpen, labels.notOpen),
      openSupplement: unsupported,
      setSupplementText: unsupported,
      openSupplementPositionPicker: unsupported,
      setSupplementPosition: unsupported,
      confirmSupplementPosition: unsupported,
      cancelSupplementPosition: unsupported,
      submitSupplement: unsupported,
      closeSupplement: unsupported,
      openPromptSelector: unsupported,
      closePromptSelector: unsupported,
      applyInstruction: unsupported,
    }

    return {
      revision: rev,
      character: { id: state.character.id, name: state.character.name, avatar: state.character.avatar },
      messages,
      generation: {
        status: state.generation === 'idle' ? 'idle' : (streamingId ? 'streaming' : 'starting'),
        messageId: streamingId,
      },
      connection: { status: 'connected', error: null },
      editPanel: { open: editing, messageId: editing ? state.editing.messageId : null, text: editing ? state.editing.text : '', transforms: [] },
      sharePanel: { open: false, title: '', subtitle: '', link: '' },
      modelPanel,
      modelConfiguration: { open: false, title: '', modelName: '', energyCost: null, energyLabel: '', controls: [] },
      moreMenu,
      conversationPanel,
      personaPanel,
      supplementPanel: { open: false, title: '', text: '', maxLength: 0, positionId: null, positionLabel: '', picker: { open: false, choices: [], pendingChoiceId: null } },
      instructionSelector: { open: false, empty: true, revision: '', instructions: [] },
      chatSettings: { open: false, title: '', empty: true, controls: [] },
      capabilities,
    }
  }

  function emit(event: HudBridgeEvent): void {
    for (const listener of listeners) {
      try {
        listener(event.type === 'error' ? event : { ...event, snapshot: clone(event.snapshot) } as HudBridgeEvent)
      } catch (e) {
        // 訂閱者自己壞掉不能拖垮其他人
      }
    }
  }

  /** 重讀宿主，內容有變才發事件、推進 revision。 */
  function refreshNow(): void {
    if (destroyed) return
    let state: HudHostState
    try {
      state = host.read()
    } catch (e) {
      const error = { code: 'PLATFORM_CHANGED' as const, message: e instanceof Error ? e.message : 'read failed' }
      if (snapshot) {
        revision += 1
        snapshot = { ...snapshot, revision, connection: { status: 'disconnected', error: error.message } }
        emit({ type: 'snapshot', snapshot })
      }
      emit({ type: 'error', error })
      return
    }
    const next = buildSnapshot(state, revision + 1)
    if (snapshot) {
      const a = JSON.stringify({ ...snapshot, revision: 0 })
      const b = JSON.stringify({ ...next, revision: 0 })
      if (a === b) return
    }
    const previous = snapshot
    revision += 1
    snapshot = next
    emit({ type: 'snapshot', snapshot })
    if (previous) emitGeneration(previous.generation, next.generation)
  }

  function emitGeneration(prev: HudSnapshot['generation'], next: HudSnapshot['generation']): void {
    if (prev.status === next.status && prev.messageId === next.messageId) return
    const snap = snapshot as HudSnapshot
    if (prev.status === 'idle' && next.status !== 'idle') emit({ type: 'generation-started', snapshot: snap })
    if (next.status === 'streaming' && next.messageId && (prev.status !== 'streaming' || prev.messageId !== next.messageId)) {
      emit({ type: 'generation-streaming', snapshot: snap, messageId: next.messageId })
    }
    if (prev.status !== 'idle' && next.status === 'idle') emit({ type: 'generation-finished', snapshot: snap, messageId: prev.messageId })
  }

  function current(): HudSnapshot {
    if (!snapshot) refreshNow()
    return snapshot as HudSnapshot
  }

  // ── 動作 ─────────────────────────────────────────────────────────

  const fail = (action: HudAction, code: HudErrorCode, message: string): HudActionResult => ({ ok: false, action, error: { code, message } })
  const ok = (action: HudAction, data?: unknown): HudActionResult => (data === undefined ? { ok: true, action } : { ok: true, action, data })

  async function callHost(action: HudAction, run: () => HostResult, data?: unknown): Promise<HudActionResult> {
    try {
      const result = await run()
      if (result === false) return fail(action, 'UNKNOWN', labels.noTarget)
      return ok(action, data)
    } catch (e) {
      return fail(action, 'UNKNOWN', e instanceof Error ? e.message : String(e))
    }
  }

  function findMessage(action: HudAction, payload: unknown): { message: HudMessage; source: HudHostMessage } | HudActionResult {
    const id = isRecord(payload) ? str(payload.messageId) : ''
    if (!id) return fail(action, 'INVALID_ARGUMENT', 'messageId')
    const snap = current()
    const message = snap.messages.find((m) => m.id === id)
    const source = host.read().messages.find((m) => m.id === id)
    if (!message || !source) return fail(action, 'NOT_FOUND', labels.noTarget)
    return { message, source }
  }

  function findConversation(action: HudAction, payload: unknown): { id: string; fingerprint: string; index: number } | HudActionResult {
    if (!isRecord(payload)) return fail(action, 'INVALID_ARGUMENT', 'conversationId')
    const id = str(payload.conversationId)
    const fp = str(payload.fingerprint)
    const index = typeof payload.index === 'number' ? payload.index : -1
    if (!id || !fp || index < 0) return fail(action, 'INVALID_ARGUMENT', 'conversationId / fingerprint / index')
    const rows = host.read().conversations.rows || []
    const row = rows[index]
    if (!row || row.id !== id) {
      // 位置變了：同一個 id 若還在，是清單重排，不是消失
      const stillThere = rows.some((r) => r.id === id)
      return fail(action, stillThere ? 'PLATFORM_CHANGED' : 'NOT_FOUND', stillThere ? labels.stale : labels.noTarget)
    }
    if (conversationFingerprint(row) !== fp) return fail(action, 'PLATFORM_CHANGED', labels.stale)
    return { id, fingerprint: fp, index }
  }

  function issueConfirmation(kind: 'message' | 'conversation', id: string, fp: string, index: number): string {
    const token = newToken()
    confirmations.set(token, { kind, id, fingerprint: fp, index, expiresAt: Date.now() + CONFIRM_TTL_MS })
    return token
  }

  function consumeConfirmation(action: HudAction, token: string, kind: 'message' | 'conversation', id: string, fp: string): HudActionResult | null {
    const entry = confirmations.get(token)
    if (!entry || entry.kind !== kind) return fail(action, 'INVALID_ARGUMENT', labels.confirmRequired)
    confirmations.delete(token)
    if (entry.expiresAt < Date.now()) return fail(action, 'PLATFORM_CHANGED', labels.stale)
    if (entry.id !== id || entry.fingerprint !== fp) return fail(action, 'PLATFORM_CHANGED', labels.stale)
    return null
  }

  function conversationConfirmation(action: HudAction, ref: { id: string; fingerprint: string; index: number }): HudActionResult {
    const token = issueConfirmation('conversation', ref.id, ref.fingerprint, ref.index)
    return ok(action, {
      phase: 'confirmation-required',
      conversationId: ref.id,
      confirmation: { conversationId: ref.id, fingerprint: ref.fingerprint, index: ref.index, confirmationToken: token, prompt: labels.confirmRequired },
    })
  }

  async function dispatch(action: HudAction, payload: unknown): Promise<HudActionResult> {
    const text = () => (isRecord(payload) ? payload.text : undefined)
    switch (action) {
      case 'sendMessage': {
        const value = text()
        if (typeof value !== 'string' || !value.trim()) return fail(action, 'INVALID_ARGUMENT', 'text')
        return callHost(action, () => host.sendMessage(value))
      }
      case 'setInputText': {
        const value = text()
        if (typeof value !== 'string') return fail(action, 'INVALID_ARGUMENT', 'text')
        return callHost(action, () => host.setInputText(value))
      }
      case 'exit': return callHost(action, () => host.exit())
      case 'stopGeneration': return callHost(action, () => host.stopGeneration())
      case 'copyMessage': {
        const found = findMessage(action, payload); if ('ok' in found) return found
        return callHost(action, () => host.copyMessage(found.message.id))
      }
      case 'continueGeneration': {
        const target = host.read().messages.find((m) => m.canonicalLatestAI && m.canContinue)
        if (!target) return fail(action, 'NOT_FOUND', labels.noTarget)
        return callHost(action, () => host.continueGeneration(target.id))
      }
      case 'regenerateMessage': {
        const found = findMessage(action, payload); if ('ok' in found) return found
        if (!found.message.capabilities.regenerate) return fail(action, 'NOT_AVAILABLE', labels.noTarget)
        return callHost(action, () => host.regenerateMessage(found.message.id))
      }
      case 'rollbackMessage': {
        const found = findMessage(action, payload); if ('ok' in found) return found
        if (!found.message.capabilities.rollback) return fail(action, 'NOT_AVAILABLE', labels.noTarget)
        return callHost(action, () => host.rollbackMessage(found.message.id))
      }
      case 'startNewStoryFromMessage': {
        const found = findMessage(action, payload); if ('ok' in found) return found
        const fork = host.forkFromMessage
        if (!found.message.capabilities.startNewStory || !fork) return fail(action, 'NOT_AVAILABLE', labels.noTarget)
        return callHost(action, () => fork.call(host, found.message.id))
      }
      case 'deleteMessage': {
        const found = findMessage(action, payload); if ('ok' in found) return found
        if (!found.message.capabilities.delete) return fail(action, 'NOT_AVAILABLE', labels.noTarget)
        const fp = messageFingerprint(found.source)
        const token = isRecord(payload) ? str(payload.confirmationToken) : ''
        if (!token) {
          const issued = issueConfirmation('message', found.message.id, fp, found.message.index)
          return ok(action, {
            phase: 'confirmation-required',
            messageId: found.message.id,
            confirmation: { messageId: found.message.id, confirmationToken: issued, prompt: labels.confirmRequired, nativeConfirmation: 'handled-if-present' },
          })
        }
        const rejected = consumeConfirmation(action, token, 'message', found.message.id, fp)
        if (rejected) return rejected
        return callHost(action, () => host.deleteMessage(found.message.id), { phase: 'deleted', messageId: found.message.id, nativeConfirmationHandled: true })
      }
      case 'openEditMessage': {
        const found = findMessage(action, payload); if ('ok' in found) return found
        if (!found.message.capabilities.edit) return fail(action, 'NOT_AVAILABLE', labels.noTarget)
        return callHost(action, () => host.openEdit(found.message.id), { messageId: found.message.id })
      }
      case 'setEditText': {
        const value = text()
        if (typeof value !== 'string') return fail(action, 'INVALID_ARGUMENT', 'text')
        return callHost(action, () => host.setEditText(value))
      }
      case 'submitEditMessage': {
        const id = isRecord(payload) ? str(payload.messageId) : ''
        const value = text()
        if (!id || typeof value !== 'string') return fail(action, 'INVALID_ARGUMENT', 'messageId / text')
        const editing = host.read().editing
        if (!editing.open || (editing.messageId && editing.messageId !== id)) return fail(action, 'PLATFORM_CHANGED', labels.stale)
        return callHost(action, () => host.submitEdit(id, value))
      }
      case 'cancelEditMessage': return callHost(action, () => host.cancelEdit())

      case 'openModelSettings': local.modelOpen = true; local.modelFilterId = null; return ok(action, current().modelPanel)
      case 'closeModelSettings': local.modelOpen = false; return ok(action)
      case 'selectModelFilter': {
        const id = isRecord(payload) ? str(payload.filterId) : ''
        if (!id) return fail(action, 'INVALID_ARGUMENT', 'filterId')
        if (!host.read().model.groups.some((g) => g.id === id)) return fail(action, 'NOT_FOUND', labels.noTarget)
        local.modelFilterId = id
        return ok(action)
      }
      case 'selectModel': {
        const id = isRecord(payload) ? str(payload.modelId) : ''
        if (!id) return fail(action, 'INVALID_ARGUMENT', 'modelId')
        if (!host.read().model.groups.some((g) => g.models.some((m) => m.id === id))) return fail(action, 'NOT_FOUND', labels.noTarget)
        return callHost(action, () => host.selectModel(id))
      }

      case 'openMoreMenu': local.moreOpen = true; return ok(action, current().moreMenu)
      case 'closeMoreMenu': local.moreOpen = false; return ok(action)
      case 'activateMoreMenuItem': {
        const id = isRecord(payload) ? str(payload.itemId) : ''
        if (!id) return fail(action, 'INVALID_ARGUMENT', 'itemId')
        const item = host.read().moreItems.find((it) => it.id === id)
        if (!item) return fail(action, 'NOT_FOUND', labels.noTarget)
        if (item.destructive) return fail(action, 'NOT_AVAILABLE', labels.confirmRequired)
        local.moreOpen = false
        return callHost(action, () => host.activateMoreItem(id))
      }
      case 'openTutorial':
      case 'openBackgroundPanel':
      case 'openCustomInstructions': {
        const kind: HudMoreKind = action === 'openTutorial' ? 'tutorial' : action === 'openBackgroundPanel' ? 'background' : 'customInstructions'
        const item = host.read().moreItems.find((it) => it.kind === kind)
        if (!item) return fail(action, 'NOT_AVAILABLE', labels.notSupported)
        local.moreOpen = false
        return callHost(action, () => host.activateMoreItem(item.id))
      }

      case 'openConversationPanel': {
        local.conversationsOpen = true
        const loaded = await callHost(action, () => host.loadConversations())
        return loaded.ok ? ok(action, current().conversationPanel) : loaded
      }
      case 'closeConversationPanel': local.conversationsOpen = false; return ok(action)
      case 'selectConversation': {
        const ref = findConversation(action, payload); if ('ok' in ref) return ref
        return callHost(action, () => host.selectConversation(ref.id))
      }
      case 'renameConversation': {
        const ref = findConversation(action, payload); if ('ok' in ref) return ref
        const title = isRecord(payload) ? str(payload.title) : ''
        if (!title.trim()) return fail(action, 'INVALID_ARGUMENT', 'title')
        return callHost(action, () => host.renameConversation(ref.id, title))
      }
      case 'requestDeleteConversation': {
        const ref = findConversation(action, payload); if ('ok' in ref) return ref
        return conversationConfirmation(action, ref)
      }
      case 'deleteConversation': {
        const ref = findConversation(action, payload); if ('ok' in ref) return ref
        const token = isRecord(payload) ? str(payload.confirmationToken) : ''
        if (!token) return conversationConfirmation(action, ref)
        const rejected = consumeConfirmation(action, token, 'conversation', ref.id, ref.fingerprint)
        if (rejected) return rejected
        return callHost(action, () => host.deleteConversation(ref.id), { phase: 'deleted', conversationId: ref.id })
      }
      case 'createConversation': return callHost(action, () => host.createConversation())

      case 'openPersona': {
        const p = host.read().persona
        local.personaOpen = true
        local.personaDraft = { mode: p.mode, name: p.name, gender: p.gender, identity: p.identity }
        return ok(action, current().personaPanel)
      }
      case 'closePersona': local.personaOpen = false; local.personaDraft = null; return ok(action)
      case 'setPersonaMode': {
        const id = isRecord(payload) ? str(payload.modeId) : ''
        if (!id) return fail(action, 'INVALID_ARGUMENT', 'modeId')
        if (!host.read().persona.modes.some((m) => m.id === id)) return fail(action, 'NOT_FOUND', labels.noTarget)
        local.personaDraft = { ...personaDraft(), mode: id }
        return ok(action)
      }
      case 'setPersonaName': {
        const name = isRecord(payload) ? payload.name : undefined
        if (typeof name !== 'string') return fail(action, 'INVALID_ARGUMENT', 'name')
        local.personaDraft = { ...personaDraft(), name }
        return ok(action)
      }
      case 'setPersonaGender': {
        const id = isRecord(payload) ? str(payload.genderId) : ''
        if (!id) return fail(action, 'INVALID_ARGUMENT', 'genderId')
        if (!host.read().persona.genders.some((g) => g.id === id)) return fail(action, 'NOT_FOUND', labels.noTarget)
        local.personaDraft = { ...personaDraft(), gender: id }
        return ok(action)
      }
      case 'setPersonaIdentity': {
        const identity = isRecord(payload) ? payload.identity : undefined
        if (typeof identity !== 'string') return fail(action, 'INVALID_ARGUMENT', 'identity')
        local.personaDraft = { ...personaDraft(), identity }
        return ok(action)
      }
      case 'submitPersona': {
        const draft = personaDraft()
        const name = isRecord(payload) && typeof payload.name === 'string' ? payload.name : draft.name
        const identity = isRecord(payload) && typeof payload.identity === 'string' ? payload.identity : draft.identity
        const fields = { mode: draft.mode, name, gender: draft.gender, identity }
        const result = await callHost(action, () => host.submitPersona(fields))
        if (result.ok) { local.personaOpen = false; local.personaDraft = null }
        return result
      }
      case 'refreshConversation': {
        const refresh = host.refreshConversation
        if (!refresh) return fail(action, 'NOT_AVAILABLE', labels.notSupported)
        return callHost(action, () => refresh.call(host))
      }
      default:
        return fail(action, 'NOT_AVAILABLE', labels.notSupported)
    }
  }

  function personaDraft(): { mode: string; name: string; gender: string; identity: string } {
    if (local.personaDraft) return local.personaDraft
    const p = host.read().persona
    return { mode: p.mode, name: p.name, gender: p.gender, identity: p.identity }
  }

  // ── 對外 ─────────────────────────────────────────────────────────

  const bridge: HudBridge = {
    async start() {
      if (started && !destroyed) return
      started = true
      destroyed = false
      refreshNow()
      emit({ type: 'ready', snapshot: current() })
    },
    destroy() {
      if (destroyed) return
      destroyed = true
      started = false
      listeners.clear()
      confirmations.clear()
    },
    refresh() { refreshNow() },
    getSnapshot() { return clone(current()) },
    getCapabilities() { return clone(current().capabilities) },
    subscribe(listener) {
      listeners.add(listener)
      return () => { listeners.delete(listener) }
    },
    async invoke<T = unknown>(action: HudAction, payload?: unknown): Promise<HudActionResult<T>> {
      if (destroyed) return fail(action, 'NOT_AVAILABLE', labels.notOpen) as HudActionResult<T>
      if (!(HUD_ACTIONS as readonly string[]).includes(action)) return fail(action, 'INVALID_ARGUMENT', 'action') as HudActionResult<T>
      const capability = current().capabilities[action]
      if (!capability.available) return fail(action, 'NOT_AVAILABLE', capability.reason || labels.notSupported) as HudActionResult<T>
      const result = await dispatch(action, payload)
      if (!destroyed) refreshNow()
      return result as HudActionResult<T>
    },
    sendMessage(text) { return bridge.invoke('sendMessage', { text }) },
    getRegisteredActions() { return registered.slice() },
  }
  return bridge
}
