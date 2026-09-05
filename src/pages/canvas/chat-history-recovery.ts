export type HistoryRecoveryReason = 'stale_generation' | 'transport_error'

export interface HistoryRecoveryInput {
  reason?: HistoryRecoveryReason
  requestConversationId?: unknown
  requestGeneration?: unknown
  requestKey?: unknown
  requestPage?: unknown
  currentConversationId?: unknown
  currentGeneration?: unknown
  timelineLength?: unknown
  activeRequestKey?: unknown
}

export interface HistoryRecoveryDecision {
  key: string
  conversationId: string
  generation: number
}

export interface HistoryRequestCompletionInput {
  requestConversationId?: unknown
  requestKey?: unknown
  currentConversationId?: unknown
  activeRequestKey?: unknown
}

export interface HistoryRequestKeyInput {
  conversationId?: unknown
  generation?: unknown
  page?: unknown
  attempt?: unknown
}

function normalizedHistoryIdentity(value: unknown): string {
  return String(value || '').trim()
}

export function createHistoryRequestKey(
  input: HistoryRequestKeyInput = {},
): string {
  return [
    normalizedHistoryIdentity(input.conversationId),
    Number(input.generation),
    Number(input.page),
    Number(input.attempt),
  ].join(':')
}

export function shouldCompleteHistoryRequest(
  input: HistoryRequestCompletionInput = {},
): boolean {
  const requestConversationId = normalizedHistoryIdentity(
    input.requestConversationId,
  )
  const currentConversationId = normalizedHistoryIdentity(
    input.currentConversationId,
  )
  const requestKey = normalizedHistoryIdentity(input.requestKey)
  const activeRequestKey = normalizedHistoryIdentity(input.activeRequestKey)

  return !!requestConversationId &&
    requestConversationId === currentConversationId &&
    !!requestKey &&
    activeRequestKey === requestKey
}

export function decideHistoryRecovery(
  input: HistoryRecoveryInput = {},
): HistoryRecoveryDecision | null {
  const reason = input.reason
  const requestConversationId = normalizedHistoryIdentity(
    input.requestConversationId,
  )
  const currentConversationId = normalizedHistoryIdentity(
    input.currentConversationId,
  )
  const requestGeneration = Number(input.requestGeneration)
  const currentGeneration = Number(input.currentGeneration)
  const requestKey = normalizedHistoryIdentity(input.requestKey)
  const activeRequestKey = normalizedHistoryIdentity(input.activeRequestKey)
  const requestPage = Number(input.requestPage)
  const timelineLength = Math.max(0, Number(input.timelineLength) || 0)
  const generationMatches = requestGeneration === currentGeneration

  if ((reason !== 'stale_generation' && reason !== 'transport_error') ||
    !requestConversationId ||
    requestConversationId !== currentConversationId ||
    !Number.isFinite(requestGeneration) ||
    !Number.isFinite(currentGeneration) ||
    requestPage !== 1 ||
    (reason === 'stale_generation' && generationMatches) ||
    (reason === 'transport_error' && !generationMatches) ||
    timelineLength > 0 ||
    activeRequestKey !== requestKey) {
    return null
  }

  return {
    key: `${currentConversationId}:${currentGeneration}`,
    conversationId: currentConversationId,
    generation: currentGeneration,
  }
}
