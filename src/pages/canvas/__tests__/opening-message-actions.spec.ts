import { describe, expect, it } from 'vitest'
import { isOpeningIndex, latestCanonicalAIIndex } from '../chat-operation-ui-state'

const ai = (content = 'x', extra: Record<string, unknown> = {}) => ({ type: 0, content, chatFinish: true, ...extra })
const user = (content = 'y') => ({ type: 1, content, chatFinish: true })

// 開場白是作者寫的，不是模型生成的：不能重新生成、改寫、繼續、刪除（owner 2026-09-07）。
describe('isOpeningIndex', () => {
  it('第一則 AI、前面沒有任何真正訊息＝開場白；後面的 AI 不是', () => {
    const list = [ai('開場'), user('嗨'), ai('回覆')]
    expect(isOpeningIndex(list, 0)).toBe(true)
    expect(isOpeningIndex(list, 2)).toBe(false)
    expect(isOpeningIndex(list, 1)).toBe(false)
  })

  it('只有開場白的新對話：它是最新一則 AI，但仍是開場白，重新生成鍵不該出現', () => {
    const list = [ai('開場')]
    expect(latestCanonicalAIIndex(list)).toBe(0)
    expect(isOpeningIndex(list, 0)).toBe(true)
  })

  it('摘要列與純系統列不算前面的訊息；玩家先講話的對話沒有開場白', () => {
    expect(isOpeningIndex([{ isSummary: true, type: 0, content: '摘要' }, ai('開場')], 1)).toBe(true)
    expect(isOpeningIndex([{ systemOnly: true, type: 0, content: '' }, ai('開場')], 1)).toBe(true)
    expect(isOpeningIndex([user('我先說'), ai('回覆')], 1)).toBe(false)
  })

  it('不是 AI 的列、摘要列、越界都不是開場白', () => {
    expect(isOpeningIndex([user('嗨')], 0)).toBe(false)
    expect(isOpeningIndex([{ isSummary: true, type: 0, content: '摘要' }], 0)).toBe(false)
    expect(isOpeningIndex([], 0)).toBe(false)
    expect(isOpeningIndex(null as unknown as any[], 0)).toBe(false)
  })
})
