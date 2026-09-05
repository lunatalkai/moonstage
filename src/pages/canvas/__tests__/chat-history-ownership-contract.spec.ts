import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import {
  mergeChatHistoryOperationProjections,
  retainedTimelineForHistoryResponse,
} from '../chat-transport-ownership'

describe('chat operation history ownership regressions', () => {
  it('binds every history response decision to its request page and conversation generation', () => {
    const chat = readFileSync(
      path.resolve(process.cwd(), 'src/pages/canvas/canvas.vue'),
      'utf8',
    )
    const historyStart = chat.indexOf('function getHistoryMsg() {')
    const historyEnd = chat.indexOf('\nfunction hideLoadTips(', historyStart)
    expect(historyStart).toBeGreaterThanOrEqual(0)
    expect(historyEnd).toBeGreaterThan(historyStart)

    const history = chat.slice(historyStart, historyEnd)
    const response = history.slice(history.indexOf('}).then(res => {'))
    expect(history).toContain('const pageAtHistoryRequest = ajax.value.page;')
    expect(history).toContain(
      'const generationAtHistoryRequest = conversationGeneration.value;',
    )
    expect(history).toContain('pageNum: pageAtHistoryRequest,')
    expect(
      response.match(/isConversationGenerationCurrent\(generationAtHistoryRequest\)/g),
    ).toHaveLength(2)
    expect(response).toContain('page: pageAtHistoryRequest,')
    expect(response).not.toContain('ajax.value.page == 1')
  })

  it('retains a newly started Send when an older page-one history response arrives before streamMeta', () => {
    const pendingAtRequest = { clientOperationId: 'old-operation' }
    const currentPending = {
      clientOperationId: 'new-send',
      userBubbleId: 'new-user',
      aiBubbleId: 'new-ai',
    }
    const timeline = [
      { id: 'canonical-user' },
      { id: 'canonical-ai' },
      { id: 'new-user' },
      { id: 'new-ai' },
    ]

    expect(retainedTimelineForHistoryResponse({
      page: 1,
      streamActive: false,
      pendingAtRequest,
      currentPending,
      timeline,
    })).toEqual([
      { id: 'new-user' },
      { id: 'new-ai' },
    ])
    expect(retainedTimelineForHistoryResponse({
      page: 1,
      streamActive: false,
      pendingAtRequest,
      currentPending: pendingAtRequest,
      timeline,
    })).toEqual([])
  })

  it('does not resurrect the pre-Backward future suffix when Send starts before history returns', () => {
    const authoritativeRollbackHistory = [
      { id: 'canonical-user' },
      { id: 'canonical-ai' },
    ]
    const staleTimelineWithNewSend = [
      ...authoritativeRollbackHistory,
      { id: 'rolled-back-user' },
      { id: 'rolled-back-ai' },
      { id: 'new-user' },
      { id: 'new-ai' },
    ]

    const retained = retainedTimelineForHistoryResponse({
      page: 1,
      streamActive: false,
      pendingAtRequest: null,
      currentPending: {
        clientOperationId: 'send-after-backward',
        userBubbleId: 'new-user',
        aiBubbleId: 'new-ai',
      },
      timeline: staleTimelineWithNewSend,
    })
    const merged = [...authoritativeRollbackHistory, ...retained]

    expect(merged.map(row => row.id)).toEqual([
      'canonical-user',
      'canonical-ai',
      'new-user',
      'new-ai',
    ])
    expect(merged.some(row => String(row.id).startsWith('rolled-back-'))).toBe(false)
  })

  it('keeps only the new Send bubbles when streamMeta arrives before the late Backward history', () => {
    const authoritativeRollbackHistory = [
      { id: 'canonical-user' },
      { id: 'canonical-ai' },
    ]
    const retained = retainedTimelineForHistoryResponse({
      page: 1,
      streamActive: true,
      pendingAtRequest: null,
      currentPending: {
        clientOperationId: 'send-after-backward',
        userBubbleId: 'new-user',
        aiBubbleId: 'new-ai',
      },
      timeline: [
        ...authoritativeRollbackHistory,
        { id: 'rolled-back-user' },
        { id: 'rolled-back-ai' },
        { id: 'new-user' },
        { id: 'new-ai' },
      ],
    })

    expect([...authoritativeRollbackHistory, ...retained].map(row => row.id)).toEqual([
      'canonical-user',
      'canonical-ai',
      'new-user',
      'new-ai',
    ])
  })

  it('projects a zero-output terminal failure as SystemMessage-only', () => {
    const rows = mergeChatHistoryOperationProjections(
      [{ id: 'user-chat', type: 1, content: 'hello' }],
      {
        schemaVersion: 'outcome_v1',
        operationStatusAvailable: true,
        operations: [{
          operationId: 'failed-send',
          kind: 'send',
          state: 'failed_retryable',
          targetChatId: 'user-chat',
          outputDisposition: 'none',
          finishReason: 'pre_provider_memory_fallback',
        }],
      },
    )

    const projection = rows.find(row => row.operationProjectionOnly === true)
    expect(projection).toMatchObject({
      content: '',
      systemOnly: true,
      operationProjectionOnly: true,
    })
  })
})
