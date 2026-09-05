import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

// 工單 #41-F1：重説（rewrite）/ 繼續（contine）旗標衛生（desktop）
//
// 根因跟 mobile 同構：doReiteration 只寫 rewrite 不清 contine、doContinue
// 只寫 contine 不清 rewrite；recoverPendingChatTurnBeforeAccepted（涵蓋
// sendError 提前 return）、compactFailed 分支、串流錯誤保留部分內容分支，
// 都沒有把兩個旗標重置回 false。殘留的 contine=true 會讓使用者下一次「普通
// 新句」發送被 server 誤判成「繼續上一輪」。
//
// 沿用本檔既有的「源碼切片」測試慣例（見 chat-transport-ownership.spec.ts）。
const root = process.cwd()
const readChat = () => fs.readFileSync(path.join(root, 'src/pages/canvas/canvas.vue'), 'utf8')

function sliceBetween(source: string, start: string, end: string): string {
  const startIndex = source.indexOf(start)
  const endIndex = source.indexOf(end, startIndex + start.length)
  expect(startIndex).toBeGreaterThanOrEqual(0)
  expect(endIndex).toBeGreaterThan(startIndex)
  return source.slice(startIndex, endIndex)
}

describe('回合旗標衛生（工單 #41-F1 · desktop）', () => {
  it('doReiteration（重説）進門時把 contine 清為 false，且先停掉活躍中的生成', () => {
    const chat = readChat()
    const fn = sliceBetween(chat, 'const doReiteration = (index) => {', 'function startContinueFromSource(item)')

    expect(fn).toContain('contine.value = false')
    expect(fn).toContain('rewrite.value = shouldRewriteUserTurn(userBubble)')
    expect(fn).toContain("actionBtnState.value === 'stop'")
    expect(fn).toContain('sendStop()')
  })

  it('doContinue（繼續）進門時把 rewrite 清為 false，且先停掉活躍中的生成', () => {
    const chat = readChat()
    const fn = sliceBetween(chat, 'function startContinueFromSource(item)', '// 舊的長按彈出選單')

    expect(fn).toContain('rewrite.value = false')
    expect(fn).toContain('contine.value = true')
    expect(fn).toContain("actionBtnState.value === 'stop'")
    expect(fn).toContain('sendStop()')
  })

  it('用戶新句發送入口（onActionBtnClick send 分支）雙清 rewrite/contine', () => {
    const chat = readChat()
    const fn = sliceBetween(chat, 'function onActionBtnClick()', 'function sendStop()')

    const sendBranchIndex = fn.indexOf("state === 'send'")
    const rewriteResetIndex = fn.indexOf('rewrite.value = false', sendBranchIndex)
    const contineResetIndex = fn.indexOf('contine.value = false', sendBranchIndex)
    const sendCallIndex = fn.indexOf('send()', sendBranchIndex)
    expect(sendBranchIndex).toBeGreaterThanOrEqual(0)
    expect(rewriteResetIndex).toBeGreaterThan(sendBranchIndex)
    expect(contineResetIndex).toBeGreaterThan(sendBranchIndex)
    expect(sendCallIndex).toBeGreaterThan(rewriteResetIndex)
    expect(sendCallIndex).toBeGreaterThan(contineResetIndex)
  })

  it('進入 stop 態後第一次點擊必須立即送出 Stop，不得用時間窗吞掉操作', () => {
    const chat = readChat()
    const fn = sliceBetween(chat, 'function onActionBtnClick()', 'function sendStop()')

    expect(fn).toContain('return sendStop()')
    expect(fn).not.toContain('stopEnteredAt')
    expect(fn).not.toContain('STOP_DEBOUNCE_MS')
    expect(chat).not.toContain('const STOP_DEBOUNCE_MS')
  })

  it('recoverPendingChatTurnBeforeAccepted（回合送出失敗復原，涵蓋 sendError 提前 return）重置兩個旗標', () => {
    const chat = readChat()
    const fn = sliceBetween(chat, 'function recoverPendingChatTurnBeforeAccepted(showNotice = true)', 'function markPendingChatTurnAccepted')

    expect(fn).toContain('rewrite.value = false')
    expect(fn).toContain('contine.value = false')
  })

  it('compactFailed（compact_no_input / compact_retryable）分支重置兩個旗標', () => {
    const chat = readChat()
    const fn = sliceBetween(chat, "case 'compactFailed':", "case 'waiting':")

    expect(fn).toContain('rewrite.value = false')
    expect(fn).toContain('contine.value = false')
  })

  it('串流錯誤但保留可顯示輸出的分支（不經過 sendError）重置兩個旗標', () => {
    const chat = readChat()
    // 測試語義變更（ContentModerationErrorSurfacing 施工單）：end marker 原本含
    // 緊接的 `sendError(0, errorMsg);` 呼叫，該分支現在多了 content_filter
    // 判斷註解才呼叫 sendError（第三參數見 content-filter-input-card.spec.ts），
    // end marker 縮到 else 分支開頭；start marker 跟隨「正文或思考皆算
    // 可顯示輸出」的共享判定，不影響本測試要斷言的旗標重置。
    const fn = sliceBetween(
      chat,
      'if (hasRenderableAssistantOutput(replyContent.value, thinkingContent.value)) {',
      '} else {\n          replyContent.value = "";'
    )

    expect(fn).toContain('rewrite.value = false')
    expect(fn).toContain('contine.value = false')
  })
})
