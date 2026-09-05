import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

// 有可見輸出時，不准說「暫時無法確認這次操作的結果」。
//
// 2026-08-01 使用者回報：模型那邊出錯（紅字）的情境下跳出這個提示，但**對話內容其實
// 有正常跑出來**。這是我自己前一天加的提示造成的誤判。
//
// 機制：announceOutcomeUnconfirmed 先試著把佔位氣泡轉成系統訊息；
// markPendingOutcomeUnconfirmed 在「最後一則已經有可見輸出」時正確地拒絕轉換並回 false，
// 但呼叫端把 false 一律當成「沒有氣泡可轉」，於是退回去彈 toast——**內容明明就在畫面上**。
//
// 產品邊界（chat-operation-reliability）：使用者可見的成功是「已顯示的 body／thinking
// 可以被重建」。durable 可見輸出存在時，這次 operation 的結果就不是「無法確認」，
// 不能對使用者宣告相反的事。
// Apple HIG：不要用警示訊息單純傳達資訊；更不要在事情其實成功時報告失敗。
describe('announceOutcomeUnconfirmed 不得在已有可見輸出時宣告無法確認', () => {
  const source = readFileSync(
    resolve(__dirname, '../pages/canvas/canvas.vue'),
    'utf8',
  )

  const announce = (() => {
    const start = source.indexOf('function announceOutcomeUnconfirmed(')
    expect(start).toBeGreaterThanOrEqual(0)
    const end = source.indexOf('\nfunction ', start + 1)
    expect(end).toBeGreaterThan(start)
    return source.slice(start, end)
  })()

  it('退回 toast 之前必須先確認畫面上沒有可見輸出', () => {
    // 轉換失敗有兩種成因，不能混為一談：
    //   (a) 根本沒有佔位氣泡（例如劇情回溯不產生 AI 氣泡）→ 才該退回 toast
    //   (b) 已經有可見輸出 → 應該什麼都不說
    expect(announce).toContain('hasRenderableAssistantOutput')
  })

  it('沒有可見輸出的情況仍要保留提示，不能整條靜音', () => {
    expect(announce).toContain('message.warning')
  })
})
