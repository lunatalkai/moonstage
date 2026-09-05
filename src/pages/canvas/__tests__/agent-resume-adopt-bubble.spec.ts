import { describe, expect, it } from 'vitest'
import {
  adoptInterruptedAgentBubbleForResume,
  keepInterruptedAgentBubble,
} from '../chat-operation-ui-state'

// 「繼續」不是新的一輪,是同一輪還沒交卷——所以它要**接管中斷的那一列**,
// 不是在底下另開一顆氣泡。
//
// 另開一顆的後果 owner 2026-08-08 在 mobile 指得很準:上面那顆還掛著「繼續」,
// 於是使用者可以在 AI 正在跑的時候再按一次繼續。按鈕該在續跑開始那一刻消失。
describe('adoptInterruptedAgentBubbleForResume', () => {
  it('接管中斷那一列,並把既有軌跡交出來讓即時流水帳接上', () => {
    const messages: any[] = [
      { type: 1, id: 'u1', chatId: 'chat-1', content: '開始' },
      {
        type: 0,
        id: 'a1',
        agentInterrupted: true,
        chatFinish: true,
        chatLoading: false,
        prepTrail: ['回想先前的劇情', '瀏覽角色目前的狀態'],
      },
    ]

    const adopted = adoptInterruptedAgentBubbleForResume(messages)

    expect(adopted?.index).toBe(1)
    expect(adopted?.bubbleId).toBe('a1')
    expect(adopted?.trail).toEqual(['回想先前的劇情', '瀏覽角色目前的狀態'])
    expect(messages[1].agentInterrupted).toBe(false)
    expect(messages[1].chatLoading).toBe(true)
    expect(messages[1].chatFinish).toBe(false)
    // 軌跡改由即時流水帳承載,不要同一份東西同時掛兩個地方。
    expect(messages[1].prepTrail).toEqual([])
  })

  it('沒有中斷的列就不接管——那不是續跑,照原本的路走', () => {
    expect(adoptInterruptedAgentBubbleForResume([
      { type: 0, id: 'a1', chatFinish: true, content: '寫完了' },
    ])).toBeUndefined()
    expect(adoptInterruptedAgentBubbleForResume([])).toBeUndefined()
  })
})

// agent 跑到一半被停下來時,那顆氣泡不是「空的」——它承載著使用者已經付過錢
// 的準備過程。當成孤兒占位移除等於讓畫面上只剩使用者自己的訊息,底下空無一物。
describe('keepInterruptedAgentBubble', () => {
  it('有軌跡就留下來,並掛出「繼續」', () => {
    const bubble: any = { type: 0, id: 'a1', content: '', chatLoading: true }
    expect(keepInterruptedAgentBubble(bubble, ['回想先前的劇情'])).toBe(true)
    expect(bubble.chatLoading).toBe(false)
    expect(bubble.agentInterrupted).toBe(true)
    expect(bubble.prepTrail).toEqual(['回想先前的劇情'])
  })

  it('沒有軌跡就不留——一顆什麼都沒有的氣泡比沒有更讓人困惑', () => {
    expect(keepInterruptedAgentBubble({ type: 0, id: 'a1', content: '' } as any, [])).toBe(false)
    expect(keepInterruptedAgentBubble({ type: 0, id: 'a1', content: '有內容' } as any, ['x'])).toBe(false)
  })
})
