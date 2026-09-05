/**
 * formatDate / formatSimpleDate guard 單元測試（desktop）
 *
 * 守住 issue mobile#4 修復（desktop 同檔案、同 typo）：
 *   - invalid timestamp（null/undefined/''/invalid string）必須回 ''，不再 'NaN-aN-aN aN:aN:aN'
 *   - 0（合法 Unix epoch 1970-01-01）必須正常格式化
 *   - 合法 timestamp 維持既有格式 'YYYY-MM-DD HH:mm:ss'
 *
 * 對齊 codebase 既有 5 處同類 guard 慣例：return ''（空字串），不是 '-'。
 */
import { describe, it, expect } from 'vitest'

// 對應 desktop/src/common/fui-app.js line 141 修復後版本（純函式，inline reproduce
// 避免 import 整個 fui object 帶 crypto-js / opencc-js 等重依賴）
const formatDate = function (timestamp: unknown): string {
  if (timestamp === null || timestamp === undefined || timestamp === '') return ''
  const date = new Date(timestamp as any)
  if (Number.isNaN(date.getTime())) return ''
  const year = date.getFullYear()
  const month = ('0' + (date.getMonth() + 1)).slice(-2)
  const day = ('0' + date.getDate()).slice(-2)
  const hours = ('0' + date.getHours()).slice(-2)
  const minutes = ('0' + date.getMinutes()).slice(-2)
  const seconds = ('0' + date.getSeconds()).slice(-2)
  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`
}

describe('fui.formatDate guard (issue mobile#4)', () => {
  it('null → "" (顯式擋掉)', () => {
    expect(formatDate(null)).toBe('')
  })
  it('undefined → "" (typo 場景)', () => {
    expect(formatDate(undefined)).toBe('')
  })
  it('"" empty string → ""', () => {
    expect(formatDate('')).toBe('')
  })
  it('invalid string → "" (Number.isNaN getTime catch)', () => {
    expect(formatDate('not-a-date')).toBe('')
  })
  it('0 (Unix epoch 1970-01-01) → 合法格式化', () => {
    // 注意：0 是 falsy 但 Date(0) = 1970-01-01，必須通過 guard
    const result = formatDate(0)
    expect(result).not.toBe('')
    expect(result).toMatch(/^1970-01-01 /)
  })
  it('-86400000 (pre-1970) → 合法格式化（負 epoch）', () => {
    const result = formatDate(-86400000)
    expect(result).not.toBe('')
    expect(result).toMatch(/^1969-12-3[01] /)
  })
  it('valid ISO string → 正確格式', () => {
    const result = formatDate('2025-04-28T12:34:56.000Z')
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/)
  })
  it('valid Number timestamp → 正確格式', () => {
    const result = formatDate(1714305296000)
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/)
  })
  it('Number.MAX_SAFE_INTEGER → "" (out of range Date)', () => {
    const result = formatDate(Number.MAX_SAFE_INTEGER)
    expect(result).toBe('')
  })
  it('NaN → ""', () => {
    expect(formatDate(NaN)).toBe('')
  })
})
