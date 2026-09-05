export type ChatOperationKind = 'send' | 'retry_generation' | 'rewrite' | 'continue'
export type ChatOperationUIAction =
  | 'retry'
  | 'retry_rewrite'
  | 'retry_continue'
  | 'rewrite'
  | 'continue'
  | 'switch_model'

export type ChatComposerOperationState = {
  isStreamActive?: boolean
  isConnecting?: boolean
  isCompacting?: boolean
  userStopRequested?: boolean
  pendingResendPayload?: unknown
  pendingChatTurn?: unknown
  streamId?: unknown
  content?: unknown
  hasContent?: boolean
  // operations:伺服器對這段對話的操作投影。只用來判斷有沒有「中斷但進度已保留」
  // 的輪次可以續跑;其餘欄位這裡一概不看。
  operations?: Array<{ operationId?: string; reasonCode?: string }>
}

export function releaseChatComposerAfterStop(
  state: ChatComposerOperationState = {},
): ChatComposerOperationState {
  return {
    ...state,
    isStreamActive: false,
    isConnecting: false,
    isCompacting: false,
    userStopRequested: false,
    pendingResendPayload: null,
    pendingChatTurn: null,
  }
}

import { findResumableAgentOperation } from '../../utils/agent-composer-action'

export function resolveChatActionButtonState(
  state: ChatComposerOperationState = {},
): 'send-disabled' | 'send' | 'stop' | 'compacting' | 'continue' {
  // 產品邊界 I-2（SKILL.md「No dead end」）：停止永遠可用。
  //
  // 只要串流被視為進行中，就必須給得出停止——不看有沒有 streamId、
  // 也不看使用者是不是已經按過一次。理由：
  //
  //   * 沒有 streamId 但 isStreamActive=true 是真實存在的狀態
  //     （tryResumeOnMount 從持久化 entry 恢復時就會這樣）。舊碼把它歸成
  //     'compacting'，而 'compacting' 在 UI 上是 disabled 且提示寫
  //     「整理記憶中，無法中斷」——標籤是錯的，而且是永久死路。
  //   * 使用者按過停止之後若串流沒真的停（operation 在伺服器端成了孤兒），
  //     舊碼回 'send-disabled'，於是「按了沒用、然後再也按不了」。
  //     停止是冪等 request（見 SKILL.md「User Stop 特例」），重複按沒有副作用，
  //     所以保持可按永遠比鎖死安全。
  //
  // 代價是按下停止後少了「已收到」的視覺回饋。這個取捨是刻意的：那個回饋在
  // 停止沒生效時會變成永久的謊言，而逃生口的可用性優先。
  if (state.isStreamActive === true) return 'stop'
  // 真正只在整理記憶、沒有進行中串流時才顯示整理記憶。
  if (state.isCompacting === true) return 'compacting'
  // agent 沒收尾時底下不該是「發送」。
  //
  // 上一輪已經花了錢、進度也留著,這時送新訊息在 agent 模式下沒有意義——
  // 使用者要的是把它跑完。而「繼續」不帶輸入框的字:那是兩個不同的意圖,
  // 所以有沒有打字都不改變這個狀態。
  //
  // 排在停止之後:I-2 說停止永遠可用且優先,生成中同時有可續跑的舊輪次時,
  // 使用者要的是停下當前這個,不是繼續另一個。
  if (findResumableAgentOperation(state.operations)) return 'continue'
  const hasContent = state.hasContent === true
    || (typeof state.content === 'string' && state.content.trim().length > 0)
  return hasContent ? 'send' : 'send-disabled'
}

export interface RewriteSnapshot {
  userIndex: number
  aiIndex: number
  userBubble: any
  aiBubble: any
}

export const BACKWARD_OPERATION_ENTRY_VERSION = 1
const BACKWARD_OPERATION_RETRY_DELAYS = [2_000, 5_000, 10_000, 20_000, 30_000] as const
export const BACKWARD_OPERATION_SLOW_RETRY_DELAY_MS = 60_000

export interface BackwardOperationEntry {
  version: typeof BACKWARD_OPERATION_ENTRY_VERSION
  operationId: string
  conversationId: string
  targetChatId: string
  attempt: number
  createdAt: number
  updatedAt: number
}

export function createBackwardOperationEntry(input: {
  operationId: unknown
  conversationId: unknown
  targetChatId: unknown
  now?: number
}): BackwardOperationEntry {
  const now = Number.isFinite(input.now) ? Number(input.now) : Date.now()
  return {
    version: BACKWARD_OPERATION_ENTRY_VERSION,
    operationId: String(input.operationId || '').trim(),
    conversationId: String(input.conversationId || '').trim(),
    targetChatId: String(input.targetChatId || '').trim(),
    attempt: 0,
    createdAt: now,
    updatedAt: now,
  }
}

export function normalizeBackwardOperationEntry(
  input: any,
  expectedConversationId: unknown = '',
  now: number = Date.now(),
): BackwardOperationEntry | null {
  if (!input || Number(input.version) !== BACKWARD_OPERATION_ENTRY_VERSION) return null
  const operationId = String(input.operationId || '').trim()
  const conversationId = String(input.conversationId || '').trim()
  const targetChatId = String(input.targetChatId || '').trim()
  const expected = String(expectedConversationId || '').trim()
  const createdAt = Number(input.createdAt)
  const updatedAt = Number(input.updatedAt)
  const attempt = Number(input.attempt)
  if (!operationId || !conversationId || !targetChatId) return null
  if (expected && conversationId !== expected) return null
  if (
    !Number.isFinite(createdAt)
    || !Number.isFinite(updatedAt)
    || !Number.isInteger(attempt)
    || attempt < 0
  ) return null
  return {
    version: BACKWARD_OPERATION_ENTRY_VERSION,
    operationId,
    conversationId,
    targetChatId,
    attempt,
    createdAt,
    updatedAt,
  }
}

export function backwardOperationRetryDelay(attempt: number): number | null {
  if (!Number.isInteger(attempt) || attempt < 0) return null
  return BACKWARD_OPERATION_RETRY_DELAYS[attempt]
    ?? BACKWARD_OPERATION_SLOW_RETRY_DELAY_MS
}

export function classifyBackwardOperationResponse(
  statusCode: number,
  data: any,
): 'success' | 'pending' | 'terminal_failure' | 'legacy_fallback' | 'retry' {
  const errorCode = String(data?.errorCode || data?.error || '').trim()
  if (errorCode === 'rollback_client_unsupported') return 'legacy_fallback'
  const operationState = String(data?.operation?.state || data?.state || data?.status || '').trim()
  if (operationState === 'completed') return 'success'
  if (
    operationState === 'accepted'
    || operationState === 'generating'
    || operationState === 'pending'
    || operationState === 'repair_pending'
    || errorCode === 'mutation_in_progress'
    || errorCode === 'conversation_history_mutation_pending'
  ) {
    return 'pending'
  }
  if (operationState === 'failed_retryable' || operationState === 'failed_terminal') {
    return 'terminal_failure'
  }
  if (statusCode === 200) return 'success'
  if (statusCode === 202) return 'pending'
  if (statusCode === 409) return 'terminal_failure'
  return 'retry'
}

function sameId(left: unknown, right: unknown): boolean {
  if (left === undefined || left === null || left === '') return false
  if (right === undefined || right === null || right === '') return false
  return String(left) === String(right)
}

function matchesBubbleId(item: any, id: unknown): boolean {
  return !!item && (sameId(item.id, id) || sameId(item.chatId, id))
}

function candidateIndex(messages: any[], operationBubbleId: unknown): number {
  return messages.findIndex(item => item && sameId(item.operationBubbleId, operationBubbleId))
}

export function findOperationCandidate(messages: any[], operationBubbleId: unknown): any | null {
  if (!Array.isArray(messages)) return null
  return messages.find(item =>
    item
    && (
      sameId(item.operationBubbleId, operationBubbleId)
      || sameId(item.id, operationBubbleId)
    )
  ) || null
}

const NON_ADOPTABLE_FINISH_REASONS = new Set([
  'empty_response',
  'rewrite_below_threshold',
  'server_error',
  'error',
])

const NON_CANONICAL_FINISH_REASONS = new Set([
  'compact_no_input',
  'compact_retryable',
  'content_filter_input',
  'conversation_stale',
  'empty_response',
  'error',
  'network_error',
  'rate_limit',
  'resume_unavailable',
  'rewrite_below_threshold',
  'server_error',
])

export function operationKindFromPayload(payload: any): ChatOperationKind {
  const explicit = String(payload?.operationKind || '').trim().toLowerCase()
  if (explicit === 'retry_generation') return 'retry_generation'
  if (explicit === 'rewrite_response' || explicit === 'rewrite') return 'rewrite'
  if (explicit === 'continue_response' || explicit === 'continue') return 'continue'
  if (explicit === 'send') return 'send'
  if (payload?.rewrite === true) return 'rewrite'
  if (payload?.contine === true && String(payload?.message || '').trim() === '') return 'continue'
  return 'send'
}

export function latestCanonicalAIIndex(messages: any[]): number {
  if (!Array.isArray(messages)) return -1
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const item = messages[index]
    if (!item || item.isSummary === true) continue
    if (item.systemOnly === true || item.isApplicationError === true) continue
    if (item.operationBubbleId !== undefined && item.operationBubbleId !== null && item.operationBubbleId !== '') {
      continue
    }
    if (NON_CANONICAL_FINISH_REASONS.has(String(item.finishReason || '').trim().toLowerCase())) {
      continue
    }
    if (item.type !== 0 || item.chatFinish !== true || item.chatLoading === true) return -1
    if (
      String(item.content || '').trim().length === 0
      && String(item.thinkingContent || '').trim().length === 0
    ) {
      return -1
    }
    return index
  }
  return -1
}

// Persisted history is not a transport placeholder. A completed AI row with
// neither visible nor thinking output and no terminal guidance has no product
// meaning, and retaining it revives the superseded Rewrite bubble as an empty
// shell after refresh. Error/interruption rows stay so ChatSystemMessage can
// render their dedicated guidance.
export function shouldKeepPersistedHistoryBubble(item: any): boolean {
  if (!item || item.type !== 0 || item.isSummary === true) return true
  if (
    String(item.content || '').trim()
    || String(item.thinkingContent || '').trim()
  ) {
    return true
  }
  const finishReason = String(item.finishReason || '').trim().toLowerCase()
  return finishReason !== '' && finishReason !== 'stop'
}

export function isLatestCanonicalAIIndex(messages: any[], index: number): boolean {
  return latestCanonicalAIIndex(messages) === index
}

export function isLatestCanonicalAIId(messages: any[], id: unknown): boolean {
  const index = latestCanonicalAIIndex(messages)
  return index >= 0 && matchesBubbleId(messages[index], id)
}

export function latestTerminalAIIndex(messages: any[]): number {
  if (!Array.isArray(messages)) return -1
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const item = messages[index]
    if (!item || item.isSummary === true || item.finishReason === 'compact_no_input') continue
    if (item.operationBubbleId !== undefined && item.operationBubbleId !== null && item.operationBubbleId !== '') {
      return -1
    }
    return item.type === 0 && item.chatFinish === true && item.chatLoading !== true ? index : -1
  }
  return -1
}

export function isTerminalActionAllowed(
  messages: any[],
  index: number,
  action: string,
): boolean {
  if (latestTerminalAIIndex(messages) !== index) return false
  const item = messages[index]
  if (!item) return false
  if (!Array.isArray(item.allowedActions)) return true
  if (action === 'retry') {
    return item.allowedActions.some((allowed: unknown) => (
      allowed === 'retry'
      || allowed === 'retry_rewrite'
      || allowed === 'retry_continue'
      || allowed === 'rewrite'
    ))
  }
  return item.allowedActions.includes(action)
}

export function terminalUIActionFromAllowedActions(
  item: any,
): ChatOperationUIAction | '' {
  return terminalUIActionsFromAllowedActions(item)[0] || ''
}

export function terminalUIActionsFromAllowedActions(
  item: any,
): ChatOperationUIAction[] {
  if (!item?.operationProjectionCapable) return []
  const allowedActions = Array.isArray(item.allowedActions)
    ? item.allowedActions
    : []
  const result: ChatOperationUIAction[] = []
  for (const action of allowedActions) {
    if (
      action === 'continue'
      || action === 'switch_model'
      || action === 'retry'
      || action === 'retry_rewrite'
      || action === 'retry_continue'
      || action === 'rewrite'
    ) {
      if (!result.includes(action)) result.push(action)
    }
  }
  return result
}

export function resolveRetryGenerationAction(
  messages: any[],
  item: any,
): { userIndex: number; terminalIndex: number } | null {
  if (!Array.isArray(messages) || !item) return null
  const serverKind = String(item.serverOperationKind || '').trim().toLowerCase()
  const operationKind = String(item.operationKind || '').trim().toLowerCase()
  if (
    serverKind !== 'send'
    && serverKind !== 'retry_generation'
    && operationKind !== 'send'
    && operationKind !== 'retry_generation'
  ) {
    return null
  }
  const sourceChatId = String(
    item.sourceChatId || item.operationSourceChatId || '',
  ).trim()
  if (!sourceChatId) return null
  const userIndex = messages.findIndex(message => (
    message
    && message.type === 1
    && matchesBubbleId(message, sourceChatId)
  ))
  const terminalIndex = messages.findIndex(message => (
    message === item
    || (
      item.operationId
      && message
      && String(message.operationId || '') === String(item.operationId)
    )
  ))
  if (userIndex < 0 || terminalIndex < 0) return null
  return { userIndex, terminalIndex }
}

export function retryModeForAI(messages: any[], index: number): 'rewrite' | 'continue' | '' {
  if (latestTerminalAIIndex(messages) !== index) return ''
  const item = messages[index]
  if (String(item?.operationKind || '').toLowerCase().includes('continue')) return 'continue'
  if (
    String(item?.operationKind || '').toLowerCase().includes('rewrite')
    || String(item?.serverOperationKind || '').toLowerCase() === 'retry_generation'
  ) {
    return 'rewrite'
  }
  for (let previousIndex = index - 1; previousIndex >= 0; previousIndex -= 1) {
    const previous = messages[previousIndex]
    if (!previous || previous.isSummary === true) continue
    return previous.type === 1 ? 'rewrite' : 'continue'
  }
  return 'continue'
}

export function createRewriteSnapshot(
  messages: any[],
  userIndex: number,
  aiIndex: number,
): RewriteSnapshot | null {
  if (!Array.isArray(messages)) return null
  const userBubble = messages[userIndex]
  const aiBubble = messages[aiIndex]
  if (!userBubble || userBubble.type !== 1 || !aiBubble || aiBubble.type !== 0 || aiBubble.isSummary) {
    return null
  }
  return {
    userIndex,
    aiIndex,
    userBubble: { ...userBubble },
    aiBubble: { ...aiBubble },
  }
}

export function createRewriteSnapshotForAI(
  messages: any[],
  aiIndex: number,
): RewriteSnapshot | null {
  if (!Array.isArray(messages)) return null
  const aiBubble = messages[aiIndex]
  if (!aiBubble || aiBubble.type !== 0 || aiBubble.isSummary === true) return null
  for (let userIndex = aiIndex - 1; userIndex >= 0; userIndex -= 1) {
    const item = messages[userIndex]
    if (!item || item.isSummary === true) continue
    if (item.type !== 1) continue
    for (let branchIndex = userIndex + 1; branchIndex <= aiIndex; branchIndex += 1) {
      const branchItem = messages[branchIndex]
      if (!branchItem || branchItem.isSummary === true) continue
      if (branchItem.type === 0) {
        return createRewriteSnapshot(messages, userIndex, branchIndex)
      }
    }
    return null
  }
  return null
}

export function createRewriteSnapshotForTarget(messages: any[], targetId: unknown): RewriteSnapshot | null {
  if (!Array.isArray(messages)) return null
  for (let userIndex = messages.length - 1; userIndex >= 0; userIndex -= 1) {
    const item = messages[userIndex]
    if (!item || item.type !== 1 || !matchesBubbleId(item, targetId)) continue
    for (let aiIndex = userIndex + 1; aiIndex < messages.length; aiIndex += 1) {
      const next = messages[aiIndex]
      if (!next || next.isSummary === true) continue
      if (next.type === 1) break
      if (next.type === 0) return createRewriteSnapshot(messages, userIndex, aiIndex)
    }
  }
  return null
}

export function createPreAdmissionOperationErrorProjection(
  messages: any[],
  pending: any,
): Record<string, any> | null {
  if (!Array.isArray(messages) || !pending) return null
  const operationKind = String(pending.operationKind || '').trim().toLowerCase()
  const base = {
    operationProjectionCapable: true,
    operationState: 'pre_admission_failed',
    operationFailureKind: 'pre_admission_failed',
  }

  if (operationKind === 'continue') {
    const requestedSourceId = String(
      pending.chatId || pending.payload?.chatId || '',
    ).trim()
    if (!requestedSourceId) return null
    const source = messages.find(item => (
      item
      && item.type === 0
      && item.isSummary !== true
      && item.operationProjectionOnly !== true
      && matchesBubbleId(item, requestedSourceId)
    ))
    if (!source) return null
    const sourceChatId = String(source.chatId || source.id || '').trim()
    if (!sourceChatId) return null
    return {
      ...base,
      operationKind: 'continue',
      serverOperationKind: 'continue_response',
      sourceChatId,
      targetChatId: sourceChatId,
      assistantChatId: sourceChatId,
      allowedActions: ['retry_continue'],
    }
  }

  if (operationKind === 'rewrite') {
    const snapshot = pending.rewriteSnapshot as RewriteSnapshot | null | undefined
    const sourceChatId = String(
      snapshot?.aiBubble?.chatId || snapshot?.aiBubble?.id || '',
    ).trim()
    const targetChatId = String(
      snapshot?.userBubble?.chatId || snapshot?.userBubble?.id || '',
    ).trim()
    if (!sourceChatId || !targetChatId) return null
    return {
      ...base,
      operationKind: 'rewrite',
      serverOperationKind: 'rewrite_response',
      sourceChatId,
      targetChatId,
      assistantChatId: sourceChatId,
      userChatId: targetChatId,
      allowedActions: ['retry_rewrite'],
    }
  }

  return null
}

export function removeOperationCandidate(messages: any[], operationBubbleId: unknown): any[] {
  if (!Array.isArray(messages)) return []
  return messages.filter(item => !item || !sameId(item.operationBubbleId, operationBubbleId))
}

export function removeOwnedTurnBubbles(
  messages: any[],
  ownership: { userBubbleId?: unknown; aiBubbleId?: unknown } | null | undefined,
): any[] {
  if (!Array.isArray(messages)) return []
  const userBubbleId = ownership?.userBubbleId
  const aiBubbleId = ownership?.aiBubbleId
  return messages.filter(item => {
    if (!item) return true
    if (sameId(item.id, userBubbleId)) return false
    return !sameId(item.id, aiBubbleId) && !sameId(item.operationBubbleId, aiBubbleId)
  })
}

export function hasOperationCandidateOutput(messages: any[], operationBubbleId: unknown): boolean {
  if (!Array.isArray(messages)) return false
  const index = candidateIndex(messages, operationBubbleId)
  if (index < 0) return false
  const candidate = messages[index]
  return String(candidate?.content || '').trim().length > 0
    || String(candidate?.thinkingContent || '').trim().length > 0
}

export function isOperationCandidateAdoptable(messages: any[], operationBubbleId: unknown): boolean {
  if (!Array.isArray(messages)) return false
  const index = candidateIndex(messages, operationBubbleId)
  if (index < 0) return false
  const candidate = messages[index]
  if (candidate?.chatFinish !== true || !hasOperationCandidateOutput(messages, operationBubbleId)) {
    return false
  }
  return !NON_ADOPTABLE_FINISH_REASONS.has(
    String(candidate?.finishReason || '').trim().toLowerCase(),
  )
}

export function clearOperationCandidateMarker(messages: any[], operationBubbleId: unknown): any[] {
  if (!Array.isArray(messages)) return []
  return messages.map(item => {
    if (!item || !sameId(item.operationBubbleId, operationBubbleId)) return item
    const finalized = { ...item }
    delete finalized.operationBubbleId
    return finalized
  })
}

export function finalizeLegacyStoppedCandidate(
  messages: any[],
  operationBubbleId: unknown,
): any[] {
  return clearOperationCandidateMarker(messages, operationBubbleId)
}

const REWRITE_OUTPUT_MINIMUM_VISIBLE_GRAPHEMES = 5

function visibleGraphemeCount(value: unknown): number {
  const text = String(value || '').trim()
  if (!text) return 0
  if (typeof Intl !== 'undefined' && typeof (Intl as any).Segmenter === 'function') {
    const segmenter = new (Intl as any).Segmenter(undefined, { granularity: 'grapheme' })
    return Array.from(segmenter.segment(text)).length
  }
  return Array.from(text).length
}

function stoppedRewriteCandidateCrossesThreshold(
  messages: any[],
  operationBubbleId: unknown,
): boolean {
  if (!Array.isArray(messages)) return false
  const index = candidateIndex(messages, operationBubbleId)
  if (index < 0) return false
  const candidate = messages[index]
  return visibleGraphemeCount(candidate?.content) >= REWRITE_OUTPUT_MINIMUM_VISIBLE_GRAPHEMES
    || visibleGraphemeCount(candidate?.thinkingContent) >= REWRITE_OUTPUT_MINIMUM_VISIBLE_GRAPHEMES
}

export function settleOptimisticDurableUserStop(
  messages: any[],
  pending: {
    operationKind?: ChatOperationKind
    userBubbleId?: unknown
    aiBubbleId?: unknown
    rewriteSnapshot?: RewriteSnapshot | null
  } | null | undefined,
  hasPartial: boolean,
): any[] {
  if (!pending) return Array.isArray(messages) ? messages : []
  const kind = pending.operationKind || 'send'

  if (kind === 'rewrite') {
    if (!hasPartial || !stoppedRewriteCandidateCrossesThreshold(messages, pending.aiBubbleId)) {
      return restoreRewriteCandidate(
        messages,
        pending.rewriteSnapshot,
        pending.aiBubbleId,
      )
    }
    const committed = commitRewriteCandidate(
      messages,
      pending.rewriteSnapshot,
      pending.aiBubbleId,
    )
    return committed.committed
      ? committed.messages
      : clearOperationCandidateMarker(messages, pending.aiBubbleId)
  }

  if (kind === 'retry_generation') {
    if (!hasPartial) {
      return restoreRewriteCandidate(
        messages,
        pending.rewriteSnapshot,
        pending.aiBubbleId,
      )
    }
    const committed = commitRewriteCandidate(
      messages,
      pending.rewriteSnapshot,
      pending.aiBubbleId,
    )
    return committed.committed
      ? committed.messages
      : clearOperationCandidateMarker(messages, pending.aiBubbleId)
  }

  if (kind === 'continue') {
    return hasPartial
      ? clearOperationCandidateMarker(messages, pending.aiBubbleId)
      : removeOperationCandidate(messages, pending.aiBubbleId)
  }

  // Agent 準備到一半被停下：keepInterruptedAgentBubble 已經把軌跡固定在那顆氣泡上，
  // 它承載著使用者付過錢的那段過程，跟「沒有輸出」不是同一件事。先前這裡把它跟
  // 使用者那則一起整組移除，畫面上只剩輸入框旁的「繼續」——玩家看不到停在哪一步
  // （owner 2026-09-05）。mobile 是把氣泡留著、底下給一張「進度留著／繼續」的卡。
  if (!hasPartial && hasKeptInterruptedAgentBubble(messages)) {
    return clearOperationCandidateMarker(messages, pending.aiBubbleId)
  }

  return hasPartial
    ? clearOperationCandidateMarker(messages, pending.aiBubbleId)
    : removeOwnedTurnBubbles(messages, pending)
}

/** 最後一則是被停下來、軌跡已固定的 Agent 氣泡（見 keepInterruptedAgentBubble）。 */
export function hasKeptInterruptedAgentBubble(messages: any[]): boolean {
  if (!Array.isArray(messages) || !messages.length) return false
  const last = messages[messages.length - 1]
  return !!(last && typeof last === 'object' && last.type === 0 && last.agentInterrupted === true && !last.chatFinish)
}

export function settleZeroOutputTerminalFailure(
  messages: any[],
  pending: {
    operationKind?: ChatOperationKind
    userBubbleId?: unknown
    aiBubbleId?: unknown
    rewriteSnapshot?: RewriteSnapshot | null
  } | null | undefined,
): any[] {
  if (!pending) return Array.isArray(messages) ? messages : []
  const kind = pending.operationKind || 'send'

  if (kind === 'rewrite' || kind === 'retry_generation') {
    return restoreRewriteCandidate(
      messages,
      pending.rewriteSnapshot,
      pending.aiBubbleId,
    )
  }
  if (kind === 'continue') {
    return removeOperationCandidate(messages, pending.aiBubbleId)
  }
  return removeOwnedTurnBubbles(messages, pending)
}

export function restoreRewriteCandidate(
  messages: any[],
  snapshot: RewriteSnapshot | null | undefined,
  operationBubbleId: unknown,
): any[] {
  const next = removeOperationCandidate(messages, operationBubbleId)
  if (!snapshot) return next

  let userIndex = next.findIndex(item => matchesBubbleId(item, snapshot.userBubble.id))
  if (userIndex < 0) {
    userIndex = Math.min(Math.max(snapshot.userIndex, 0), next.length)
    next.splice(userIndex, 0, { ...snapshot.userBubble })
  }

  const sourceAIExists = next.some(item =>
    matchesBubbleId(item, snapshot.aiBubble.id) && !sameId(item.operationBubbleId, operationBubbleId)
  )
  if (!sourceAIExists) {
    const insertAt = Math.min(Math.max(userIndex + 1, snapshot.aiIndex), next.length)
    next.splice(insertAt, 0, { ...snapshot.aiBubble })
  }
  return next
}

export function commitRewriteCandidate(
  messages: any[],
  snapshot: RewriteSnapshot | null | undefined,
  operationBubbleId: unknown,
): { committed: boolean; messages: any[]; reason?: 'ineligible_output' } {
  if (!Array.isArray(messages) || !snapshot) return { committed: false, messages }
  const provisionalIndex = candidateIndex(messages, operationBubbleId)
  if (provisionalIndex < 0 || messages[provisionalIndex]?.chatFinish !== true) {
    return { committed: false, messages }
  }
  if (!isOperationCandidateAdoptable(messages, operationBubbleId)) {
    return { committed: false, reason: 'ineligible_output', messages }
  }

  const candidate = { ...messages[provisionalIndex] }
  delete candidate.operationBubbleId
  const sourceIndex = messages.findIndex((item, index) =>
    index !== provisionalIndex
    && matchesBubbleId(item, snapshot.aiBubble.id)
    && !sameId(item.operationBubbleId, operationBubbleId)
  )
  const branchIndex = sourceIndex >= 0 ? sourceIndex : snapshot.aiIndex
  const keptPrefix = messages.slice(0, Math.max(branchIndex, 0)).filter(
    item => !item || !sameId(item.operationBubbleId, operationBubbleId)
  )
  return {
    committed: true,
    messages: [...keptPrefix, candidate],
  }
}

export function replaceLatestCanonicalAI(
  messages: any[],
  targetId: unknown,
  replacement: any,
): { updated: boolean; messages: any[] } {
  const targetIndex = latestCanonicalAIIndex(messages)
  if (targetIndex < 0 || !matchesBubbleId(messages[targetIndex], targetId)) {
    return { updated: false, messages }
  }
  return {
    updated: true,
    messages: [
      ...messages.slice(0, targetIndex),
      { ...messages[targetIndex], ...replacement },
    ],
  }
}

export interface AdoptedAgentResumeBubble {
  index: number
  bubbleId: unknown
  trail: string[]
}

/**
 * 續跑時接管中斷的那一列。
 *
 * 「繼續」不是新的一輪，是同一輪還沒交卷——所以後續的準備過程要接在原本那顆
 * 氣泡裡繼續長，最後直接變成 AI 的回覆，而不是在底下另開一顆。
 *
 * 另開一顆還有一個更難看的後果：上面那顆仍掛著「繼續」，於是 AI 正在跑的時候
 * 使用者還能再按一次。續跑開始的那一刻，這個入口就該消失。
 *
 * 軌跡交出來給即時流水帳承載並清掉列上那份，避免同一段東西同時掛在兩個地方。
 */
export function adoptInterruptedAgentBubbleForResume(
  messages: any[],
): AdoptedAgentResumeBubble | undefined {
  if (!Array.isArray(messages)) return undefined
  for (let i = messages.length - 1; i >= 0; i--) {
    const row = messages[i]
    if (!row || row.type !== 0 || !row.agentInterrupted) continue
    const trail = Array.isArray(row.prepTrail) ? row.prepTrail.slice() : []
    row.agentInterrupted = false
    row.chatLoading = true
    row.chatFinish = false
    row.prepTrail = []
    row.prepTrailCollapsed = true
    return { index: i, bubbleId: row.id, trail }
  }
  return undefined
}

/**
 * agent 跑到一半被停下來時，那顆氣泡不是「空的」。
 *
 * 它承載著使用者已經付過錢的那段準備過程（流水帳掛在 chatLoading 的氣泡上）。
 * 當成孤兒占位移除，等於讓畫面上只剩使用者自己的訊息、底下空無一物。
 *
 * 留下來並把即時軌跡固定上去；底下的「繼續」由 agentInterrupted 驅動。
 * 沒有軌跡就不留：一顆什麼都沒有的氣泡比沒有更讓人困惑。
 */
export function keepInterruptedAgentBubble(bubble: any, prepSteps: string[]): boolean {
  if (!bubble || typeof bubble !== 'object') return false
  if (bubble.type !== 0) return false
  // 已經有內容的氣泡本來就不會被當成空的移除，不歸這條管。
  if (bubble.content || bubble.thinkingContent) return false
  if (!Array.isArray(prepSteps) || prepSteps.length === 0) return false
  bubble.chatLoading = false
  bubble.prepTrail = prepSteps.slice()
  bubble.prepTrailCollapsed = true
  bubble.agentInterrupted = true
  return true
}
