import { describe, expect, it, vi } from 'vitest'
import * as transport from '../chat-transport-ownership'
import { operationKindFromPayload } from '../chat-operation-ui-state'

const {
  createChatTransportOwnership,
  createClientOperationId,
  createOperationStatusPollScheduler,
  createPendingStreamEntry,
  buildPendingOperationProbeQuery,
  classifyOperationCapabilityResponse,
  consumeFrozenPendingStreamError,
  decideStreamResume,
  isChatOperationTerminal,
  markStreamEntryAccepted,
  mergeChatHistoryOperationProjections,
  mergeOperationStatusIntoStreamEntry,
  markExplicitPreAdmissionError,
  mergeStreamMetaIntoPendingEntry,
  normalizeChatOperationStatus,
  prepareChatPayload,
  recordExactOperationProbeMiss,
  selectPendingOperationFromList,
  shouldApplyOperationStatus,
  shouldAwaitDurableStopTerminal,
  shouldProbeExactOperationIdentity,
  terminateStreamForChatError,
  isChatSendInFlight,
  projectionFinishReason,
} = transport as any

const completePayloadInput = (overrides: Record<string, unknown> = {}) => ({
  conversationId: 'conv-1',
  storyId: 'story-1',
  message: 'hello',
  model: 'test-model',
  thinkingDepth: 'medium',
  rewrite: false,
  contine: false,
  presetCmd: 'stay in character',
  language: 'zh-Hant',
  chatId: '',
  clientTurnId: '',
  ackToken: '',
  supportsPassBlock: true,
  ...overrides,
})

describe('desktop chat transport ownership state machine', () => {
  it('surfaces a durable empty response as a model-specific retryable outcome', () => {
    expect(projectionFinishReason({
      kind: 'send',
      state: 'failed_retryable',
      reasonCode: 'empty_response',
      outputDisposition: 'none',
    })).toBe('empty_response')
    expect(projectionFinishReason({
      kind: 'send',
      state: 'failed_retryable',
      reasonCode: 'temporary_failure',
      outputDisposition: 'none',
    })).toBe('server_error')
  })

  // 逾時說明義務（owner 2026-08-07 裁決）：reasoning_only 若肇因於伺服器端 idle
  // watchdog（上游太慢），要換成專屬 finishReason，讓 UI 能顯示「模型太久沒回應」
  // 而不是聽起來像模型自己選擇不回答。reasonCode 判斷必須排在既有的
  // outputDisposition === 'reasoning_only' 分支之前——那個分支對逾時與非逾時
  // 的 reasoning_only 都成立，先判會讓 timeout case 永遠走不到專屬分支。
  it('distinguishes idle-timeout reasoning-only from ordinary reasoning-only', () => {
    expect(projectionFinishReason({
      kind: 'send',
      state: 'interrupted',
      reasonCode: 'no_final_answer_timeout',
      outputDisposition: 'reasoning_only',
    })).toBe('reasoning_only_timeout')
    // 非逾時的 reasoning_only 必須維持原文案不變（回歸鎖）。
    expect(projectionFinishReason({
      kind: 'send',
      state: 'interrupted',
      reasonCode: 'no_final_answer',
      outputDisposition: 'reasoning_only',
    })).toBe('reasoning_only')
  })

  it('[B1] conversation_stale terminates the stream before socket close, so reconnect and noActiveStream resend stay off', () => {
    const state: any = {
      isStreamActive: true,
      streamId: 'stream-old',
      pendingResendPayload: { payload: completePayloadInput(), pendingSince: Date.now() },
      pendingChatTurn: { accepted: true },
    }
    const clearStreamState = vi.fn(() => {
      state.isStreamActive = false
      state.streamId = ''
      state.pendingResendPayload = null
      state.pendingChatTurn = null
    })
    const reconnect = vi.fn()
    const autoResend = vi.fn()

    expect(terminateStreamForChatError('conversation_stale', clearStreamState)).toBe(true)
    if (state.isStreamActive && state.streamId) reconnect()
    if (state.pendingResendPayload) autoResend()

    expect(clearStreamState).toHaveBeenCalledTimes(1)
    expect(reconnect).not.toHaveBeenCalled()
    expect(autoResend).not.toHaveBeenCalled()
    expect(state.pendingChatTurn).toBeNull()

    const untouched = vi.fn()
    expect(terminateStreamForChatError('service_unavailable', untouched)).toBe(false)
    expect(untouched).not.toHaveBeenCalled()
  })

  it('[B4] blocks the Enter-confirm send path while a turn or compaction is in flight', () => {
    const networkSend = vi.fn()
    const onConfirm = (state: any) => {
      if (isChatSendInFlight(state)) return
      networkSend()
    }

    onConfirm({ isStreamActive: true })
    onConfirm({ pendingResendPayload: {} })
    onConfirm({ pendingChatTurn: {} })
    onConfirm({ isCompacting: true })
    expect(networkSend).not.toHaveBeenCalled()

    onConfirm({})
    expect(networkSend).toHaveBeenCalledTimes(1)
  })

  it('allows one chat payload per socket generation and stales older callbacks', () => {
    const ownership = createChatTransportOwnership()
    const first = ownership.openSocketGeneration()

    expect(ownership.consumeChatPayload(first)).toBe(true)
    expect(ownership.consumeChatPayload(first)).toBe(false)

    const second = ownership.openSocketGeneration()
    expect(ownership.isCurrentSocket(first)).toBe(false)
    expect(ownership.consumeChatPayload(first)).toBe(false)
    expect(ownership.consumeChatPayload(second)).toBe(true)
  })

  it('treats accepted acknowledgement as mandatory from the first V2 turn', () => {
    const ownership = createChatTransportOwnership()

    expect(ownership.shouldRecoverTransientTurn({ accepted: false })).toBe(true)
    const pending = { accepted: false, expectsAccepted: true }
    expect(ownership.markAccepted(pending, { chatId: 'chat-2' })).toBe('chat-2')
    expect(pending).toMatchObject({ accepted: true, chatId: 'chat-2' })
    expect(ownership.shouldRecoverTransientTurn(pending)).toBe(false)
    expect(ownership.shouldRecoverTransientTurn({ accepted: false, expectsAccepted: true })).toBe(true)
  })

  it('keeps the durable-ack watchdog armed for capable Send, Rewrite, and Continue after streamMeta', () => {
    vi.useFakeTimers()
    try {
      for (const pending of [
        {
          accepted: false,
          expectsAccepted: true,
          payload: completePayloadInput({
            supportsOperationOutcome: true,
            clientOperationId: 'send-operation',
          }),
        },
        {
          accepted: false,
          expectsAccepted: false,
          payload: completePayloadInput({
            rewrite: true,
            chatId: 'user-1',
            supportsOperationOutcome: true,
            clientOperationId: 'rewrite-operation',
          }),
        },
        {
          accepted: false,
          expectsAccepted: false,
          payload: completePayloadInput({
            message: '',
            contine: true,
            chatId: 'ai-1',
            supportsOperationOutcome: true,
            clientOperationId: 'continue-operation',
          }),
        },
      ]) {
        const ownership = createChatTransportOwnership()
        const token = ownership.openSocketGeneration()
        const onTimeout = vi.fn()
        ownership.armAcceptedDeadline(token, 15_000, onTimeout)
        expect(ownership.shouldAwaitDurableTurnAck(pending)).toBe(true)

        ownership.noteServerStreamProgress(pending, 'stream_meta')
        expect(pending).toMatchObject({
          streamMetaReceived: true,
          serverProgress: false,
        })
        vi.advanceTimersByTime(15_000)
        expect(onTimeout).toHaveBeenCalledTimes(1)
      }
    } finally {
      vi.useRealTimers()
    }
  })

  it('lets a confirmed legacy server use streamMeta as delivery proof without weakening capable lanes', () => {
    vi.useFakeTimers()
    try {
      const ownership = createChatTransportOwnership()
      const token = ownership.openSocketGeneration()
      const onTimeout = vi.fn()
      ownership.armAcceptedDeadline(token, 15_000, onTimeout)
      const pending = {
        accepted: false,
        expectsAccepted: false,
        payload: completePayloadInput({
          message: '',
          contine: true,
          chatId: 'ai-1',
          supportsOperationOutcome: true,
          clientOperationId: 'continue-operation',
        }),
      }

      ownership.noteServerStreamProgress(pending, 'stream_meta')
      ownership.noteServerStreamProgress(pending, 'legacy_server')
      expect(pending).toMatchObject({
        operationOutcomeCapability: 'legacy',
        serverProgress: true,
      })
      vi.advanceTimersByTime(15_000)
      expect(onTimeout).not.toHaveBeenCalled()
      expect(ownership.shouldRecoverTransientTurn(pending)).toBe(false)

      expect(classifyOperationCapabilityResponse({ statusCode: 404 })).toBe('legacy')
      expect(classifyOperationCapabilityResponse({
        statusCode: 404,
        data: {
          error: 'operation_not_found',
          errorCode: 'operation_not_found',
        },
      })).toBe('supported')
      expect(classifyOperationCapabilityResponse({
        statusCode: 200,
        data: { schemaVersion: 'outcome_v1', operations: [] },
      })).toBe('supported')
      expect(classifyOperationCapabilityResponse({
        statusCode: 200,
        data: {
          schemaVersion: 'outcome_v1',
          operationStatusAvailable: false,
          operations: [],
        },
      })).toBe('legacy')
      expect(classifyOperationCapabilityResponse({ statusCode: 503 })).toBe('unknown')
    } finally {
      vi.useRealTimers()
    }
  })

  it('selects only the exact client operation identity and never guesses an older same-kind operation', () => {
    const pending = {
      operationKind: 'continue',
      startedAt: 50_000,
      clientOperationId: 'client-current',
      payload: {
        conversationId: 'conv-1',
        clientOperationId: 'client-current',
      },
    }
    const response = {
      schemaVersion: 'outcome_v1',
      operations: [
        {
          operationId: 'older-same-kind',
          clientOperationId: 'client-older',
          conversationId: 'conv-1',
          kind: 'continue_response',
          state: 'completed',
          acceptedAt: new Date(50_500).toISOString(),
        },
        {
          operationId: 'current-continue',
          clientOperationId: 'client-current',
          conversationId: 'conv-1',
          kind: 'continue_response',
          state: 'generating',
          acceptedAt: new Date(50_100).toISOString(),
        },
      ],
    }

    expect(selectPendingOperationFromList(response, pending)).toMatchObject({
      operationId: 'current-continue',
      clientOperationId: 'client-current',
    })
    expect(selectPendingOperationFromList(response, {
      ...pending,
      clientOperationId: 'client-missing',
      payload: {
        ...pending.payload,
        clientOperationId: 'client-missing',
      },
    })).toBeNull()
    expect(selectPendingOperationFromList(response, {
      ...pending,
      clientOperationId: '',
      payload: { conversationId: 'conv-1' },
    })).toBeNull()

    expect(buildPendingOperationProbeQuery(pending, 10)).toBe(
      '?conversationId=conv-1&clientOperationId=client-current&limit=10',
    )
    expect(buildPendingOperationProbeQuery({
      payload: {
        conversationId: 'conv / encoded',
        clientOperationId: 'client?id=1',
      },
    }, 10)).toBe(
      '?conversationId=conv%20%2F%20encoded&clientOperationId=client%3Fid%3D1&limit=10',
    )
    expect(buildPendingOperationProbeQuery({
      payload: { conversationId: 'conv-1' },
    }, 10)).toBe('')
  })

  it('moves exhausted fast polling to one bounded slow timer without declaring a nonterminal operation failed', () => {
    vi.useFakeTimers()
    try {
      expect(typeof createOperationStatusPollScheduler).toBe('function')
      const scheduler = createOperationStatusPollScheduler({
        windowMs: 12_000,
        slowDelayMs: 60_000,
      })
      const poll = vi.fn()

      expect(scheduler.schedule(poll)).toBe(true)
      vi.advanceTimersByTime(1_999)
      expect(poll).not.toHaveBeenCalled()
      vi.advanceTimersByTime(1)
      expect(poll).toHaveBeenCalledTimes(1)

      expect(scheduler.schedule(poll)).toBe(true)
      vi.advanceTimersByTime(4_999)
      expect(poll).toHaveBeenCalledTimes(1)
      vi.advanceTimersByTime(1)
      expect(poll).toHaveBeenCalledTimes(2)

      expect(scheduler.schedule(poll)).toBe(true)
      vi.advanceTimersByTime(5_000)
      expect(poll).toHaveBeenCalledTimes(3)
      expect(scheduler.schedule(poll)).toBe(false)
      expect(scheduler.isExhausted()).toBe(true)

      expect(typeof scheduler.scheduleSlow).toBe('function')
      expect(scheduler.scheduleSlow(poll)).toBe(true)
      expect(scheduler.scheduleSlow(poll)).toBe(false)
      vi.advanceTimersByTime(59_999)
      expect(poll).toHaveBeenCalledTimes(3)
      vi.advanceTimersByTime(1)
      expect(poll).toHaveBeenCalledTimes(4)
      expect(scheduler.isExhausted()).toBe(true)
      expect(scheduler.scheduleSlow(poll)).toBe(true)
      scheduler.pause()
      vi.advanceTimersByTime(60_000)
      expect(poll).toHaveBeenCalledTimes(4)
      expect(scheduler.isExhausted()).toBe(true)

      scheduler.cancel()
      expect(scheduler.isExhausted()).toBe(false)
      expect(scheduler.schedule(poll)).toBe(true)
      scheduler.cancel()
      vi.advanceTimersByTime(5_000)
      expect(poll).toHaveBeenCalledTimes(4)

      // cancel starts a new operation window instead of inheriting an exhausted one.
      expect(scheduler.schedule(poll)).toBe(true)
      vi.advanceTimersByTime(2_000)
      expect(poll).toHaveBeenCalledTimes(5)
    } finally {
      vi.useRealTimers()
    }
  })

  it('settles only an explicit pre-admission error after repeated exact supported misses', () => {
    const pending = {
      operationKind: 'send',
      clientOperationId: 'client-pre-admission',
      payload: completePayloadInput({
        supportsOperationOutcome: true,
        clientOperationId: 'client-pre-admission',
      }),
    }

    expect(markExplicitPreAdmissionError(
      pending,
      'content_filter',
      1_000,
    )).toBe(true)
    expect(pending).toMatchObject({
      preAdmissionErrorType: 'content_filter',
      preAdmissionErrorAt: 1_000,
      exactIdentityEmptyProbeCount: 0,
    })
    expect(recordExactOperationProbeMiss(
      pending,
      1_000,
      { minimumMisses: 3, minimumAgeMs: 5_000 },
    )).toMatchObject({ confirmed: false, misses: 1 })
    expect(recordExactOperationProbeMiss(
      pending,
      3_000,
      { minimumMisses: 3, minimumAgeMs: 5_000 },
    )).toMatchObject({ confirmed: false, misses: 2 })
    expect(recordExactOperationProbeMiss(
      pending,
      6_000,
      { minimumMisses: 3, minimumAgeMs: 5_000 },
    )).toMatchObject({ confirmed: true, misses: 3 })

    const persisted = markStreamEntryAccepted({
      ...createPendingStreamEntry(pending.payload, 1_000),
      preAdmissionErrorType: pending.preAdmissionErrorType,
      preAdmissionErrorAt: pending.preAdmissionErrorAt,
      exactIdentityEmptyProbeCount: pending.exactIdentityEmptyProbeCount,
    }, {
      streamId: '',
      now: 6_500,
    })
    expect(decideStreamResume(persisted, 60_000)).toMatchObject({
      kind: 'byClientOperationId',
      clientOperationId: 'client-pre-admission',
      preAdmissionErrorType: 'content_filter',
      preAdmissionErrorAt: 1_000,
      exactIdentityEmptyProbeCount: 3,
    })

    const ambiguous = {
      clientOperationId: 'client-ambiguous',
      payload: completePayloadInput({
        supportsOperationOutcome: true,
        clientOperationId: 'client-ambiguous',
      }),
    }
    expect(recordExactOperationProbeMiss(ambiguous, 10_000)).toMatchObject({
      confirmed: false,
      misses: 0,
    })
    expect(markExplicitPreAdmissionError(
      {
        operationOutcomeCapability: 'legacy',
        payload: completePayloadInput(),
      },
      'server_error',
      10_000,
    )).toBe(false)

    pending.operationId = 'durable-operation'
    expect(recordExactOperationProbeMiss(pending, 20_000)).toMatchObject({
      confirmed: false,
      misses: 3,
    })
  })

  it('keeps capable Send ownership when both Stop transports fail and releases only a confirmed legacy lane locally', async () => {
    expect(typeof shouldAwaitDurableStopTerminal).toBe('function')
    const capablePending = {
      operationKind: 'send',
      clientOperationId: 'client-stop',
      payload: completePayloadInput({
        supportsOperationOutcome: true,
        clientOperationId: 'client-stop',
      }),
    }
    const wsStop = vi.fn().mockRejectedValue(new Error('socket failed'))
    const httpStop = vi.fn().mockRejectedValue(new Error('http failed'))
    let ownedTurn: any = capablePending

    await Promise.allSettled([wsStop(), httpStop()])
    if (!shouldAwaitDurableStopTerminal(ownedTurn)) ownedTurn = null

    expect(ownedTurn).toBe(capablePending)
    expect(wsStop).toHaveBeenCalledTimes(1)
    expect(httpStop).toHaveBeenCalledTimes(1)
    expect(shouldAwaitDurableStopTerminal({
      ...capablePending,
      operationOutcomeCapability: 'legacy',
    })).toBe(false)
    expect(shouldAwaitDurableStopTerminal({
      operationKind: 'send',
      payload: completePayloadInput(),
    })).toBe(false)
  })

  it('keeps probing exact identity after accepted until a server operation id is bound', () => {
    const pending = {
      accepted: true,
      operationOutcomeCapability: 'supported',
      clientOperationId: 'client-accepted',
      payload: completePayloadInput({
        supportsOperationOutcome: true,
        clientOperationId: 'client-accepted',
      }),
    }
    expect(shouldProbeExactOperationIdentity(pending)).toBe(true)
    expect(shouldProbeExactOperationIdentity({
      ...pending,
      operationId: 'server-operation',
    })).toBe(false)
    expect(shouldProbeExactOperationIdentity({
      ...pending,
      operationOutcomeCapability: 'legacy',
    })).toBe(false)
  })

  it('recovers the first pre-ack failure without an automatic rewrite retry', () => {
    const ownership = createChatTransportOwnership()
    const pending = { accepted: false, expectsAccepted: true }
    const recoverDraft = vi.fn()
    const send = vi.fn()
    let rewrite = false

    if (ownership.shouldRecoverTransientTurn(pending)) recoverDraft()
    else {
      rewrite = true
      send()
    }

    expect(recoverDraft).toHaveBeenCalledTimes(1)
    expect(send).not.toHaveBeenCalled()
    expect(rewrite).toBe(false)
  })

  it('uses rewrite=false before accepted and rewrite=true only with a durable chatId', () => {
    const ownership = createChatTransportOwnership()

    expect(ownership.shouldRewriteUserTurn({ transportTransient: true, serverAccepted: false })).toBe(false)
    expect(ownership.shouldRewriteUserTurn({ transportTransient: true, serverAccepted: true })).toBe(false)
    expect(ownership.shouldRewriteUserTurn({ transportTransient: true, serverAccepted: true, chatId: 'chat-2' })).toBe(true)
    expect(ownership.shouldRewriteUserTurn({ transportTransient: true, chatId: 'chat-2' })).toBe(true)
    expect(ownership.shouldRewriteUserTurn({ transportTransient: false, serverAccepted: true })).toBe(true)
    expect(ownership.shouldRewriteUserTurn({ type: 1, id: 42 })).toBe(true)
  })

  it('builds the same complete payload shape for first send and manual resend', () => {
    const first = prepareChatPayload(completePayloadInput())
    expect(first.ok).toBe(true)
    expect(first.missingFields).toEqual([])
    expect(first.payload).toEqual(completePayloadInput())
    expect(prepareChatPayload(first.payload)).toEqual(first)

    const rewrite = prepareChatPayload(completePayloadInput({ rewrite: true, chatId: 'chat-user-1' }))
    expect(rewrite.ok).toBe(true)
    expect(rewrite.payload.chatId).toBe('chat-user-1')
  })

  it('preserves the original turn identity and expiry acknowledgement token for an exact resend', () => {
    const original = prepareChatPayload(completePayloadInput({
      clientTurnId: 'turn-expiry-1',
      ackToken: 'ack-expiry-1',
    }))

    expect(original.ok).toBe(true)
    expect(original.payload).toMatchObject({
      clientTurnId: 'turn-expiry-1',
      ackToken: 'ack-expiry-1',
    })
    expect(prepareChatPayload(original.payload).payload).toMatchObject({
      clientTurnId: 'turn-expiry-1',
      ackToken: 'ack-expiry-1',
    })
  })

  it('keeps the frozen legacy payload shape while a capable turn carries one stable client operation id', () => {
    const legacy = prepareChatPayload(completePayloadInput())
    expect(legacy.payload).toEqual(completePayloadInput())

    const firstId = createClientOperationId(1234, 0.25)
    const secondId = createClientOperationId(1234, 0.25)
    expect(firstId).not.toBe(secondId)
    expect(firstId.length).toBeLessThanOrEqual(64)

    const capable = prepareChatPayload(completePayloadInput({
      supportsOperationOutcome: true,
      clientOperationId: firstId,
    }))
    expect(capable).toMatchObject({
      ok: true,
      payload: {
        supportsOperationOutcome: true,
        clientOperationId: firstId,
      },
    })
    expect(prepareChatPayload(capable.payload)).toEqual(capable)
    const retryGeneration = prepareChatPayload(completePayloadInput({
      supportsOperationOutcome: true,
      clientOperationId: 'retry-generation-1',
      operationKind: 'retry_generation',
      rewrite: true,
      chatId: 'chat-user-1',
    }))
    expect(retryGeneration.payload).toMatchObject({
      supportsOperationOutcome: true,
      clientOperationId: 'retry-generation-1',
      operationKind: 'retry_generation',
      rewrite: true,
      chatId: 'chat-user-1',
    })
    expect(prepareChatPayload(retryGeneration.payload)).toEqual(retryGeneration)
    expect(prepareChatPayload(completePayloadInput({
      supportsOperationOutcome: true,
    }))).toMatchObject({
      ok: false,
      missingFields: expect.arrayContaining(['clientOperationId']),
    })
  })

  it('types every capable chat operation while preserving matching legacy fallback fields and local UI semantics', () => {
    const cases = [
      {
        localKind: 'send',
        wireKind: 'send',
        legacy: { rewrite: false, contine: false, chatId: '' },
      },
      {
        localKind: 'rewrite',
        wireKind: 'rewrite_response',
        legacy: { rewrite: true, contine: false, chatId: 'ai-rewrite-source' },
      },
      {
        localKind: 'continue',
        wireKind: 'continue_response',
        legacy: {
          message: '',
          rewrite: false,
          contine: true,
          chatId: 'ai-continue-source',
        },
      },
      {
        localKind: 'retry_generation',
        wireKind: 'retry_generation',
        legacy: {
          operationKind: 'retry_generation',
          rewrite: true,
          contine: false,
          chatId: 'user-retry-source',
        },
      },
    ] as const

    for (const testCase of cases) {
      const prepared = prepareChatPayload(completePayloadInput({
        supportsOperationOutcome: true,
        clientOperationId: `client-${testCase.localKind}`,
        ...testCase.legacy,
      }))

      expect(prepared).toMatchObject({
        ok: true,
        payload: {
          supportsOperationOutcome: true,
          clientOperationId: `client-${testCase.localKind}`,
          operationKind: testCase.wireKind,
          ...testCase.legacy,
        },
      })
      expect(operationKindFromPayload(prepared.payload)).toBe(testCase.localKind)
      expect(prepareChatPayload(prepared.payload)).toEqual(prepared)
    }
  })

  it('preserves server operation version zero through normalization, persistence, and cold resume', () => {
    const status = {
      operationId: 'operation-version-zero',
      clientOperationId: 'client-version-zero',
      conversationId: 'conv-1',
      kind: 'send',
      state: 'accepted',
      version: 0,
      allowedActions: [],
    }

    expect(normalizeChatOperationStatus(status)).toMatchObject({ version: 0 })
    const entry = mergeOperationStatusIntoStreamEntry(
      createPendingStreamEntry(completePayloadInput({
        supportsOperationOutcome: true,
        clientOperationId: 'client-version-zero',
      }), 100),
      status,
      200,
    )
    expect(entry).toMatchObject({
      operationId: 'operation-version-zero',
      operationVersion: 0,
    })
    expect(decideStreamResume(entry, 300)).toMatchObject({
      kind: 'byOperationId',
      operationId: 'operation-version-zero',
      operationVersion: 0,
    })

    for (const missingVersion of [null, undefined, Number.NaN]) {
      expect(normalizeChatOperationStatus({
        ...status,
        version: missingVersion,
      })).not.toHaveProperty('version')
      expect(decideStreamResume({
        ...entry,
        operationVersion: missingVersion,
      }, 300).operationVersion).toBeUndefined()
    }
  })

  it('rejects polluted storage payloads instead of auto-sending missing required fields', () => {
    const now = 50_000
    expect(decideStreamResume({ streamId: 'legacy-stream', lastEventId: 2, updatedAt: now }, now, {
      streamTtlMs: 60_000,
      pendingTtlMs: 20_000,
    })).toMatchObject({ kind: 'recoverDraft', reason: 'incomplete_pending_payload' })

    const pollutedPending = decideStreamResume({
      pendingSince: now - 100,
      pendingPayload: { streamId: 'legacy-stream' },
      updatedAt: now,
    }, now, { streamTtlMs: 60_000, pendingTtlMs: 20_000 })
    expect(pollutedPending).toMatchObject({ kind: 'recoverDraft', reason: 'incomplete_pending_payload' })

    const send = vi.fn()
    if (pollutedPending.kind === 'byConv') send(pollutedPending.pendingPayload)
    expect(send).not.toHaveBeenCalled()
  })

  it('keeps the full pending payload through streamMeta and clears it only on accepted', () => {
    const payload = prepareChatPayload(completePayloadInput()).payload
    const pending = createPendingStreamEntry(payload, 100)
    const afterMeta = mergeStreamMetaIntoPendingEntry(pending, { streamId: 'stream-1', lastEventId: 1, now: 200 })
    expect(afterMeta).toMatchObject({
      streamId: 'stream-1',
      accepted: false,
      pendingPayload: payload,
      pendingSince: 100,
    })

    const accepted = markStreamEntryAccepted(afterMeta, { streamId: 'stream-1', lastEventId: 2, now: 300 })
    expect(accepted).toMatchObject({ streamId: 'stream-1', lastEventId: 2, accepted: true })
    expect(accepted.pendingPayload).toBeUndefined()
    expect(accepted.pendingSince).toBeUndefined()
  })

  it('keeps a capable persisted intent recoverable by exact client id after the legacy resend window expires', () => {
    const payload = prepareChatPayload(completePayloadInput({
      supportsOperationOutcome: true,
      clientOperationId: 'client-http-loss',
    })).payload
    const pending = createPendingStreamEntry(payload, 100)

    expect(decideStreamResume(pending, 60_000, {
      streamTtlMs: 1_000,
      pendingTtlMs: 20_000,
    })).toMatchObject({
      kind: 'byClientOperationId',
      clientOperationId: 'client-http-loss',
      pendingPayload: payload,
    })
  })

  it('persists the server operation identity through accepted and resumes by status without mistaking the client id', () => {
    const clientOperationId = createClientOperationId(5678, 0.5)
    const payload = prepareChatPayload(completePayloadInput({
      supportsOperationOutcome: true,
      clientOperationId,
    })).payload
    const pending = createPendingStreamEntry(payload, 100)

    expect(normalizeChatOperationStatus({
      clientOperationId,
      kind: 'rewrite_response',
      state: 'generating',
    })).toBeNull()

    const status = normalizeChatOperationStatus({
      operationId: 'server-operation-1',
      clientOperationId,
      kind: 'rewrite_response',
      state: 'generating',
      version: 2,
    })
    expect(status).toMatchObject({
      operationId: 'server-operation-1',
      clientOperationId,
      kind: 'rewrite_response',
      state: 'generating',
    })
    expect(isChatOperationTerminal(status)).toBe(false)

    const withStatus = mergeOperationStatusIntoStreamEntry(pending, status, 200)
    const accepted = markStreamEntryAccepted(withStatus, {
      streamId: 'stream-1',
      lastEventId: 2,
      now: 300,
    })
    expect(accepted).toMatchObject({
      operationId: 'server-operation-1',
      operationState: 'generating',
      clientOperationId,
    })

    expect(decideStreamResume(accepted, 90_000, {
      streamTtlMs: 1_000,
      pendingTtlMs: 1_000,
    })).toMatchObject({
      kind: 'byOperationId',
      operationId: 'server-operation-1',
    })
    expect(decideStreamResume({
      accepted: true,
      clientOperationId,
      updatedAt: 300,
    }, 90_000, {
      streamTtlMs: 1_000,
      pendingTtlMs: 1_000,
    })).not.toEqual(expect.objectContaining({ kind: 'byOperationId' }))

    expect(isChatOperationTerminal(normalizeChatOperationStatus({
      operationId: 'server-operation-1',
      kind: 'rewrite_response',
      state: 'interrupted',
      assistantChatId: 'assistant-chat-1',
      allowedActions: ['continue', 'rewrite'],
    }))).toBe(true)
  })

  it('merges the capable history envelope by exact server chat targets and keeps rowless failure actions durable', () => {
    const historyRows = [
      {
        id: 'user-send',
        chatId: 'user-send',
        type: 1,
        content: 'Send prompt',
        chatFinish: true,
      },
      {
        id: 'ai-rewrite-source',
        chatId: 'ai-rewrite-source',
        type: 0,
        content: 'Original reply',
        chatFinish: true,
        finishReason: 'stop',
      },
      {
        id: 'ai-interrupted',
        chatId: 'ai-interrupted',
        type: 0,
        content: 'Durable partial reply',
        chatFinish: true,
        finishReason: 'stop',
      },
    ]
    const capableHistoryEnvelope = {
      schemaVersion: 'outcome_v1',
      operations: [
        {
          operationId: 'op-send-failed',
          clientOperationId: 'client-send-failed',
          conversationId: 'conv-1',
          kind: 'send',
          state: 'failed_retryable',
          version: 4,
          userChatId: 'user-send',
          allowedActions: ['retry'],
          reasonCode: 'temporary_failure',
        },
        {
          operationId: 'op-rewrite-failed',
          clientOperationId: 'client-rewrite-failed',
          conversationId: 'conv-1',
          kind: 'rewrite_response',
          state: 'failed_retryable',
          version: 7,
          sourceChatId: 'ai-rewrite-source',
          targetChatId: 'user-send',
          outputDisposition: 'none',
          allowedActions: ['retry_rewrite', 'dismiss'],
          reasonCode: 'below_threshold',
        },
        {
          operationId: 'op-interrupted',
          clientOperationId: 'client-interrupted',
          conversationId: 'conv-1',
          kind: 'continue_response',
          state: 'interrupted',
          version: 9,
          sourceChatId: 'ai-rewrite-source',
          assistantChatId: 'ai-interrupted',
          outputDisposition: 'visible',
          allowedActions: ['continue', 'retry_continue'],
          reasonCode: 'reply_interrupted',
        },
      ],
    }

    const merged = mergeChatHistoryOperationProjections(
      historyRows,
      capableHistoryEnvelope,
      { aiPic: '/role.png' },
    )
    const interrupted = merged.find((row: any) => row.chatId === 'ai-interrupted')
    expect(interrupted).toMatchObject({
      operationProjectionCapable: true,
      operationId: 'op-interrupted',
      clientOperationId: 'client-interrupted',
      operationVersion: 9,
      operationState: 'interrupted',
      operationKind: 'continue',
      allowedActions: ['continue', 'retry_continue'],
      finishReason: 'interrupted',
    })

    const sendFailure = merged.find((row: any) => row.operationId === 'op-send-failed')
    expect(sendFailure).toMatchObject({
      operationProjectionOnly: true,
      operationProjectionCapable: true,
      operationTargetChatId: 'user-send',
      clientOperationId: 'client-send-failed',
      operationVersion: 4,
      allowedActions: ['retry'],
      finishReason: 'server_error',
    })
    expect(merged.indexOf(sendFailure)).toBe(merged.findIndex((row: any) => row.chatId === 'user-send') + 1)

    const rewriteFailure = merged.find((row: any) => row.operationId === 'op-rewrite-failed')
    expect(rewriteFailure).toMatchObject({
      operationProjectionOnly: true,
      operationTargetChatId: 'ai-rewrite-source',
      operationKind: 'rewrite',
      allowedActions: ['retry_rewrite', 'dismiss'],
      finishReason: 'rewrite_below_threshold',
    })
    expect(merged.indexOf(rewriteFailure)).toBeGreaterThan(
      merged.findIndex((row: any) => row.chatId === 'ai-rewrite-source'),
    )

    // Capable projections without an exact source/target are not attached to
    // the list tail. Rendering the wrong operation is worse than deferring it
    // until the target page is loaded.
    expect(mergeChatHistoryOperationProjections(historyRows, {
      schemaVersion: 'outcome_v1',
      operations: [{
        operationId: 'op-unresolved',
        clientOperationId: 'client-unresolved',
        conversationId: 'conv-1',
        kind: 'continue_response',
        state: 'failed_retryable',
        version: 1,
        allowedActions: ['retry_continue'],
      }],
    })).toEqual(historyRows)

    // Old servers keep their frozen history shape.
    expect(mergeChatHistoryOperationProjections(historyRows, {
      chats: [],
    })).toEqual(historyRows)

    const lastKnown = mergeChatHistoryOperationProjections(
      historyRows,
      capableHistoryEnvelope,
      { aiPic: '/role.png' },
    )
    const degraded = mergeChatHistoryOperationProjections(
      historyRows,
      {
        schemaVersion: 'outcome_v1',
        operationStatusAvailable: false,
        operations: [],
      },
      {
        aiPic: '/role.png',
        lastKnownMessages: lastKnown,
      },
    )
    expect(degraded.find((row: any) => row.operationId === 'op-send-failed')).toMatchObject({
      operationProjectionOnly: true,
      operationState: 'failed_retryable',
      allowedActions: ['retry'],
    })
    expect(degraded.find((row: any) => row.operationId === 'op-rewrite-failed')).toMatchObject({
      operationProjectionOnly: true,
      operationState: 'failed_retryable',
      allowedActions: ['retry_rewrite', 'dismiss'],
    })
  })

  it('keeps completed and failed Backward operations in the top-level read model without materializing chat bubbles', () => {
    const historyRows = [
      { id: 'user-1', chatId: 'user-1', type: 1, content: 'prompt', chatFinish: true },
      { id: 'ai-1', chatId: 'ai-1', type: 0, content: 'reply', chatFinish: true },
    ]
    const failedBackward = {
      operationId: 'op-backward-failed',
      clientOperationId: 'client-backward-failed',
      conversationId: 'conv-1',
      kind: 'backward',
      state: 'failed_retryable',
      version: 3,
      checkpointChatId: 'user-1',
      allowedActions: ['retry'],
      reasonCode: 'mutation_failed',
    }
    const completedBackward = {
      ...failedBackward,
      operationId: 'op-backward-completed',
      clientOperationId: 'client-backward-completed',
      state: 'completed',
      version: 4,
      allowedActions: [],
      reasonCode: 'completed',
    }

    expect(mergeChatHistoryOperationProjections(historyRows, {
      schemaVersion: 'outcome_v1',
      operations: [failedBackward, completedBackward],
    })).toEqual(historyRows)

    // The list selector still recognizes Backward as its own operation kind;
    // only the chat-row projection is intentionally suppressed.
    expect(selectPendingOperationFromList({
      schemaVersion: 'outcome_v1',
      operations: [failedBackward],
    }, {
      clientOperationId: 'client-backward-failed',
      operationKind: 'backward',
      payload: { conversationId: 'conv-1' },
    })).toMatchObject({
      operationId: 'op-backward-failed',
      kind: 'backward',
    })
  })

  it('persists the highest operation version and rejects stale or terminal-regressing status/list/SSE projections', () => {
    const acceptedV2 = {
      operationId: 'op-versioned',
      clientOperationId: 'client-versioned',
      conversationId: 'conv-1',
      kind: 'send',
      state: 'accepted',
      version: 2,
      assistantChatId: '',
      allowedActions: [],
    }
    const terminalV5 = {
      ...acceptedV2,
      state: 'interrupted',
      version: 5,
      assistantChatId: 'ai-versioned',
      userChatId: 'user-versioned',
      targetChatId: 'user-versioned',
      sourceChatId: 'ai-source',
      checkpointChatId: 'checkpoint-versioned',
      parentOperationId: 'op-parent',
      sourceOperationId: 'op-source',
      outputDisposition: 'visible',
      finishReason: 'interrupted',
      allowedActions: ['continue'],
      reasonCode: 'reply_interrupted',
    }
    const staleV3 = {
      ...acceptedV2,
      state: 'generating',
      version: 3,
    }
    const impossibleV6Regression = {
      ...acceptedV2,
      state: 'generating',
      version: 6,
    }

    const acceptedEntry = mergeOperationStatusIntoStreamEntry(
      createPendingStreamEntry(completePayloadInput({
        supportsOperationOutcome: true,
        clientOperationId: 'client-versioned',
      }), 100),
      acceptedV2,
      200,
    )
    expect(acceptedEntry).toMatchObject({
      operationId: 'op-versioned',
      operationVersion: 2,
      operationState: 'accepted',
      allowedActions: [],
    })
    const terminalEntry = mergeOperationStatusIntoStreamEntry(acceptedEntry, terminalV5, 300)
    expect(terminalEntry).toMatchObject({
      operationVersion: 5,
      operationState: 'interrupted',
      assistantChatId: 'ai-versioned',
      userChatId: 'user-versioned',
      targetChatId: 'user-versioned',
      sourceChatId: 'ai-source',
      checkpointChatId: 'checkpoint-versioned',
      parentOperationId: 'op-parent',
      sourceOperationId: 'op-source',
      outputDisposition: 'visible',
      finishReason: 'interrupted',
      allowedActions: ['continue'],
    })
    expect(decideStreamResume(terminalEntry, 350)).toMatchObject({
      kind: 'byOperationId',
      operationId: 'op-versioned',
      operationVersion: 5,
      assistantChatId: 'ai-versioned',
      sourceChatId: 'ai-source',
      checkpointChatId: 'checkpoint-versioned',
      allowedActions: ['continue'],
    })
    expect(mergeOperationStatusIntoStreamEntry(terminalEntry, staleV3, 400)).toEqual(terminalEntry)
    expect(mergeOperationStatusIntoStreamEntry(terminalEntry, impossibleV6Regression, 500)).toEqual(terminalEntry)
    expect(shouldApplyOperationStatus(terminalEntry, staleV3)).toBe(false)
    expect(shouldApplyOperationStatus(terminalEntry, impossibleV6Regression)).toBe(false)

    // A same-version terminal may beat an in-flight projection, but a
    // same-version accepted event cannot regress generating.
    expect(shouldApplyOperationStatus({
      operationId: 'op-versioned',
      operationVersion: 5,
      operationState: 'generating',
    }, terminalV5)).toBe(true)
    expect(shouldApplyOperationStatus({
      operationId: 'op-versioned',
      operationVersion: 2,
      operationState: 'generating',
    }, acceptedV2)).toBe(false)
  })

  it('converges streamMeta → explicit error → legacy 404 → close/noActive without replaying the provider request', () => {
    const pending: any = {
      operationKind: 'rewrite',
      streamMetaReceived: true,
      clientOperationId: 'client-legacy-error',
      payload: completePayloadInput({
        rewrite: true,
        chatId: 'user-source',
        supportsOperationOutcome: true,
        clientOperationId: 'client-legacy-error',
      }),
    }
    const showOriginalError = vi.fn()
    const clearReplayPayloadAndGuard = vi.fn(() => {
      pending.payload = null
      pending.pendingResendPayload = null
    })
    const providerSend = vi.fn()

    // streamMeta has already arrived; the legacy server then emits one
    // application error while capability is still unknown.
    expect(markExplicitPreAdmissionError(pending, 'content_filter', 1_000)).toBe(true)
    expect(classifyOperationCapabilityResponse({ statusCode: 404 })).toBe('legacy')
    const frozenError = consumeFrozenPendingStreamError(pending)
    expect(frozenError).toBe('content_filter')
    clearReplayPayloadAndGuard()
    showOriginalError(frozenError)

    // Later close/noActive callbacks observe no replay payload. Re-consuming
    // the same frozen error is idempotent and cannot show a second error.
    if (pending.pendingResendPayload) providerSend(pending.pendingResendPayload)
    const repeatedError = consumeFrozenPendingStreamError(pending)
    if (repeatedError) showOriginalError(repeatedError)
    if (pending.payload) providerSend(pending.payload)

    expect(showOriginalError).toHaveBeenCalledTimes(1)
    expect(showOriginalError).toHaveBeenCalledWith('content_filter')
    expect(clearReplayPayloadAndGuard).toHaveBeenCalledTimes(1)
    expect(providerSend).not.toHaveBeenCalled()
  })

  it('owns open and accepted deadlines by socket generation', () => {
    vi.useFakeTimers()
    const ownership = createChatTransportOwnership()
    const recoverDraft = vi.fn()
    const closeSocket = vi.fn()
    const onOpenTimeout = () => { recoverDraft(); closeSocket() }
    const first = ownership.openSocketGeneration()
    ownership.armOpenDeadline(first, 10_000, onOpenTimeout)
    vi.advanceTimersByTime(10_000)
    expect(recoverDraft).toHaveBeenCalledTimes(1)
    expect(closeSocket).toHaveBeenCalledTimes(1)

    const onAcceptedTimeout = () => { recoverDraft(); closeSocket() }
    const second = ownership.openSocketGeneration()
    ownership.markSocketOpened(second)
    ownership.armAcceptedDeadline(second, 15_000, onAcceptedTimeout)
    vi.advanceTimersByTime(15_000)
    expect(recoverDraft).toHaveBeenCalledTimes(2)
    expect(closeSocket).toHaveBeenCalledTimes(2)

    const staleTimeout = vi.fn()
    const third = ownership.openSocketGeneration()
    ownership.armOpenDeadline(third, 10_000, staleTimeout)
    ownership.openSocketGeneration()
    vi.advanceTimersByTime(10_000)
    expect(staleTimeout).not.toHaveBeenCalled()
    vi.useRealTimers()
  })

  it('retries turn_already_consumed on one new socket, then recovers the draft', () => {
    const ownership = createChatTransportOwnership()
    const pending = { accepted: false, expectsAccepted: true, consumedRetryCount: 0, payload: completePayloadInput() }
    const resendOnNewSocket = vi.fn()
    const recoverDraft = vi.fn()

    if (ownership.consumeTurnAlreadyConsumedRetry(pending)) resendOnNewSocket()
    else recoverDraft()
    if (ownership.consumeTurnAlreadyConsumedRetry(pending)) resendOnNewSocket()
    else recoverDraft()

    expect(resendOnNewSocket).toHaveBeenCalledTimes(1)
    expect(recoverDraft).toHaveBeenCalledTimes(1)

    const rewritePending = { accepted: false, expectsAccepted: false, consumedRetryCount: 0, payload: completePayloadInput({ rewrite: true, chatId: 'chat-1' }) }
    expect(ownership.consumeTurnAlreadyConsumedRetry(rewritePending)).toBe(true)
    expect(ownership.consumeTurnAlreadyConsumedRetry(rewritePending)).toBe(false)
  })
})

// ── agent 中斷／續跑（與 mobile 同構，2026-08-08 由 owner 實測驗收） ──────────
describe('agent 中斷的那一輪', () => {
  it('停止不是伺服器錯誤——不能投影成紅色的失敗加「重試」', () => {
    // 重試是從頭重跑,正好把使用者已經付過錢的斷點丟掉;他要的是繼續。
    expect(projectionFinishReason({
      operationId: 'op-1',
      state: 'failed_retryable',
      reasonCode: 'agent_progress_preserved',
    } as any)).toBe('agent_progress_preserved')

    expect(projectionFinishReason({
      operationId: 'op-2',
      state: 'stopped',
      reasonCode: '',
    } as any)).toBe('user_stop')
  })

  it('中斷的輪次帶著軌跡與「繼續」,而且不是錯誤列', () => {
    const rows = mergeChatHistoryOperationProjections(
      [{ type: 1, id: 'u1', chatId: 'chat-1', content: '開始' }],
      {
        schemaVersion: 'outcome_v1',
        operationStatusAvailable: true,
        operations: [{
          operationId: 'op-1',
          conversationId: 'conv-1',
          state: 'failed_retryable',
          reasonCode: 'agent_progress_preserved',
          sourceChatId: 'chat-1',
          kind: 'send',
          allowedActions: [],
        }],
      },
      { agentPrepTrail: ['回想先前的劇情', '瀏覽角色目前的狀態'] } as any,
    )

    const card = rows.find((row: any) => row?.agentInterrupted === true)
    expect(card).toBeTruthy()
    expect(card.prepTrail).toEqual(['回想先前的劇情', '瀏覽角色目前的狀態'])
    // 這一列裝的是成果,不是錯誤——標成錯誤會讓它變紅並套上「重試」。
    expect(card.isApplicationError).toBe(false)
    expect(card.systemOnly).toBe(false)
  })

  // 這一條走的是**生產真正的那條路**:軌跡從 options.agentPrepTraces 進來,
  // 而且是伺服器的 {stage,…} 物件,由前端挑五語文案。
  //
  // 先前那條測試餵的是 agentPrepTrail(即時停止用的 fallback),於是「從 response
  // 讀 traces」這個接錯的參數位置照樣全綠——測試用了跟生產不同的路。
  it('載入歷史時,伺服器軌跡要從 options 讀得到', () => {
    const rows = mergeChatHistoryOperationProjections(
      [{ type: 1, id: 'u1', chatId: 'chat-1', content: '開始' }],
      {
        schemaVersion: 'outcome_v1',
        operationStatusAvailable: true,
        operations: [{
          operationId: 'op-1',
          conversationId: 'conv-1',
          state: 'failed_retryable',
          reasonCode: 'agent_progress_preserved',
          sourceChatId: 'chat-1',
          kind: 'send',
          allowedActions: [],
        }],
      },
      {
        agentPrepTraces: { 'op-1': [{ stage: 'drafting' }] },
        t: (key: string) => (key === 'multiPass.prepDrafting' ? '寫這則回覆的草稿' : key),
      } as any,
    )

    const card = rows.find((row: any) => row?.agentInterrupted === true)
    expect(card).toBeTruthy()
    expect(card.prepTrail).toEqual(['寫這則回覆的草稿'])
  })
})
