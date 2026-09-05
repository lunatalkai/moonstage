import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  BACKWARD_OPERATION_ENTRY_VERSION,
  backwardOperationRetryDelay,
  classifyBackwardOperationResponse,
  commitRewriteCandidate,
  createBackwardOperationEntry,
  createPreAdmissionOperationErrorProjection,
  createRewriteSnapshot,
  createRewriteSnapshotForAI,
  finalizeLegacyStoppedCandidate,
  findOperationCandidate,
  latestCanonicalAIIndex,
  hasOperationCandidateOutput,
  isOperationCandidateAdoptable,
  isTerminalActionAllowed,
  latestTerminalAIIndex,
  normalizeBackwardOperationEntry,
  operationKindFromPayload,
  removeOperationCandidate,
  removeOwnedTurnBubbles,
  releaseChatComposerAfterStop,
  replaceLatestCanonicalAI,
  resolveChatActionButtonState,
  resolveRetryGenerationAction,
  retryModeForAI,
  restoreRewriteCandidate,
  settleZeroOutputTerminalFailure,
  settleOptimisticDurableUserStop,
  shouldKeepPersistedHistoryBubble,
  terminalUIActionFromAllowedActions,
  terminalUIActionsFromAllowedActions,
} from '../chat-operation-ui-state'
import {
  authoritativePendingOperationDisposition,
  isChatSendInFlight,
  mergeChatHistoryOperationProjections,
  projectionFinishReason,
} from '../chat-transport-ownership'

describe('Stop composer ownership', () => {
  it('releases every request-scoped blocker so typed text can be sent without refresh', () => {
    const released = releaseChatComposerAfterStop({
      isStreamActive: true,
      isConnecting: true,
      isCompacting: true,
      userStopRequested: true,
      pendingResendPayload: { payload: { message: 'old turn' } },
      pendingChatTurn: { operationId: 'old-operation' },
    })

    expect(released).toEqual({
      isStreamActive: false,
      isConnecting: false,
      isCompacting: false,
      userStopRequested: false,
      pendingResendPayload: null,
      pendingChatTurn: null,
    })
    expect(isChatSendInFlight(released)).toBe(false)
    expect(resolveChatActionButtonState({ ...released, content: 'new turn' })).toBe('send')
  })

  it('keeps the ordinary active-stream Stop state before the user cancels', () => {
    expect(resolveChatActionButtonState({
      isStreamActive: true,
      streamId: 'stream-1',
      content: 'draft',
    })).toBe('stop')
  })

  it('keeps Stop available while an active request is compacting', () => {
    expect(resolveChatActionButtonState({
      isCompacting: true,
      isStreamActive: true,
      streamId: 'stream-active',
      userStopRequested: false,
    })).toBe('stop')
  })
})

const root = process.cwd()
const read = (rel: string) => fs.readFileSync(path.join(root, rel), 'utf8')
const readChat = () => read('src/pages/canvas/canvas.vue')

function sliceBetween(source: string, start: string, end: string): string {
  const startIndex = source.indexOf(start)
  const endIndex = source.indexOf(end, startIndex + start.length)
  expect(startIndex).toBeGreaterThanOrEqual(0)
  expect(endIndex).toBeGreaterThan(startIndex)
  return source.slice(startIndex, endIndex)
}

describe('desktop chat operation product contract', () => {
  it('keeps authoritative ownership after flowNodeStatus changes the candidate render id', () => {
    const candidate = {
      id: 'assistant-server-id',
      operationBubbleId: 'provisional-id',
      type: 0,
      content: 'replacement',
      chatFinish: true,
    }
    expect(findOperationCandidate([candidate], 'provisional-id')).toBe(candidate)
    expect(findOperationCandidate([candidate], 'assistant-server-id')).toBe(candidate)
  })

  it('does not revive a rewritten empty assistant shell after history refresh', () => {
    expect(shouldKeepPersistedHistoryBubble({
      type: 0,
      content: '',
      thinkingContent: '',
      finishReason: 'stop',
      chatFinish: true,
    })).toBe(false)
    expect(shouldKeepPersistedHistoryBubble({
      type: 0,
      content: '',
      thinkingContent: 'visible reasoning',
      finishReason: 'stop',
      chatFinish: true,
    })).toBe(true)
    expect(shouldKeepPersistedHistoryBubble({
      type: 0,
      content: '',
      thinkingContent: '',
      finishReason: 'server_error',
      chatFinish: true,
    })).toBe(true)
  })

  it('anchors Rewrite of a continued latest AI at the full assistant suffix', () => {
    const timeline = [
      { id: 'user-1', chatId: 'user-chat-1', type: 1, content: 'prompt', chatFinish: true },
      { id: 'ai-source', type: 0, content: 'partial', chatFinish: true },
      { id: 'ai-continued', type: 0, content: 'continued', chatFinish: true },
    ]
    expect(createRewriteSnapshotForAI(timeline, 2)).toEqual({
      userIndex: 0,
      aiIndex: 1,
      userBubble: timeline[0],
      aiBubble: timeline[1],
    })
  })

  it('keeps exact Continue and Rewrite lineage on confirmed pre-admission error cards', () => {
    const timeline = [
      {
        id: 'user-local',
        chatId: 'user-server',
        type: 1,
        content: 'prompt',
        chatFinish: true,
      },
      {
        id: 'ai-local',
        chatId: 'ai-server',
        type: 0,
        content: 'answer',
        chatFinish: true,
      },
      {
        id: 'continue-provisional',
        operationBubbleId: 'continue-provisional',
        type: 0,
        content: '',
      },
    ]

    expect(createPreAdmissionOperationErrorProjection(timeline, {
      operationKind: 'continue',
      chatId: 'ai-server',
      payload: { chatId: 'ai-server' },
    })).toEqual({
      operationProjectionCapable: true,
      operationState: 'pre_admission_failed',
      operationFailureKind: 'pre_admission_failed',
      operationKind: 'continue',
      serverOperationKind: 'continue_response',
      sourceChatId: 'ai-server',
      targetChatId: 'ai-server',
      assistantChatId: 'ai-server',
      allowedActions: ['retry_continue'],
    })

    expect(createPreAdmissionOperationErrorProjection(timeline, {
      operationKind: 'rewrite',
      rewriteSnapshot: createRewriteSnapshot(timeline, 0, 1),
    })).toEqual({
      operationProjectionCapable: true,
      operationState: 'pre_admission_failed',
      operationFailureKind: 'pre_admission_failed',
      operationKind: 'rewrite',
      serverOperationKind: 'rewrite_response',
      sourceChatId: 'ai-server',
      targetChatId: 'user-server',
      assistantChatId: 'ai-server',
      userChatId: 'user-server',
      allowedActions: ['retry_rewrite'],
    })
  })

  const oldTimeline = [
    { id: 'user-1', type: 1, content: 'prompt', chatFinish: true },
    { id: 'ai-old', type: 0, content: 'old answer', chatFinish: true },
    { id: 'summary-1', type: 0, content: 'summary', chatFinish: true, isSummary: true },
  ]

  it('projects pre-provider Rewrite failure as one system card without an AI bubble', () => {
    const failed = mergeChatHistoryOperationProjections(
      oldTimeline,
      {
        schemaVersion: 'outcome_v1',
        operationStatusAvailable: true,
        operations: [{
          operationId: 'rewrite-failed',
          conversationId: 'conversation-1',
          kind: 'rewrite_response',
          state: 'failed_retryable',
          version: 2,
          sourceChatId: 'ai-old',
          outputDisposition: 'none',
          allowedActions: ['retry_rewrite'],
        }],
      },
    )

    expect(failed).toHaveLength(oldTimeline.length + 1)
    expect(failed[2]).toMatchObject({
      content: '',
      operationProjectionOnly: true,
      systemOnly: true,
      isApplicationError: true,
      finishReason: 'rewrite_below_threshold',
    })
  })

  // 順序是產品語意,不是排版偏好:流水帳說「發生了什麼」,續跑卡說「現在能做
  // 什麼」——先看到經過,再看到出口。反過來的話,使用者是先被要求做決定,再讀到
  // 依據(owner 2026-08-08 在 desktop 拍到做反了)。mobile 也是這個順序。
  // 順序是產品語意，不是排版偏好：流水帳說「發生了什麼」，出口說「現在能做
  // 什麼」——先看到經過，再看到出口。畫布上那個出口不是一張卡了：中斷的輪次
  // 由輸入區的主鍵接手（continue 狀態），流水帳仍然畫在它自己那一列裡。
  it('keeps the preparation trail with the row, and the way out on the composer', () => {
    const chat = readChat()
    const message = read('src/pages/canvas/components/canvas-message.vue')

    // 流水帳：那一輪做了什麼，真的畫在那一則訊息上（不是只留一個沒人讀的欄位）
    expect(chat).toContain('prepTrail: Array.isArray(item.prepTrail)')
    expect(message).toContain('v-for="(line, li) in message.prepTrail"')
    // 出口：沒收尾的輪次讓主鍵變成「繼續」，而不是另外長出一張卡
    expect(chat).toContain("if (state === 'continue') return 'continue'")
    expect(read('src/pages/canvas/components/canvas-composer.vue')).toContain("sendState === 'continue'")
  })

  it('starts Rewrite with a fresh provisional id before rendering its candidate', () => {
    const send = sliceBetween(readChat(), 'function send() {', '// 发送WebSocket消息')
    // 這一行從 `nextBubbleId()` 變成三元式,是刻意的語意擴充:「繼續」會接管
    // 中斷的那一列而不是另開一顆(見 adoptInterruptedAgentBubbleForResume),
    // 所以續跑用的是既有氣泡的 id。**這條契約守的不變式沒有改**——新的一輪
    // 仍然先鑄一個臨時 id、再設 currentChatId,兩者都在推入之前。
    const candidateIdIndex = send.indexOf('const aiBubbleId = adoptedResume')
    const activeIdIndex = send.indexOf('currentChatId.value = aiBubbleId')
    const pushIndex = send.indexOf('unref(talkList).push(data)', candidateIdIndex)

    // 續跑那條不得推入新的一列,否則畫面會同時有兩顆:上面那顆還掛著「繼續」。
    expect(send).toContain('adoptInterruptedAgentBubbleForResume(unref(talkList))')
    expect(candidateIdIndex).toBeGreaterThanOrEqual(0)
    expect(activeIdIndex).toBeGreaterThan(candidateIdIndex)
    expect(activeIdIndex).toBeLessThan(pushIndex)

    const resume = sliceBetween(readChat(), 'const pushPlaceholder = () => {', 'if (pending.kind ===')
    const resumeActiveIdIndex = resume.indexOf('currentChatId.value = aiBubbleId')
    expect(resumeActiveIdIndex).toBeGreaterThanOrEqual(0)
    expect(resumeActiveIdIndex).toBeLessThan(resume.indexOf('upsertPendingAIBubble({'))
  })

  it('treats a trailing summary as derived and exposes only the latest canonical AI for manual edit', () => {
    expect(latestCanonicalAIIndex(oldTimeline)).toBe(1)
    expect(latestCanonicalAIIndex([
      ...oldTimeline,
      { id: 'compact-notice', type: 0, content: 'notice', chatFinish: true, finishReason: 'compact_no_input' },
    ])).toBe(1)
    expect(latestCanonicalAIIndex([
      ...oldTimeline,
      { id: 'user-2', type: 1, content: 'new prompt', chatFinish: true },
      { id: 'send-error', type: 0, content: 'error', chatFinish: true, finishReason: 'server_error' },
    ])).toBe(-1)
    expect(latestCanonicalAIIndex([
      ...oldTimeline,
      {
        id: 'rewrite-pre-admission-error',
        type: 0,
        content: '',
        chatFinish: true,
        finishReason: 'conversation_stale',
        systemOnly: true,
        isApplicationError: true,
      },
    ])).toBe(1)
    expect(latestCanonicalAIIndex([
      ...oldTimeline,
      {
        id: 'operation-busy-error',
        type: 0,
        content: '',
        chatFinish: true,
        finishReason: 'operation_in_progress',
        systemOnly: true,
        isApplicationError: true,
      },
    ])).toBe(1)
  })

  it('never treats a provisional operation row as canonical or actionable', () => {
    expect(latestCanonicalAIIndex([
      ...oldTimeline,
      {
        id: 'ai-provisional',
        operationBubbleId: 'candidate-1',
        type: 0,
        content: 'partial candidate',
        chatFinish: true,
        finishReason: 'user_stop',
      },
    ])).toBe(1)
  })

  it('restores the old rewrite branch on an undurable error and commits only the durable candidate', () => {
    const snapshot = createRewriteSnapshot(oldTimeline, 0, 1)
    const provisional = [
      ...oldTimeline,
      {
        id: 'ai-new',
        operationBubbleId: 'candidate-1',
        type: 0,
        content: '',
        thinkingContent: 'reasoning only',
        chatFinish: true,
        finishReason: 'reasoning_only',
      },
    ]

    expect(restoreRewriteCandidate(provisional, snapshot, 'candidate-1')).toEqual(oldTimeline)
    expect(commitRewriteCandidate(provisional, snapshot, 'candidate-1')).toEqual({
      committed: true,
      messages: [
        oldTimeline[0],
        {
          id: 'ai-new',
          type: 0,
          content: '',
          thinkingContent: 'reasoning only',
          chatFinish: true,
          finishReason: 'reasoning_only',
        },
      ],
    })
  })

  it('keeps Continue as a second independent AI bubble and removes only its failed candidate', () => {
    const candidate = {
      id: 'ai-continue',
      operationBubbleId: 'continue-1',
      type: 0,
      content: '',
      chatFinish: false,
    }
    expect(removeOperationCandidate([...oldTimeline, candidate], 'continue-1')).toEqual(oldTimeline)
    expect(hasOperationCandidateOutput([...oldTimeline, candidate], 'continue-1')).toBe(false)
  })

  it('targets terminal actions at the exact latest row and retries a Continue as a new Continue', () => {
    const continueTimeline = [
      { id: 'user-1', type: 1, content: 'prompt', chatFinish: true },
      { id: 'ai-source', type: 0, content: 'source', chatFinish: true, finishReason: 'stop' },
      {
        id: 'ai-continue',
        type: 0,
        content: '',
        thinkingContent: 'reasoning only',
        chatFinish: true,
        finishReason: 'reasoning_only',
        operationKind: 'continue',
        allowedActions: ['retry'],
      },
    ]
    expect(latestTerminalAIIndex(continueTimeline)).toBe(2)
    expect(isTerminalActionAllowed(continueTimeline, 1, 'continue')).toBe(false)
    expect(isTerminalActionAllowed(continueTimeline, 2, 'retry')).toBe(true)
    expect(retryModeForAI(continueTimeline, 2)).toBe('continue')
    expect(retryModeForAI([
      { id: 'user-1', type: 1, content: 'prompt', chatFinish: true },
      { id: 'ai-send', type: 0, thinkingContent: 'reasoning', chatFinish: true },
    ], 1)).toBe('rewrite')
    expect(retryModeForAI([
      { id: 'user-1', type: 1, content: 'prompt', chatFinish: true },
      { id: 'ai-source', type: 0, content: 'source', chatFinish: true },
      { id: 'ai-continued', type: 0, content: 'continued', chatFinish: true },
    ], 2)).toBe('continue')

    expect(terminalUIActionFromAllowedActions({
      operationProjectionCapable: true,
      allowedActions: ['retry_rewrite', 'dismiss'],
    })).toBe('retry_rewrite')
    expect(terminalUIActionFromAllowedActions({
      operationProjectionCapable: true,
      allowedActions: ['retry_continue'],
    })).toBe('retry_continue')
    expect(terminalUIActionFromAllowedActions({
      operationProjectionCapable: true,
      allowedActions: ['switch_model', 'retry'],
    })).toBe('switch_model')
    expect(terminalUIActionsFromAllowedActions({
      operationProjectionCapable: true,
      allowedActions: ['retry', 'switch_model'],
    })).toEqual(['retry', 'switch_model'])
    expect(terminalUIActionFromAllowedActions({
      operationProjectionCapable: true,
      allowedActions: [],
      finishReason: 'server_error',
    })).toBe('')
    expect(terminalUIActionFromAllowedActions({
      operationProjectionCapable: false,
      allowedActions: ['retry'],
    })).toBe('')
  })

  it('promotes a frozen legacy user-stop bubble so its contextual Continue is actionable', () => {
    const stopped = finalizeLegacyStoppedCandidate([
      { id: 'user-stop', type: 1, content: 'prompt', chatFinish: true },
      {
        id: 'ai-stop',
        operationBubbleId: 'candidate-stop',
        type: 0,
        content: 'partial answer',
        chatFinish: true,
        chatLoading: false,
        finishReason: 'user_stop',
      },
    ], 'candidate-stop')

    expect(stopped[1].operationBubbleId).toBeUndefined()
    expect(latestTerminalAIIndex(stopped)).toBe(1)
    expect(isTerminalActionAllowed(stopped, 1, 'continue')).toBe(true)
    const chat = readChat()
    expect(chat).toContain(
      'const legacyOperationBubbleId = pendingOperation?.aiBubbleId || bubbleId',
    )
    expect(chat).toContain(
      'talkList.value = finalizeLegacyStoppedCandidate(talkList.value, legacyOperationBubbleId)',
    )
    expect(chat).toContain(
      'if (!awaitsDurableOperationTerminal && !hasPartial && stoppedPrompt && !unref(content))',
    )
  })

  it('settles a durable Stop optimistically without leaving the timeline or composer locked', () => {
    const sendPending = {
      operationKind: 'send',
      userBubbleId: 'user-send',
      aiBubbleId: 'ai-send',
    }
    const sendTimeline = [
      { id: 'user-send', type: 1, content: 'prompt', chatFinish: true },
      {
        id: 'ai-send',
        operationBubbleId: 'ai-send',
        type: 0,
        content: '',
        chatFinish: false,
      },
    ]
    expect(settleOptimisticDurableUserStop(sendTimeline, sendPending, false)).toEqual([])
    expect(settleOptimisticDurableUserStop([
      sendTimeline[0],
      {
        ...sendTimeline[1],
        content: 'partial',
        chatFinish: true,
        finishReason: 'user_stop',
      },
    ], sendPending, true)).toEqual([
      sendTimeline[0],
      {
        ...sendTimeline[1],
        content: 'partial',
        chatFinish: true,
        finishReason: 'user_stop',
      },
    ].map(item => {
      const copy = { ...item }
      delete copy.operationBubbleId
      return copy
    }))

    const snapshot = createRewriteSnapshot(oldTimeline, 0, 1)
    const rewritePending = {
      operationKind: 'rewrite',
      aiBubbleId: 'rewrite-candidate',
      rewriteSnapshot: snapshot,
    }
    const emptyRewrite = [
      ...oldTimeline,
      {
        id: 'rewrite-ai',
        operationBubbleId: 'rewrite-candidate',
        type: 0,
        content: '',
        chatFinish: false,
      },
    ]
    expect(settleOptimisticDurableUserStop(emptyRewrite, rewritePending, false))
      .toEqual(oldTimeline)

    const shortRewrite = [
      ...oldTimeline,
      {
        id: 'rewrite-ai',
        operationBubbleId: 'rewrite-candidate',
        type: 0,
        content: '一二三四',
        chatFinish: true,
        finishReason: 'user_stop',
      },
    ]
    expect(settleOptimisticDurableUserStop(shortRewrite, rewritePending, true))
      .toEqual(oldTimeline)

    const eligibleRewrite = [
      ...oldTimeline,
      {
        id: 'rewrite-ai',
        operationBubbleId: 'rewrite-candidate',
        type: 0,
        content: '一二三四五',
        chatFinish: true,
        finishReason: 'user_stop',
      },
    ]
    expect(settleOptimisticDurableUserStop(eligibleRewrite, rewritePending, true))
      .toEqual([
        oldTimeline[0],
        {
          id: 'rewrite-ai',
          type: 0,
          content: '一二三四五',
          chatFinish: true,
          finishReason: 'user_stop',
        },
      ])

    const continuePending = {
      operationKind: 'continue',
      aiBubbleId: 'continue-candidate',
    }
    const continueCandidate = {
      id: 'continue-ai',
      operationBubbleId: 'continue-candidate',
      type: 0,
      content: '',
      chatFinish: false,
    }
    expect(settleOptimisticDurableUserStop(
      [...oldTimeline, continueCandidate],
      continuePending,
      false,
    )).toEqual(oldTimeline)
  })

  it('retries a rowless Send by exact durable USER lineage without requiring a source AI', () => {
    const timeline = [
      {
        id: 'user-local',
        chatId: 'user-durable',
        type: 1,
        content: 'prompt',
        chatFinish: true,
      },
      {
        id: 'operation-status-send-failed',
        type: 0,
        chatFinish: true,
        operationProjectionOnly: true,
        operationProjectionCapable: true,
        operationId: 'operation-send-failed',
        operationKind: 'send',
        serverOperationKind: 'send',
        operationState: 'failed_retryable',
        sourceChatId: 'user-durable',
        allowedActions: ['retry'],
      },
    ]

    expect(resolveRetryGenerationAction(
      timeline,
      timeline[1],
    )).toEqual({
      userIndex: 0,
      terminalIndex: 1,
    })

    const chat = readChat()
    const retry = sliceBetween(
      chat,
      'function startRetryGenerationFromAuthoritativeTerminal',
      'function onSystemMsgCta',
    )
    expect(retry).toContain('createRewriteSnapshot(talkList.value, userIndex, terminalIndex)')
    expect(retry).toContain('rewrite.value = true')
    expect(retry).toContain('rewriteTargetChatId.value')
    expect(retry).toContain("requestedOperationKindOverride = 'retry_generation'")
    expect(retry).toContain('send()')
  })

  it('persists one versioned Backward identity and classifies replay projections without inventing a new ID', () => {
    const entry = createBackwardOperationEntry({
      operationId: 'rollback-one',
      conversationId: 'conv-1',
      targetChatId: 'chat-5',
      now: 1_000,
    })
    expect(entry).toEqual({
      version: BACKWARD_OPERATION_ENTRY_VERSION,
      operationId: 'rollback-one',
      conversationId: 'conv-1',
      targetChatId: 'chat-5',
      attempt: 0,
      createdAt: 1_000,
      updatedAt: 1_000,
    })
    expect(normalizeBackwardOperationEntry(entry, 'conv-1', 2_000)).toEqual(entry)
    expect(normalizeBackwardOperationEntry(entry, 'conv-2', 2_000)).toBeNull()
    expect(backwardOperationRetryDelay(0)).toBe(2_000)
    expect(backwardOperationRetryDelay(4)).toBe(30_000)
    expect(backwardOperationRetryDelay(5)).toBe(60_000)
    expect(backwardOperationRetryDelay(500)).toBe(60_000)
    expect(classifyBackwardOperationResponse(202, { status: 'repair_pending' })).toBe('pending')
    expect(classifyBackwardOperationResponse(200, { operation: { state: 'accepted' } })).toBe('pending')
    expect(classifyBackwardOperationResponse(200, { operation: { state: 'generating' } })).toBe('pending')
    expect(classifyBackwardOperationResponse(200, { status: 'success' })).toBe('success')
    expect(classifyBackwardOperationResponse(409, { status: 'failed' })).toBe('terminal_failure')
    expect(classifyBackwardOperationResponse(409, {
      errorCode: 'rollback_client_unsupported',
    })).toBe('legacy_fallback')
  })

  it('keeps one Backward identity and a mutation guard after six consecutive 202 responses', () => {
    let entry = createBackwardOperationEntry({
      operationId: 'rollback-six-202',
      conversationId: 'conv-1',
      targetChatId: 'chat-5',
      now: 1_000,
    })

    for (let response = 0; response < 6; response += 1) {
      expect(classifyBackwardOperationResponse(202, { status: 'pending' })).toBe('pending')
      const delay = backwardOperationRetryDelay(entry.attempt)
      expect(delay).not.toBeNull()
      entry = {
        ...entry,
        attempt: entry.attempt + 1,
        updatedAt: entry.updatedAt + Number(delay),
      }
    }

    expect(entry.operationId).toBe('rollback-six-202')
    expect(entry.attempt).toBe(6)
    expect(backwardOperationRetryDelay(entry.attempt)).toBe(60_000)
    expect(normalizeBackwardOperationEntry(
      entry,
      'conv-1',
      entry.updatedAt + (48 * 60 * 60 * 1_000),
    )).toEqual(entry)
  })

  it('removes only bubbles owned by the failed turn and preserves a newer turn', () => {
    const timeline = [
      { id: 'user-failed', type: 1, content: 'failed prompt' },
      { id: 'ai-failed', operationBubbleId: 'ai-failed', type: 0, content: '' },
      { id: 'user-new', type: 1, content: 'new prompt' },
      { id: 'ai-new', type: 0, content: 'new answer', chatFinish: true },
    ]

    expect(removeOwnedTurnBubbles(timeline, {
      userBubbleId: 'user-failed',
      aiBubbleId: 'ai-failed',
    })).toEqual(timeline.slice(2))
  })

  it('removes a zero-output Send pair while preserving the durable error projection lane', () => {
    const timeline = [
      { id: 'user-failed', type: 1, content: 'failed prompt' },
      {
        id: 'ai-failed',
        operationBubbleId: 'ai-failed',
        type: 0,
        content: '',
        thinkingContent: '',
      },
      { id: 'system-error', operationProjectionOnly: true, type: 2 },
    ]

    expect(settleZeroOutputTerminalFailure(timeline, {
      operationKind: 'send',
      userBubbleId: 'user-failed',
      aiBubbleId: 'ai-failed',
    })).toEqual([timeline[2]])
  })

  it('treats capable history terminal or absence as authoritative stale-loading cleanup', () => {
    const pending = {
      operationId: 'operation-current',
      clientOperationId: 'client-current',
      payload: { conversationId: 'conversation-current' },
    }
    expect(authoritativePendingOperationDisposition({
      schemaVersion: 'outcome_v1',
      operationStatusAvailable: true,
      operations: [{
        operationId: 'operation-current',
        clientOperationId: 'client-current',
        conversationId: 'conversation-current',
        kind: 'send',
        state: 'failed_retryable',
        version: 4,
      }],
    }, pending)).toBe('terminal')
    expect(authoritativePendingOperationDisposition({
      schemaVersion: 'outcome_v1',
      operationStatusAvailable: true,
      operations: [],
    }, pending)).toBe('absent')
    expect(authoritativePendingOperationDisposition({
      schemaVersion: 'outcome_v1',
      operationStatusAvailable: false,
      operations: [],
    }, pending)).toBe('unknown')
  })

  it('does not adopt a durable terminal marker when Rewrite produced zero visible output', () => {
    const snapshot = createRewriteSnapshot(oldTimeline, 0, 1)
    const provisional = [
      ...oldTimeline,
      {
        id: 'ai-empty',
        operationBubbleId: 'empty-1',
        type: 0,
        content: '',
        thinkingContent: '',
        chatFinish: true,
        finishReason: 'user_stop',
      },
    ]
    expect(commitRewriteCandidate(provisional, snapshot, 'empty-1')).toEqual({
      committed: false,
      reason: 'ineligible_output',
      messages: provisional,
    })
  })

  it('treats the typed below-threshold terminal as non-durable even when a short chunk was rendered', () => {
    const snapshot = createRewriteSnapshot(oldTimeline, 0, 1)
    const provisional = [
      ...oldTimeline,
      {
        id: 'ai-short',
        operationBubbleId: 'short-1',
        type: 0,
        content: '短',
        thinkingContent: '',
        chatFinish: true,
        finishReason: 'rewrite_below_threshold',
      },
    ]
    expect(hasOperationCandidateOutput(provisional, 'short-1')).toBe(true)
    expect(isOperationCandidateAdoptable(provisional, 'short-1')).toBe(false)
    expect(commitRewriteCandidate(provisional, snapshot, 'short-1')).toEqual({
      committed: false,
      reason: 'ineligible_output',
      messages: provisional,
    })
  })

  it('shows an explicit preserved-old-reply result for a durable below-threshold Rewrite terminal', () => {
    const source = readChat()
    expect(projectionFinishReason({
      kind: 'rewrite_response',
      state: 'failed_retryable',
      outputDisposition: 'none',
    })).toBe('rewrite_below_threshold')
    expect(source).toContain('projectionFinishReason(')
    expect(source).toContain("t('chat.rewriteBelowThreshold')")
    expect(source).toContain("'rewrite_below_threshold': 'model-error'")
  })

  it('maps frozen rewrite/contine flags to one operation kind with rewrite precedence', () => {
    expect(operationKindFromPayload({
      operationKind: 'retry_generation',
      rewrite: true,
      contine: true,
    })).toBe('retry_generation')
    expect(operationKindFromPayload({ rewrite: true, contine: true })).toBe('rewrite')
    expect(operationKindFromPayload({ rewrite: false, contine: true })).toBe('continue')
    expect(operationKindFromPayload({ message: 'new turn', rewrite: false, contine: true })).toBe('send')
    expect(operationKindFromPayload({ rewrite: false, contine: false })).toBe('send')
  })

  it('patches manual edit by exact latest-AI identity and invalidates only trailing derived summaries', () => {
    expect(replaceLatestCanonicalAI(oldTimeline, 'ai-old', { content: 'edited' })).toEqual({
      updated: true,
      messages: [
        oldTimeline[0],
        { ...oldTimeline[1], content: 'edited' },
      ],
    })
    expect(replaceLatestCanonicalAI(oldTimeline, 'user-1', { content: 'bad target' })).toEqual({
      updated: false,
      messages: oldTimeline,
    })
  })

  it('wires rewrite snapshot, durable DONE commit, undurable rollback, and no duplicate USER into chat.vue', () => {
    const chat = readChat()
    const send = sliceBetween(chat, 'function send()', '// 发送WebSocket消息')
    const regenerate = sliceBetween(chat, 'const doReiteration =', 'const doContinue =')
    const sendError = sliceBetween(chat, 'const sendError =', 'function upsertPendingAIBubble')
    const eventError = sliceBetween(chat, "case 'error':", '// 滚动节流定时器')
    const dispatch = read('src/pages/canvas/chat-sse-dispatch.ts')
    const userStop = sliceBetween(chat, 'function finalizeUserStoppedStream()', 'function releaseStoppedComposerOwnership()')
    const reconnect = sliceBetween(chat, 'function attemptReconnectWithResume()', '// 关闭WebSocket连接')

    expect(regenerate).toContain('createRewriteSnapshot')
    expect(regenerate).not.toContain('talkList.value = talkList.value.filter')
    expect(send).toContain('if (unref(content) && !unref(rewrite))')
    expect(send).toContain('operationBubbleId')
    expect(send).toContain('operationKind:')
    expect(sendError).toContain('discardPendingChatOperationCandidate')
    expect(eventError.indexOf('discardPendingChatOperationCandidate'))
      .toBeLessThan(eventError.indexOf('hasRenderableAssistantOutput'))
    expect(dispatch).toContain('ctx.commitPendingChatOperationAfterVisibleDone()')
    expect(userStop).toContain('awaitsDurableOperationTerminal')
    expect(reconnect).toContain('discardStoppedOperationWithoutDurableTerminal')
  })

  it('handles sendError by captured identity without positional or delayed cleanup', () => {
    const sendError = sliceBetween(readChat(), 'const sendError =', 'function upsertPendingAIBubble')
    const partialGuard = sendError.indexOf('hasRenderableAssistantOutput')
    const ownedCleanup = sendError.indexOf('removeOwnedTurnBubbles')

    expect(partialGuard).toBeGreaterThanOrEqual(0)
    expect(ownedCleanup).toBeGreaterThan(partialGuard)
    expect(sendError).not.toContain('talkList.value.pop()')
    expect(sendError).not.toContain('setTimeout(')
  })

  it('unlocks capable Stop optimistically and refreshes authoritative history after the ACK', () => {
    const chat = readChat()
    const sendStop = sliceBetween(chat, 'function sendStop()', 'function requestConversationStopFallback')
    const stopFallback = sliceBetween(
      chat,
      'function requestConversationStopFallback',
      'function finalizeUserStoppedStream()',
    )
    const userStop = sliceBetween(chat, 'function finalizeUserStoppedStream()', 'function releaseStoppedComposerOwnership()')
    const durableOperationSettlement = userStop.indexOf(
      'settleOptimisticDurableUserStop',
    )
    const legacyDraftRestore = userStop.indexOf(
      'if (!awaitsDurableOperationTerminal && !hasPartial && stoppedPrompt',
    )
    const releasePendingTurn = userStop.indexOf('releaseStoppedComposerOwnership()')
    const clearTransport = userStop.indexOf('clearStreamState()')

    expect(userStop).toContain('shouldAwaitDurableStopTerminal(pendingChatTurn)')
    expect(durableOperationSettlement).toBeGreaterThanOrEqual(0)
    expect(legacyDraftRestore).toBeGreaterThanOrEqual(0)
    expect(legacyDraftRestore).toBeLessThan(durableOperationSettlement)
    expect(releasePendingTurn).toBeGreaterThan(durableOperationSettlement)
    expect(clearTransport).toBeGreaterThan(releasePendingTurn)
    expect(stopFallback).toContain(".then(() =>")
    expect(stopFallback).toContain('operationStatusPollScheduler.cancel()')
    expect(stopFallback).toContain('getHistoryMsg()')
    expect(stopFallback).not.toContain("requestPendingOperationReconciliation('user_stop_ack')")
    expect(sendStop).not.toContain("requestPendingOperationReconciliation('user_stop')")
    expect(chat).toContain("const STOP_SETTLEMENT_LS_PREFIX = 'lt:pendingStop:'")
    expect(sendStop).toContain('persistPendingStopSettlement')
    expect(stopFallback).toContain('clearPendingStopSettlement')
    expect(userStop).not.toContain('clearStreamState({ preservePersistedOperation: true })')
    expect(userStop).toContain('releaseStoppedComposerOwnership()')
  })

  it('blocks Send and timeline mutations while Backward or another operation is pending', () => {
    expect(isChatSendInFlight({ rollbackPending: true })).toBe(true)

    const chat = readChat()
    const send = sliceBetween(chat, 'function send()', '// 发送WebSocket消息')
    const backward = sliceBetween(chat, 'function loadConversation(chatId)', 'function chatDelete(chatId)')
    const manualEdit = sliceBetween(chat, 'const sureRewrite =', '// 重新生成誤觸保護')
    const regenerateAndContinue = sliceBetween(chat, 'const doReiteration =', '// 舊的長按彈出選單')

    expect(send).toContain('isTimelineMutationBlocked()')
    expect(send).toContain('notifyTimelineMutationBlocked()')
    expect(backward).toContain('isTimelineMutationBlocked()')
    expect(manualEdit).toContain('isTimelineMutationBlocked()')
    // Reiteration, legacy Continue, and capable exact-source Continue each own
    // a mutation fence before reaching the shared send core.
    expect(regenerateAndContinue.match(/isTimelineMutationBlocked\(\)/g)).toHaveLength(3)
  })

  it('reposts Backward with the same persisted operation ID and only falls back once for an old server', () => {
    const chat = readChat()
    const backward = sliceBetween(chat, 'function loadConversation(chatId)', 'function chatDelete(chatId)')
    const recovery = sliceBetween(chat, 'function writePendingBackwardOperation', 'function loadConversation(chatId)')
    const mount = sliceBetween(chat, 'function tryResumeOnMount()', 'function detachGlobalSocketListeners')

    expect(recovery).toContain('BACKWARD_OPERATION_ENTRY_VERSION')
    expect(recovery).toContain('normalizeBackwardOperationEntry')
    expect(recovery).toContain('backwardOperationRetryDelay')
    expect(recovery).toContain('clientOperationID: entry.operationId')
    expect(recovery).toContain('rollbackMutationCapability: \'v1\'')
    expect(recovery).toContain('legacyFallbackUsed')
    expect(recovery).toContain('BACKWARD_OPERATION_SLOW_RETRY_DELAY_MS')
    expect(recovery).not.toContain('rollbackPending.value = false;\n    uni.showToast({ title: t(\'chat.operationStatusUnavailable\')')
    expect(backward).toContain('createBackwardOperationEntry')
    expect(mount).toContain('resumePendingBackwardOperation')
  })

  it('keeps nonterminal operation identity, candidate, and controls guarded after fast status polling exhausts', () => {
    const chat = readChat()
    const recovery = sliceBetween(
      chat,
      'function recoverOperationStatusPollingExhausted',
      'function scheduleOperationStatusReconciliation',
    )
    const scheduler = sliceBetween(
      chat,
      'function scheduleOperationStatusReconciliation',
      'function requestAuthoritativeOperationReconciliation',
    )
    const foreground = sliceBetween(chat, 'onShow(() => {', 'onHide(() => {')
    const unload = sliceBetween(chat, 'onUnload(() => {', 'onBackPress(() => {')
    const backPress = sliceBetween(chat, 'onBackPress(() => {', '</script>')

    expect(recovery).toContain('operationStatusPollScheduler.scheduleSlow')
    expect(recovery).not.toContain('discardPendingChatOperationCandidate')
    expect(recovery).not.toContain('pendingChatTurn = null')
    expect(recovery).not.toContain('pendingResendPayload.value = null')
    expect(recovery).not.toContain('clearStreamState()')
    expect(recovery).not.toContain('operationStatusPollScheduler.cancel()')
    expect(scheduler).toContain('recoverOperationStatusPollingExhausted')
    expect(foreground).toContain('resumePendingOperationReconciliationOnForeground')
    expect(unload).toContain('preservePersistedOperation: hasPersistedPendingOperationIdentity()')
    expect(backPress).toContain('preservePersistedOperation: hasPersistedPendingOperationIdentity()')
  })

  it('routes toolbar regeneration through Rewrite even when the latest AI was created by Continue', () => {
    const chat = readChat()
    const confirm = sliceBetween(chat, 'function confirmReiteration(index)', 'const doReiteration =')
    expect(confirm).toContain('doReiteration(index)')
    expect(confirm).not.toContain("retryModeForAI(talkList.value, index) === 'continue'")
    expect(confirm).not.toContain('doContinue(talkList.value[index], index)')

    const regenerate = sliceBetween(chat, 'const doReiteration =', 'function startContinueFromSource')
    expect(regenerate).toContain('createRewriteSnapshotForAI(talkList.value, index)')
    expect(regenerate).toContain('const userBubble = rewriteSnapshot.userBubble')
  })

  it('shows manual edit only for the latest canonical AI', () => {
    const chat = readChat()
    const menu = sliceBetween(chat, 'const menuActions = computed', 'function openMessageMenu')
    const manualEdit = sliceBetween(chat, 'const sureRewrite =', '// 重新生成誤觸保護')

    expect(chat).toContain('isLatestCanonicalAIIndex(index)')
    // 「改寫」只掛在最後一則正規 AI 訊息上——別則點得到卻做不到。
    expect(menu).toContain('isLatestCanonicalAIIndex(index)')
    expect(menu).toContain("key: 'edit'")
    expect(manualEdit).toContain('isLatestCanonicalAIId')
    expect(manualEdit).toContain('replaceLatestCanonicalAI')
  })

  it('provides the latest-AI and durable terminal copy in all five locales', () => {
    for (const localeFile of ['en.json', 'zh-Hans.json', 'zh-Hant.json', 'ja.json', 'ko.json']) {
      const locale = JSON.parse(read(`src/locale/${localeFile}`))
      for (const key of [
        'chat.editLatestAIOnly',
        'chat.turnInterrupted',
        'chat.noFinalAnswer',
        'chat.switchModel',
        'chat.retryOrSwitchModel',
        'chat.operationPending',
        'chat.operationStatusUnavailable',
      ]) {
        expect(locale[key]).toEqual(expect.any(String))
        expect(locale[key].trim()).not.toBe('')
      }
    }
  })

  // 2026-08-01：「結果還在確認中」原本走 toast——會自己消失、放不下按鈕，
  // 用戶錯過就沒了。那正是缺陷本身：它是狀態卻用打斷式呈現，而且不可行動
  // （Apple HIG：不要只為告知而打斷；PWA/App 沒有「重新整理」，恢復成本不該
  // 由用戶承擔）。改成留在對話流裡的系統訊息，並掛既有的 refresh_history
  // CTA——那是 App 內重載對話，不是瀏覽器重整。
  it('renders the unconfirmed outcome as a durable system row with an in-app escape', () => {
    const chat = readChat()
    const kind = sliceBetween(chat, 'function getSystemMsgKind', 'function getSystemMsgLabel')
    const label = sliceBetween(chat, 'function getSystemMsgLabel', 'function getSystemMsgSub')
    const ctaAction = sliceBetween(chat, 'function getSystemMsgCtaAction', 'function exactTimelineRowIndex')

    expect(kind).toContain("'outcome_unconfirmed'")
    expect(label).toContain("t('chat.operationStatusUnavailable')")
    // 逃生口必須是 App 內重載，而不是要求用戶自己重新整理或重開。
    expect(ctaAction).toContain("'outcome_unconfirmed'")
    expect(ctaAction).toContain("'refresh_history'")
    // 這是狀態不是錯誤：不得沿用 model-error 的告警視覺。
    expect(kind).not.toMatch(/'outcome_unconfirmed':\s*'model-error'/)
    // 也不能沿用 'stopped'：notice tone 是 border-radius:9999px 的單行藥丸，
    // 只裝得下「已停止生成」那種短標籤。本卡有說明文字與 CTA，套藥丸會被撐成
    // 一顆球並把按鈕擠到文字上——2026-08-01 UI 驗收實際拍到，當時單元測試全綠
    // 卻沒攔住，因為只驗了三張表的對應關係，沒驗容器裝不裝得下內容。
    expect(kind).not.toMatch(/'outcome_unconfirmed':\s*'stopped'/)

    // label 是短粗體標題、sub 才是說明，這是系統訊息卡的既有設計；
    // 把整段話塞進 label 正是版面壞掉的直接原因。
    const sub = sliceBetween(chat, 'function getSystemMsgSub', 'function getSystemMsgCta')
    expect(sub).toContain("t('chat.operationStatusUnavailableSub')")

    // 這個 kind 必須有卡片版面覆寫，否則吃到 notice 的藥丸預設。
    const comp = read('src/components/chat-system-message/chat-system-message.vue')
    expect(comp).toContain("'outcome-unconfirmed'")
    expect(comp).toMatch(/\.sys-kind-outcome-unconfirmed\s+\.sys-msg-card\s*\{[^}]*border-radius/)
  })

  it('routes every unconfirmed-outcome announcement through the durable row first', () => {
    const chat = readChat()
    // 舊行為：四個觸發點各自彈一次 toast，然後把佔位氣泡 pop 掉。
    // 新行為：全部改走同一個入口，先嘗試把佔位氣泡轉成留得住的系統訊息。
    expect(chat).toContain('function markPendingOutcomeUnconfirmed')
    expect(chat).toContain('function announceOutcomeUnconfirmed')
    // 劇情回溯那條沒有 AI 佔位氣泡可轉，仍需要 toast 兜底——但兜底只能有一份，
    // 且必須在入口內部。散落在呼叫點就等於某條路徑繞過了那顆留得住的 row。
    expect(chat.match(/message\.warning\(t\('chat\.operationStatusUnavailable'\)\)/g) ?? [])
      .toHaveLength(1)
    // 劇情回溯那一處刻意保留 uni.showToast——它不產生 AI 佔位氣泡，沒有 row
    // 可轉；改走入口只會落到 fallback，卻把 toast 元件換掉，是沒有收益的視覺變更。
    expect(chat.match(/uni\.showToast\(\{ title: t\('chat\.operationStatusUnavailable'\), icon: 'none' \}\)/g) ?? [])
      .toHaveLength(1)
    // 兜底那一份必須就在入口函式體內。
    // 用「到下一個 function 宣告為止」切函式體，不要用固定字元數——
    // 固定視窗會在入口內合法新增守衛或註解時假紅（2026-08-02 實際發生過一次）。
    const helperStart = chat.indexOf('function announceOutcomeUnconfirmed')
    const helperEnd = chat.indexOf('\nfunction ', helperStart + 1)
    const helperBody = chat.slice(helperStart, helperEnd > helperStart ? helperEnd : undefined)
    expect(helperBody).toContain('markPendingOutcomeUnconfirmed()')
    expect(helperBody).toContain("message.warning(t('chat.operationStatusUnavailable'))")
  })

  it('maps interrupted and reasoning-only terminals to durable product copy', () => {
    const chat = readChat()
    const kind = sliceBetween(chat, 'function getSystemMsgKind', 'function getSystemMsgLabel')
    const label = sliceBetween(chat, 'function getSystemMsgLabel', 'function getSystemMsgSub')
    const sub = sliceBetween(chat, 'function getSystemMsgSub', 'function getSystemMsgCta')
    expect(kind).toContain("'interrupted'")
    expect(kind).toContain("'reasoning_only'")
    expect(label).toContain("t('chat.turnInterrupted')")
    expect(label).toContain("t('chat.noFinalAnswer')")
    expect(sub).toContain("t('chat.retryOrSwitchModel')")
  })

  it('uses exact terminal lineage and keeps incomplete/user_stop/reasoning-only parity', () => {
    const chat = readChat()
    const template = sliceBetween(chat, '<chat-system-message', '</CanvasMessage>')
    const terminal = sliceBetween(chat, 'function getSystemMsgKind', 'function backwardStorageKey')
    const continueHandler = sliceBetween(chat, 'function startContinueFromSource', '// 舊的長按彈出選單')
    const send = sliceBetween(chat, 'function send()', '// 发送WebSocket消息')

    expect(template).toContain('getSystemMsgCta(item.finishReason, item, index)')
    expect(template).toContain('getSystemMsgCtaAction(item.finishReason, item, index)')
    expect(template).not.toContain("!['user_stop'")
    expect(terminal).toContain("'incomplete'")
    expect(terminal).toContain('isTerminalActionAllowed')
    expect(terminal).toContain('retryModeForAI')
    expect(terminal).toContain('doContinue(item, index)')
    expect(terminal).toContain("action === 'retry_rewrite'")
    expect(terminal).toContain("action === 'retry_continue'")
    expect(terminal).toContain('item?.checkpointChatId')
    expect(terminal).toContain('firstExactTimelineRowIndex')
    expect(terminal).toContain('continueFromAuthoritativeTerminal')
    expect(continueHandler).toContain('continueTargetChatId')
    expect(send).toContain("unref(contine) ? unref(continueTargetChatId)")
  })

  it('opts capable turns into authoritative outcomes and reconciles by exact durable identity', () => {
    const chat = readChat()
    const main = read('src/main.js')
    const transport = read('src/pages/canvas/chat-transport-ownership.ts')
    const dispatch = read('src/pages/canvas/chat-sse-dispatch.ts')
    const send = sliceBetween(chat, 'function send()', '// 发送WebSocket消息')
    const recovery = sliceBetween(chat, 'function recoverOperationStatusPollingExhausted', 'function beginPendingChatTurn')
    const record = sliceBetween(chat, 'function recordAuthoritativeOperationStatus', 'function refreshHistoryAfterAuthoritativeOperation')
    const termination = sliceBetween(chat, 'function handleOwnedSocketTermination', '// 发送信息')
    const clearStream = sliceBetween(chat, 'function clearStreamState(', 'function bumpConversationGeneration')
    const accepted = sliceBetween(chat, 'function markPendingChatTurnAccepted', 'function finalizePendingChatTurnAfterVisibleDone')

    expect(send).toContain('const supportsOperationOutcome = canUseChatOperationOutcome()')
    expect(send).toContain('supportsOperationOutcome,')
    expect(send).toContain('clientOperationId: supportsOperationOutcome ? createClientOperationId() :')
    expect(dispatch).toContain("case 'operationStatus':")
    expect(dispatch).toContain('ctx.onOperationStatus')
    expect(recovery).toContain('pendingChatTurn?.operationId')
    expect(recovery).toContain('const stored = readLsEntry()')
    expect(recovery).toContain('stored?.operationId')
    expect(recovery).not.toContain('operationId: clientOperationId')
    expect(record.indexOf('existingOperationId !== status.operationId')).toBeLessThan(
      record.indexOf('chatTransport.noteServerStreamProgress(pendingChatTurn'),
    )
    expect(record).toContain('pendingChatTurn.sourceChatId = status.sourceChatId')
    expect(record).toContain('pendingChatTurn.checkpointChatId = status.checkpointChatId')
    expect(record).toContain('operationBubble.assistantChatId = status.assistantChatId')
    expect(record).toContain('operationBubble.sourceChatId = status.sourceChatId')
    expect(termination).toContain('requestPendingOperationReconciliation(`socket_${kind}`)')
    expect(termination.indexOf('requestPendingOperationReconciliation(`socket_${kind}`)')).toBeLessThan(
      termination.indexOf('recoverPendingChatTurnBeforeAccepted()'),
    )
    expect(recovery).toContain('operationStatusPollScheduler.schedule')
    expect(recovery).toContain('scheduleOperationStatusReconciliation')
    expect(recovery).toContain('recoverOperationStatusPollingExhausted')
    expect(recovery).toContain('operationStatusPollScheduler.scheduleSlow')
    expect(clearStream).toContain('operationStatusPollScheduler.cancel()')
    expect(recovery).not.toContain('attempt < OPERATION_STATUS_RETRY_DELAYS.length')
    expect(record.indexOf('existingOperationId !== status.operationId')).toBeLessThan(
      record.indexOf('chatTransport.noteServerStreamProgress(pendingChatTurn'),
    )
    expect(chat).toContain('_this.requestUrl.chatOperationStatus')
    expect(chat).toContain('buildPendingOperationProbeQuery')
    expect(chat).toContain('requestPendingOperationReconciliation')
    expect(accepted).toContain('shouldKeepPendingPayloadForExactProbe')
    expect(accepted).toContain("!String(pendingChatTurn.operationId || '').trim()")
    expect(accepted).toContain('pendingChatTurn.payload?.supportsOperationOutcome === true')
    expect(main).toContain('chatOperationStatus: `${V1}/conversation/operations`')
    expect(main).toContain("'/conversation/operations',")
    expect(transport).toContain("kind: 'byOperationId'")
  })

  it('requests capable history and merges top-level operation projections before rendering the timeline', () => {
    const chat = readChat()
    const history = sliceBetween(chat, 'function getHistoryMsg()', '// 隐藏加载提示')

    expect(history).toContain('if (supportsOperationOutcome) historyRequestData.supportsOperationOutcome = true')
    expect(history).toContain('filter(shouldKeepPersistedHistoryBubble)')
    expect(history).toContain('mergeChatHistoryOperationProjections')
    expect(history).toContain('res.data.operations')
    expect(history.indexOf('mergeChatHistoryOperationProjections')).toBeLessThan(
      history.indexOf('talkList.value ='),
    )
  })

  it('settles authoritative stale loading before history can reinsert a typing bubble', () => {
    const history = sliceBetween(
      readChat(),
      'function getHistoryMsg()',
      '// 隐藏加载提示',
    )
    expect(history).toContain('authoritativePendingOperationDisposition')
    expect(history).toContain('pendingChatTurn = null')
    expect(history).toContain('clearStreamState()')
    expect(history.indexOf('clearStreamState()')).toBeLessThan(
      history.indexOf('if (isStreamActive.value)'),
    )
  })

  it('keeps legacy signed-token absence away from protected operation status endpoints', () => {
    const chat = readChat()
    const exactProbe = sliceBetween(
      chat,
      'function probePendingTurnAfterDurableAckTimeout',
      'function handleChatTransportDeadline',
    )
    const reconciliation = sliceBetween(
      chat,
      'function requestPendingOperationReconciliation',
      'function resumePendingOperationReconciliationOnForeground',
    )

    expect(exactProbe).toContain('if (!canUseChatOperationOutcome())')
    expect(exactProbe.indexOf('if (!canUseChatOperationOutcome())')).toBeLessThan(
      exactProbe.indexOf('_this.http.get(endpoint'),
    )
    expect(reconciliation).toContain("pendingChatTurn.operationOutcomeCapability = 'legacy'")
  })

  it('applies monotonic operation versions from actual additive SSE/status wires and freezes legacy errors once', () => {
    const chat = readChat()
    const record = sliceBetween(
      chat,
      'function recordAuthoritativeOperationStatus',
      'function refreshHistoryAfterAuthoritativeOperation',
    )
    const probe = sliceBetween(
      chat,
      'function probePendingTurnAfterDurableAckTimeout',
      'function handleChatTransportDeadline',
    )
    const legacySettle = sliceBetween(
      chat,
      'function settleFrozenLegacyStreamError',
      'function probePendingTurnAfterDurableAckTimeout',
    )
    const errorEvent = sliceBetween(chat, "case 'error':", '// 滚动节流定时器')

    expect(record).toContain('shouldApplyOperationStatus')
    expect(record).toContain('pendingChatTurn.operationVersion = status.version')
    expect(record).toContain('operationBubble.operationVersion = status.version')
    expect(probe).toContain('settleFrozenLegacyStreamError(capturedPending)')
    expect(legacySettle).toContain('consumeFrozenPendingStreamError')
    expect(legacySettle).toContain('pendingResendPayload.value = null')
    expect(legacySettle).toContain('clearStreamState()')
    expect(legacySettle).toContain('appendChatErrorBubble(errorType, errorMsg)')
    expect(errorEvent).toContain('markExplicitPreAdmissionError(')
  })
})
