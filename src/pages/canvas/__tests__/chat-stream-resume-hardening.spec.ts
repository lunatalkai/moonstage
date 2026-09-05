import { describe, expect, it, vi } from 'vitest'
import { dispatchSSEEvent, handleParsedChatSSEEventGate } from '../chat-sse-dispatch'

function makeContext() {
  const ctx: any = {
    currentChatId: { value: '' },
    replyContent: { value: '' },
    thinkingContent: { value: '' },
    talkList: { value: [] },
    lastFinishReason: { value: '' },
    lastEventId: { value: 0 },
    streamId: { value: 'stale-stream' },
    isStreamActive: { value: true },
    tempContent: { value: '' },
    content: { value: '' },
    pendingMessageMeta: { value: null },
    pendingResendPayload: { value: { payload: { message: 'already stored' } } },
    isResumeInitial: { value: true },
    pic: { value: '' },
    formData: {},
    finalizeV3Message: vi.fn(),
    feedV3Chunk: vi.fn(),
    looksLikeV3Content: vi.fn(() => false),
    upsertPendingAIBubble: vi.fn(),
    scrollToBottom: vi.fn(),
    checkQuotaExhaustion: vi.fn(),
    playSound: vi.fn(),
    persistStreamState: vi.fn(),
    clearStreamState: vi.fn(() => {
      ctx.streamId.value = ''
      ctx.isStreamActive.value = false
    }),
    sendError: vi.fn(),
    resetHistoryPagination: vi.fn(),
    getHistoryMsg: vi.fn(),
    emitCGUpdate: vi.fn(),
    removeOrphanPlaceholder: vi.fn(),
    removeResumeHistoryDuplicateByMessageAnchor: vi.fn(),
    appendStreamStateMessage: vi.fn(),
    clearCompactState: vi.fn(),
    tify: (value: string) => value,
    getLocale: () => 'en',
    nextTick: (callback?: () => void) => callback?.(),
    t: (key: string) => key,
  }
  return ctx
}

describe('chat stream resume hardening', () => {
  it('drops a stale pre-rollback event before dispatcher or inline mutation', () => {
    const ctx = makeContext()
    const dispatchEvent = vi.fn((event) => dispatchSSEEvent(event, ctx))
    const clearResumeInitialIfNeeded = vi.fn()

    const consumed = handleParsedChatSSEEventGate({
      event: 'answer',
      raw: '',
      data: { choices: [{ delta: { content: 'stale branch' } }] },
    } as any, {
      isGenerationCurrent: () => false,
      dispatchEvent,
      clearResumeInitialIfNeeded,
    })

    expect(consumed).toBe(true)
    expect(dispatchEvent).not.toHaveBeenCalled()
    expect(clearResumeInitialIfNeeded).not.toHaveBeenCalled()
    expect(ctx.talkList.value).toEqual([])
  })

  it('deduplicates a resumed answer by its message anchor regardless of list order', () => {
    const ctx = makeContext()
    ctx.talkList.value = [
      { id: 'assistant-elsewhere', type: 0, chatFinish: true },
      { id: 'user-anchor', type: 1 },
      { id: 'assistant-anchor', type: 0, chatFinish: true },
      { id: 'placeholder', type: 0, chatFinish: false },
    ]

    dispatchSSEEvent({ event: 'flowNodeStatus', raw: '', data: { name: 'assistant-anchor' } } as any, ctx)

    expect(ctx.removeResumeHistoryDuplicateByMessageAnchor).toHaveBeenCalledWith('assistant-anchor')
    expect(ctx.currentChatId.value).toBe('assistant-anchor')
  })

  it('turns resumeUnavailable into a manual regenerate soft error without resending payload', () => {
    const ctx = makeContext()

    dispatchSSEEvent({ event: 'resumeUnavailable', raw: '', data: { retryable: true } } as any, ctx)

    expect(ctx.pendingResendPayload.value).toBeNull()
    expect(ctx.isResumeInitial.value).toBe(false)
    expect(ctx.clearStreamState).toHaveBeenCalledTimes(1)
    expect(ctx.removeOrphanPlaceholder).toHaveBeenCalledTimes(1)
    expect(ctx.appendStreamStateMessage).toHaveBeenCalledWith('chat.resumeUnavailable', 'resume_unavailable')
    expect(ctx.sendError).not.toHaveBeenCalled()
  })

  it.each([
    ['compact_no_input', 'chat.compactNoInput', 'compact_no_input'],
    ['compact_retryable', 'chat.compactFailed', 'compact_retryable'],
    ['resume_unavailable', 'chat.resumeUnavailable', 'resume_unavailable'],
  ])('classifies synchronous error finishReason %s without generic connection handling', (finishReason, messageKey, stateReason) => {
    const ctx = makeContext()

    const consumed = dispatchSSEEvent({
      event: 'error',
      raw: '',
      data: { finishReason, error_type: 'connection_error' },
    } as any, ctx)

    expect(consumed).toBe(true)
    expect(ctx.clearCompactState).toHaveBeenCalledTimes(1)
    expect(ctx.appendStreamStateMessage).toHaveBeenCalledWith(messageKey, stateReason)
    expect(ctx.sendError).not.toHaveBeenCalled()
  })

  it('fetches history exactly once for sessionExpired', () => {
    const ctx = makeContext()

    dispatchSSEEvent({ event: 'sessionExpired', raw: '', data: {} } as any, ctx)

    expect(ctx.resetHistoryPagination).toHaveBeenCalledTimes(1)
    expect(ctx.getHistoryMsg).toHaveBeenCalledTimes(1)
    expect(ctx.removeOrphanPlaceholder).toHaveBeenCalledTimes(1)
  })
})
