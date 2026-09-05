import { describe, it, expect } from 'vitest'
import {
  resolveCompactWatchdogAction,
  CHAT_OPERATION_LIVE_STATUS_TRUST_MS,
} from '../chat-transport-ownership'

// 壓縮期間操作停在 accepted，而 accepted 正是「後端還在做」的狀態之一。
//
// 原本的 watchdog 到期就自己把 isCompacting 清掉、把送出鍵放開——那是前端替後端
// 宣告「壓縮結束了」。壓縮是 fail-closed 的：後端沒壓完，使用者送出的下一則訊息
// 只會撞上同一份還沒完成的狀態。權威只能有一份，而它在後端。
describe('壓縮 watchdog 的權威在後端', () => {
  const now = 1_700_000_000_000

  it('後端說還在準備（accepted）→ 繼續等，不放手', () => {
    expect(resolveCompactWatchdogAction({
      state: 'accepted',
      observedAt: now - 1000,
      now,
    })).toBe('keep-waiting')
  })

  it('後端說還在生成 → 繼續等', () => {
    expect(resolveCompactWatchdogAction({
      state: 'generating',
      observedAt: now - 1000,
      now,
    })).toBe('keep-waiting')
  })

  it('後端說已經是終態 → 放手', () => {
    expect(resolveCompactWatchdogAction({
      state: 'completed',
      observedAt: now - 1000,
      now,
    })).toBe('release')
  })

  it('問不到後端超過信任窗 → 放手，不能永遠釘住畫面', () => {
    expect(resolveCompactWatchdogAction({
      state: 'accepted',
      observedAt: now - CHAT_OPERATION_LIVE_STATUS_TRUST_MS - 1,
      now,
    })).toBe('release')
  })

  it('從來沒問到過狀態 → 放手（沒有證據就不能宣稱還在跑）', () => {
    expect(resolveCompactWatchdogAction({ now })).toBe('release')
  })

  it('未知狀態 → 放手，不讓伺服器新增狀態值把前端釘死', () => {
    expect(resolveCompactWatchdogAction({
      state: 'some_future_state',
      observedAt: now - 1000,
      now,
    })).toBe('release')
  })

  it('觀測時間指向未來（時鐘偏移）→ 保守繼續等', () => {
    expect(resolveCompactWatchdogAction({
      state: 'accepted',
      observedAt: now + 60_000,
      now,
    })).toBe('keep-waiting')
  })
})
