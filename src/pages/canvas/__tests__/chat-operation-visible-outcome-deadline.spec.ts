import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  CHAT_OPERATION_VISIBLE_OUTCOME_DEADLINE_MS,
  decideStreamResume,
  isChatOperationVisibleOutcomeExpired,
} from '../chat-transport-ownership'

// I-1（No dead end，對話可靠性規範）：
// 任何被接受的使用者意圖必須在有界時間內（預設 5 分鐘）收斂成使用者可見的
// 結果。這份測試鎖定「已過界仍非 terminal 時必須誠實放手」這條產品邊界，而
// 不是任何一次特定實作。

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

describe('isChatOperationVisibleOutcomeExpired', () => {
  it('prefers the server acceptedAt over a local startedAt when both are present', () => {
    const now = 10 * 60 * 1000
    // Local startedAt claims the turn just began (not expired), but the
    // server's acceptedAt says it has been six minutes — server time wins.
    expect(isChatOperationVisibleOutcomeExpired({
      acceptedAt: now - 6 * 60 * 1000,
      localStartedAt: now - 1000,
      now,
    })).toBe(true)

    // Inverse: local startedAt claims six minutes ago, but the server's
    // acceptedAt says it only just began — server time still wins.
    expect(isChatOperationVisibleOutcomeExpired({
      acceptedAt: now - 1000,
      localStartedAt: now - 6 * 60 * 1000,
      now,
    })).toBe(false)
  })

  it('falls back to localStartedAt only when acceptedAt is absent', () => {
    const now = 10 * 60 * 1000
    expect(isChatOperationVisibleOutcomeExpired({
      localStartedAt: now - 6 * 60 * 1000,
      now,
    })).toBe(true)
    expect(isChatOperationVisibleOutcomeExpired({
      localStartedAt: now - 1000,
      now,
    })).toBe(false)
  })

  it('stays conservative (false) when neither a server nor a local baseline is available', () => {
    expect(isChatOperationVisibleOutcomeExpired({ now: Date.now() })).toBe(false)
    expect(isChatOperationVisibleOutcomeExpired({
      acceptedAt: null,
      localStartedAt: null,
      now: Date.now(),
    })).toBe(false)
    expect(isChatOperationVisibleOutcomeExpired({
      acceptedAt: undefined,
      localStartedAt: undefined,
      now: Date.now(),
    })).toBe(false)
  })

  it('stays conservative (false) when the resolved baseline is in the future (clock skew)', () => {
    const now = Date.now()
    expect(isChatOperationVisibleOutcomeExpired({
      acceptedAt: now + 60 * 1000,
      now,
    })).toBe(false)
    expect(isChatOperationVisibleOutcomeExpired({
      localStartedAt: now + 60 * 1000,
      now,
    })).toBe(false)
  })

  it('treats exactly-at-deadline as not expired and one tick past as expired', () => {
    const now = 1_000_000
    const localStartedAt = now - CHAT_OPERATION_VISIBLE_OUTCOME_DEADLINE_MS
    expect(isChatOperationVisibleOutcomeExpired({ localStartedAt, now })).toBe(false)
    expect(isChatOperationVisibleOutcomeExpired({ localStartedAt: localStartedAt - 1, now })).toBe(true)
  })

  it('parses an ISO acceptedAt string the same way a numeric timestamp would be parsed', () => {
    const now = new Date('2026-01-01T00:10:00.000Z').getTime()
    expect(isChatOperationVisibleOutcomeExpired({
      acceptedAt: '2026-01-01T00:00:00.000Z',
      now,
    })).toBe(true)
    expect(isChatOperationVisibleOutcomeExpired({
      acceptedAt: '2026-01-01T00:09:00.000Z',
      now,
    })).toBe(false)
  })
})

describe('decideStreamResume byOperationId age boundary', () => {
  const operationId = 'op-old-40-days'

  it('marks a 40-day-old byOperationId entry as expired', () => {
    const now = Date.now()
    const fortyDaysAgo = now - 40 * 24 * 60 * 60 * 1000
    const decision = decideStreamResume(
      {
        version: 2,
        accepted: false,
        operationId,
        operationState: 'generating',
        updatedAt: fortyDaysAgo,
      },
      now,
    )
    expect(decision.kind).toBe('byOperationId')
    expect(decision.expired).toBe(true)
  })

  it('does not mark a fresh byOperationId entry as expired', () => {
    const now = Date.now()
    const justNow = now - 5 * 1000
    const decision = decideStreamResume(
      {
        version: 2,
        accepted: false,
        operationId,
        operationState: 'generating',
        updatedAt: justNow,
      },
      now,
    )
    expect(decision.kind).toBe('byOperationId')
    expect(decision.expired).toBe(false)
  })

  it('also marks an accepted+streamId entry that aged past the stream TTL and the visible-outcome deadline', () => {
    const now = Date.now()
    const fortyDaysAgo = now - 40 * 24 * 60 * 60 * 1000
    const decision = decideStreamResume(
      {
        version: 2,
        accepted: true,
        streamId: 'stream-old',
        operationId,
        operationState: 'generating',
        updatedAt: fortyDaysAgo,
      },
      now,
      { streamTtlMs: 10 * 60 * 1000 },
    )
    expect(decision.kind).toBe('byOperationId')
    expect(decision.expired).toBe(true)
  })
})

describe('desktop chat.vue wires the I-1 visible-outcome deadline', () => {
  it('checks the deadline in requestAuthoritativeOperationReconciliation before scheduling another poll', () => {
    const chat = readChat()
    const reconciliation = sliceBetween(
      chat,
      'function requestAuthoritativeOperationReconciliation',
      'function requestPendingOperationReconciliation',
    )
    expect(reconciliation).toContain('isChatOperationVisibleOutcomeExpired(')
    expect(reconciliation).toContain('releaseExpiredChatOperationOwnership(recorded, reason)')
    // The terminal check must still come first: a durable terminal result
    // must never be discarded as if it were merely "too old to wait for".
    // (There are now multiple isChatOperationVisibleOutcomeExpired( call
    // sites — director follow-up added deadline checks on every give-up
    // branch — so this specifically locates the confirmed-non-terminal one
    // that follows the terminal check, not just the first occurrence.)
    const terminalCheckIndex = reconciliation.indexOf('isChatOperationTerminal(recorded)')
    expect(terminalCheckIndex).toBeGreaterThanOrEqual(0)
    expect(terminalCheckIndex).toBeLessThan(
      reconciliation.indexOf('isChatOperationVisibleOutcomeExpired(', terminalCheckIndex),
    )
  })

  it('places releaseExpiredChatOperationOwnership after scheduleOperationStatusReconciliation, never inside the frozen recovery slice', () => {
    const chat = readChat()
    expect(
      chat.indexOf('function releaseExpiredChatOperationOwnership'),
    ).toBeGreaterThan(
      chat.indexOf('function scheduleOperationStatusReconciliation'),
    )
    // The frozen contract in chat-operation-product-contract.spec.ts asserts
    // this slice must not contain any release-ownership semantics. Guard the
    // same invariant here so an accidental relocation fails fast in this file
    // too, with a message that points at the actual boundary rule.
    const recovery = sliceBetween(
      chat,
      'function recoverOperationStatusPollingExhausted',
      'function scheduleOperationStatusReconciliation',
    )
    expect(recovery).not.toContain('releaseExpiredChatOperationOwnership')
  })

  it('defines releaseExpiredChatOperationOwnership so it re-fetches history and fences stale reads', () => {
    const chat = readChat()
    const release = sliceBetween(
      chat,
      'function releaseExpiredChatOperationOwnership',
      'function schedulePendingOperationIdentityReconciliation',
    )
    expect(release).toContain('bumpConversationGeneration()')
    expect(release).toContain('getHistoryMsg()')
    expect(release).toContain('operationStatusPollScheduler.cancel()')
    expect(release).toContain('pendingChatTurn = null')
    expect(release).toContain('pendingResendPayload.value = null')
    expect(release).toContain('clearStreamState()')
    expect(release).toContain('closeWebSocket()')
    expect(release).toContain("t('chat.operationTimedOut')")
  })

  it('gates the resumed byOperationId placeholder push and stream-active flag on pending.expired', () => {
    const chat = readChat()
    const resume = sliceBetween(chat, "} else if (pending.kind === 'byOperationId') {", 'cancelRewrite')
    expect(resume).toContain('pending.expired === true')
    expect(resume).toContain('requestAuthoritativeOperationReconciliation(\'mount\')')
  })

  // director follow-up：實務上一筆很舊的殘留紀錄，伺服器多半已經不認得那個
  // operationId 了——真實世界最常走的是查無此 operation／讀取失敗，而不是
  // 「讀到未完成狀態」。過界檢查只掛在「成功讀回且非 terminal」那一條分支不夠：
  // 每一處「無法確認結果、準備重新排程」的分支都要先過同一個界，否則一筆
  // 404/身分不符/查詢失敗的殘留紀錄會被每 60 秒重查一次、永遠查到永遠。
  it('also checks the deadline on every other give-up-and-reschedule branch, not only the confirmed non-terminal read', () => {
    const chat = readChat()
    const reconciliation = sliceBetween(
      chat,
      'function requestAuthoritativeOperationReconciliation',
      'function requestPendingOperationReconciliation',
    )
    // 5 處：identity 不符、conversationId 不符、recordAuthoritative 失敗、
    // 確認非 terminal、以及 .catch() 讀取失敗——全部都要過界。
    expect(reconciliation.split('isChatOperationVisibleOutcomeExpired(').length - 1).toBe(5)
    expect(reconciliation.split('releaseExpiredChatOperationOwnership(').length - 1).toBe(5)

    const identityMismatch = sliceBetween(
      chat,
      'if (!status || status.operationId !== operationId) {',
      'if (status.conversationId && status.conversationId !== capturedConversationId) {',
    )
    expect(identityMismatch).toContain('isChatOperationVisibleOutcomeExpired(')
    expect(identityMismatch).toContain('releaseExpiredChatOperationOwnership(null, reason)')
    expect(
      identityMismatch.indexOf('isChatOperationVisibleOutcomeExpired('),
    ).toBeLessThan(identityMismatch.indexOf('scheduleOperationStatusReconciliation(reason, operationId)'))

    const conversationMismatch = sliceBetween(
      chat,
      'if (status.conversationId && status.conversationId !== capturedConversationId) {',
      'const recorded = recordAuthoritativeOperationStatus(status);',
    )
    expect(conversationMismatch).toContain('isChatOperationVisibleOutcomeExpired(')
    expect(conversationMismatch).toContain('releaseExpiredChatOperationOwnership(null, reason)')

    const recordFailed = sliceBetween(
      chat,
      'const recorded = recordAuthoritativeOperationStatus(status);',
      'if (isChatOperationTerminal(recorded)) {',
    )
    expect(recordFailed).toContain('isChatOperationVisibleOutcomeExpired(')
    expect(recordFailed).toContain('releaseExpiredChatOperationOwnership(null, reason)')

    // `}).catch((error: any) => {` is not unique across the file (Backward's
    // operation request has its own catch), so the catch block is carved out
    // of the already-scoped `reconciliation` slice instead of the raw file —
    // otherwise this would silently grab an unrelated, much larger range.
    const catchStartInReconciliation = reconciliation.indexOf('}).catch((error: any) => {')
    expect(catchStartInReconciliation).toBeGreaterThanOrEqual(0)
    const catchBlock = reconciliation.slice(catchStartInReconciliation)
    expect(catchBlock).toContain('isChatOperationVisibleOutcomeExpired(')
    expect(catchBlock).toContain('releaseExpiredChatOperationOwnership(null, reason)')
    // 沒有 recorded.acceptedAt 可用的分支只能用本機 startedAt 當退路——不可
    // 憑空捏造一個 acceptedAt。
    expect(identityMismatch).not.toContain('acceptedAt:')
    expect(conversationMismatch).not.toContain('acceptedAt:')
    expect(recordFailed).not.toContain('acceptedAt:')
    expect(catchBlock).not.toContain('acceptedAt:')
  })

  // 死碼修正：operationTimedOutNoticeKey 的去重判斷若在 clearStreamState()
  // 之後才讀，會被同一次呼叫裡的 clearStreamState() 自己先清空，去重永遠失效。
  it('decides the operationTimedOutNoticeKey dedup before clearStreamState() runs, so the guard is not neutralized by its own cleanup', () => {
    const chat = readChat()
    const release = sliceBetween(
      chat,
      'function releaseExpiredChatOperationOwnership',
      'function schedulePendingOperationIdentityReconciliation',
    )
    const dedupDecisionIndex = release.indexOf('operationTimedOutNoticeKey !== (operationId || reason)')
    const clearStreamCallIndex = release.indexOf('clearStreamState();')
    expect(dedupDecisionIndex).toBeGreaterThanOrEqual(0)
    expect(clearStreamCallIndex).toBeGreaterThan(0)
    expect(dedupDecisionIndex).toBeLessThan(clearStreamCallIndex)

    // clearStreamState() 本身不得再重置這個旗標，否則不管判斷點擺在哪都沒用。
    const clearStream = sliceBetween(
      chat,
      'function clearStreamState(',
      'function bumpConversationGeneration',
    )
    expect(clearStream).not.toContain('operationTimedOutNoticeKey = ')
  })
})

describe('chat.operationTimedOut i18n', () => {
  it('exists and is non-empty in all five locales', () => {
    for (const localeFile of ['en.json', 'zh-Hans.json', 'zh-Hant.json', 'ja.json', 'ko.json']) {
      const locale = JSON.parse(read(`src/locale/${localeFile}`))
      expect(locale['chat.operationTimedOut']).toEqual(expect.any(String))
      expect(locale['chat.operationTimedOut'].trim()).not.toBe('')
    }
  })
})
