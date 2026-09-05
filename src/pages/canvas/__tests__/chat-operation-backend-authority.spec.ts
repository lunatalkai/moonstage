import { describe, expect, it } from 'vitest'
import {
  CHAT_OPERATION_LIVE_STATUS_TRUST_MS,
  isChatOperationBackendStillWorking,
} from '../chat-transport-ownership'

// 權威只能有一個：這一輪還在不在跑由伺服器說了算。
//
// 線上實測（2026-08-30，24 小時窗）：272 輪在伺服器上成功完成，耗時卻超過前端
// 的五分鐘上界，而且全部是普通輪次拿不到 agent 豁免。使用者扣了點、回覆寫好了，
// 畫面卻顯示逾時失敗。這幾條把「後端說還在跑就不准判死」釘住。
describe('後端才是權威', () => {
  const now = 1_000_000_000

  it('伺服器剛說還在生成 → 不准放手', () => {
    expect(isChatOperationBackendStillWorking({
      state: 'generating', observedAt: now - 1_000, now,
    })).toBe(true)
  })

  it('伺服器剛說已受理（還沒開始生成）→ 一樣不准放手', () => {
    expect(isChatOperationBackendStillWorking({
      state: 'accepted', observedAt: now - 1_000, now,
    })).toBe(true)
  })

  it('問不到伺服器超過信任窗 → 退回碼表', () => {
    expect(isChatOperationBackendStillWorking({
      state: 'generating',
      observedAt: now - CHAT_OPERATION_LIVE_STATUS_TRUST_MS - 1,
      now,
    })).toBe(false)
  })

  it('終態不算還在跑', () => {
    for (const state of ['completed', 'interrupted', 'stopped', 'failed_retryable', 'failed_terminal']) {
      expect(isChatOperationBackendStillWorking({ state, observedAt: now - 1_000, now })).toBe(false)
    }
  })

  it('未知狀態退回碼表，不得把前端永遠釘住', () => {
    expect(isChatOperationBackendStillWorking({
      state: 'some_future_state', observedAt: now - 1_000, now,
    })).toBe(false)
  })

  it('從來沒問到過狀態 → 退回碼表（否則永遠不放手）', () => {
    expect(isChatOperationBackendStillWorking({ state: 'generating', observedAt: null, now })).toBe(false)
  })

  it('觀測時間指向未來（時鐘偏移）→ 保守繼續等', () => {
    expect(isChatOperationBackendStillWorking({
      state: 'generating', observedAt: now + 60_000, now,
    })).toBe(true)
  })
})
