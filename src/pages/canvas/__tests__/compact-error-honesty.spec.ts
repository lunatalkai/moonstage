import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

// Source-text assertions on chat.vue's inline WebSocket switch, matching the
// established pattern in chat-transport-ownership.spec.ts: chat.vue's setup()
// isn't independently mountable, so Vuex-touching inline branches are
// verified by slicing the raw source between stable markers.
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

describe('desktop compact_retryable error honesty', () => {
  it('clears compacting state (isCompacting/compactStatus/watchdog) when an error event arrives, so the "整理中" pill disappears immediately instead of hanging until the 60s watchdog', () => {
    const chat = readChat()
    const errorCase = sliceBetween(chat, "case 'error':", "\n    }\n  });\n}")

    expect(errorCase).toContain('clearCompactWatchdog()')
    expect(errorCase).toContain("store.commit('setIsCompacting', false)")
    expect(errorCase).toContain("store.commit('setCompactStatus', '')")
  })

  it('does not touch the existing retry/resend logic while clearing compacting state', () => {
    const chat = readChat()
    const errorCase = sliceBetween(chat, "case 'error':", "\n    }\n  });\n}")

    // 只清狀態,不動重試邏輯: the pre-existing branch logic must survive untouched.
    expect(errorCase).toContain('const errorMsg = resolveChatErrorMessage(errorType, t);')
    expect(errorCase).toContain('upsertPendingAIBubble(data);')
    // 測試語義變更（ContentModerationErrorSurfacing 施工單）：舊預期
    // `sendError(0, errorMsg);`（無第三參數）→ 新預期加第三、四參數
    // finishReasonOverride，content_filter 時傳 'content_filter_input' 讓
    // sendError 改推 filtered 卡（不放重試 CTA），非 content_filter 時傳空
    // 字串維持既有純文字錯誤泡泡行為不變；第四參數保留原始產品 errorType。
    // 原因：見
    // content-filter-input-card.spec.ts。
    expect(errorCase).toMatch(
      /sendError\(\s*0,\s*errorMsg,\s*errorType === 'content_filter' \? 'content_filter_input' : '',\s*errorType,?\s*\);/,
    )
  })
})
