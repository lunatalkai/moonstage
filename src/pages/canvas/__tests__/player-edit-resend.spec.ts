/**
 * 玩家「編輯並重送」自己最新那一句。
 *
 * 用戶 2026-09-12：「发一条，ai回复。发现不满意，然后重新编辑，然后自动发送。不然的话，
 * 就要把自己之前发过的消息复制粘贴修改，再回溯发送。」舊聊天框架有這功能，新殼搬的
 * 時候只搬了 AI 那半（改寫 AI 回覆）。
 *
 * 這裡釘住兩件事：哪一則玩家訊息能編輯（最後一則、已存檔、後面有 AI 回覆），以及
 * 這一輪沒成時畫面上的句子要換回原文。
 */
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import {
  canEditResendPlayerIndex,
  createRewriteSnapshotForTarget,
  restoreRewriteCandidate,
} from '../chat-operation-ui-state'
import CanvasMessage from '../components/canvas-message.vue'

const user = (id: string, content: string, extra: Record<string, unknown> = {}) => ({ id, chatId: id, type: 1, content, ...extra })
const ai = (id: string, content: string, extra: Record<string, unknown> = {}) => ({ id, chatId: id, type: 0, content, finishReason: 'stop', ...extra })

describe('哪一則玩家訊息能編輯並重送', () => {
  it('最後一則玩家訊息、已存檔、後面有 AI 回覆：可以', () => {
    const list = [ai('g', '開場'), user('u1', '早'), ai('a1', '嗨'), user('u2', '再來'), ai('a2', '好')]
    expect(canEditResendPlayerIndex(list, 3)).toBe(true)
  })
  it('中間的玩家訊息不行：改了等於分叉，那是倒回的事', () => {
    const list = [ai('g', '開場'), user('u1', '早'), ai('a1', '嗨'), user('u2', '再來'), ai('a2', '好')]
    expect(canEditResendPlayerIndex(list, 1)).toBe(false)
  })
  it('後面沒有 AI 回覆（那一輪失敗或還在跑）不行：那是重試，不是編輯', () => {
    expect(canEditResendPlayerIndex([ai('g', '開場'), user('u1', '早')], 1)).toBe(false)
    expect(canEditResendPlayerIndex([ai('g', '開場'), user('u1', '早'), ai('a1', '', { chatLoading: true })], 1)).toBe(false)
  })
  it('沒存檔的訊息（id 0）與 AI 訊息不行', () => {
    expect(canEditResendPlayerIndex([user('u1', '早', { id: 0 }), ai('a1', '嗨')], 0)).toBe(false)
    expect(canEditResendPlayerIndex([user('u1', '早'), ai('a1', '嗨')], 1)).toBe(false)
  })
  it('摘要列不算在後面的東西裡', () => {
    const list = [user('u1', '早'), ai('s', '摘要', { isSummary: true }), ai('a1', '嗨')]
    expect(canEditResendPlayerIndex(list, 0)).toBe(true)
  })
})

describe('這一輪沒成，玩家的句子要換回去', () => {
  it('restoreRewriteCandidate 把改過的內容還原成快照裡的原句', () => {
    const list = [ai('g', '開場'), user('u1', '原句'), ai('a1', '嗨')]
    const snapshot = createRewriteSnapshotForTarget(list, 'u1')!
    expect(snapshot).toBeTruthy()
    // 畫面先換成新字、AI 換成候選
    const provisional = [list[0], { ...list[1], content: '改過的句子' }, { id: 'cand', type: 0, content: '', operationBubbleId: 'cand' }]
    const restored = restoreRewriteCandidate(provisional, snapshot, 'cand')
    expect(restored[1].content).toBe('原句')
    expect(restored[2].id).toBe('a1')
  })
})

describe('動作列貼著氣泡', () => {
  it('氣泡與動作列在同一組（.mes_turn）裡，動作列緊接氣泡之後', () => {
    const w = mount(CanvasMessage, {
      props: {
        message: { id: 'u1', mesid: 2, role: 'user', name: '你', avatar: '', html: '<p>早</p>', finished: true, latest: false, latestAI: false, swipes: null },
      },
    })
    const turn = w.element.querySelector('.mes_block .mes_turn')!
    expect(turn).toBeTruthy()
    const bubble = turn.querySelector(':scope > .mes_text')!
    const actions = turn.querySelector(':scope > .select-box.mes_buttons')!
    expect(bubble).toBeTruthy()
    expect(actions).toBeTruthy()
    expect(bubble.nextElementSibling).toBe(actions)
  })
})
