/**
 * 上下文 chip：只露百分比與等級，內部數字一個都不出去。
 */
import { describe, it, expect } from 'vitest'
import {
  computeContextUsage,
  contextBudgetTokens,
  contextUsageLevel,
  formatContextUsage,
} from '../canvas-context-usage'

const OPTIONS = [
  { text: '48K', value: 1, tokens: 48000 },
  { text: '64K', value: 2, tokens: 64000 },
  { text: '128K', value: 5, tokens: 128000 },
]

/** 假的 i18n：把模板照 key 原樣展開，讓輸出字串可被檢查。 */
const t = (key: string, params: Record<string, unknown> = {}) => {
  const table: Record<string, string> = {
    'canvas.context.chip': '上下文 {percent}%',
    'canvas.context.tip': '這一輪用掉了目前記憶容量的 {percent}%（{level}）',
    'canvas.context.level.low': '還很寬裕',
    'canvas.context.level.mid': '用了一些',
    'canvas.context.level.high': '偏高',
    'canvas.context.level.full': '接近上限，下一輪可能會先整理記憶',
  }
  return (table[key] || key).replace(/\{(\w+)\}/g, (_, k) => String(params[k]))
}

describe('容量分母', () => {
  it('依玩家目前檔位從模型的檔位表取容量', () => {
    expect(contextBudgetTokens(OPTIONS, 1)).toBe(48000)
    expect(contextBudgetTokens(OPTIONS, '2')).toBe(64000)
  })
  it('檔位對不到、表是空的、值不合法 → null，不猜', () => {
    expect(contextBudgetTokens(OPTIONS, 3)).toBeNull()
    expect(contextBudgetTokens([], 1)).toBeNull()
    expect(contextBudgetTokens(undefined, 1)).toBeNull()
    expect(contextBudgetTokens([{ value: 1, tokens: 0 }], 1)).toBeNull()
  })
})

describe('百分比', () => {
  it('實測列：6150 / 48000 → 13%，等級「寬裕」', () => {
    expect(computeContextUsage({ inputTokens: 6150, budgetTokens: 48000 })).toEqual({ percent: 13, level: 'low' })
  })
  it('沒有 token 資料（開場白列、舊列）→ null，整顆不畫、不畫 0%', () => {
    expect(computeContextUsage({ inputTokens: 0, budgetTokens: 48000 })).toBeNull()
    expect(computeContextUsage({ inputTokens: null, budgetTokens: 48000 })).toBeNull()
    expect(computeContextUsage({ inputTokens: 6150, budgetTokens: null })).toBeNull()
  })
  it('超過容量封頂 100，極小值至少 1', () => {
    expect(computeContextUsage({ inputTokens: 60000, budgetTokens: 48000 })?.percent).toBe(100)
    expect(computeContextUsage({ inputTokens: 10, budgetTokens: 48000 })?.percent).toBe(1)
  })
  it('等級門檻：92 以上＝接近上限，跟伺服器整理記憶的水位線同一個數', () => {
    expect(contextUsageLevel(91)).toBe('high')
    expect(contextUsageLevel(92)).toBe('full')
    expect(contextUsageLevel(75)).toBe('high')
    expect(contextUsageLevel(45)).toBe('mid')
    expect(contextUsageLevel(44)).toBe('low')
  })
})

describe('脫敏', () => {
  it('輸出只含百分比與等級文案，沒有 token 數、容量、模型或線路', () => {
    const usage = computeContextUsage({ inputTokens: 6150, budgetTokens: 48000 })
    const shown = formatContextUsage(usage, t)!
    expect(shown.label).toBe('上下文 13%')
    expect(shown.label).toMatch(/^上下文 \d{1,3}%$/)
    for (const text of [shown.label, shown.tip]) {
      expect(text).not.toMatch(/6150|48000|48K|token|claude|sonnet|ripple/i)
      // 除了那一個百分比，不能有別的數字
      expect(text.replace(/13%/g, '')).not.toMatch(/\d/)
    }
    expect(shown.level).toBe('low')
  })
  it('沒有資料就沒有顯示物', () => {
    expect(formatContextUsage(null, t)).toBeNull()
  })
})
