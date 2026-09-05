import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

// 施工單：內容審查拒絕精準分揀與用戶提示（ContentModerationErrorSurfacing）
// 設計文件：內容審查錯誤呈現設計
//
// 收到 SSE/WS error 事件 error_type='content_filter'（輸入端內容審查，S1-S3
// 阿里/Kimi/Grok 簽名分揀命中）時，前端必須渲染跟既有輸出端過濾（Claude 系
// finishReason='content_filter'）同一張 <chat-system-message kind='filtered'>
// 卡片視覺，但**不放重試 CTA**（原樣重發必再撞，重試無意義）。兩通道用不同
// finishReason 值區隔 CTA 語義：既有 'content_filter'（輸出端，保留重試）vs
// 新的 'content_filter_input'（輸入端，無 CTA）。
//
// chat.vue 的 setup() 巨大且吃真實 uni-app runtime，無法直接 mount（既有慣例
// 見 compact-error-honesty.spec.ts 開頭註解），沿用 source-text slicing 驗證。
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

describe('desktop chat.vue · content_filter_input drives the filtered card without a retry CTA', () => {
  it('getSystemMsgKind maps content_filter_input to the same "filtered" kind as the existing output-side channel', () => {
    const chat = readChat()
    const fn = sliceBetween(chat, 'function getSystemMsgKind(finishReason)', 'function getSystemMsgLabel(finishReason)')
    expect(fn).toContain("'content_filter_input': 'filtered'")
  })

  it('getSystemMsgLabel reuses the existing systemMsg.filtered headline (no invented copy)', () => {
    const chat = readChat()
    const fn = sliceBetween(chat, 'function getSystemMsgLabel(finishReason)', 'function getSystemMsgSub(finishReason)')
    const line = fn.split('\n').find((l) => l.includes("'content_filter_input':"))
    expect(line).toBeTruthy()
    expect(line).toContain("t('systemMsg.filtered')")
  })

  it('getSystemMsgSub uses the dedicated actionable copy key (error.contentFilter), distinct from the generic filteredSub', () => {
    const chat = readChat()
    const fn = sliceBetween(chat, 'function getSystemMsgSub(finishReason)', 'function getSystemMsgCta(finishReason, item, index)')
    const line = fn.split('\n').find((l) => l.includes("'content_filter_input':"))
    expect(line).toBeTruthy()
    expect(line).toContain("t('error.contentFilter')")
  })

  it('getSystemMsgCta does NOT classify content_filter_input as retry or continue — no CTA renders (E1: deterministic input-side rejection, retry would repeat the same failure)', () => {
    const chat = readChat()
    const fn = sliceBetween(chat, 'function getSystemMsgCta(finishReason, item, index)', 'function onSystemMsgCta(action, item, index)')
    const retryLine = fn.split('\n').find((l) => l.includes('const retry ='))
    const contLine = fn.split('\n').find((l) => l.includes('const cont ='))
    expect(retryLine).not.toContain('content_filter_input')
    expect(contLine).not.toContain('content_filter_input')
    // Regression: the existing output-side channel must keep its retry CTA untouched.
    expect(retryLine).toContain("'content_filter'")
  })

  it('sendError accepts a finishReasonOverride param and pushes an empty-content, finishReason-tagged bubble instead of a plain-text error bubble when set', () => {
    const chat = readChat()
    const fn = sliceBetween(chat, 'const sendError = (retryLimit, errMsg, finishReasonOverride', '\n\n// 更新 / 補 AI 進行中氣泡')
    expect(fn).toContain('finishReasonOverride')
    expect(fn).toContain('finishReason: finishReasonOverride,')
    // Error completion is now one identity-owned synchronous outcome. A delayed
    // second swap could remove a newer turn after the user has already continued.
    const pushSites = fn.split('finishReasonOverride ? {').length - 1
    expect(pushSites).toBe(1)
    expect(fn).toContain('talkList.value.push(errorBubble)')
    expect(fn).toContain('removeOwnedTurnBubbles(talkList.value, failedPendingTurn)')
    expect(fn).not.toContain('talkList.value.pop()')
    expect(fn).not.toContain('setTimeout(')
  })

  it('the error event handler routes error_type="content_filter" to sendError with finishReasonOverride, only in the empty-replyContent branch (the partial-content branch stays untouched)', () => {
    const chat = readChat()
    const errorCase = sliceBetween(chat, "case 'error':", "\n    }\n  });\n}")
    expect(errorCase).toMatch(
      /sendError\(\s*0,\s*errorMsg,\s*errorType === 'content_filter' \? 'content_filter_input' : '',\s*errorType,?\s*\);/,
    )
    // Partial output remains visible, but now keeps the same typed product
    // classification instead of inventing a generic error.
    expect(errorCase).toContain('resolveChatErrorPresentation(errorType, t).finishReason')
    expect(errorCase).toContain('upsertPendingAIBubble(data);')
  })
})
