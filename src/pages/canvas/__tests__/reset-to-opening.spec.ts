import { describe, expect, it } from 'vitest'
import { openingChatIdFromOldestHistoryRow } from '../chat-operation-ui-state'

// 重置聊天＝倒回到開場白（長期指令、手帳留著）。開場白是歷史裡最舊那一列，
// 這裡釘住「哪一列算開場白」：AI、不是摘要；玩家先講話的卡沒有開場白。
describe('openingChatIdFromOldestHistoryRow', () => {
  it('最舊一列是 AI：它的 chatId 就是倒回目標', () => {
    expect(openingChatIdFromOldestHistoryRow({ chatId: 'c1', chatRole: 'AI', chatMessage: '開場' })).toBe('c1')
  })
  it('最舊一列是玩家：沒有開場白', () => {
    expect(openingChatIdFromOldestHistoryRow({ chatId: 'c1', chatRole: 'USER', chatMessage: '嗨' })).toBe('')
  })
  it('摘要列、空列都不算', () => {
    expect(openingChatIdFromOldestHistoryRow({ chatId: 's', chatRole: 'AI', isSummary: true })).toBe('')
    expect(openingChatIdFromOldestHistoryRow(null)).toBe('')
    expect(openingChatIdFromOldestHistoryRow(undefined)).toBe('')
  })
})
