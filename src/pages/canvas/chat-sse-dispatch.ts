/**
 * Extracted SSE event dispatcher originally inline in chat.vue's
 * handlerMessage. Consumes one parsed SSEEvent at a time. Both the
 * legacy WebSocket transport and the new HTTP streaming transport
 * feed events through this function — the protocol is SSE in both
 * cases, only the carrier differs.
 *
 * Intentionally parameterised on a context object so the same logic
 * can be unit-tested without a full chat.vue mount. Plain .ts file
 * (not a composable) avoids pulling the whole Vue scope graph across
 * an import boundary.
 *
 * NOT covered here:
 *   - compacting / compactDone / compactFailed / compactSkipped — touch Vuex
 *     store.commit and remain inline in chat.vue's handlerMessage so
 *     the Vuex dependency doesn't leak into this file.
 *   - flowResponses / noActiveStream / waiting / retrying / error —
 *     also remain inline (scope of Task 9 is only the main streaming
 *     path + v2 protocol events).
 *
 * The dispatcher also handles cg_update for the
 * upcoming HTTP transport. chat.vue currently catches those via a
 * JSON-envelope probe BEFORE handlerMessage reaches the SSE parser,
 * so the branches here are effectively dead on the WS path but safe
 * (behaviour-preserving) — the inline probe still short-circuits.
 */

import type { SSEEvent } from '@/utils/sseParser'
import type { Ref } from 'vue'
import { clearStreamCache } from '@/utils/rich-text-renderer.js'
import { resolvePendingThinkingCollapsed } from '@/utils/thinking-content'

// All reactive refs / helpers the switch needs. chat.vue constructs an
// instance once in setup() and passes the same object on every call.
export interface DispatchContext {
  // refs (mutable)
  currentChatId: Ref<string | number>
  replyContent: Ref<string>
  thinkingContent: Ref<string>
  talkList: Ref<any[]>
  lastFinishReason: Ref<string>
  lastEventId: Ref<number>
  streamId: Ref<string>
  isStreamActive: Ref<boolean>
  tempContent: Ref<string>
  content: Ref<string>
  // Phase 0 Task 3 (follow-up)：server 在 streamMeta 之後、首個 answer chunk 之前 emit
  // `event: messageMeta` 帶的這一輪中繼資料。留著給恢復流程對照，不驅動渲染。
  pendingMessageMeta: Ref<{ roleId?: string; [key: string]: any } | null>
  pendingResendPayload: Ref<any>
  isResumeInitial: Ref<boolean>
  // Set by chat.vue immediately after a local user stop. Late answer/thinking
  // chunks from the old stream must not keep mutating the finalized bubble.
  userStopRequested?: Ref<boolean>

  // value accessors (chat.vue exposes these in varying shapes —
  // typed loosely so the caller can adapt)
  pic: { value: string }
  formData: { autoAudio?: boolean; [k: string]: any }

  // helpers
  upsertPendingAIBubble: (data: any) => void
  scrollToBottom: (force?: boolean) => void
  persistStreamState: () => void
  clearStreamState: () => void
  sendError: (type: number, msg: string) => void
  // Reset pagination flags before the dispatcher's single history fetch.
  // Keeping this behind a hook avoids a second inline sessionExpired owner.
  resetHistoryPagination: () => void
  getHistoryMsg: () => void
  removeOrphanPlaceholder: () => void
  removeResumeHistoryDuplicateByMessageAnchor: (messageId: string | number) => void
  appendStreamStateMessage: (messageText: string, finishReason: 'resume_unavailable' | 'compact_retryable' | 'compact_no_input') => void
  clearCompactState: () => void
  discardPendingChatOperationCandidate?: () => boolean
  commitPendingChatOperationAfterVisibleDone?: () => boolean
  onOperationStatus?: (data: any) => void
  onOperationRecoveryRequired?: (reason: 'sessionExpired' | 'resumeUnavailable') => boolean

  // utils
  tify: (s: string) => string
  getLocale: () => string
  nextTick: (cb?: () => void) => void
  t: (key: string) => string

  // 2026-05-07 Phase 3: chat finish (finishReason === 'stop') 後觸發,
  // 由 chat.vue 實作為 fetch GET /readiness 並更新 readiness store。
  // 失敗 / 非 base creator role / 非 finishReason=stop 時 caller 自行跳過。
  triggerReadinessFetch?: () => void
}

export interface ParsedChatSSEEventGateOptions {
  dispatchEvent: (ev: SSEEvent) => boolean
  clearResumeInitialIfNeeded?: (ev: SSEEvent) => void
  isGenerationCurrent?: () => boolean
}

const RESUME_INITIAL_CLEAR_EVENTS = ['answer', 'flowNodeStatus', 'compactDone', 'compactSkipped', 'message']

export function handleParsedChatSSEEventGate(ev: SSEEvent, options: ParsedChatSSEEventGateOptions): boolean {
  if (options.isGenerationCurrent && !options.isGenerationCurrent()) return true
  const consumedByDispatcher = options.dispatchEvent(ev)
  if (consumedByDispatcher) return true
  if (RESUME_INITIAL_CLEAR_EVENTS.includes(ev.event)) {
    options.clearResumeInitialIfNeeded?.(ev)
  }
  return false
}

/**
 * Handle a single parsed SSE event.
 *
 * Returns true when the event was dropped by a guard or fully consumed here.
 * chat.vue must then skip its inline legacy handler for that same event.
 */
export function dispatchSSEEvent(ev: SSEEvent, ctx: DispatchContext): boolean {
  // Record v2-protocol event id for resume.
  if (ev.id && typeof ev.id === 'number' && ev.id > ctx.lastEventId.value) {
    ctx.lastEventId.value = ev.id
    ctx.persistStreamState()
  }

  if (shouldDropAfterUserStop(ev, ctx)) {
    return true
  }

  switch (ev.event) {
    case 'flowNodeStatus':
      if (ctx.isResumeInitial.value) {
        ctx.removeResumeHistoryDuplicateByMessageAnchor(ev.data.name)
      }
      ctx.currentChatId.value = ev.data.name
      ctx.nextTick(() => ctx.scrollToBottom())
      break

    case 'answer':
      handleAnswer(ev, ctx)
      break

    case 'thinking':
      handleThinking(ev, ctx)
      break

    case 'message':
      handleLegacyMessage(ev, ctx)
      break

    case 'streamMeta':
      handleStreamMeta(ev, ctx)
      break

    case 'messageMeta':
      handleMessageMeta(ev, ctx)
      break

    case 'operationStatus':
      ctx.onOperationStatus?.(ev.data)
      return true

    case 'done':
      // v2 terminal event — clear resume state.
      console.log('[Stream] done event received, clearing state')
      ctx.isStreamActive.value = false
      ctx.clearStreamState()
      break

    case 'sessionExpired':
      if (ctx.onOperationRecoveryRequired?.('sessionExpired')) return true
      // v2 resume path reported the session is gone; fall back to
      // history fetch so the user still sees the conversation.
      console.warn('[Stream] session expired, fallback to history')
      ctx.clearStreamState()
      ctx.isResumeInitial.value = false
      ctx.removeOrphanPlaceholder()
      try {
        ctx.resetHistoryPagination()
        ctx.getHistoryMsg()
      } catch (e) {
        console.error('[Stream] sessionExpired → getHistoryMsg 失敗:', e)
      }
      break

    case 'resumeUnavailable':
      if (ctx.onOperationRecoveryRequired?.('resumeUnavailable')) return true
      // HasAIChatSince 查詢失敗是 fail-closed soft error：USER row 已落庫，
      // 禁止自動重送原 payload；既有「再說一次」入口會走 regenerate 語義。
      ctx.pendingResendPayload.value = null
      ctx.isResumeInitial.value = false
      ctx.clearStreamState()
      ctx.removeOrphanPlaceholder()
      ctx.appendStreamStateMessage(ctx.t('chat.resumeUnavailable'), 'resume_unavailable')
      break

    case 'error':
      if (handleSynchronousStreamStateError(ev, ctx)) return true
      break

    // compacting / compactDone / compactFailed / compactSkipped / quotaExhausted are
    // intentionally NOT handled here — they touch Vuex store.commit
    // and are handled inline in chat.vue.

    default:
      break
  }
  return false
}

// ---------- internal handlers (unchanged logic copied from chat.vue) ----------

function shouldDropAfterUserStop(ev: SSEEvent, ctx: DispatchContext): boolean {
  if (!ctx.userStopRequested?.value) return false
  // Rewrite/Continue 的 local Stop 仍要等 outcome_v1 durable terminal；
  // operationStatus 是權威身份/狀態，不能被舊 stream chunk guard 吃掉。
  if (ev.event === 'operationStatus') return false
  if (ev.event === 'streamMeta') {
    const incomingStreamId = String(ev.data?.streamId || '')
    const stoppedStreamId = String(ctx.streamId.value || '')
    if (!incomingStreamId || !stoppedStreamId || incomingStreamId !== stoppedStreamId) {
      ctx.userStopRequested.value = false
    }
    return false
  }
  if (ev.event === 'answer' || ev.event === 'message') {
    if (ev.raw === '[DONE]') return false
    const finishReason = ev.data?.choices?.[0]?.finish_reason
      || ev.data?.finishReason
      || ev.data?.finish_reason
    if (finishReason === 'user_stop') return false
  }
  return true
}

function handleSynchronousStreamStateError(ev: SSEEvent, ctx: DispatchContext): boolean {
  const finishReason = ev.data?.finishReason || ev.data?.finish_reason
  const stateByFinishReason = {
    compact_no_input: ['chat.compactNoInput', 'compact_no_input'],
    compact_retryable: ['chat.compactFailed', 'compact_retryable'],
    resume_unavailable: ['chat.resumeUnavailable', 'resume_unavailable'],
  } as const
  const state = stateByFinishReason[finishReason as keyof typeof stateByFinishReason]
  if (!state) return false

  ctx.discardPendingChatOperationCandidate?.()
  ctx.clearCompactState()
  ctx.replyContent.value = ''
  ctx.thinkingContent.value = ''
  ctx.tempContent.value = ''
  ctx.lastFinishReason.value = ''
  if (finishReason === 'resume_unavailable') {
    ctx.pendingResendPayload.value = null
    ctx.isResumeInitial.value = false
    ctx.clearStreamState()
  }
  ctx.removeOrphanPlaceholder()
  ctx.appendStreamStateMessage(ctx.t(state[0]), state[1])
  return true
}

function mergeCurrentPendingBubbleState(ctx: DispatchContext, data: any): any {
  data.thinkingCollapsed = resolvePendingThinkingCollapsed(ctx.talkList.value, data.thinkingCollapsed)
  const last = ctx.talkList.value[ctx.talkList.value.length - 1]
  if (!last || last.type !== 0 || last.chatFinish) return data
  if (last.finishReason && !data.finishReason) data.finishReason = last.finishReason
  return data
}

function handleThinking(ev: SSEEvent, ctx: DispatchContext): void {
  if (ev.raw === '[DONE]') return
  const thinkingData: any = ev.data
  const rawDelta = thinkingData?.choices?.[0]?.delta?.reasoning_content
  if (!rawDelta) return

  const delta: string = ctx.getLocale() === 'zh-Hant' ? ctx.tify(String(rawDelta)) : String(rawDelta)
  ctx.thinkingContent.value += delta

  const data: any = {
    id: ctx.currentChatId.value,
    content: ctx.replyContent.value,
    thinkingContent: ctx.thinkingContent.value,
    thinkingCollapsed: true,
    type: 0,
    pic: ctx.pic.value,
    chatLoading: false,
    chatFinish: false,
    maskPosition: 1,
    isPinned: false,
  }
  ctx.upsertPendingAIBubble(mergeCurrentPendingBubbleState(ctx, data))
  ctx.nextTick(() => ctx.scrollToBottom())
}

function handleAnswer(ev: SSEEvent, ctx: DispatchContext): void {
  if (ev.raw !== '[DONE]') {
    const answerData: any = ev.data
    // Capture finish_reason from final streaming chunk
    if (answerData?.choices?.[0]?.finish_reason && answerData.choices[0].finish_reason !== 'stop') {
      ctx.lastFinishReason.value = answerData.choices[0].finish_reason
    }
    if (answerData?.choices?.[0]?.delta?.content) {
      if (answerData.choices[0].delta.content.length > 0) {
        const rawDelta: string = answerData.choices[0].delta.content
        const delta: string = ctx.getLocale() === 'zh-Hant' ? ctx.tify(rawDelta) : rawDelta
        ctx.replyContent.value += delta

        const data: any = {
          id: ctx.currentChatId.value,
          content: ctx.replyContent.value,
          thinkingContent: ctx.thinkingContent.value,
          thinkingCollapsed: true,
          type: 0,
          pic: ctx.pic.value,
          chatLoading: false,
          chatFinish: false,
          maskPosition: 1,
          isPinned: false,
        }
        ctx.upsertPendingAIBubble(mergeCurrentPendingBubbleState(ctx, data))
        ctx.nextTick(() => ctx.scrollToBottom())
      }
    }
    return
  }

  // [DONE] branch
  if (ctx.getLocale() === 'zh-Hant') {
    ctx.replyContent.value = ctx.tify(ctx.replyContent.value)
  }
  const data: any = {
    id: ctx.currentChatId.value,
    content: ctx.replyContent.value,
    thinkingContent: ctx.thinkingContent.value,
    thinkingCollapsed: true,
    type: 0,
    pic: ctx.pic.value,
    chatLoading: false,
    chatFinish: true,
    maskPosition: 1,
    isPinned: false,
    finishReason: ctx.lastFinishReason.value || 'stop',
  }
  // 清 streaming render cache (issue #5 · 對齊 mobile)：下次這個 id
  // 進來會走 full parse,確保最終 HTML 跟 cache-disabled path 位元相同
  if (ctx.currentChatId.value) {
    try { clearStreamCache(ctx.currentChatId.value + ':0'); } catch (_) {}
  }
  ctx.upsertPendingAIBubble(data)
  if (ctx.commitPendingChatOperationAfterVisibleDone) {
    ctx.commitPendingChatOperationAfterVisibleDone()
  }
  if (data.finishReason === 'user_stop' && ctx.userStopRequested?.value) {
    ctx.userStopRequested.value = false
  }
  const finishReasonForReadiness = (data.finishReason as string) || 'stop'
  ctx.lastFinishReason.value = ''
  // Phase 0 Task 3：本輪結束清掉 messageMeta 暫存
  ctx.pendingMessageMeta.value = null

  ctx.nextTick(() => ctx.scrollToBottom())
  ctx.tempContent.value = ''
  ctx.replyContent.value = ''
  ctx.thinkingContent.value = ''
  console.log('訊息傳送結束')

  // 2026-05-07 Phase 3: chat 正常完成後觸發 readiness 拉取
  // 僅 finishReason='stop' 觸發 (其他 user_stop / error / context_overflow 跳過)
  if (finishReasonForReadiness === 'stop' && ctx.triggerReadinessFetch) {
    try {
      ctx.triggerReadinessFetch()
    } catch (e) {
      // 不阻塞 chat 主流程
      console.warn('[Readiness] trigger failed:', e)
    }
  }
}

function handleLegacyMessage(ev: SSEEvent, ctx: DispatchContext): void {
  // v1 protocol's turn-end marker. Same shape as answer/[DONE].
  if (ev.raw !== '[DONE]') return
  if (ctx.getLocale() === 'zh-Hant') {
    ctx.replyContent.value = ctx.tify(ctx.replyContent.value)
  }
  const data: any = {
    id: ctx.currentChatId.value,
    content: ctx.replyContent.value,
    thinkingContent: ctx.thinkingContent.value,
    thinkingCollapsed: true,
    type: 0,
    pic: ctx.pic.value,
    chatLoading: false,
    chatFinish: true,
    maskPosition: 1,
    isPinned: false,
    finishReason: ctx.lastFinishReason.value || undefined,
  }
  ctx.upsertPendingAIBubble(data)
  if (ctx.commitPendingChatOperationAfterVisibleDone) {
    ctx.commitPendingChatOperationAfterVisibleDone()
  }
  if (data.finishReason === 'user_stop' && ctx.userStopRequested?.value) {
    ctx.userStopRequested.value = false
  }
  // Phase 0 Task 3：本輪結束清掉 messageMeta 暫存
  ctx.pendingMessageMeta.value = null

  ctx.nextTick(() => ctx.scrollToBottom())
  ctx.tempContent.value = ''
  ctx.replyContent.value = ''
  ctx.thinkingContent.value = ''
  console.log('訊息傳送結束')
}

function handleStreamMeta(ev: SSEEvent, ctx: DispatchContext): void {
  // Phase 2a：伺服端首個事件下發 streamId，之後 resume/刷新都用它
  try {
    const meta: any = ev.data
    if (meta && meta.streamId) {
      ctx.streamId.value = meta.streamId
      ctx.isStreamActive.value = true
      ctx.persistStreamState()
      console.log('[Stream] streamMeta received:', meta.streamId)

      // Resume 補 AI placeholder bubble：正常 send() 流程會在發送時 push 一個
      // chatLoading 的空 AI 氣泡，resume 路徑（刷新進來）沒有這一步，若不補則：
      //   1. UI 空白，用戶不知 AI 在生成
      //   2. 首個 answer chunk 到達時，splice(length-1, 1, data) 會覆蓋掉用戶自己的訊息氣泡
      const last = ctx.talkList.value[ctx.talkList.value.length - 1]
      const needPlaceholder = !last || last.type !== 0 || last.chatFinish
      if (needPlaceholder) {
        ctx.talkList.value.push({
          id: new Date().getTime(),
          content: '',
          type: 0,
          pic: ctx.pic.value,
          playstate: false,
          chatLoading: true,
          chatFinish: false,
          maskPosition: 1,
        })
        ctx.nextTick(() => ctx.scrollToBottom(true))
      }
    }
  } catch (e) {
    console.error('[Stream] 解析 streamMeta 失敗:', e)
  }
}

function handleMessageMeta(ev: SSEEvent, ctx: DispatchContext): void {
  // 伺服器在角色查詢完成後送這個事件，帶著這一輪的中繼資料（角色 id 等）。
  // 只暫存，不驅動任何渲染分支——這個客戶端只有一條渲染路徑。
  try {
    const meta: any = ev.data
    if (!meta || typeof meta !== 'object') return
    ctx.pendingMessageMeta.value = meta
  } catch (e) {
    console.error('[Stream] 解析 messageMeta 失敗:', e)
  }
}
