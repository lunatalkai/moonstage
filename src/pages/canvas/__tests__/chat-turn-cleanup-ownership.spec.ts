import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

// 回合結束清理的所有權（desktop）
//
// 根因：server 在終結 `operationStatus` 事件**之後**才寫 `answer [DONE]`
// （settle → emit 在伺服器結算邏輯；
// [DONE] 見 character_router.go:9979 / :14064 / :14492，每個 provider 都是
// settle 先、[DONE] 後）。而 desktop 收到終結事件就走
// refreshHistoryAfterAuthoritativeOperation，它在收尾時呼叫
// bumpConversationGeneration()，於是 isOwnedSocketCallback（chat.vue:6061）
// 的 generation 閘立刻失效，**同一批 parse 出來的 [DONE] 被靜默丟棄**。
//
// 問題在於 [DONE] 分支（chat-sse-dispatch.ts:433-441）是「回合結束清理」的
// 唯一擁有者。它被 fence 掉之後，每一個 capable desktop 成功回合都留下未清理
// 的 streaming 狀態——這不是偶發競賽，是必然。
//
// 使用者可見後果（2026-07-30 多人回報）：
//   「思考鏈會看到上一回合的內容」「輸入新訊息前先回溯就沒看到」
// 回溯之所以能救，是因為 teardownStreamForConversationSwitch（chat.vue:1711-1712）
// 是唯一會清 thinkingContent 的使用者可觸發路徑。
//
// 沿用本目錄既有的「源碼切片」測試慣例（見 chat-turn-flag-hygiene.spec.ts）。
const root = process.cwd()
const readChat = () => fs.readFileSync(path.join(root, 'src/pages/canvas/canvas.vue'), 'utf8')

function sliceBetween(source: string, start: string, end: string): string {
  const startIndex = source.indexOf(start)
  const endIndex = source.indexOf(end, startIndex + start.length)
  expect(startIndex).toBeGreaterThanOrEqual(0)
  expect(endIndex).toBeGreaterThan(startIndex)
  return source.slice(startIndex, endIndex)
}

describe('回合結束清理的所有權（desktop）', () => {
  // FIX-D1：send() 進門時 replyContent 有清、thinkingContent 沒清。
  // mobile 同一位置兩個都清（mobile/src/pages/canvas/canvas.vue:9220-9221），
  // 這個不對稱正是「只有電腦網頁看到思考鏈污染」的原因。
  it('send() 進門時把 thinkingContent 一併清空（與 replyContent 對稱、與 mobile 對齊）', () => {
    const fn = sliceBetween(readChat(), 'function send() {', 'function sendWebSocketMessage(data) {')

    expect(fn).toContain('replyContent.value = ""')
    expect(fn).toContain('thinkingContent.value = ""')
  })

  // FIX-D2：權威終結路徑必須接手 [DONE] 原本負責的回合清理。
  // 只複製幂等的賦空值；不複製 playSound / checkQuotaExhaustion /
  // triggerReadinessFetch，因為 legacy lane 仍會收到 [DONE]，那些有真副作用
  // 會被重複觸發。
  it('refreshHistoryAfterAuthoritativeOperation 接手 [DONE] 的回合狀態重置', () => {
    const fn = sliceBetween(
      readChat(),
      'function refreshHistoryAfterAuthoritativeOperation(status: any) {',
      'function handleOperationStatusEvent(input: any) {',
    )

    expect(fn).toContain("lastFinishReason.value = ''")
    expect(fn).toContain("tempContent.value = ''")
    expect(fn).toContain("replyContent.value = ''")
    expect(fn).toContain("thinkingContent.value = ''")
    expect(fn).toContain('pendingMessageMeta.value = null')
    expect(fn).toContain('clearStreamCache(')
  })

  // 反向鎖：這條路徑不得複製 [DONE] 的有副作用呼叫。
  // legacy lane（未送 supportsOperationOutcome 的客戶端）仍走 [DONE]，
  // 兩邊都做會讓語音播兩次、額度提示彈兩次、readiness 拉兩次。
  it('權威終結路徑不得複製 [DONE] 的有副作用呼叫（避免 legacy lane 重複觸發）', () => {
    const fn = sliceBetween(
      readChat(),
      'function refreshHistoryAfterAuthoritativeOperation(status: any) {',
      'function handleOperationStatusEvent(input: any) {',
    )

    expect(fn).not.toContain('playSound(')
    expect(fn).not.toContain('checkQuotaExhaustion(')
    expect(fn).not.toContain('triggerReadinessFetch(')
  })
})
