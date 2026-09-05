import { describe, it, expect } from 'vitest'
import { resolveChatActionButtonState } from '../chat-operation-ui-state'

const resumable = [{ operationId: 'op-1', reasonCode: 'agent_progress_preserved' }]

describe('resolveChatActionButtonState — agent 中斷態', () => {
  // agent 沒收尾時,底下不該是「發送」。
  //
  // 上一輪已經花了錢、進度也留著,這時送新訊息在 agent 模式下沒有意義——
  // 使用者要的是把它跑完。給「繼續」才是他當下唯一需要的動作。
  it('有可續跑的輪次時是繼續', () => {
    expect(resolveChatActionButtonState({ operations: resumable })).toBe('continue')
  })

  // 產品邊界 I-2:停止永遠可用,而且優先於一切。
  //
  // 生成中同時存在可續跑的舊輪次時,使用者要的是停止當下這個,
  // 不是繼續另一個——逃生口不得被任何狀態擠掉。
  it('生成中仍然是停止,不被繼續蓋掉', () => {
    expect(resolveChatActionButtonState({
      isStreamActive: true, operations: resumable,
    })).toBe('stop')
  })

  // 打了字也不改變:繼續不帶輸入框的字,那是兩個不同的意圖。
  it('輸入框有字時仍然是繼續', () => {
    expect(resolveChatActionButtonState({
      content: '我想說點別的', operations: resumable,
    })).toBe('continue')
  })

  // 其他失敗原因沒有東西可續,硬給繼續鍵會讓使用者按下去拿到空的斷點。
  it('非進度保留的失敗不給繼續', () => {
    expect(resolveChatActionButtonState({
      content: 'hi',
      operations: [{ operationId: 'op-2', reasonCode: 'temporary_failure' }],
    })).toBe('send')
  })

  // 沒有 agent 輪次時完全照舊——這條釘住「只動 agent」。
  it('沒有可續跑的輪次時行為零變化', () => {
    expect(resolveChatActionButtonState({ content: 'hi' })).toBe('send')
    expect(resolveChatActionButtonState({})).toBe('send-disabled')
    expect(resolveChatActionButtonState({ isCompacting: true })).toBe('compacting')
  })
})
