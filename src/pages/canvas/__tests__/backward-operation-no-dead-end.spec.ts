import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  CHAT_OPERATION_VISIBLE_OUTCOME_DEADLINE_MS,
  isChatOperationVisibleOutcomeExpired,
} from '../chat-transport-ownership'

// Product boundary under test: chat-operation-reliability SKILL.md
// "No dead end" I-1 — an accepted Backward (rollback) intent must converge,
// within bounded time, into either success or an honest, retryable error.
//
// Regression this guards: when the persisted retry attempt becomes invalid
// (backwardOperationRetryDelay(entry.attempt) returns null), the old code
// set rollbackPending.value = true and showed the "we'll keep checking" copy
// forever — the user could never Backward/Delete/Rewrite/Continue again in
// that conversation without a hard refresh, and refresh alone did not clear
// the persisted pending marker either. That is exactly the two user reports
// (komeijikoishi514 / et_0210): stuck on "回溯處理中，請稍等" with every
// mutation blocked and desktop unable to even enter the conversation.

const root = process.cwd()
const read = (rel: string) => fs.readFileSync(path.join(root, rel), 'utf8')
const readChat = () => read('src/pages/canvas/canvas.vue')

function sliceBetween(source: string, start: string, end: string): string {
  const startIndex = source.indexOf(start)
  const endIndex = source.indexOf(end, startIndex + start.length)
  expect(startIndex, `missing start marker: ${start}`).toBeGreaterThanOrEqual(0)
  expect(endIndex, `missing end marker: ${end}`).toBeGreaterThan(startIndex)
  return source.slice(startIndex, endIndex)
}

describe('Backward retry exhaustion has no dead end (desktop)', () => {
  it('routes the exhausted-retry branch through failPendingBackwardOperation, not self-cleanup', () => {
    const chat = readChat()
    const scheduleFn = sliceBetween(
      chat,
      'function schedulePendingBackwardOperation',
      'function postPendingBackwardOperation',
    )
    const exhausted = sliceBetween(
      scheduleFn,
      'if (delay == null) {',
      'if (\n    delay === BACKWARD_OPERATION_SLOW_RETRY_DELAY_MS',
    )

    // Requirement 2: exhaustion must hand off to the existing, already-correct
    // finalizer instead of re-implementing clear/toast/rollbackPending inline.
    expect(exhausted).toContain("failPendingBackwardOperation(entry, 'chat.rollbackTimedOut')")
    expect(exhausted).not.toContain('clearPendingBackwardOperation(entry)')
    expect(exhausted).not.toContain('cancelPendingBackwardRetryTimer()')

    // Requirement 1: rollbackPending must resolve to false on exhaustion, not
    // get stuck true. The exhausted branch itself must not set it true, and
    // must not contain any `rollbackPending.value = false` duplicated locally
    // either (that responsibility belongs solely to failPendingBackwardOperation).
    expect(exhausted).not.toContain('rollbackPending.value = true')
    expect(exhausted).not.toContain('rollbackPending.value = false')

    // Requirement 3: must not reuse the dishonest "we'll keep checking" copy —
    // that key promises continued confirmation attempts, but exhaustion means
    // we have already given up.
    expect(exhausted).not.toContain('chat.operationStatusUnavailable')

    const failFn = sliceBetween(
      chat,
      'function failPendingBackwardOperation',
      'function schedulePendingBackwardOperation',
    )
    expect(failFn).toContain('rollbackPending.value = false')
  })

  it('preserves the existing bounded-retry behavior for non-exhausted attempts (no regression)', () => {
    const chat = readChat()
    const scheduleFn = sliceBetween(
      chat,
      'function schedulePendingBackwardOperation',
      'function postPendingBackwardOperation',
    )

    // The slow-retry notice, persisted retry metadata bump, and setTimeout
    // re-post loop for attempts that still resolve to a real delay must be
    // untouched by this fix.
    expect(scheduleFn).toContain('BACKWARD_OPERATION_SLOW_RETRY_DELAY_MS')
    expect(scheduleFn).toContain("uni.showToast({ title: t('chat.operationStatusUnavailable'), icon: 'none' });")
    expect(scheduleFn).toContain('writePendingBackwardOperation(nextEntry)')
    expect(scheduleFn).toContain('postPendingBackwardOperation(nextEntry, legacyFallbackUsed)')
    expect(scheduleFn).toContain('entry.attempt + 1')
  })

  it('ships a non-empty chat.rollbackTimedOut string in all five locales', () => {
    for (const localeFile of ['en.json', 'zh-Hans.json', 'zh-Hant.json', 'ja.json', 'ko.json']) {
      const locale = JSON.parse(read(`src/locale/${localeFile}`))
      expect(locale['chat.rollbackTimedOut']).toEqual(expect.any(String))
      expect(locale['chat.rollbackTimedOut'].trim()).not.toBe('')
      // Must not collide with or silently alias the dishonest "still checking"
      // copy, and must not reuse "rollback failed" (we don't know if the
      // server-side rollback actually failed — we only know we stopped waiting).
      expect(locale['chat.rollbackTimedOut']).not.toBe(locale['chat.operationStatusUnavailable'])
      expect(locale['chat.rollbackTimedOut']).not.toBe(locale['chat.rollbackFailed'])
    }
  })
})

// Second-round regression: backwardOperationRetryDelay(entry.attempt) is a
// frozen contract that returns 60_000 for every legal attempt (see
// chat-operation-product-contract.spec.ts). It therefore never exhausts on
// its own — schedulePendingBackwardOperation would retry every 60s forever,
// which is exactly the komeijikoishi514 / et_0210 "回溯處理中，請稍等" dead
// end. The absolute time bound below must be decoupled from that function
// (never edited, never re-derived from attempt count) and anchored on the
// entry's createdAt instead, matching the same
// isChatOperationVisibleOutcomeExpired primitive and 5-minute deadline
// an earlier change already established for chat operation status
// polling.
describe('Backward retry has an absolute createdAt-based deadline, decoupled from backwardOperationRetryDelay (desktop)', () => {
  it('checks an absolute createdAt-based deadline before ever computing backwardOperationRetryDelay, and routes expiry through failPendingBackwardOperation', () => {
    const chat = readChat()
    const scheduleFn = sliceBetween(
      chat,
      'function schedulePendingBackwardOperation',
      'function postPendingBackwardOperation',
    )

    const expiryCallIndex = scheduleFn.indexOf('isChatOperationVisibleOutcomeExpired({')
    const delayCallIndex = scheduleFn.indexOf('backwardOperationRetryDelay(entry.attempt)')
    expect(expiryCallIndex, 'must call isChatOperationVisibleOutcomeExpired').toBeGreaterThanOrEqual(0)
    expect(delayCallIndex, 'must call backwardOperationRetryDelay').toBeGreaterThanOrEqual(0)
    // Decoupled: the deadline check happens strictly before the retry-delay
    // computation, so its outcome can never be influenced by (or need to
    // change) backwardOperationRetryDelay's frozen 60_000 return value.
    expect(expiryCallIndex).toBeLessThan(delayCallIndex)

    const deadlineCheck = sliceBetween(
      scheduleFn,
      'isChatOperationVisibleOutcomeExpired({',
      'const delay = backwardOperationRetryDelay(entry.attempt);',
    )
    // Anchored on the entry's own createdAt (requirement 2), not attempt
    // count, not updatedAt, and not a freshly re-derived timestamp.
    expect(deadlineCheck).toContain('localStartedAt: entry.createdAt')
    // Must not invent a bespoke deadline constant or duplicate arithmetic —
    // reuse the same frozen 5-minute I-1 boundary already covering chat
    // operation status polling.
    expect(deadlineCheck).not.toMatch(/5\s*\*\s*60\s*\*\s*1000/)
    expect(deadlineCheck).not.toContain('deadlineMs:')
    // On expiry, hand off to the existing finalizer with the existing
    // exhausted-retry copy — not a new inline cleanup, not the dishonest
    // "still checking" copy.
    expect(deadlineCheck).toContain("failPendingBackwardOperation(entry, 'chat.rollbackTimedOut')")
    expect(deadlineCheck).not.toContain('chat.operationStatusUnavailable')
    expect(deadlineCheck).not.toContain('rollbackPending.value = true')
    expect(deadlineCheck).not.toContain('rollbackPending.value = false')
  })

  it('preserves bounded-retry scheduling for attempts still inside the createdAt deadline (no regression)', () => {
    const chat = readChat()
    const scheduleFn = sliceBetween(
      chat,
      'function schedulePendingBackwardOperation',
      'function postPendingBackwardOperation',
    )
    // The absolute-deadline check must be a guard clause the function falls
    // through when not expired — it must not replace or reorder the existing
    // bounded-retry path (delay computation, slow-retry notice, persisted
    // metadata bump, and the next setTimeout re-post).
    expect(scheduleFn).toContain('const delay = backwardOperationRetryDelay(entry.attempt);')
    expect(scheduleFn).toContain('if (delay == null) {')
    expect(scheduleFn).toContain('BACKWARD_OPERATION_SLOW_RETRY_DELAY_MS')
    expect(scheduleFn).toContain('writePendingBackwardOperation(nextEntry)')
    expect(scheduleFn).toContain('postPendingBackwardOperation(nextEntry, legacyFallbackUsed)')
    expect(scheduleFn).toContain('entry.attempt + 1')
  })

  // Behavioral coverage of the exact primitive/call-shape production code
  // uses (localStartedAt keyed on createdAt). This is real execution, not
  // source-text matching: it proves the shared purity's safety guarantees
  // hold for the Backward entry's actual field (createdAt), independent of
  // whatever the wiring test above asserts textually.
  it('gives up once createdAt has aged past the 5 minute visible-outcome deadline', () => {
    const now = Date.now()
    const createdAt = now - CHAT_OPERATION_VISIBLE_OUTCOME_DEADLINE_MS - 1
    expect(isChatOperationVisibleOutcomeExpired({ localStartedAt: createdAt, now })).toBe(true)
  })

  it('does not give up while createdAt is still inside the deadline (no regression)', () => {
    const now = Date.now()
    const createdAt = now - (CHAT_OPERATION_VISIBLE_OUTCOME_DEADLINE_MS - 1000)
    expect(isChatOperationVisibleOutcomeExpired({ localStartedAt: createdAt, now })).toBe(false)
  })

  it('never gives up when createdAt is missing or not a finite number (stay conservative)', () => {
    const now = Date.now()
    expect(isChatOperationVisibleOutcomeExpired({ localStartedAt: undefined, now })).toBe(false)
    expect(isChatOperationVisibleOutcomeExpired({ localStartedAt: null, now })).toBe(false)
    expect(isChatOperationVisibleOutcomeExpired({ localStartedAt: Number.NaN, now })).toBe(false)
  })

  it('never gives up when createdAt points to the future (clock skew stays conservative)', () => {
    const now = Date.now()
    const createdAt = now + 60_000
    expect(isChatOperationVisibleOutcomeExpired({ localStartedAt: createdAt, now })).toBe(false)
  })
})
