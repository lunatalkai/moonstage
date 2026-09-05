import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { handleParsedChatSSEEventGate } from '../chat-sse-dispatch'

const readChat = () => fs.readFileSync(path.join(process.cwd(), 'src/pages/canvas/canvas.vue'), 'utf8')

function sliceBetween(source: string, start: string, end: string): string {
  const startIndex = source.indexOf(start)
  const endIndex = source.indexOf(end, startIndex + start.length)
  expect(startIndex).toBeGreaterThanOrEqual(0)
  expect(endIndex).toBeGreaterThan(startIndex)
  return source.slice(startIndex, endIndex)
}

describe('desktop compact lifecycle visibility', () => {
  // 2026-08-31 語義變更：原本鎖的是「與伺服器六分鐘總預算對齊」的字面常數。
  // 那個伺服器預算已經移除（壓縮改由串流靜默判死），所以這個秒數不再是壓縮的
  // 上限，只剩「接不到收尾事件時的兜底」。
  //
  // 改鎖現在真正重要的三件事：預設值仍在共用模組、兜底走可注入的解析函式
  // （讓到期分支可測）、以及沒有人把它改回一分鐘那種會誤判正常壓縮的值。
  it('watchdog 用共用模組的預設值，並走可注入的解析函式', () => {
    const chat = readChat()
    expect(chat).toContain('resolveCompactWatchdogMs')
    expect(chat).toContain('compactWatchdogMs()')
    expect(chat).not.toContain('const COMPACT_WATCHDOG_MS = 60 * 1000;')
    expect(chat).not.toContain('60s watchdog')
  })

  it.each([
    ["case 'compactDone':", "case 'compactFailed':"],
    ["case 'compactFailed':", "case 'compactSkipped':"],
    ["case 'compactSkipped':", "case 'waiting':"],
  ])('%s immediately returns the composer to normal state', (start, end) => {
    const branch = sliceBetween(readChat(), start, end)
    expect(branch).toContain('clearCompactWatchdog()')
    expect(branch).toContain("store.commit('setIsCompacting', false)")
  })

  it('shows the low-key localized notice for compactSkipped without changing unknown-event dispatch', () => {
    const chat = readChat()
    const branch = sliceBetween(chat, "case 'compactSkipped':", "case 'waiting':")
    expect(branch).toContain("t('chat.compactSkippedNotice')")
    expect(branch).toContain("icon: 'none'")
    expect(chat).toContain("case 'waiting':")
  })

  it('treats compactSkipped as a substantive resume terminal event', () => {
    let resumeClears = 0
    const consumed = handleParsedChatSSEEventGate({
      event: 'compactSkipped',
      raw: '{"reason":"degraded"}',
      data: { reason: 'degraded' },
    }, {
      dispatchEvent: () => false,
      clearResumeInitialIfNeeded: () => { resumeClears += 1 },
    })

    expect(consumed).toBe(false)
    expect(resumeClears).toBe(1)
  })
})
