import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  CHAT_OPERATION_VISIBLE_OUTCOME_DEADLINE_MS,
  decideStreamResume,
} from '../chat-transport-ownership'

// I-1（No dead end，對話可靠性規範）：
// 這份測試鎖定第三個同型死路——`byClientOperationId` resume 路徑（送出後還沒
// 拿到伺服器 operationId 就失敗：網路斷、伺服器重啟、pre-admission 失敗）。
// `decideStreamResume` 的 `byClientOperationId` 分支過去完全跳過年齡上界，
// 接手後的 `schedulePendingOperationIdentityReconciliation` 又只會在快輪詢
// 耗盡後轉慢輪詢（`scheduleSlow`，60 秒一輪），沒有任何上界——兩者疊加就是
// 永遠卡住。這份測試鎖定兩處都必須誠實放手。

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

function byClientOperationIdEntry(pendingSince: number) {
  return {
    version: 2,
    accepted: false,
    pendingSince,
    updatedAt: pendingSince,
    pendingPayload: {
      conversationId: 'conv-1',
      accountId: 'acc-1',
      message: 'hello',
      supportsOperationOutcome: true,
      clientOperationId: 'client-never-admitted',
    },
  }
}

describe('decideStreamResume byClientOperationId age boundary', () => {
  it('marks a pendingSince older than the 5-minute visible-outcome deadline as expired', () => {
    const now = Date.now()
    const sixMinutesAgo = now - 6 * 60 * 1000
    const decision = decideStreamResume(byClientOperationIdEntry(sixMinutesAgo), now, {
      pendingTtlMs: 20 * 1000,
    })
    expect(decision.kind).toBe('byClientOperationId')
    expect(decision.expired).toBe(true)
  })

  it('does not mark a fresh pendingSince as expired (non-regression: existing resume behavior stays intact)', () => {
    const now = Date.now()
    const justPastPendingTtl = now - 25 * 1000
    const decision = decideStreamResume(byClientOperationIdEntry(justPastPendingTtl), now, {
      pendingTtlMs: 20 * 1000,
    })
    expect(decision.kind).toBe('byClientOperationId')
    expect(decision.expired).toBe(false)
  })

  it('treats exactly-at-deadline as not expired and one tick past as expired', () => {
    const now = 1_000_000
    const atDeadline = now - CHAT_OPERATION_VISIBLE_OUTCOME_DEADLINE_MS
    expect(decideStreamResume(byClientOperationIdEntry(atDeadline), now, {
      pendingTtlMs: 20 * 1000,
    }).expired).toBe(false)
    expect(decideStreamResume(byClientOperationIdEntry(atDeadline - 1), now, {
      pendingTtlMs: 20 * 1000,
    }).expired).toBe(true)
  })

  it('stays conservative (does not give up) when pendingSince is missing, non-finite, or in the future', () => {
    const now = Date.now()

    const missing = decideStreamResume({
      version: 2,
      accepted: false,
      updatedAt: now,
      pendingPayload: {
        conversationId: 'conv-1',
        accountId: 'acc-1',
        message: 'hello',
        supportsOperationOutcome: true,
        clientOperationId: 'client-never-admitted',
      },
    }, now, { pendingTtlMs: 20 * 1000 })
    expect(missing.kind).toBe('byClientOperationId')
    expect(missing.expired).toBe(false)

    const nonFinite = decideStreamResume({
      ...byClientOperationIdEntry(Number.NaN),
    }, now, { pendingTtlMs: 20 * 1000 })
    expect(nonFinite.kind).toBe('byClientOperationId')
    expect(nonFinite.expired).toBe(false)

    const future = decideStreamResume(byClientOperationIdEntry(now + 60 * 1000), now, {
      pendingTtlMs: 20 * 1000,
    })
    expect(future.kind).toBe('byClientOperationId')
    expect(future.expired).toBe(false)
  })
})

describe('desktop chat.vue gates byClientOperationId resume on pending.expired', () => {
  it('does not set isStreamActive, pushPlaceholder, or pendingResendPayload when the resumed candidate is expired', () => {
    const chat = readChat()
    const branch = sliceBetween(
      chat,
      "} else if (pending.kind === 'byClientOperationId') {",
      "} else if (pending.kind === 'byOperationId') {",
    )
    const expiredIndex = branch.indexOf('pending.expired === true')
    expect(expiredIndex).toBeGreaterThanOrEqual(0)

    const releaseCallIndex = branch.indexOf('releaseExpiredChatOperationOwnership(null, \'mount\')')
    expect(releaseCallIndex).toBeGreaterThan(expiredIndex)

    // The expired branch is the first `return;` inside this else-if — slice it
    // out and prove the dead-end guards never run inside it.
    const expiredBranchEnd = branch.indexOf('return;', expiredIndex) + 'return;'.length
    const expiredBranch = branch.slice(expiredIndex, expiredBranchEnd)
    expect(expiredBranch).not.toContain('isStreamActive.value = true')
    expect(expiredBranch).not.toContain('pushPlaceholder()')
    expect(expiredBranch).not.toContain('pendingResendPayload.value = {')
    expect(expiredBranch).toContain('releaseExpiredChatOperationOwnership(null, \'mount\')')

    // Non-regression: the ordinary (non-expired) path directly below must
    // still do all three — the fix must be additive, not a behavior removal.
    const ordinaryBranch = branch.slice(expiredBranchEnd)
    expect(ordinaryBranch).toContain('isStreamActive.value = true')
    expect(ordinaryBranch).toContain('pendingResendPayload.value = {')
    expect(ordinaryBranch).toContain('pushPlaceholder()')
  })
})

describe('desktop chat.vue caps schedulePendingOperationIdentityReconciliation with the I-1 deadline', () => {
  it('checks isChatOperationVisibleOutcomeExpired before scheduling another poll, and releases when expired', () => {
    const chat = readChat()
    const fn = sliceBetween(
      chat,
      'function schedulePendingOperationIdentityReconciliation(',
      'function requestAuthoritativeOperationReconciliation(',
    )
    expect(fn).toContain('isChatOperationVisibleOutcomeExpired(')
    expect(fn).toContain('releaseExpiredChatOperationOwnership(null, reason)')
    expect(fn).toContain('localStartedAt: pending.startedAt')

    // The deadline check must happen before the scheduler is armed again —
    // otherwise a fast poll always wins the race and the deadline never bites.
    const deadlineIndex = fn.indexOf('isChatOperationVisibleOutcomeExpired(')
    const scheduleIndex = fn.indexOf('operationStatusPollScheduler.schedule(')
    expect(deadlineIndex).toBeGreaterThanOrEqual(0)
    expect(scheduleIndex).toBeGreaterThan(deadlineIndex)
  })
})
