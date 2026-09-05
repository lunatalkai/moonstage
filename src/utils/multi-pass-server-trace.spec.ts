import { describe, it, expect } from 'vitest'
import { applyServerPrepTraces } from './multi-pass'

const trace = [{ stage: 'looking_up', resource: 'worldbook', count: 3 }]

describe('applyServerPrepTraces', () => {
  // 重整之後軌跡還在——這是整條線最終要交付的那一件事。
  //
  // 先前軌跡只活在記憶體裡，重整就沒了，而使用者已經為那段過程付過錢。
  it('把伺服器送回的軌跡掛到對應的 AI 訊息上', () => {
    // 真實列形狀:chat UUID 在 `id`,**沒有 chatId 欄位**。
    // 第一版 fixture 寫成 id 是數字、UUID 放 chatId,跟真實剛好相反,
    // 於是 mock 全綠而線上是徹底的 no-op。
    const messages = [
      { id: 'user-1', type: 1 },
      { id: 'ai-1', type: 0 },
    ]
    const operations = [
      { operationId: 'op-1', sourceChatId: 'user-1', assistantChatId: 'ai-1' },
    ]

    const out = applyServerPrepTraces(messages, operations, { 'op-1': trace })

    expect(out[1].prepTrail).toEqual(trace)
    // 重建不該替使用者把面板展開。
    expect(out[1].prepTrailCollapsed).toBe(true)
    expect(out[0].prepTrail).toBeUndefined()
  })

  // 中斷的那一輪沒有 AI 列，軌跡要掛在使用者那則上——否則使用者付了錢卻看不到
  // 任何過程，正是這條線要修的那個症狀。
  it('沒有 AI 列時掛到來源訊息上', () => {
    const messages = [{ id: 'user-1', type: 1 }]
    const operations = [
      { operationId: 'op-1', sourceChatId: 'user-1', assistantChatId: null },
    ]

    const out = applyServerPrepTraces(messages, operations, { 'op-1': trace })

    expect(out[0].prepTrail).toEqual(trace)
  })

  // 記憶體裡已經有軌跡時不要覆蓋。
  //
  // 串流剛結束那一刻，記憶體那份比伺服器新（伺服器可能還沒寫完最後一步）。
  // 用舊的蓋掉新的，畫面會倒退。
  it('不覆蓋已經在畫面上的軌跡', () => {
    const live = [{ stage: 'revealing' }]
    const messages = [{ id: 'ai-1', type: 0, prepTrail: live }]
    const operations = [
      { operationId: 'op-1', sourceChatId: 'user-1', assistantChatId: 'ai-1' },
    ]

    const out = applyServerPrepTraces(messages, operations, { 'op-1': trace })

    expect(out[0].prepTrail).toEqual(live)
  })

  // 伺服器沒送這個欄位時原樣返回。
  //
  // 欄位不存在是常態（沒有 agent 輪次的那些頁），判斷不能用 truthiness——
  // 那會讓「空物件」與「沒有」走進不同分支。
  it('沒有軌跡欄位時原樣返回', () => {
    const messages = [{ id: 'ai-1', type: 0 }]
    expect(applyServerPrepTraces(messages, [], undefined)).toBe(messages)
    expect(applyServerPrepTraces(messages, [], {})).toBe(messages)
  })

  it('輸入不是陣列時不炸', () => {
    expect(applyServerPrepTraces(undefined as any, [], { 'op-1': trace })).toEqual([])
  })
})
