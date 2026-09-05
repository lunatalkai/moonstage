import { prepTrailFromServerSteps } from '@/utils/prep-step-text'
export interface PendingChatTurn {
  userBubbleId?: string | number
  aiBubbleId?: string | number
  draft?: string
  payload?: any
  socketToken?: number
  expectsAccepted?: boolean
  accepted?: boolean
  chatId?: string | number
  consumedRetryCount?: number
  serverProgress?: boolean
  streamMetaReceived?: boolean
  operationOutcomeCapability?: 'unknown' | 'supported' | 'legacy'
  startedAt?: number
  operationKind?: 'send' | 'retry_generation' | 'rewrite' | 'continue'
  clientOperationId?: string
  operationId?: string
  operationState?: string
  operationVersion?: number
  serverOperationKind?: string
  assistantChatId?: string
  userChatId?: string
  targetChatId?: string
  sourceChatId?: string
  checkpointChatId?: string
  parentOperationId?: string
  sourceOperationId?: string
  outputDisposition?: string
  finishReason?: string
  allowedActions?: string[]
  reasonCode?: string
  messageKey?: string
  preAdmissionErrorType?: string
  preAdmissionErrorAt?: number
  exactIdentityEmptyProbeCount?: number
  frozenStreamErrorConsumed?: boolean
  rewriteSnapshot?: import('./chat-operation-ui-state').RewriteSnapshot | null
}

export const STREAM_ENTRY_VERSION = 2
// 伺服器對「中斷但進度已保留」的原因碼。只有這個碼代表有東西可以續。
export const AGENT_PROGRESS_PRESERVED_REASON = 'agent_progress_preserved'

const CHAT_OPERATION_STATES = new Set([
  'accepted',
  'generating',
  'completed',
  'interrupted',
  // 'stopped' 一度不在這裡,於是每一個「使用者按停止」的操作都被正規化成 null——
  // 客戶端等於看不見它,畫面上只剩使用者自己的訊息,底下空無一物。
  // mobile 那邊追了三輪「左邊是空的」才發現是這一行(2026-08-08)。
  'stopped',
  'failed_retryable',
  'failed_terminal',
])
const TERMINAL_CHAT_OPERATION_STATES = new Set([
  'completed',
  'interrupted',
  'stopped',
  'failed_retryable',
  'failed_terminal',
])
let clientOperationSequence = 0
export const CHAT_OPERATION_RECOVERY_WINDOW_MS = 12 * 1000
export const CHAT_OPERATION_INITIAL_POLL_DELAY_MS = 2 * 1000
export const CHAT_OPERATION_STEADY_POLL_DELAY_MS = 5 * 1000
export const CHAT_OPERATION_SLOW_POLL_DELAY_MS = 60 * 1000

// I-1（No dead end）：普通 one-shot 的任何被接受意圖必須在有界時間內收斂成使用者
// 可見的結果。這是那個「有界時間」的預設值；到期仍非 terminal 就必須誠實放手，
// 不能無限期輪詢下去。agent 模式不適用——見 isChatOperationVisibleOutcomeExpired。
export const CHAT_OPERATION_VISIBLE_OUTCOME_DEADLINE_MS = 5 * 60 * 1000

// 後端說「還在生成」的時候，前端不得自行判死。
//
// 權威只能有一個。這一輪還在不在跑，由伺服器的 operation 狀態決定，不由前端的
// 碼表決定。線上實測（2026-08-30，24 小時窗）：272 輪在伺服器上成功完成、正常
// 落盤，耗時卻落在 300～599 秒（216 筆）與 600 秒以上（56 筆）——全部越過前端的
// 五分鐘上界，而且全部是普通輪次（沒有 passBlocks，拿不到 agent 豁免）。那些人
// 扣了點、伺服器寫好了回覆，畫面卻顯示逾時失敗。
//
// 五分鐘的碼表因此降級成**退路**：只有在「連伺服器現在是什麼狀態都問不到」的
// 時候才用它。問得到、而且答案是還在跑，就繼續等。
//
// 信任窗取 180 秒：慢速輪詢是 30 秒（mobile）／60 秒（desktop），180 秒等於連續
// 漏掉六次或三次。再短會在正常的輪詢抖動下誤判成「問不到」。
export const CHAT_OPERATION_LIVE_STATUS_TRUST_MS = 3 * 60 * 1000

// 只信任白名單內的狀態。寫成「不是終態就算活著」的話，伺服器將來多一個狀態值
// 就會把前端永遠釘住；未知狀態一律退回碼表。
export const CHAT_OPERATION_LIVE_STATES = ['accepted', 'generating']

/**
 * 伺服器最近一次回答是不是「這一輪還在跑」。
 *
 * 兩種時間戳異常分開處理，因為保守的方向不一樣：
 *   - 根本沒有觀測值 → 回 false。我們沒有任何證據，只能退回碼表；回 true 會讓
 *     一個從來沒問到狀態的客戶端永遠不放手。
 *   - 觀測值指向未來（時鐘偏移）→ 回 true。我們確實問到了，只是時鐘怪；比照
 *     本檔既有慣例，拿不到可信基準時寧可繼續等。
 */
export function isChatOperationBackendStillWorking(input: {
  state?: string | null
  observedAt?: number | null
  now: number
}): boolean {
  const state = String(input?.state ?? '').trim()
  if (CHAT_OPERATION_LIVE_STATES.indexOf(state) < 0) return false
  const observedAt = Number(input?.observedAt)
  const now = Number(input?.now)
  if (!Number.isFinite(observedAt) || !Number.isFinite(now)) return false
  const age = now - observedAt
  if (age < 0) return true
  return age <= CHAT_OPERATION_LIVE_STATUS_TRUST_MS
}

// 壓縮 watchdog 的預設兜底間隔。
//
// 這個秒數**不是壓縮的上限**——伺服器端的牆鐘已經移除，判死交給串流靜默偵測。
// 它只剩一個角色：接不到收尾事件時別讓「整理記憶中」卡在畫面上。真正讓 pill
// 撐住的是伺服器每十幾秒重送一次 compacting，每次都把這個 timer 續上。
export const COMPACT_WATCHDOG_DEFAULT_MS = 390 * 1000

// 注入下限。比一次壓縮還短會讓兜底變成誤判——正常壓縮就會被當成事件遺失。
export const COMPACT_WATCHDOG_MIN_MS = 1000

/**
 * 解析 watchdog 間隔的覆寫值。
 *
 * 為什麼需要注入點：到期後的那條分支要壓縮跑超過六分半才走得到，按需重現不了。
 * 沒有注入點的話，接線對不對只能靠上線後撞運氣——而接線正是這裡唯一的風險
 * （決策函式本身有單元測試）。
 *
 * 為什麼只准調短：測試要的是提早到期。調長只會讓卡住的畫面更晚被兜底，那是
 * 幫倒忙；壞值一律退回預設，不讓任何輸入把兜底關掉。
 */
export function resolveCompactWatchdogMs(raw?: unknown): number {
  const parsed = Number(raw)
  if (!Number.isFinite(parsed)) return COMPACT_WATCHDOG_DEFAULT_MS
  if (parsed < COMPACT_WATCHDOG_MIN_MS) return COMPACT_WATCHDOG_DEFAULT_MS
  if (parsed > COMPACT_WATCHDOG_DEFAULT_MS) return COMPACT_WATCHDOG_DEFAULT_MS
  return parsed
}

/**
 * 壓縮 watchdog 到期時該不該放手。
 *
 * 壓縮期間操作停在 accepted，而 accepted 正是「後端還在做」的狀態之一，所以這裡
 * 直接沿用同一個判準——不是新規則，是把既有的權威判斷套到壓縮這個場景。
 *
 * 為什麼不能讓 watchdog 自己清狀態：壓縮是 fail-closed 的。後端沒壓完，前端把
 * 送出鍵放開也沒有用——使用者送出的下一則訊息只會撞上同一份還沒完成的狀態，
 * 而畫面上已經沒有任何東西告訴他發生了什麼。權威只能有一份，而它在後端。
 *
 * watchdog 本來的用途是「SSE 事件遺失時不要卡住畫面」，那個用途仍然成立——
 * 只是恢復的方式應該是「去問後端」，不是「假設它結束了」。
 */
export function resolveCompactWatchdogAction(input: {
  state?: string | null
  observedAt?: number | null
  now: number
}): 'keep-waiting' | 'release' {
  return isChatOperationBackendStillWorking(input) ? 'keep-waiting' : 'release'
}

/**
 * 這一輪算不算 agent 模式。任一來源說 true 就是 true。
 *
 * 刻意**不是**「伺服器優先」。伺服器那個 agentTurn 是 dispatch 階段才寫進
 * billingSnapshot 的（server 端註解：Agent mode is a dispatch-stage fact），
 * 所以 state=accepted 的整個準備階段它一律是 false——而那正好是這個判斷唯一
 * 重要的窗口。讓它覆蓋本地已知的事實，等於整段修法在關鍵時刻失效。
 *
 * 三個來源各自涵蓋一段時間：本機開關涵蓋送出當下，持久化那一筆涵蓋重整之後，
 * 伺服器那份涵蓋冷啟動與換裝置（正文開始生成之後才會為真）。
 */
export function resolveAgentTurnForOwnership(input: {
  status?: { agentTurn?: boolean } | null
  entry?: { agentTurn?: boolean } | null
  localAgentTurn?: boolean
}): boolean {
  if (input?.status?.agentTurn === true) return true
  if (input?.entry?.agentTurn === true) return true
  return input?.localAgentTurn === true
}

function resolveVisibleOutcomeTimestamp(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null
  }
  if (typeof value === 'string') {
    const trimmed = value.trim()
    if (!trimmed) return null
    if (/^-?\d+(\.\d+)?$/.test(trimmed)) {
      const numeric = Number(trimmed)
      return Number.isFinite(numeric) ? numeric : null
    }
    const parsed = Date.parse(trimmed)
    return Number.isFinite(parsed) ? parsed : null
  }
  return null
}

/**
 * I-1 的純判斷：是否已超過使用者可見結果的有界時間。伺服器 acceptedAt 優先於
 * 本機 localStartedAt，因為它跨重整、跨裝置一致，不受本機時鐘或重整重置影響。
 * 兩者都缺、或時間戳指向未來（時鐘偏移）一律回傳 false——拿不到可信基準時
 * 寧可保守不放手，放手錯了會製造重複扣點。
 */
export function isChatOperationVisibleOutcomeExpired(input: {
  acceptedAt?: string | number | null
  localStartedAt?: number | null
  now: number
  deadlineMs?: number
  agentTurn?: boolean
}): boolean {
  // agent 輪次不套這條上界：一輪要打三到五次模型，跑六分鐘、十分鐘都是正常的。
  // 套上去的話使用者看到的是「還在跑的那一輪突然消失」，而後端好好的。它什麼
  // 時候停由伺服器決定（使用者按停止，或內部重試耗盡），不由前端的碼表決定。
  if (input?.agentTurn === true) return false
  const now = Number(input?.now)
  if (!Number.isFinite(now)) return false
  const deadlineMs = Math.max(
    0,
    Number(input?.deadlineMs ?? CHAT_OPERATION_VISIBLE_OUTCOME_DEADLINE_MS),
  )
  const baseline = resolveVisibleOutcomeTimestamp(input?.acceptedAt)
    ?? resolveVisibleOutcomeTimestamp(input?.localStartedAt)
  if (baseline === null) return false
  const elapsed = now - baseline
  if (elapsed < 0) return false
  return elapsed > deadlineMs
}

function nonNegativeIntegerOrUndefined(value: unknown): number | undefined {
  if (value === null || value === undefined) return undefined
  const normalized = Number(value)
  return Number.isInteger(normalized) && normalized >= 0 ? normalized : undefined
}

export interface OperationStatusPollScheduler {
  schedule(callback: () => void): boolean
  scheduleSlow(callback: () => void): boolean
  pause(): void
  cancel(): void
  hasPending(): boolean
  isExhausted(): boolean
}

export function createOperationStatusPollScheduler(options: {
  windowMs?: number
  initialDelayMs?: number
  steadyDelayMs?: number
  slowDelayMs?: number
} = {}): OperationStatusPollScheduler {
  const windowMs = Math.max(0, Number(options.windowMs ?? CHAT_OPERATION_RECOVERY_WINDOW_MS))
  const initialDelayMs = Math.max(
    2 * 1000,
    Number(options.initialDelayMs ?? CHAT_OPERATION_INITIAL_POLL_DELAY_MS),
  )
  const steadyDelayMs = Math.max(
    2 * 1000,
    Number(options.steadyDelayMs ?? CHAT_OPERATION_STEADY_POLL_DELAY_MS),
  )
  const slowDelayMs = Math.max(
    30 * 1000,
    Number(options.slowDelayMs ?? CHAT_OPERATION_SLOW_POLL_DELAY_MS),
  )
  let timer: ReturnType<typeof setTimeout> | null = null
  let elapsedScheduledMs = 0
  let attempt = 0
  let generation = 0

  const clearPendingTimer = () => {
    generation += 1
    if (timer !== null) clearTimeout(timer)
    timer = null
  }

  const scheduleWithDelay = (callback: () => void, delay: number): boolean => {
    if (typeof callback !== 'function' || timer !== null) return false
    const ownedGeneration = ++generation
    timer = setTimeout(() => {
      if (ownedGeneration !== generation) return
      timer = null
      callback()
    }, delay)
    return true
  }

  return {
    schedule(callback: () => void): boolean {
      if (typeof callback !== 'function' || timer !== null) return false
      const delay = attempt === 0 ? initialDelayMs : steadyDelayMs
      if (elapsedScheduledMs + delay > windowMs) return false
      elapsedScheduledMs += delay
      attempt += 1
      return scheduleWithDelay(callback, delay)
    },
    scheduleSlow(callback: () => void): boolean {
      if (!this.isExhausted()) return false
      return scheduleWithDelay(callback, slowDelayMs)
    },
    pause(): void {
      clearPendingTimer()
    },
    cancel(): void {
      clearPendingTimer()
      elapsedScheduledMs = 0
      attempt = 0
    },
    hasPending(): boolean {
      return timer !== null
    },
    isExhausted(): boolean {
      const delay = attempt === 0 ? initialDelayMs : steadyDelayMs
      return timer === null && elapsedScheduledMs + delay > windowMs
    },
  }
}

export interface ChatOperationStatus {
  operationId: string
  clientOperationId?: string
  kind: string
  state: string
  version?: number
  conversationId?: string
  assistantChatId?: string
  userChatId?: string
  targetChatId?: string
  sourceChatId?: string
  checkpointChatId?: string
  parentOperationId?: string
  sourceOperationId?: string
  outputDisposition?: string
  finishReason?: string
  reasonCode?: string
  messageKey?: string
  allowedActions?: string[]
  retryable?: boolean
  // 伺服器把這一輪被接受當下凍結的 agent 模式投影出來。舊伺服器不帶這個欄位，
  // 留 undefined 讓呼叫端退回本地判斷——當成 false 會讓 agent 輪次在冷啟動後
  // 又被套上五分鐘上界。
  agentTurn?: boolean
  acceptedAt?: string
  terminalAt?: string
  lastUpdateTime?: string
}

export function createClientOperationId(
  now = Date.now(),
  randomValue = Math.random(),
): string {
  clientOperationSequence += 1
  const safeNow = Number.isFinite(Number(now)) ? Math.max(0, Math.floor(Number(now))) : Date.now()
  const safeRandom = Number.isFinite(Number(randomValue))
    ? Math.abs(Number(randomValue) % 1)
    : Math.random()
  const randomToken = Math.floor(safeRandom * 0x100000000).toString(36)
  return `chat-${safeNow.toString(36)}-${clientOperationSequence.toString(36)}-${randomToken}`.slice(0, 64)
}

export function normalizeChatOperationStatus(input: any): ChatOperationStatus | null {
  if (!input || typeof input !== 'object') return null
  if (
    input.schemaVersion !== undefined
    && String(input.schemaVersion || '').trim() !== 'outcome_v1'
  ) {
    return null
  }
  const source = input.operation && typeof input.operation === 'object'
    ? input.operation
    : input
  const operationId = String(source.operationId || '').trim()
  const state = String(source.state || '').trim()
  if (!operationId || !CHAT_OPERATION_STATES.has(state)) return null

  const normalized: ChatOperationStatus = {
    operationId,
    kind: String(source.kind || '').trim(),
    state,
  }
  const version = nonNegativeIntegerOrUndefined(source.version)
  if (version !== undefined) normalized.version = version
  // 只認伺服器明確給的布林；沒帶就留 undefined（見 ChatOperationStatus.agentTurn）。
  if (typeof source.agentTurn === 'boolean') normalized.agentTurn = source.agentTurn
  for (const key of [
    'conversationId',
    'clientOperationId',
    'assistantChatId',
    'userChatId',
    'targetChatId',
    'sourceChatId',
    'checkpointChatId',
    'parentOperationId',
    'sourceOperationId',
    'outputDisposition',
    'finishReason',
    'reasonCode',
    'messageKey',
    'acceptedAt',
    'terminalAt',
    'lastUpdateTime',
  ] as const) {
    const value = String(source[key] || '').trim()
    if (value) normalized[key] = value
  }
  if (Array.isArray(source.allowedActions)) {
    normalized.allowedActions = source.allowedActions
      .filter((action: any) => typeof action === 'string' && action.trim())
      .map((action: string) => action.trim())
  }
  if (typeof source.retryable === 'boolean') normalized.retryable = source.retryable
  return normalized
}

export function isChatOperationTerminal(input: any): boolean {
  const status = normalizeChatOperationStatus(input)
  return !!status && TERMINAL_CHAT_OPERATION_STATES.has(status.state)
}

function isChatOperationTerminalState(state: unknown): boolean {
  return TERMINAL_CHAT_OPERATION_STATES.has(String(state || '').trim())
}

function operationStatusVersion(input: any): number | undefined {
  const hasOperationVersion = input
    && Object.prototype.hasOwnProperty.call(input, 'operationVersion')
  return nonNegativeIntegerOrUndefined(
    hasOperationVersion
      ? input?.operationVersion
      : (input?.state !== undefined ? input?.version : undefined),
  )
}

function operationStatusState(input: any): string {
  return String(input?.operationState || input?.state || '').trim()
}

/**
 * Server operation versions are monotonic. A terminal projection also never
 * returns to an in-flight state, even if a delayed transport claims a larger
 * version. Missing-version payloads remain accepted only while no versioned
 * projection has been observed, preserving old-server compatibility.
 */
export function shouldApplyOperationStatus(current: any, input: any): boolean {
  const incoming = normalizeChatOperationStatus(input)
  if (!incoming) return false

  const currentOperationId = String(current?.operationId || '').trim()
  if (currentOperationId && currentOperationId !== incoming.operationId) return false

  const currentState = operationStatusState(current)
  const incomingState = incoming.state
  if (
    isChatOperationTerminalState(currentState)
    && !isChatOperationTerminalState(incomingState)
  ) {
    return false
  }

  const currentVersion = operationStatusVersion(current)
  const incomingVersion = operationStatusVersion(incoming)
  if (currentVersion !== undefined && incomingVersion === undefined) return false
  if (
    currentVersion !== undefined
    && incomingVersion !== undefined
    && incomingVersion < currentVersion
  ) {
    return false
  }

  if (
    currentVersion !== undefined
    && incomingVersion !== undefined
    && incomingVersion === currentVersion
  ) {
    if (
      isChatOperationTerminalState(incomingState)
      && !isChatOperationTerminalState(currentState)
    ) {
      return true
    }
    if (
      isChatOperationTerminalState(currentState)
      && incomingState !== currentState
    ) {
      return false
    }
    const progressRank: Record<string, number> = {
      accepted: 1,
      generating: 2,
      completed: 3,
      interrupted: 3,
      failed_retryable: 3,
      failed_terminal: 3,
    }
    if (
      (progressRank[incomingState] || 0)
      < (progressRank[currentState] || 0)
    ) {
      return false
    }
  }
  return true
}

export function classifyOperationCapabilityResponse(
  response: any,
): 'supported' | 'legacy' | 'unknown' {
  const statusCode = Number(response?.statusCode)
  if (statusCode === 404) {
    const errorCode = String(
      response?.data?.errorCode || response?.data?.error || '',
    ).trim()
    // A typed 404 is emitted by the outcome_v1 route itself. Only an
    // untyped route-level 404 proves that the endpoint is absent.
    if (errorCode === 'operation_not_found') return 'supported'
    return 'legacy'
  }
  if (
    statusCode === 200
    && String(response?.data?.schemaVersion || '').trim() === 'outcome_v1'
    && Array.isArray(response?.data?.operations)
  ) {
    if (response?.data?.operationStatusAvailable === false) return 'legacy'
    return 'supported'
  }
  return 'unknown'
}

function normalizedOperationKind(
  kind: unknown,
): 'send' | 'retry_generation' | 'rewrite' | 'continue' | 'backward' {
  const normalized = String(kind || '').trim().toLowerCase()
  if (normalized === 'continue_response') return 'continue'
  if (normalized === 'rewrite_response') return 'rewrite'
  if (normalized === 'retry_generation') return 'retry_generation'
  if (normalized === 'backward') return 'backward'
  return 'send'
}

export function selectPendingOperationFromList(response: any, pending: any): ChatOperationStatus | null {
  if (
    String(response?.schemaVersion || '').trim() !== 'outcome_v1'
    || !Array.isArray(response?.operations)
  ) {
    return null
  }
  const clientOperationId = String(
    pending?.clientOperationId || pending?.payload?.clientOperationId || '',
  ).trim()
  if (!clientOperationId) return null
  const conversationId = String(pending?.payload?.conversationId || '').trim()
  for (const candidate of response.operations) {
    const status = normalizeChatOperationStatus(candidate)
    if (!status) continue
    if (status.clientOperationId !== clientOperationId) continue
    if (conversationId && status.conversationId && status.conversationId !== conversationId) continue
    return status
  }
  return null
}

export function authoritativePendingOperationDisposition(
  response: any,
  pending: any,
): 'active' | 'terminal' | 'absent' | 'unknown' {
  if (
    String(response?.schemaVersion || '').trim() !== 'outcome_v1'
    || response?.operationStatusAvailable === false
    || !Array.isArray(response?.operations)
  ) {
    return 'unknown'
  }

  const operationId = String(pending?.operationId || '').trim()
  const clientOperationId = String(
    pending?.clientOperationId || pending?.payload?.clientOperationId || '',
  ).trim()
  if (!operationId && !clientOperationId) return 'unknown'
  const accepted = pending?.accepted === true || !!operationId

  const conversationId = String(pending?.payload?.conversationId || '').trim()
  for (const candidate of response.operations) {
    const status = normalizeChatOperationStatus(candidate)
    if (!status) continue
    if (operationId) {
      if (status.operationId !== operationId) continue
    } else if (status.clientOperationId !== clientOperationId) {
      continue
    }
    if (
      conversationId
      && status.conversationId
      && status.conversationId !== conversationId
    ) {
      continue
    }
    return isChatOperationTerminal(status) ? 'terminal' : 'active'
  }
  return accepted ? 'absent' : 'unknown'
}

export function retainedTimelineForHistoryResponse({
  page,
  streamActive,
  pendingAtRequest,
  currentPending,
  timeline,
}: {
  page: number
  streamActive: boolean
  pendingAtRequest: any
  currentPending: any
  timeline: any[]
}): any[] {
  const currentTimeline = Array.isArray(timeline) ? timeline : []
  if (page !== 1) return currentTimeline
  if (!currentPending || currentPending === pendingAtRequest) {
    return streamActive ? currentTimeline : []
  }

  const ownedBubbleIds = new Set(
    [currentPending.userBubbleId, currentPending.aiBubbleId]
      .map(value => String(value ?? '').trim())
      .filter(Boolean),
  )
  if (ownedBubbleIds.size === 0) return []
  return currentTimeline.filter(row => ownedBubbleIds.has(String(row?.id ?? '').trim()))
}

function exactHistoryRowIndex(rows: any[], chatId: unknown): number {
  const expected = String(chatId || '').trim()
  if (!expected) return -1
  return rows.findIndex(row =>
    row
    && row.operationProjectionOnly !== true
    && (
      String(row.chatId || '').trim() === expected
      || String(row.id || '').trim() === expected
    )
  )
}

function historyProjectionTargetChatId(status: ChatOperationStatus): string {
  for (const candidate of [
    status.sourceChatId,
    status.targetChatId,
    status.userChatId,
    status.checkpointChatId,
  ]) {
    const value = String(candidate || '').trim()
    if (value) return value
  }
  return ''
}

export function projectionFinishReason(
  status: ChatOperationStatus,
  current = '',
  thinkingContent = '',
): string {
  // 逾時說明義務：這則 reasoning_only 是不是我方 idle watchdog 造成的，必須先
  // 判，因為下面的 outputDisposition === 'reasoning_only' 對逾時與非逾時的
  // reasoning_only 都成立——排在後面會讓這個分支變成永遠打不到的死碼。
  if (status.reasonCode === 'no_final_answer_timeout') {
    return 'reasoning_only_timeout'
  }
  if (
    status.outputDisposition === 'reasoning_only'
    || (
      status.reasonCode === 'no_final_answer'
      && String(thinkingContent || '').trim()
    )
  ) {
    return 'reasoning_only'
  }
  if (
    normalizedOperationKind(status.kind) === 'rewrite'
    && status.outputDisposition === 'none'
    && !status.assistantChatId
  ) {
    return 'rewrite_below_threshold'
  }
  if (status.reasonCode === 'no_final_answer') {
    return 'empty_response'
  }
  if (status.reasonCode === 'empty_response') {
    return 'empty_response'
  }
  if (status.state === 'interrupted') {
    return 'interrupted'
  }
  // 中斷但進度已保留:這一列裝的是使用者已經付過錢的成果,還可以接著跑。
  //
  // 落到底下那條 server_error 的話,畫面會是一條紅色的失敗加一顆「重試」——
  // 而重試是**從頭重跑**,正好把斷點丟掉,語意跟使用者要的「繼續」相反。
  if (status.reasonCode === AGENT_PROGRESS_PRESERVED_REASON) {
    return AGENT_PROGRESS_PRESERVED_REASON
  }
  // 使用者按停止不是伺服器故障,別用故障的樣子呈現他自己的操作。
  if (status.state === 'stopped') {
    return 'user_stop'
  }
  if (status.state === 'failed_retryable' || status.state === 'failed_terminal') {
    return 'server_error'
  }
  return String(status.finishReason || current || 'stop').trim() || 'stop'
}

function operationProjectionMetadata(status: ChatOperationStatus) {
  return {
    operationProjectionCapable: true,
    operationId: status.operationId,
    clientOperationId: status.clientOperationId || '',
    operationConversationId: status.conversationId || '',
    operationVersion: status.version,
    operationState: status.state,
    operationKind: normalizedOperationKind(status.kind),
    serverOperationKind: status.kind,
    assistantChatId: status.assistantChatId || '',
    userChatId: status.userChatId || '',
    targetChatId: status.targetChatId || '',
    sourceChatId: status.sourceChatId || '',
    checkpointChatId: status.checkpointChatId || '',
    parentOperationId: status.parentOperationId || '',
    sourceOperationId: status.sourceOperationId || '',
    outputDisposition: status.outputDisposition || '',
    allowedActions: status.allowedActions ? [...status.allowedActions] : [],
    reasonCode: status.reasonCode || '',
    messageKey: status.messageKey || '',
    retryable: status.retryable === true,
  }
}

function operationStatusFromProjectionRow(row: any): ChatOperationStatus | null {
  if (!row?.operationId || !row?.operationState) return null
  const operationKind = String(row.operationKind || '').trim().toLowerCase()
  const kind = String(row.serverOperationKind || '').trim() || (
    operationKind === 'retry_generation'
      ? 'retry_generation'
      : operationKind === 'rewrite'
        ? 'rewrite_response'
        : operationKind === 'continue'
          ? 'continue_response'
          : operationKind === 'backward'
            ? 'backward'
            : 'send'
  )
  return normalizeChatOperationStatus({
    operationId: row.operationId,
    clientOperationId: row.clientOperationId,
    conversationId: row.operationConversationId,
    kind,
    state: row.operationState,
    version: row.operationVersion,
    assistantChatId: row.assistantChatId,
    userChatId: row.userChatId,
    targetChatId: row.targetChatId,
    sourceChatId: row.sourceChatId,
    checkpointChatId: row.checkpointChatId,
    parentOperationId: row.parentOperationId,
    sourceOperationId: row.sourceOperationId,
    outputDisposition: row.outputDisposition,
    finishReason: row.finishReason,
    reasonCode: row.reasonCode,
    messageKey: row.messageKey,
    allowedActions: row.allowedActions,
    retryable: row.retryable,
  })
}

function preserveUnavailablePendingRows(messages: any[], lastKnownMessages: any[]): any[] {
  const next = Array.isArray(messages) ? [...messages] : []
  if (!Array.isArray(lastKnownMessages)) return next
  for (const row of lastKnownMessages) {
    if (!row || !(
      row.operationBubbleId !== undefined
      || row.transportTransient === true
      || row.operationProjectionOnly === true
    )) {
      continue
    }
    const operationId = String(row.operationId || '').trim()
    if (
      operationId
      && next.some(candidate =>
        candidate && String(candidate.operationId || '').trim() === operationId
      )
    ) {
      continue
    }
    if (
      next.some(candidate =>
        candidate
        && (
          (row.chatId && String(candidate.chatId || '') === String(row.chatId))
          || (row.id && String(candidate.id || '') === String(row.id))
        )
      )
    ) {
      continue
    }
    next.push({ ...row })
  }
  return next
}

/**
 * Joins capable history's top-level operation projections to chat rows by
 * exact public chat IDs. Operations without an assistant row (zero/below
 * threshold/persist failure) become a durable status bubble immediately after
 * their exact source/target. Missing targets are deferred instead of being
 * guessed from the list tail.
 */
export function mergeChatHistoryOperationProjections(
  messages: any[],
  response: any,
  options: {
    aiPic?: string
    lastKnownMessages?: any[]
    // 伺服器送回的軌跡（載入歷史時才有），鍵是 operationId。
    agentPrepTraces?: Record<string, any[]>
    // i18n 取字函式：伺服器只送階段語意，五語文案在前端挑。
    t?: (key: string, params?: Record<string, string>) => string
    // 即時停止那條路沒有 agentPrepTraces，用畫面上正在跑的流水帳頂上。
    agentPrepTrail?: string[]
  } = {},
): any[] {
  const sourceRows = Array.isArray(messages) ? messages : []
  if (
    String(response?.schemaVersion || '').trim() !== 'outcome_v1'
    || !Array.isArray(response?.operations)
  ) {
    return sourceRows
  }
  if (response.operationStatusAvailable === false) {
    const cachedOperations = (options.lastKnownMessages || [])
      .map(operationStatusFromProjectionRow)
      .filter((status): status is ChatOperationStatus => !!status)
    const projected = mergeChatHistoryOperationProjections(
      sourceRows,
      {
        schemaVersion: 'outcome_v1',
        operationStatusAvailable: true,
        operations: cachedOperations,
      },
      { aiPic: options.aiPic, agentPrepTraces: options.agentPrepTraces, t: options.t, agentPrepTrail: options.agentPrepTrail },
    )
    return preserveUnavailablePendingRows(
      projected,
      options.lastKnownMessages || [],
    )
  }

  const rows = sourceRows.map(row => (
    row && typeof row === 'object' ? { ...row } : row
  ))
  const latestByOperation = new Map<string, ChatOperationStatus>()
  for (const candidate of response.operations) {
    const status = normalizeChatOperationStatus(candidate)
    if (!status) continue
    const previous = latestByOperation.get(status.operationId)
    if (!previous || shouldApplyOperationStatus(previous, status)) {
      latestByOperation.set(status.operationId, status)
    }
  }

  for (const status of latestByOperation.values()) {
    // Backward mutates the canonical timeline; it never owns an assistant
    // message. Its durable operation remains available in the top-level read
    // model and existing rollback reconcile UI, but must not masquerade as an
    // empty AI response or inherit generation retry semantics.
    if (normalizedOperationKind(status.kind) === 'backward') continue

    const existingIndex = rows.findIndex(row =>
      row && String(row.operationId || '').trim() === status.operationId
    )
    if (
      existingIndex >= 0
      && !shouldApplyOperationStatus(rows[existingIndex], status)
    ) {
      continue
    }
    if (existingIndex >= 0 && rows[existingIndex]?.operationProjectionOnly === true) {
      rows.splice(existingIndex, 1)
    }

    const assistantIndex = exactHistoryRowIndex(rows, status.assistantChatId)
    if (assistantIndex >= 0) {
      const row = rows[assistantIndex]
      rows[assistantIndex] = {
        ...row,
        ...operationProjectionMetadata(status),
        finishReason: projectionFinishReason(
          status,
          row?.finishReason,
          row?.thinkingContent,
        ),
      }
      continue
    }

    if (
      status.state !== 'failed_retryable'
      && status.state !== 'failed_terminal'
    ) {
      continue
    }
    const targetChatId = historyProjectionTargetChatId(status)
    const targetIndex = exactHistoryRowIndex(rows, targetChatId)
    if (targetIndex < 0) continue

    let insertionIndex = targetIndex + 1
    while (
      insertionIndex < rows.length
      && rows[insertionIndex]?.operationProjectionOnly === true
      && rows[insertionIndex]?.operationTargetChatId === targetChatId
    ) {
      insertionIndex += 1
    }
    rows.splice(insertionIndex, 0, {
      id: `operation-projection-${status.operationId}`,
      operationProjectionOnly: true,
      operationTargetChatId: targetChatId,
      systemOnly: true,
      content: '',
      thinkingContent: '',
      thinkingCollapsed: true,
      type: 0,
      pic: options.aiPic || '',
      playstate: false,
      maskPosition: 1,
      chatLoading: false,
      chatFinish: true,
      isApplicationError: true,
      finishReason: projectionFinishReason(status),
      ...operationProjectionMetadata(status),
      ...interruptedAgentRowFields(status, response, options),
    })
  }
  return rows
}


/**
 * 中斷但進度已保留的那一輪，額外要蓋上去的欄位。
 *
 * 軌跡有兩個來源，缺一不可：載入歷史時走伺服器的 agentPrepTraces；而使用者按下
 * 停止的**當下**沒有那個欄位（它只出現在歷史回應裡），這時用畫面上正在跑的流水帳。
 * 少了後者，這一列會沒有軌跡、渲染成一列空的——畫面上連自己發的訊息和結果都像
 * 不見了，要重新整理才長出來（owner 2026-08-08 在 mobile 實測）。
 *
 * 沒有軌跡就什麼都不蓋：一張空的「準備過程」卡比沒有卡更讓人困惑。
 */
function interruptedAgentRowFields(
  status: ChatOperationStatus,
  response: any,
  options: { t?: (key: string, params?: Record<string, string>) => string; agentPrepTrail?: string[] },
): Record<string, unknown> {
  if (status.reasonCode !== AGENT_PROGRESS_PRESERVED_REASON) return {}
  // 生產路徑把軌跡放在 **options**（歷史回應的欄位由呼叫端取出來再傳進來）；
  // response 那份只是保險。寫反的話伺服器軌跡永遠讀不到，而畫面會退化成一顆
  // 系統藥丸——沒有錯誤、沒有日誌，只是那一層永遠不成立。
  const traces = options.agentPrepTraces || response?.agentPrepTraces || {}
  let trail = options.t
    ? prepTrailFromServerSteps(traces[status.operationId], options.t)
    : []
  if (!trail.length && Array.isArray(options.agentPrepTrail)) {
    trail = options.agentPrepTrail.slice()
  }
  if (!trail.length) return {}
  return {
    prepTrail: trail,
    // 重建不該替使用者把面板展開。
    prepTrailCollapsed: true,
    agentInterrupted: true,
    // 這一列不是錯誤:它裝的是使用者已經付過錢的成果,還可以接著跑。
    isApplicationError: false,
    systemOnly: false,
  }
}

export function buildPendingOperationProbeQuery(pending: any, limit = 10): string {
  const conversationId = String(pending?.payload?.conversationId || '').trim()
  const clientOperationId = String(
    pending?.clientOperationId || pending?.payload?.clientOperationId || '',
  ).trim()
  if (!conversationId || !clientOperationId) return ''
  const boundedLimit = Math.min(50, Math.max(1, Math.floor(Number(limit) || 10)))
  return `?conversationId=${encodeURIComponent(conversationId)}`
    + `&clientOperationId=${encodeURIComponent(clientOperationId)}`
    + `&limit=${boundedLimit}`
}

export function markExplicitPreAdmissionError(
  pending: any,
  errorType: unknown,
  now = Date.now(),
): boolean {
  if (!pending || typeof pending !== 'object') return false
  if (pending.operationOutcomeCapability === 'legacy') return false
  if (String(pending.operationId || '').trim()) return false
  const clientOperationId = String(
    pending.clientOperationId || pending.payload?.clientOperationId || '',
  ).trim()
  if (
    !clientOperationId
    || pending.payload?.supportsOperationOutcome !== true
  ) return false
  const normalizedErrorType = String(errorType || '').trim()
  if (!normalizedErrorType) return false

  if (!String(pending.preAdmissionErrorType || '').trim()) {
    pending.preAdmissionErrorType = normalizedErrorType
    pending.preAdmissionErrorAt = Math.max(0, Number(now) || 0)
    pending.exactIdentityEmptyProbeCount = 0
  }
  return true
}

/**
 * Consumes the original application error exactly once after the capability
 * probe proves that this is an old server. The caller owns UI cleanup; this
 * helper only freezes idempotency so close/noActiveStream cannot replay the
 * request or show the same error twice.
 */
export function consumeFrozenPendingStreamError(pending: any): string {
  if (!pending || typeof pending !== 'object') return ''
  if (pending.frozenStreamErrorConsumed === true) return ''
  const errorType = String(pending.preAdmissionErrorType || '').trim()
  if (!errorType) return ''
  pending.frozenStreamErrorConsumed = true
  return errorType
}

export function recordExactOperationProbeMiss(
  pending: any,
  now = Date.now(),
  options: {
    minimumMisses?: number
    minimumAgeMs?: number
  } = {},
): { confirmed: boolean; misses: number } {
  const misses = Math.max(
    0,
    Math.floor(Number(pending?.exactIdentityEmptyProbeCount) || 0),
  )
  if (
    !pending
    || typeof pending !== 'object'
    || !String(pending.preAdmissionErrorType || '').trim()
    || String(pending.operationId || '').trim()
    || pending.operationOutcomeCapability === 'legacy'
  ) {
    return { confirmed: false, misses }
  }

  const nextMisses = misses + 1
  pending.exactIdentityEmptyProbeCount = nextMisses
  const errorAt = Math.max(0, Number(pending.preAdmissionErrorAt) || 0)
  const ageMs = Math.max(0, (Number(now) || 0) - errorAt)
  const minimumMisses = Math.max(
    2,
    Math.floor(Number(options.minimumMisses) || 3),
  )
  const minimumAgeMs = Math.max(
    2_000,
    Number(options.minimumAgeMs) || 5_000,
  )
  return {
    confirmed: nextMisses >= minimumMisses && ageMs >= minimumAgeMs,
    misses: nextMisses,
  }
}

export function mergeOperationStatusIntoStreamEntry(
  entry: any,
  input: any,
  now = Date.now(),
) {
  const current = entry && typeof entry === 'object' ? entry : {}
  const status = normalizeChatOperationStatus(input)
  if (!status || !shouldApplyOperationStatus(current, status)) return current
  return {
    ...current,
    version: STREAM_ENTRY_VERSION,
    operationId: status.operationId,
    clientOperationId: status.clientOperationId
      || current.clientOperationId
      || current.pendingPayload?.clientOperationId
      || '',
    operationState: status.state,
    operationVersion: status.version ?? current.operationVersion,
    serverOperationKind: status.kind || current.serverOperationKind || '',
    assistantChatId: status.assistantChatId || current.assistantChatId || '',
    userChatId: status.userChatId || current.userChatId || '',
    targetChatId: status.targetChatId || current.targetChatId || '',
    sourceChatId: status.sourceChatId || current.sourceChatId || '',
    checkpointChatId: status.checkpointChatId || current.checkpointChatId || '',
    parentOperationId: status.parentOperationId || current.parentOperationId || '',
    sourceOperationId: status.sourceOperationId || current.sourceOperationId || '',
    outputDisposition: status.outputDisposition || current.outputDisposition || '',
    finishReason: status.finishReason || current.finishReason || '',
    allowedActions: status.allowedActions
      ? [...status.allowedActions]
      : (Array.isArray(current.allowedActions) ? [...current.allowedActions] : undefined),
    reasonCode: status.reasonCode || current.reasonCode || '',
    messageKey: status.messageKey || current.messageKey || '',
    updatedAt: now,
  }
}

function operationResumeIdentity(entry: any) {
  const operationId = String(entry?.operationId || '').trim()
  if (!operationId) return {}
  return {
    operationId,
    operationState: String(entry?.operationState || '').trim(),
    operationVersion: operationStatusVersion(entry),
    serverOperationKind: String(entry?.serverOperationKind || '').trim(),
    assistantChatId: String(entry?.assistantChatId || '').trim(),
    userChatId: String(entry?.userChatId || '').trim(),
    targetChatId: String(entry?.targetChatId || '').trim(),
    sourceChatId: String(entry?.sourceChatId || '').trim(),
    checkpointChatId: String(entry?.checkpointChatId || '').trim(),
    parentOperationId: String(entry?.parentOperationId || '').trim(),
    sourceOperationId: String(entry?.sourceOperationId || '').trim(),
    outputDisposition: String(entry?.outputDisposition || '').trim(),
    finishReason: String(entry?.finishReason || '').trim(),
    clientOperationId: String(
      entry?.clientOperationId || entry?.pendingPayload?.clientOperationId || '',
    ).trim(),
    allowedActions: Array.isArray(entry?.allowedActions)
      ? [...entry.allowedActions]
      : undefined,
    reasonCode: String(entry?.reasonCode || '').trim(),
    messageKey: String(entry?.messageKey || '').trim(),
  }
}

export function acceptedChatId(eventData: any): string | number {
  if (!eventData || typeof eventData !== 'object') return ''
  return eventData.chatId || ''
}

export function terminateStreamForChatError(errorType: string, clearStreamState: () => void): boolean {
  if (errorType !== 'conversation_stale' || typeof clearStreamState !== 'function') return false
  clearStreamState()
  return true
}

export function isChatSendInFlight(state: any): boolean {
  const current = state && typeof state === 'object' ? state : {}
  return current.isStreamActive === true
    || current.isConnecting === true
    || !!current.pendingResendPayload
    || !!current.pendingChatTurn
    || current.isCompacting === true
    || current.rollbackPending === true
}

export function shouldAwaitDurableStopTerminal(pending: PendingChatTurn | null): boolean {
  if (!pending || pending.operationOutcomeCapability === 'legacy') return false
  return pending.payload?.supportsOperationOutcome === true
    || !!String(pending.clientOperationId || '').trim()
    || !!String(pending.operationId || '').trim()
}

export function shouldProbeExactOperationIdentity(pending: PendingChatTurn | null): boolean {
  if (
    !pending
    || pending.operationOutcomeCapability === 'legacy'
    || !!String(pending.operationId || '').trim()
  ) {
    return false
  }
  return pending.payload?.supportsOperationOutcome === true
    && !!String(
      pending.clientOperationId || pending.payload?.clientOperationId || '',
    ).trim()
}

export type ChatWireOperationKind =
  | 'send'
  | 'retry_generation'
  | 'rewrite_response'
  | 'continue_response'

/**
 * Resolve the additive outcome_v1 wire kind from the same legacy fields old
 * servers still consume. All first-send and replay paths pass through
 * prepareChatPayload, so MP/H5 and direct/resumed transports cannot drift.
 */
export function wireOperationKindForChatPayload(input: any): ChatWireOperationKind {
  const source = input && typeof input === 'object' ? input : {}
  const explicit = String(source.operationKind || '').trim().toLowerCase()
  if (explicit === 'retry_generation') return 'retry_generation'
  if (explicit === 'rewrite_response' || explicit === 'rewrite') return 'rewrite_response'
  if (explicit === 'continue_response' || explicit === 'continue') return 'continue_response'
  if (explicit === 'send') return 'send'
  if (source.rewrite === true) return 'rewrite_response'
  if (
    source.contine === true
    && String(source.message == null ? '' : source.message).trim() === ''
  ) {
    return 'continue_response'
  }
  return 'send'
}

export function prepareChatPayload(input: any) {
  const source = input && typeof input === 'object' ? input : {}
  const payload = {
    conversationId: typeof source.conversationId === 'string' ? source.conversationId : '',
    storyId: source.storyId == null ? '' : String(source.storyId),
    message: source.message == null ? '' : String(source.message),
    model: source.model == null ? '' : String(source.model),
    thinkingDepth: source.thinkingDepth == null ? '' : String(source.thinkingDepth),
    rewrite: source.rewrite === true,
    contine: source.contine === true,
    presetCmd: source.presetCmd == null ? '' : String(source.presetCmd),
    language: source.language == null ? '' : String(source.language),
    chatId: source.chatId == null ? '' : String(source.chatId),
    // A rejected MOD-expiry turn is only safe to replay when its original
    // client identity and one-time acknowledgement travel together unchanged.
    clientTurnId: source.clientTurnId == null ? '' : String(source.clientTurnId),
    ackToken: source.ackToken == null ? '' : String(source.ackToken),
    // Capability declaration, not a preference. This client can consume the
    // terminal passBlock event even when the conversation keeps multi-pass off.
    supportsPassBlock: true,
  }
  // 續跑來源:非空才帶上,一般送出的線上封包完全不變。
  //
  // payload 是白名單組出來的,而這個欄位原本不在裡面——呼叫端填了、伺服器也讀
  // (router/conversation_turn.go 讀 param["resumeFromOperationId"]),中間被默默
  // 丟掉,於是「繼續」從來不曾接上斷點,每次都是從頭重跑一次。
  const resumeFrom = source.resumeFromOperationId == null
    ? ''
    : String(source.resumeFromOperationId).trim()
  if (resumeFrom) {
    Object.assign(payload, { resumeFromOperationId: resumeFrom })
  }
  if (source.supportsOperationOutcome === true) {
    Object.assign(payload, {
      supportsOperationOutcome: true,
      clientOperationId: source.clientOperationId == null
        ? ''
        : String(source.clientOperationId).trim(),
      operationKind: wireOperationKindForChatPayload(source),
    })
  }
  const missingFields: string[] = []
  if (!payload.conversationId) missingFields.push('conversationId')
  if (payload.rewrite && !payload.chatId) missingFields.push('chatId')
  if (
    source.supportsOperationOutcome === true
    && !String(source.clientOperationId || '').trim()
  ) {
    missingFields.push('clientOperationId')
  }
  return { ok: missingFields.length === 0, payload, missingFields }
}

export function createPendingStreamEntry(payload: any, now = Date.now()) {
  const prepared = prepareChatPayload(payload)
  return {
    version: STREAM_ENTRY_VERSION,
    accepted: false,
    pendingSince: now,
    pendingPayload: prepared.payload,
    clientOperationId: String(prepared.payload?.clientOperationId || '').trim(),
    updatedAt: now,
  }
}

export function mergeStreamMetaIntoPendingEntry(entry: any, { streamId, lastEventId = 0, now = Date.now() }: any) {
  const current = entry && typeof entry === 'object' ? entry : {}
  const next: any = {
    ...current,
    version: STREAM_ENTRY_VERSION,
    streamId: streamId || current.streamId || '',
    lastEventId,
    accepted: current.accepted === true,
    updatedAt: now,
  }
  if (next.accepted !== true) {
    const prepared = prepareChatPayload(current.pendingPayload)
    if (prepared.ok) {
      next.pendingSince = current.pendingSince || now
      next.pendingPayload = prepared.payload
    }
  }
  return next
}

export function markStreamEntryAccepted(entry: any, { streamId, lastEventId = 0, now = Date.now() }: any) {
  const current = entry && typeof entry === 'object' ? entry : {}
  const operationIdentity = operationResumeIdentity(current)
  const clientOperationId = String(
    current.clientOperationId || current.pendingPayload?.clientOperationId || '',
  ).trim()
  const keepPendingIntent = !operationIdentity.operationId
    && clientOperationId
    && current.pendingPayload?.supportsOperationOutcome === true
  return {
    version: STREAM_ENTRY_VERSION,
    streamId: streamId || current.streamId || '',
    lastEventId,
    accepted: true,
    // 這一支是用白名單重建物件，不是 ...current 展開，所以每個要活過 accepted
    // 的欄位都得逐一帶。agentTurn 一旦在這裡掉了，重整之後掛載路徑就沒有任何
    // 依據判斷這是不是 agent 輪次——而 accepted 在送出後一秒內就發生，
    // 等於這個欄位實際上從來不曾存活過（瀏覽器實測抓到）。
    ...(current.agentTurn === true ? { agentTurn: true } : {}),
    ...operationIdentity,
    clientOperationId,
    ...(keepPendingIntent
      ? {
        pendingSince: current.pendingSince || now,
        pendingPayload: current.pendingPayload,
        preAdmissionErrorType: String(current.preAdmissionErrorType || '').trim(),
        preAdmissionErrorAt: Math.max(0, Number(current.preAdmissionErrorAt) || 0),
        exactIdentityEmptyProbeCount: Math.max(
          0,
          Math.floor(Number(current.exactIdentityEmptyProbeCount) || 0),
        ),
      }
      : {}),
    updatedAt: now,
  }
}

export function decideStreamResume(entry: any, now = Date.now(), options: any = {}): any {
  if (!entry || typeof entry !== 'object') return null
  const streamTtlMs = options.streamTtlMs || 10 * 60 * 1000
  const pendingTtlMs = options.pendingTtlMs || 20 * 1000
  const updatedAt = Number(entry.updatedAt) || 0
  const operationIdentity = operationResumeIdentity(entry)

  if (entry.accepted === true && entry.streamId) {
    if (now - updatedAt > streamTtlMs) {
      if (operationIdentity.operationId) {
        const localBaselineMs = updatedAt || undefined
        return {
          kind: 'byOperationId',
          ...operationIdentity,
          pendingSince: localBaselineMs,
          expired: isChatOperationVisibleOutcomeExpired({
            localStartedAt: localBaselineMs ?? null,
            now,
            agentTurn: entry?.agentTurn === true,
          }),
        }
      }
      return { kind: 'expired' }
    }
    return {
      kind: 'byStreamId',
      streamId: entry.streamId,
      lastEventId: Number(entry.lastEventId) || 0,
      ...operationIdentity,
    }
  }
  if (operationIdentity.operationId && !entry.streamId) {
    const localBaselineMs = updatedAt || Number(entry.pendingSince) || undefined
    return {
      kind: 'byOperationId',
      ...operationIdentity,
      pendingSince: localBaselineMs,
      expired: isChatOperationVisibleOutcomeExpired({
        localStartedAt: localBaselineMs ?? null,
        now,
        agentTurn: entry?.agentTurn === true,
      }),
    }
  }

  const prepared = prepareChatPayload(entry.pendingPayload)
  const draft = entry.pendingPayload && typeof entry.pendingPayload.message === 'string'
    ? entry.pendingPayload.message
    : ''
  if (!prepared.ok) return { kind: 'recoverDraft', reason: 'incomplete_pending_payload', draft }

  const pendingSince = Number(entry.pendingSince) || 0
  const clientOperationId = String(
    entry.clientOperationId || prepared.payload.clientOperationId || '',
  ).trim()
  if (
    prepared.payload.supportsOperationOutcome === true
    && clientOperationId
    && !entry.streamId
  ) {
    // I-1（No dead end）：這是「送出後還沒學到伺服器 operationId 就中斷」的
    // 主要路徑（網路斷、伺服器重啟、pre-admission 失敗）。additive 帶出
    // expired，讓 mount-time resume 能在超過可見結果上界時直接放手，不再進入
    // schedulePendingOperationIdentityReconciliation 的無界慢速輪詢。
    return {
      kind: 'byClientOperationId',
      clientOperationId,
      pendingSince,
      pendingPayload: prepared.payload,
      preAdmissionErrorType: String(entry.preAdmissionErrorType || '').trim(),
      preAdmissionErrorAt: Math.max(0, Number(entry.preAdmissionErrorAt) || 0),
      exactIdentityEmptyProbeCount: Math.max(
        0,
        Math.floor(Number(entry.exactIdentityEmptyProbeCount) || 0),
      ),
      expired: isChatOperationVisibleOutcomeExpired({
        localStartedAt: pendingSince || null,
        now,
        agentTurn: entry?.agentTurn === true,
      }),
    }
  }
  if (!pendingSince || now - pendingSince > pendingTtlMs) return { kind: 'expired', draft }
  if (entry.streamId) {
    return {
      kind: 'byStreamId',
      streamId: entry.streamId,
      lastEventId: Number(entry.lastEventId) || 0,
      pendingSince,
      pendingPayload: prepared.payload,
      ...operationIdentity,
    }
  }
  return {
    kind: 'byConv',
    pendingSince,
    pendingPayload: prepared.payload,
    ...operationIdentity,
  }
}

export function createChatTransportOwnership() {
  let tokenSequence = 0
  let activeSocketToken = 0
  const consumedChatPayloadTokens = new Set<number>()
  let openDeadline: any = null
  let acceptedDeadline: any = null

  const clearDeadline = (deadline: any) => {
    if (deadline?.handle) clearTimeout(deadline.handle)
  }
  const clearOwnedDeadline = (name: 'open' | 'accepted', socketToken?: number) => {
    const deadline = name === 'open' ? openDeadline : acceptedDeadline
    if (!deadline || (socketToken !== undefined && deadline.socketToken !== socketToken)) return false
    clearDeadline(deadline)
    if (name === 'open') openDeadline = null
    else acceptedDeadline = null
    return true
  }
  const armDeadline = (name: 'open' | 'accepted', socketToken: number, timeoutMs: number, onTimeout: (socketToken: number) => void) => {
    clearOwnedDeadline(name)
    if (socketToken !== activeSocketToken || typeof onTimeout !== 'function') return false
    const deadline: any = { socketToken, handle: null }
    deadline.handle = setTimeout(() => {
      const current = name === 'open' ? openDeadline : acceptedDeadline
      if (current !== deadline || socketToken !== activeSocketToken) return
      if (name === 'open') openDeadline = null
      else acceptedDeadline = null
      onTimeout(socketToken)
    }, timeoutMs)
    if (name === 'open') openDeadline = deadline
    else acceptedDeadline = deadline
    return true
  }

  return {
    openSocketGeneration(): number {
      clearOwnedDeadline('open')
      clearOwnedDeadline('accepted')
      activeSocketToken = ++tokenSequence
      return activeSocketToken
    },

    invalidateSocketGeneration(socketToken: number): void {
      if (socketToken !== activeSocketToken) return
      clearOwnedDeadline('open')
      clearOwnedDeadline('accepted')
      activeSocketToken = 0
    },

    isCurrentSocket(socketToken: number): boolean {
      return socketToken !== 0 && socketToken === activeSocketToken
    },

    consumeChatPayload(socketToken: number): boolean {
      if (!this.isCurrentSocket(socketToken) || consumedChatPayloadTokens.has(socketToken)) return false
      consumedChatPayloadTokens.add(socketToken)
      return true
    },

    retireChatPayload(socketToken: number): void {
      if (socketToken) consumedChatPayloadTokens.add(socketToken)
    },

    armOpenDeadline(socketToken: number, timeoutMs: number, onTimeout: (socketToken: number) => void) {
      return armDeadline('open', socketToken, timeoutMs, onTimeout)
    },

    markSocketOpened(socketToken: number) {
      return clearOwnedDeadline('open', socketToken)
    },

    armAcceptedDeadline(socketToken: number, timeoutMs: number, onTimeout: (socketToken: number) => void) {
      return armDeadline('accepted', socketToken, timeoutMs, onTimeout)
    },

    clearAcceptedDeadline(socketToken: number) {
      return clearOwnedDeadline('accepted', socketToken)
    },

    clearDeadlines(socketToken: number) {
      const openCleared = clearOwnedDeadline('open', socketToken)
      const acceptedCleared = clearOwnedDeadline('accepted', socketToken)
      return openCleared || acceptedCleared
    },

    markAccepted(pending: PendingChatTurn | null, eventData: any): string | number {
      const chatId = acceptedChatId(eventData)
      if (pending) {
        pending.accepted = true
        pending.chatId = chatId
        this.clearAcceptedDeadline(pending.socketToken || 0)
      }
      return chatId
    },

    shouldAwaitDurableTurnAck(pending: PendingChatTurn | null): boolean {
      if (!pending || pending.accepted === true || pending.serverProgress === true) return false
      if (pending.operationId) return false
      if (pending.payload?.supportsOperationOutcome === true) return true
      return pending.expectsAccepted !== false
    },

    // A capable streamMeta proves only that a WS session exists. Admission can
    // still stall after it, so only accepted/operationStatus may disarm the
    // durable-ack deadline. A confirmed old server keeps the frozen behavior:
    // streamMeta is its strongest available delivery proof.
    noteServerStreamProgress(
      pending: PendingChatTurn | null,
      progress: 'stream_meta' | 'durable_operation' | 'legacy_server' = 'durable_operation',
    ): void {
      if (!pending) return
      if (progress === 'stream_meta') {
        pending.streamMetaReceived = true
        if (
          pending.payload?.supportsOperationOutcome === true
          && pending.operationOutcomeCapability !== 'legacy'
        ) {
          if (pending.accepted !== true) pending.serverProgress = false
          return
        }
      }
      if (progress === 'legacy_server') {
        pending.operationOutcomeCapability = 'legacy'
      } else if (progress === 'durable_operation') {
        pending.operationOutcomeCapability = 'supported'
      }
      clearOwnedDeadline('accepted', pending.socketToken)
      if (pending.accepted !== true) pending.serverProgress = true
    },

    shouldRecoverTransientTurn(pending: PendingChatTurn | null): boolean {
      return this.shouldAwaitDurableTurnAck(pending)
    },

    shouldRewriteUserTurn(userBubble: any): boolean {
      if (!userBubble || userBubble.transportTransient !== true) return true
      return !!userBubble.chatId
    },

    consumeTurnAlreadyConsumedRetry(pending: PendingChatTurn | null): boolean {
      if (!pending || !pending.payload) return false
      const count = Number(pending?.consumedRetryCount) || 0
      if (count >= 1 || !pending) return false
      pending.consumedRetryCount = count + 1
      return true
    },
  }
}
