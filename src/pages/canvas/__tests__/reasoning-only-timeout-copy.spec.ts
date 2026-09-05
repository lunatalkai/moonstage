import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

// 工單：逾時說明義務（owner 2026-08-07 裁決）。「因為逾時而只有思考、沒有正文」
// 的那一輪，畫面上不能只顯示中性的「模型完成了思考，但沒有產生最終回覆」——
// 使用者無法分辨這是逾時還是模型自己選擇不答，於是覺得「我什麼都沒得到卻被
// 扣點」。這份規格鎖住新的 finishReason='reasoning_only_timeout' 分支：
//   - 视觉 kind 沿用既有 'model-error'（純文案改動，不新增圖示/CSS）
//   - label/sub 走新的 i18n key，且必須提到「換模型」與「稍後再試」兩個出路
//   - 舊 legacy fallback 的 retry CTA 陣列要收錄新值，才能點得到「重試」
//   - 非逾時的既有 'reasoning_only' 分支完全不動（回歸鎖）
//
// chat.vue 巨大且吃真實 uni-app runtime 無法直接 mount，沿用既有慣例
// （見 system-msg-compact-retryable.spec.ts）做 source-text slicing 驗證。
const root = process.cwd()
const readChat = () => fs.readFileSync(path.join(root, 'src/pages/canvas/canvas.vue'), 'utf8')

function sliceBetween(source: string, start: string, end: string): string {
  const startIndex = source.indexOf(start)
  const endIndex = source.indexOf(end, startIndex + start.length)
  expect(startIndex).toBeGreaterThanOrEqual(0)
  expect(endIndex).toBeGreaterThan(startIndex)
  return source.slice(startIndex, endIndex)
}

describe('desktop chat.vue · reasoning_only_timeout copy (chat-operation-reliability 說明義務)', () => {
  it('getSystemMsgKind maps the timeout variant to the existing model-error visual (no new kind/CSS)', () => {
    const chat = readChat()
    const fn = sliceBetween(chat, 'function getSystemMsgKind(finishReason)', 'function getSystemMsgLabel(finishReason)')
    expect(fn).toContain("'reasoning_only_timeout': 'model-error'")
  })

  it('getSystemMsgLabel/getSystemMsgSub use dedicated i18n keys for the timeout case, distinct from ordinary reasoning_only', () => {
    const chat = readChat()
    const labelFn = sliceBetween(chat, 'function getSystemMsgLabel(finishReason)', 'function getSystemMsgSub(finishReason)')
    expect(labelFn).toContain("'reasoning_only_timeout':")
    expect(labelFn).toContain("t('chat.noFinalAnswerTimeout')")

    const subFn = sliceBetween(chat, 'function getSystemMsgSub(finishReason)', 'function getSystemMsgCtaLabel(')
    expect(subFn).toContain("'reasoning_only_timeout':")
    expect(subFn).toContain("t('chat.retryLaterOrSwitchModel')")
  })

  it('legacy fallback CTA still resolves retry for the timeout variant (button stays clickable on old un-projected rows)', () => {
    const chat = readChat()
    const ctaActionFn = sliceBetween(chat, 'function getSystemMsgCtaAction(finishReason, item, index)', 'function exactTimelineRowIndex(')
    const retryArrayLine = ctaActionFn.split('\n').find(line => line.includes("const retry = ["))
    expect(retryArrayLine).toBeTruthy()
    expect(retryArrayLine as string).toContain("'reasoning_only_timeout'")
  })

  it('does not touch the existing non-timeout reasoning_only copy (regression lock)', () => {
    const chat = readChat()
    const labelFn = sliceBetween(chat, 'function getSystemMsgLabel(finishReason)', 'function getSystemMsgSub(finishReason)')
    expect(labelFn).toContain("t('chat.noFinalAnswer')")
    const subFn = sliceBetween(chat, 'function getSystemMsgSub(finishReason)', 'function getSystemMsgCtaLabel(')
    expect(subFn).toContain("t('chat.retryOrSwitchModel')")
  })
})
