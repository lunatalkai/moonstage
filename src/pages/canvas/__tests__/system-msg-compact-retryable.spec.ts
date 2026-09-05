import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

// 施工單：聊天失敗態可操作性（卡死鏈 C 腿收尾）· C2 desktop
//
// Desktop 目前完全沒有 mobile 那套 <chat-system-message> 卡片機制：
// finishReason 驅動的截斷/失敗提示只有一則 ⚠️ 純文字（getTruncationHint，
// 沒有 CTA，也漏掉 rate_limit/server_error/network_error 三個 kind）。
// 這份測試鎖定 chat.vue port 完之後的行為契約，跟 mobile 版
// tests/chat/system-msg-compact-retryable.spec.js 對齊：
//   - 新 <chat-system-message> 卡片取代舊 truncation-hint（含 CTA）
//   - user_stop 與 mobile 一致走卡片，且只有最新 exact terminal row 可操作
//   - resume_unavailable / compact_no_input 維持純文字，不動
//   - compact_retryable 併入卡片，CTA 重試複用 doReiteration，且
//     appendStreamStateMessage 傳空字串 content 避免文字重複兩次
//
// chat.vue 的 setup() 巨大且吃真實 uni-app runtime，無法直接 mount（既有
// 慣例見 compact-error-honesty.spec.ts 開頭註解），沿用 source-text
// slicing 驗證。
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

describe('desktop chat.vue · SystemMessage card port (C2)', () => {
  it('renders <chat-system-message> gated on finishReason, excluding only resume_unavailable/compact_no_input', () => {
    const chat = readChat()
    const gate = sliceBetween(chat, '<chat-system-message', '@cta="onSystemMsgCta($event, item, index)"')
    expect(gate).not.toContain("'user_stop'")
    expect(gate).toContain("'resume_unavailable'")
    expect(gate).toContain("'compact_no_input'")
    expect(gate).toContain('getSystemMsgKind(item.finishReason)')
  })

  it('the old truncation-hint plain-text block for finishReason-classified messages is gone (replaced by the card)', () => {
    const chat = readChat()
    expect(chat).not.toContain('⚠️ {{ getTruncationHint(item.finishReason) }}')
    expect(chat).not.toContain('function getTruncationHint(finishReason)')
  })

  it('user_stop uses the same contextual card path as mobile', () => {
    const chat = readChat()
    const gate = sliceBetween(chat, '<chat-system-message', '@cta="onSystemMsgCta($event, item, index)"')
    const ctaFn = sliceBetween(chat, 'function getSystemMsgCta(finishReason, item, index)', 'function onSystemMsgCta(action, item, index)')
    expect(gate).not.toContain("'user_stop'")
    expect(ctaFn).toContain("'user_stop'")
    expect(ctaFn).toContain('isTerminalActionAllowed(talkList.value, index, action)')
  })

  it('getSystemMsgKind covers every mobile failure/notice kind, matching mobile 1:1 (content_filter/refusal/length/context_overflow/error/pause_turn/user_stop/rate_limit/server_error/network_error/compact_retryable)', () => {
    const chat = readChat()
    const fn = sliceBetween(chat, 'function getSystemMsgKind(finishReason)', 'function getSystemMsgLabel(finishReason)')
    expect(fn).toContain("'content_filter': 'filtered'")
    expect(fn).toContain("'refusal':")
    expect(fn).toContain("'length':         'length-cap'")
    expect(fn).toContain("'context_overflow': 'length-cap'")
    expect(fn).toContain("'empty_response': 'model-error'")
    expect(fn).toContain("'rewrite_below_threshold': 'model-error'")
    expect(fn).toContain("'error':          'model-error'")
    expect(fn).toContain("'pause_turn':     'stopped'")
    expect(fn).toContain("'user_stop':      'stopped'")
    expect(fn).toContain("'rate_limit':     'rate-limit'")
    expect(fn).toContain("'server_error':   'server-error'")
    expect(fn).toContain("'network_error':  'network-error'")
    expect(fn).toContain("'compact_retryable': 'compact-retryable'")
  })

  it('getSystemMsgLabel/getSystemMsgSub reuse existing locale keys ported verbatim from mobile (no invented copy)', () => {
    const chat = readChat()
    const labelFn = sliceBetween(chat, 'function getSystemMsgLabel(finishReason)', 'function getSystemMsgSub(finishReason)')
    expect(labelFn).toContain("t('systemMsg.filtered')")
    expect(labelFn).toContain("t('systemMsg.lengthCap')")
    expect(labelFn).toContain("t('systemMsg.modelError')")
    expect(labelFn).toContain("t('systemMsg.stopped')")
    expect(labelFn).toContain("t('systemMsg.rateLimit')")
    expect(labelFn).toContain("t('systemMsg.serverError')")
    expect(labelFn).toContain("t('systemMsg.networkError')")
    expect(labelFn).toContain("t('chat.compactFailed')")
    expect(labelFn).toContain("t('error.emptyResponse')")
    expect(labelFn).toContain("t('chat.rewriteBelowThreshold')")

    const subFn = sliceBetween(chat, 'function getSystemMsgSub(finishReason)', 'function getSystemMsgCta(finishReason, item, index)')
    expect(subFn).toContain("t('systemMsg.filteredSub')")
    expect(subFn).toContain("t('systemMsg.lengthCapSub')")
    expect(subFn).toContain("t('systemMsg.modelErrorSub')")
    expect(subFn).toContain("t('systemMsg.stoppedSub')")
    expect(subFn).toContain("t('systemMsg.rateLimitSub')")
    expect(subFn).toContain("t('systemMsg.serverErrorSub')")
    expect(subFn).toContain("t('systemMsg.networkErrorSub')")
    expect(subFn).toContain("t('error.compactRetryable')")
  })

  it('getSystemMsgCta classifies retry vs continue actions, matching mobile', () => {
    const chat = readChat()
    const fn = sliceBetween(chat, 'function getSystemMsgCta(finishReason, item, index)', 'function onSystemMsgCta(action, item, index)')
    const retryLine = fn.split('\n').find((l) => l.includes('const retry ='))
    const contLine = fn.split('\n').find((l) => l.includes('const cont ='))
    expect(retryLine).toContain("'content_filter'")
    expect(retryLine).toContain("'refusal'")
    expect(retryLine).toContain("'error'")
    expect(retryLine).toContain("'empty_response'")
    expect(retryLine).toContain("'rewrite_below_threshold'")
    expect(retryLine).toContain("'rate_limit'")
    expect(retryLine).toContain("'server_error'")
    expect(retryLine).toContain("'network_error'")
    expect(retryLine).toContain("'compact_retryable'")
    expect(contLine).toContain("'length'")
    expect(contLine).toContain("'context_overflow'")
    expect(contLine).toContain("'pause_turn'")
  })

  it('onSystemMsgCta reuses the existing doReiteration/doContinue paths — no separate send path written', () => {
    const chat = readChat()
    const fn = sliceBetween(chat, 'function onSystemMsgCta(action, item, index)', 'function backwardStorageKey')
    expect(fn).toContain('doReiteration(index)')
    expect(fn).toContain('doContinue(item, index)')
  })

  it('the compact_retryable appendStreamStateMessage call site passes empty content — the card is the single source of the message, not a duplicated bubble text', () => {
    const chat = readChat()
    expect(chat).toContain("appendStreamStateMessage('', 'compact_retryable')")
    // compact_no_input 維持原本的純文字，不動
    expect(chat).toContain("appendStreamStateMessage(t('chat.compactNoInput'), 'compact_no_input')")
  })
})
