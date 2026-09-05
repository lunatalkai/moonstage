import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { dispatchSSEEvent } from '../chat-sse-dispatch'

function makeDispatchContext() {
  const captured: { last: any } = { last: null }
  const ctx: any = {
    currentChatId: { value: 'ai-reasoning-only' },
    replyContent: { value: '' },
    thinkingContent: { value: '' },
    talkList: { value: [] },
    lastFinishReason: { value: '' },
    lastEventId: { value: 0 },
    streamId: { value: '' },
    isStreamActive: { value: true },
    tempContent: { value: '' },
    content: { value: '' },
    pendingMessageMeta: { value: null },
    pendingResendPayload: { value: null },
    isResumeInitial: { value: false },
    userStopRequested: { value: false },
    pic: { value: '' },
    formData: { autoAudio: false },
    finalizeV3Message: () => null,
    feedV3Chunk: () => [],
    looksLikeV3Content: () => false,
    upsertPendingAIBubble: (data: any) => {
      captured.last = data
      ctx.talkList.value = [data]
    },
    scrollToBottom: () => {},
    checkQuotaExhaustion: () => {},
    playSound: () => {},
    persistStreamState: () => {},
    clearStreamState: () => {},
    sendError: () => {},
    resetHistoryPagination: () => {},
    getHistoryMsg: () => {},
    removeOrphanPlaceholder: () => {},
    removeResumeHistoryDuplicateByMessageAnchor: () => {},
    appendStreamStateMessage: () => {},
    clearCompactState: () => {},
    emitCGUpdate: () => {},
    tify: (value: string) => value,
    getLocale: () => 'en',
    nextTick: (callback?: () => void) => callback?.(),
    t: (key: string) => key,
  }
  return { ctx, captured }
}

describe('Desktop reasoning-only terminal response', () => {
  it('keeps thinking visible when a successful terminal response has no final body', () => {
    const { ctx, captured } = makeDispatchContext()

    dispatchSSEEvent({
      event: 'thinking',
      raw: '',
      data: { choices: [{ delta: { reasoning_content: 'visible reasoning' } }] },
    } as any, ctx)
    dispatchSSEEvent({ event: 'answer', raw: '[DONE]', data: {} } as any, ctx)

    expect(captured.last).toMatchObject({
      content: '',
      thinkingContent: 'visible reasoning',
      chatFinish: true,
      finishReason: 'stop',
    })
  })

  it('treats thinking as renderable partial output on the interrupted terminal path', () => {
    const source = fs.readFileSync(path.resolve(__dirname, '../canvas.vue'), 'utf8')
    const errorBranchStart = source.indexOf("case 'error':")
    const errorBranchEnd = source.indexOf('// 滚动节流定时器', errorBranchStart)
    const errorBranch = source.slice(errorBranchStart, errorBranchEnd)

    expect(errorBranchStart).toBeGreaterThan(-1)
    expect(errorBranchEnd).toBeGreaterThan(errorBranchStart)
    expect(errorBranch).toContain(
      'hasRenderableAssistantOutput(replyContent.value, thinkingContent.value)',
    )
    expect(errorBranch).toMatch(/["']thinkingContent["']:\s*thinkingContent\.value/)
    expect(errorBranch).toContain(
      'resolveChatErrorPresentation(errorType, t).finishReason',
    )
  })

  it('does not classify a pending thinking-only bubble as an orphan placeholder', () => {
    const source = fs.readFileSync(path.resolve(__dirname, '../canvas.vue'), 'utf8')
    const orphanHelperStart = source.indexOf('function removeOrphanPlaceholder()')
    const orphanHelperEnd = source.indexOf(
      'function removeResumeHistoryDuplicateByMessageAnchor',
      orphanHelperStart,
    )
    const orphanHelper = source.slice(orphanHelperStart, orphanHelperEnd)

    expect(orphanHelperStart).toBeGreaterThan(-1)
    expect(orphanHelperEnd).toBeGreaterThan(orphanHelperStart)
    expect(orphanHelper).toContain(
      'hasRenderableAssistantOutput(last.content, last.thinkingContent)',
    )
  })
})
