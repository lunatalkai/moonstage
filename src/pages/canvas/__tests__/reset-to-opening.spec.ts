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

import { openingChatIdFromLoadedList } from '../chat-operation-ui-state'

// 畫面上的列只在「沒有更舊的頁」時能信：長對話只載最新一頁，那一頁最舊的 AI 是劇情中段。
describe('openingChatIdFromLoadedList', () => {
  const ai = (id: string) => ({ id, chatId: id, type: 0, content: 'x', chatFinish: true })
  const user = (id: string) => ({ id, chatId: id, type: 1, content: 'y', chatFinish: true })
  it('沒有更舊的頁：第一則 AI 就是開場白', () => {
    expect(openingChatIdFromLoadedList([ai('g'), user('u1'), ai('a1')], false)).toBe('g')
  })
  it('還有更舊的頁：畫面上的第一則 AI 不能當開場白，回空字串讓呼叫端去問伺服器', () => {
    expect(openingChatIdFromLoadedList([ai('a30'), user('u31'), ai('a31')], true)).toBe('')
  })
  it('玩家先講話、或列沒存檔：沒有開場白', () => {
    expect(openingChatIdFromLoadedList([user('u1'), ai('a1')], false)).toBe('')
    expect(openingChatIdFromLoadedList([{ id: 0, type: 0, content: 'x', chatFinish: true }], false)).toBe('')
  })
})
