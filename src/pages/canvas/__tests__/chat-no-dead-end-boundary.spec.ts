import { describe, expect, it } from 'vitest'
import { resolveChatActionButtonState } from '../chat-operation-ui-state'

// 產品邊界 I-2：停止永遠可用
//
// 對話可靠性規範
//       「No dead end：不得卡死的產品邊界」
//
//   I-2  使用者主動「停止」在任何時刻都必須可按、可送達、可生效。
//        停止是逃生口，不得被任何「進行中」狀態擋住。
//
// 用「有 operation 在進行中」當理由擋掉「停止」，等於把唯一的逃生口用它要逃的
// 那個東西鎖上。停止的存在目的就是終結進行中的 operation，所以「進行中」永遠
// 不能是拒絕停止的理由。
//
// 2026-07-30 實際事故：使用者回報「問題是取消不了、暫停不了、也回溯不了」。
// resolveChatActionButtonState 有兩條死路：
//
//   ① userStopRequested && isStreamActive → 'send-disabled'
//      按過一次停止之後，若串流其實沒停（operation 在伺服器端成了孤兒），
//      按鈕永遠停在 disabled——按了沒用，然後再也按不了。
//
//   ② isStreamActive 但沒有 streamId → 'compacting'（在 UI 上是 disabled，
//      提示還寫「整理記憶中，無法中斷」）。它根本不在整理記憶，標籤是錯的。
//      而 tryResumeOnMount 從沒有 TTL 的 localStorage entry 恢復時就會設
//      isStreamActive=true 且無 streamId，所以每次掛載都落進這條，
//      按鈕永久 disabled。
//
// 停止是冪等 request（見 SKILL.md「User Stop 特例」），所以重複按是安全的，
// 讓它保持可按不會產生副作用。

describe('產品邊界 I-2：停止永遠可用（no dead end）', () => {
  it('串流仍在進行時，即使沒有 streamId，也必須給得出停止', () => {
    // 事故形態：resume 自持久化 entry，isStreamActive 被重新武裝但沒有 streamId。
    expect(resolveChatActionButtonState({
      isStreamActive: true,
      streamId: '',
      content: '',
    })).toBe('stop')
  })

  it('已經按過停止但串流還沒停時，必須仍然給得出停止（不得變成 disabled）', () => {
    // 事故形態：使用者按了停止、伺服器端 operation 是孤兒、確認永遠不會回來。
    expect(resolveChatActionButtonState({
      userStopRequested: true,
      isStreamActive: true,
      streamId: 'stream-1',
      content: '',
    })).toBe('stop')
  })

  it('已按停止且沒有 streamId（最壞組合）仍必須給得出停止', () => {
    expect(resolveChatActionButtonState({
      userStopRequested: true,
      isStreamActive: true,
      streamId: '',
      content: '',
    })).toBe('stop')
  })

  // 以下三條是回歸護欄：修 I-2 不得把正常狀態弄壞。
  it('沒有任何進行中狀態時，有草稿就是送出', () => {
    expect(resolveChatActionButtonState({ content: 'draft' })).toBe('send')
  })

  it('沒有任何進行中狀態且沒有草稿時，送出鍵維持不可用', () => {
    expect(resolveChatActionButtonState({ content: '   ' })).toBe('send-disabled')
  })

  it('真正只在整理記憶、沒有進行中串流時，才顯示整理記憶', () => {
    expect(resolveChatActionButtonState({
      isCompacting: true,
      isStreamActive: false,
      content: '',
    })).toBe('compacting')
  })
})
