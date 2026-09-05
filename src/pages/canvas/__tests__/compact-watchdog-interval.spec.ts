import { describe, it, expect } from 'vitest'
import {
  COMPACT_WATCHDOG_DEFAULT_MS,
  resolveCompactWatchdogMs,
} from '../chat-transport-ownership'

// 這條路徑（watchdog 到期後的決策）需要壓縮跑超過六分半才會走到，按需重現不了。
// 沒有注入點的話它永遠只有單元測試覆蓋，接線對不對只能靠上線後撞運氣。
//
// 因此開一個「只能調短、不能調長」的注入點：測試要的是提早到期；調長只會讓
// 卡住的畫面更晚被兜底，那是幫倒忙。
describe('壓縮 watchdog 間隔的注入點', () => {
  it('沒有覆寫時用預設值', () => {
    expect(resolveCompactWatchdogMs(undefined)).toBe(COMPACT_WATCHDOG_DEFAULT_MS)
    expect(resolveCompactWatchdogMs(null)).toBe(COMPACT_WATCHDOG_DEFAULT_MS)
    expect(resolveCompactWatchdogMs('')).toBe(COMPACT_WATCHDOG_DEFAULT_MS)
  })

  it('接受區間內的縮短值', () => {
    expect(resolveCompactWatchdogMs('3000')).toBe(3000)
    expect(resolveCompactWatchdogMs(2500)).toBe(2500)
  })

  it('不接受比預設更長的值——調長只會讓卡住的畫面更晚被兜底', () => {
    expect(resolveCompactWatchdogMs(COMPACT_WATCHDOG_DEFAULT_MS + 1)).toBe(COMPACT_WATCHDOG_DEFAULT_MS)
    expect(resolveCompactWatchdogMs(99_999_999)).toBe(COMPACT_WATCHDOG_DEFAULT_MS)
  })

  it('不接受過短的值——比一次壓縮還短會讓兜底變成誤判', () => {
    expect(resolveCompactWatchdogMs(1)).toBe(COMPACT_WATCHDOG_DEFAULT_MS)
    expect(resolveCompactWatchdogMs(0)).toBe(COMPACT_WATCHDOG_DEFAULT_MS)
    expect(resolveCompactWatchdogMs(-5000)).toBe(COMPACT_WATCHDOG_DEFAULT_MS)
  })

  it('垃圾輸入退回預設，不讓壞值把兜底關掉', () => {
    expect(resolveCompactWatchdogMs('abc')).toBe(COMPACT_WATCHDOG_DEFAULT_MS)
    expect(resolveCompactWatchdogMs(NaN)).toBe(COMPACT_WATCHDOG_DEFAULT_MS)
    expect(resolveCompactWatchdogMs(Infinity)).toBe(COMPACT_WATCHDOG_DEFAULT_MS)
    expect(resolveCompactWatchdogMs({})).toBe(COMPACT_WATCHDOG_DEFAULT_MS)
  })
})
