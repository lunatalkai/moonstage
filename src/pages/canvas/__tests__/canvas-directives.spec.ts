/**
 * 長期指令的清單狀態。守的是邊界：上限、對話還沒建立、編輯態互斥。
 */
import { describe, it, expect } from 'vitest'
import {
  DIRECTIVE_FALLBACK_MAX_COUNT,
  createDirectiveState,
  readDirectiveResponse,
  directiveCountText,
  addBlockReason,
  canAddDirective,
  startEditDirective,
  cancelEditDirective,
  canSaveEdit,
} from '../canvas-directives'

describe('讀伺服器的指令清單', () => {
  it('清單在 list 這個鍵底下，不是 directives', () => {
    const read = readDirectiveResponse({
      list: [{ sourceId: 's1', text: '回覆短一點', origin: 'manual', status: 'active' }],
      maxCount: 10,
      maxLength: 200,
    })
    expect(read.list).toEqual([{ sourceId: 's1', text: '回覆短一點', origin: 'manual', status: 'active' }])
    expect(read.maxCount).toBe(10)
    expect(read.maxLength).toBe(200)
  })

  it('上限用伺服器給的，不寫死——伺服器放寬之後不該還被舊數字擋住', () => {
    expect(readDirectiveResponse({ list: [], maxCount: 30, maxLength: 500 }).maxCount).toBe(30)
    expect(readDirectiveResponse({ list: [] }).maxCount).toBe(DIRECTIVE_FALLBACK_MAX_COUNT)
  })

  it('沒有 sourceId 的列丟掉——它沒有可以改或刪的對象', () => {
    expect(readDirectiveResponse({ list: [{ text: 'x' }, null, { sourceId: 's', text: 'y' }] }).list)
      .toEqual([{ sourceId: 's', text: 'y', origin: '', status: '' }])
  })

  it('回傳形狀不對也不炸', () => {
    expect(readDirectiveResponse(null).list).toEqual([])
    expect(readDirectiveResponse({ list: 'nope' }).list).toEqual([])
  })
})

describe('新增按得下嗎', () => {
  const base = createDirectiveState()

  it('對話還沒建立時說得出原因——把鍵變灰而不說話，玩家不知道要等什麼', () => {
    expect(addBlockReason({ ...base, draft: '好' }, false)).toBe('no-conversation')
  })

  it('滿了就是滿了', () => {
    const full = {
      ...base,
      maxCount: 2,
      draft: '好',
      list: [{ sourceId: 'a', text: 'a' }, { sourceId: 'b', text: 'b' }],
    }
    expect(addBlockReason(full, true)).toBe('limit')
  })

  it('沒寫字不算', () => {
    expect(addBlockReason({ ...base, draft: '   ' }, true)).toBe('empty')
  })

  it('太長也擋——送出去只會被伺服器擋，玩家只看到一句失敗', () => {
    expect(addBlockReason({ ...base, maxLength: 5, draft: '一二三四五六' }, true)).toBe('too-long')
  })

  it('都過了就按得下', () => {
    expect(canAddDirective({ ...base, draft: '回覆短一點' }, true)).toBe(true)
    expect(addBlockReason({ ...base, draft: '回覆短一點' }, true)).toBe('')
  })
})

describe('編輯態', () => {
  const state = {
    ...createDirectiveState(),
    list: [{ sourceId: 'a', text: '甲' }, { sourceId: 'b', text: '乙' }],
  }

  it('一次只有一條在編輯——點另一條就換過去', () => {
    const first = startEditDirective(state, state.list[0])
    expect(first.editingSourceId).toBe('a')
    expect(first.editingText).toBe('甲')
    const second = startEditDirective(first, state.list[1])
    expect(second.editingSourceId).toBe('b')
    expect(second.editingText).toBe('乙')
  })

  it('取消把編輯中的字丟掉，不寫回清單', () => {
    const editing = { ...startEditDirective(state, state.list[0]), editingText: '改到一半' }
    const cancelled = cancelEditDirective(editing)
    expect(cancelled.editingSourceId).toBe('')
    expect(cancelled.list[0].text).toBe('甲')
  })

  it('改成空白不能存——那是刪除，不要替玩家做那個決定', () => {
    expect(canSaveEdit({ ...state, editingSourceId: 'a', editingText: '  ' })).toBe(false)
    expect(canSaveEdit({ ...state, editingSourceId: 'a', editingText: '改好了' })).toBe(true)
    expect(canSaveEdit({ ...state, editingSourceId: '', editingText: '改好了' })).toBe(false)
  })

  it('超過長度也不能存', () => {
    expect(canSaveEdit({ ...state, maxLength: 3, editingSourceId: 'a', editingText: '一二三四' })).toBe(false)
  })
})

describe('數量徽章', () => {
  it('寫成幾分之幾，讓玩家知道還能加幾條', () => {
    const state = { ...createDirectiveState(), maxCount: 10, list: [{ sourceId: 'a', text: 'a' }] }
    expect(directiveCountText(state)).toBe('(1/10)')
  })
})
