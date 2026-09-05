import { describe, expect, it } from 'vitest'

import {
  resolveChatErrorTypeFromFailure,
  resolveChatErrorMessage,
  resolveChatErrorPresentation,
} from './chat-error-message.js'

const translate = (key: string) => key

describe('resolveChatErrorMessage', () => {
  it('preserves typed business failures rejected by the shared HTTP interceptor', () => {
    expect(resolveChatErrorTypeFromFailure({
      statusCode: 409,
      data: {
        errorCode: 'rewrite_target_not_latest',
        error: 'This conversation changed.',
      },
    })).toBe('rewrite_target_not_latest')

    expect(resolveChatErrorTypeFromFailure({
      response: {
        status: 400,
        data: { errorCode: 'rewrite_target_invalid' },
      },
    })).toBe('rewrite_target_invalid')
  })

  it('distinguishes HTTP platform failures from actual network failures', () => {
    expect(resolveChatErrorTypeFromFailure({ statusCode: 500, data: {} })).toBe('server_error')
    expect(resolveChatErrorTypeFromFailure({ statusCode: 402, data: {} })).toBe('insufficient_credits')
    expect(resolveChatErrorTypeFromFailure(new Error('network disconnected'))).toBe('connection_error')
  })

  it('maps insufficient credits to the localized top-up message', () => {
    expect(resolveChatErrorMessage('insufficient_credits', translate)).toBe('chat.point_no_tips')
  })

  it('maps exhausted free quota to the localized quota message', () => {
    expect(resolveChatErrorMessage('quota_exhausted', translate)).toBe('chat.freeQuotaExhaustedTitle')
  })

  it('preserves known chat errors and falls back for unknown types', () => {
    expect(resolveChatErrorMessage('empty_response', translate)).toBe('error.emptyResponse')
    expect(resolveChatErrorMessage('unexpected_error', translate)).toBe('error.connectionError')
  })

  it('maps compact_retryable to its own honest recap message, not the generic connection error', () => {
    expect(resolveChatErrorMessage('compact_retryable', translate)).toBe('error.compactRetryable')
  })

  it('keeps mutation_in_progress on the localized rollback-in-progress notice', () => {
    expect(resolveChatErrorMessage('mutation_in_progress', translate)).toBe('chat.rollbackInProgressNotice')
  })

  it('maps every typed pre-admission failure to an honest visible SystemMessage reason', () => {
    expect(resolveChatErrorPresentation('operation_in_progress', translate)).toMatchObject({
      message: 'chat.operationPending',
      finishReason: 'operation_in_progress',
    })
    expect(resolveChatErrorPresentation('mutation_in_progress', translate)).toMatchObject({
      message: 'chat.rollbackInProgressNotice',
      finishReason: 'mutation_in_progress',
    })
    expect(resolveChatErrorPresentation('conversation_history_mutation_pending', translate)).toMatchObject({
      message: 'chat.rollbackInProgressNotice',
      finishReason: 'mutation_in_progress',
    })
    expect(resolveChatErrorPresentation('rewrite_target_not_persisted', translate)).toMatchObject({
      message: 'error.replyNotGenerated',
      finishReason: 'conversation_stale',
    })
    expect(resolveChatErrorPresentation('continue_target_invalid', translate)).toMatchObject({
      message: 'error.replyNotGenerated',
      finishReason: 'conversation_stale',
    })
    expect(resolveChatErrorPresentation('rewrite_target_not_latest', translate)).toMatchObject({
      message: 'chat.editLatestAIOnly',
      finishReason: 'rewrite_target_not_latest',
    })
    expect(resolveChatErrorPresentation('rewrite_target_invalid', translate)).toMatchObject({
      message: 'chat.rewriteTargetChanged',
      finishReason: 'rewrite_target_invalid',
    })
  })

  it('keeps an unknown typed failure visible instead of creating a hidden system-only row', () => {
    expect(resolveChatErrorPresentation('unexpected_error', translate)).toMatchObject({
      message: 'error.connectionError',
      finishReason: 'error',
    })
  })

  it('[B2] maps conversation_stale to its own honest retry message in all five locales', () => {
    expect(resolveChatErrorMessage('conversation_stale', translate)).toBe('error.replyNotGenerated')

    const expected = {
      en: "This reply wasn't generated; please try again.",
      'zh-Hans': '这一条没有生成成功，请再试一次。',
      'zh-Hant': '這一則沒有生成成功，請再試一次。',
      ja: 'この返信は生成できなかったため、もう一度お試しください。',
      ko: '이번 답변을 생성하지 못했으니 다시 시도해 주세요.',
    }
    Object.entries(expected).forEach(([locale, message]) => {
      expect(require(`../locale/${locale}.json`)['error.replyNotGenerated']).toBe(message)
    })
  })

  // 施工單：內容審查拒絕精準分揀與用戶提示（ContentModerationErrorSurfacing）
  // §3.3：error_type='content_filter' 走專屬提示（可換說法/換模型），不再落回
  // 通用「連線錯誤」。
  it('maps content_filter to its own actionable message, not the generic connection error', () => {
    expect(resolveChatErrorMessage('content_filter', translate)).toBe('error.contentFilter')
  })

  it('keeps user-actionable failures distinct from platform failures', () => {
    expect(resolveChatErrorPresentation('insufficient_credits', translate)).toEqual({
      message: 'chat.point_no_tips',
      finishReason: 'insufficient_credits',
      action: 'openVip',
    })
    expect(resolveChatErrorPresentation('quota_exhausted', translate)).toEqual({
      message: 'chat.freeQuotaExhaustedTitle',
      finishReason: 'quota_exhausted',
      action: 'openVip',
    })
    expect(resolveChatErrorPresentation('model_refused', translate)).toEqual({
      message: 'error.modelRefused',
      finishReason: 'refusal',
      action: '',
    })
    expect(resolveChatErrorPresentation('content_filter', translate)).toEqual({
      message: 'error.contentFilter',
      finishReason: 'content_filter_input',
      action: '',
    })
    expect(resolveChatErrorPresentation('rate_limit', translate).finishReason).toBe('rate_limit')
    expect(resolveChatErrorPresentation('connection_error', translate).finishReason).toBe('network_error')
    expect(resolveChatErrorPresentation('server_error', translate).finishReason).toBe('server_error')
  })
})
