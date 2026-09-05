import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { prepareChatPayload } from '../chat-transport-ownership'

// Locale mirroring copies page tests under src/{locale}/pages/... before the
// full suite. process.cwd() remains the desktop project root in every copy.
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

describe('desktop chat transport ownership', () => {
  it('forces uni-h5 callback mode so connectSocket returns a SocketTask (PC send-unavailable root cause)', () => {
    const chat = readChat()
    const idx = chat.indexOf('const capturedSocket: any = uni.connectSocket({')
    expect(idx).toBeGreaterThan(-1)
    const connectCall = chat.slice(idx, chat.indexOf('this', idx) + 400)
    expect(connectCall).toContain('success: () => {}')
  })

  it('opens a fresh socket generation and sends exactly one chat payload after its open', () => {
    const chat = readChat()
    const send = sliceBetween(chat, 'function sendWebSocketMessage(data)', '//连接WebSocket服务器')
    const connection = sliceBetween(chat, 'function connectWebSocket(', '// Phase 2a：斷線自動重連')

    expect(send).toContain('retireActiveSocketForNextTurn()')
    expect(send).toContain('chatTransport.openSocketGeneration()')
    expect(send).toContain('connectWebSocket(undefined, socketToken)')
    expect(send).not.toContain('if (isConnecting.value)')
    expect(connection).toContain('capturedSocket.onOpen(onOpen)')
    // 開放 API 的串流先驗票：第一幀交票，收到 ready 才送排隊中的聊天幀。
    expect(connection).toContain("JSON.stringify({ type: 'auth', ticket })")
    expect(chat).toContain('sendQueuedChatPayload(readySocket, socketToken)')
    expect(chat).toContain('chatTransport.consumeChatPayload(socketToken)')
  })

  it('fences every task callback with immutable socket and conversation generations', () => {
    const chat = readChat()
    const connection = sliceBetween(chat, 'function connectWebSocket(', '// Phase 2a：斷線自動重連')

    expect(connection.match(/isOwnedSocketCallback\(socketToken, capturedGeneration\)/g)?.length).toBeGreaterThanOrEqual(4)
    expect(connection).toContain('capturedSocket.onMessage(onMessage)')
    expect(connection).toContain('capturedSocket.onClose(onClose)')
    expect(connection).toContain('capturedSocket.onError(onError)')
    expect(chat).not.toContain('setupWebSocketListeners()')
  })

  it('tracks transient bubbles, promotes on accepted, and restores the exact draft on pre-ack failure', () => {
    const chat = readChat()
    const send = sliceBetween(chat, 'function send()', '// 发送WebSocket消息')
    const handler = sliceBetween(chat, 'const handlerMessage =', '// 滚动节流定时器')
    const recovery = sliceBetween(chat, 'function recoverPendingChatTurnBeforeAccepted(showNotice = true)', 'function markPendingChatTurnAccepted')

    expect(send).toContain('transportTransient: true')
    expect(send).toContain('beginPendingChatTurn')
    expect(recovery).toContain('shouldRecoverTransientTurn')
    expect(recovery).toContain('pending.userBubbleId')
    expect(recovery).toContain('pending.aiBubbleId')
    expect(recovery).toContain("message.warning(t('chat.messageNotSentDraftSaved'))")
    expect(handler).toContain("event.event === 'accepted'")
    expect(handler).toContain('markPendingChatTurnAccepted(event.data)')
  })

  it('retires the current payload generation on visible DONE without a timer', () => {
    const chat = readChat()
    const handler = sliceBetween(chat, 'const handlerMessage =', '// 滚动节流定时器')

    expect(handler).toContain("event.raw === '[DONE]'")
    expect(handler).toContain('retireActiveSocketAfterVisibleDone(socketToken)')
    expect(chat).not.toContain('scheduleSocketCloseAfterDone')
    expect(chat).not.toContain('setTimeout(() => closeWebSocket')
  })

  it('uses rewrite=false for an unaccepted local user bubble', () => {
    const chat = readChat()
    const regenerate = sliceBetween(chat, 'const doReiteration =', 'const doContinue =')

    expect(regenerate).toContain('const rewriteSnapshot = createRewriteSnapshotForAI(talkList.value, index)')
    expect(regenerate).toContain('const userBubble = rewriteSnapshot.userBubble')
    expect(regenerate).toContain('rewrite.value = shouldRewriteUserTurn(userBubble)')
    expect(regenerate).not.toContain('rewrite.value = true')
  })

  it('[WO-B regression] retries the original accepted bubble chatId even when newer history repeats its content', () => {
    const chat = readChat()
    const regenerate = sliceBetween(chat, 'const doReiteration =', 'const doContinue =')
    const originalBubble = { chatId: 'chat-original', content: 'Try this choice' }
    const newestFirstHistory = [
      { chatId: 'chat-newer-duplicate', chatRole: 'USER', chatMessage: 'Try this choice' },
      { chatId: originalBubble.chatId, chatRole: 'USER', chatMessage: originalBubble.content },
    ]

    expect(newestFirstHistory[0].chatId).not.toBe(originalBubble.chatId)
    expect(regenerate).toContain("rewriteTargetChatId.value = rewrite.value ? String(userBubble.chatId || userBubble.id || '') : ''")
    expect(regenerate).not.toContain('refreshRetryTargetChatId')
    expect(regenerate).not.toContain('historyMessageList')
    expect(regenerate.indexOf('rewriteTargetChatId.value =')).toBeLessThan(regenerate.indexOf('send()'))
  })

  it('[WO-B] wires terminal stale cleanup and the Enter-safe in-flight guard into chat.vue', () => {
    const chat = readChat()
    const handler = sliceBetween(chat, 'const handlerMessage =', '// 滚动节流定时器')
    const send = sliceBetween(chat, 'function send()', '// 发送WebSocket消息')
    const mutationFence = sliceBetween(chat, 'function isTimelineMutationBlocked()', 'function notifyTimelineMutationBlocked()')

    expect(handler).toContain("terminateStreamForChatError(errorType, () => clearStreamState())")
    expect(handler).toContain('pendingChatTurn = null')
    expect(handler).toContain("sendError(0, errorMsg, 'conversation_stale', errorType)")
    expect(chat).toContain("'conversation_stale': 'model-error'")
    expect(chat).toContain("'conversation_stale': t('error.replyNotGenerated')")
    expect(chat).toContain("'compact_retryable', 'conversation_stale'")
    expect(handler).toContain('markExplicitPreAdmissionError(')
    expect(chat).toContain('recordExactOperationProbeMiss(')
    expect(chat).toContain('settleConfirmedPreAdmissionFailure(')
    expect(chat).toContain('@confirm="send"')
    expect(send).toContain('isTimelineMutationBlocked()')
    expect(send.indexOf('isTimelineMutationBlocked()')).toBeLessThan(send.indexOf('content.value = unref(content).trim()'))
    expect(mutationFence).toContain('isChatSendInFlight({')
    expect(mutationFence).toContain('isCompacting: unref(isCompacting)')
    expect(mutationFence).toContain('pendingChatTurn')
  })

  it('puts all four typed operations and their matching legacy flags on the actual H5 websocket frame', () => {
    const chat = readChat()
    const send = sliceBetween(chat, 'function send()', '// 发送WebSocket消息')
    const queue = sliceBetween(chat, 'function sendQueuedChatPayload', 'function handleOwnedSocketTermination')

    expect(send).toContain('rewrite: unref(rewrite)')
    expect(send).toContain('contine: unref(contine)')
    expect(send).toContain("operationKind: explicitOperationKind === 'retry_generation'")
    expect(send).toContain('const messageData = preparedPayload.payload')
    expect(send).toContain('sendWebSocketMessage(messageData)')
    expect(queue).toContain('data: JSON.stringify(entry.payload)')

    const cases = [
      ['send', { rewrite: false, contine: false, chatId: '' }],
      ['rewrite_response', { rewrite: true, contine: false, chatId: 'ai-rewrite-source' }],
      ['continue_response', { message: '', rewrite: false, contine: true, chatId: 'ai-continue-source' }],
      ['retry_generation', {
        operationKind: 'retry_generation',
        rewrite: true,
        contine: false,
        chatId: 'user-retry-source',
      }],
    ] as const

    for (const [operationKind, legacy] of cases) {
      const prepared = prepareChatPayload({
        conversationId: 'conversation-wire',
        storyId: 'story-wire',
        message: 'hello',
        model: 'model-wire',
        thinkingDepth: '',
        rewrite: false,
        contine: false,
        presetCmd: '',
        language: 'zh-Hant',
        chatId: '',
        supportsOperationOutcome: true,
        clientOperationId: `client-${operationKind}`,
        ...legacy,
      })
      expect(prepared.ok).toBe(true)

      // sendQueuedChatPayload writes this exact JSON string into SocketTask.send.
      const wirePayload = JSON.parse(JSON.stringify(prepared.payload))
      expect(wirePayload).toMatchObject({
        operationKind,
        rewrite: legacy.rewrite,
        contine: legacy.contine,
        chatId: legacy.chatId,
      })
    }
  })


  it('routes payloads, durability, watchdogs, and consumed-turn recovery through the owned V2 socket', () => {
    const chat = readChat()
    const dispatch = read('src/pages/canvas/chat-sse-dispatch.ts')
    const send = sliceBetween(chat, 'function send()', '// 发送WebSocket消息')
    const queue = sliceBetween(chat, 'function sendQueuedChatPayload', 'function handleOwnedSocketTermination')
    const handler = sliceBetween(chat, 'const handlerMessage =', '// 滚动节流定时器')
    const streamMeta = sliceBetween(dispatch, 'function handleStreamMeta', 'function handleMessageMeta')
    const accepted = sliceBetween(chat, 'function markPendingChatTurnAccepted', 'function finalizePendingChatTurnAfterVisibleDone')
    const noActive = sliceBetween(chat, "case 'noActiveStream':", "case 'hasRecentReply':")

    expect(send).toContain('const preparedPayload = prepareChatPayload(payloadInput)')
    // 開放客戶端的封包不帶任何帳號識別：身分只在標頭與串流票證上。
    expect(send).not.toContain('accountId')
    expect(send).toContain('conversationId: unref(conversationId)')
    expect(chat).toContain('const prepared = prepareChatPayload(data)')
    expect(noActive).toContain('prepareChatPayload(resend.payload)')
    expect(queue).not.toContain('sendSocketMessage')
    expect(queue).toContain('captured SocketTask.send unavailable')
    expect(queue).toContain('closeWebSocket()')
    expect(chat).toContain('createPendingStreamEntry')
    expect(chat).toContain('mergeStreamMetaIntoPendingEntry')
    expect(chat).toContain('markStreamEntryAccepted')
    expect(streamMeta).not.toContain('pendingResendPayload.value = null')
    expect(accepted).toContain('pendingResendPayload.value = null')
    expect(accepted).toContain('persistAcceptedStreamState()')
    expect(chat).toContain("params.set('protocolVersion', PROTOCOL_VERSION)")
    expect(chat).toContain('armOpenDeadline')
    expect(chat).toContain('markSocketOpened')
    expect(chat).toContain('armAcceptedDeadline')
    expect(handler).toContain("event.event === 'turn_already_consumed'")
    expect(handler).toContain('consumeTurnAlreadyConsumedRetry')
    expect(handler).toContain('if (!recoverPendingChatTurnBeforeAccepted()) recoverStoredStreamDraft({ draft })')
    expect(chat).toContain('expectsAccepted: !pending.pendingPayload.rewrite && !pending.pendingPayload.contine')
  })

  it('provides a human-readable saved-draft message in all five locales', () => {
    const localeFiles = [
      'src/locale/en.json',
      'src/locale/zh-Hans.json',
      'src/locale/zh-Hant.json',
      'src/locale/ja.json',
      'src/locale/ko.json',
    ]

    localeFiles.forEach((localeFile) => {
      const locale = JSON.parse(read(localeFile))
      expect(locale['chat.messageNotSentDraftSaved']).toEqual(expect.any(String))
      expect(locale['chat.messageNotSentDraftSaved'].trim()).not.toBe('')
    })
  })
  it('finalize 只在 accepted 時解除 transient(防 serverProgress-only 氣泡重說撞 UUID)', () => {
    const chat = readChat()
    const fnIdx = chat.indexOf('function finalizePendingChatTurnAfterVisibleDone()')
    const seg = chat.slice(fnIdx, fnIdx + 600)
    expect(seg).toContain('if (pendingChatTurn.accepted === true) {')
    const clearIdx = seg.indexOf('userBubble.transportTransient = false')
    const guardIdx = seg.indexOf('if (pendingChatTurn.accepted === true)')
    expect(guardIdx).toBeGreaterThan(-1)
    expect(clearIdx).toBeGreaterThan(guardIdx)
  })

  it('prints the server reason in an error bubble instead of the generic not-sent toast', () => {
    // 由來：免費模型的資格拒絕（免費次數用完）被顯示成「訊息未送出，草稿已保留」，
    // 使用者分不出是我們壞了還是他不能用。伺服器已經給了原因就要印出來。
    const chat = readChat()
    const recovery = sliceBetween(
      chat,
      'function recoverPendingChatTurnBeforeAccepted(showNotice = true)',
      'function markPendingChatTurnAccepted',
    )

    expect(recovery).toContain('pending.preAdmissionErrorType')
    expect(recovery).toContain('appendChatErrorBubble(explicitErrorType, resolveChatErrorMessage(explicitErrorType, t))')
    // 沒有明確原因時仍然只彈那句話——這條分支不是被取代，是被讓路。
    expect(recovery).toContain("message.warning(t('chat.messageNotSentDraftSaved'))")
  })

})
