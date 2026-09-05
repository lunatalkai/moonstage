import { describe, expect, it } from 'vitest'
import {
  getThinkingControl,
  isAdaptiveThinkingModel,
  getVisibleThinkingDepthOptions,
} from './model-context-options'

// 施工單：模型思考能力三檔聲明制（邊界 7）
//
// server modelListV2 為每個模型聲明 thinkingControl: 'none' | 'toggleable' | 'adaptive'。
// 前端純函式負責：
//   - 缺欄位 / 未知值 → fallback 'toggleable'（=現行行為，零劣化）
//   - 'none'    → 思考控制全部不顯示（thinkingDepthOptions 清空）
//   - 'toggleable' → 現行「關閉＋深度檔位」不變（options 原樣）
//   - 'adaptive'   → 檔位選擇器不顯示「關閉」選項（off 被過濾掉）
const offOption = { value: 'off', labelKey: 'modelSelect.thinkingOff' }
const autoOption = { value: 'auto', labelKey: 'modelSelect.thinkingAuto' }
const highOption = { value: 'high', labelKey: 'modelSelect.thinkingHigh' }
const fullOptions = [offOption, autoOption, highOption]

describe('getThinkingControl · 聲明制三檔 + fallback (desktop)', () => {
  it('回傳 server 聲明的合法值', () => {
    expect(getThinkingControl({ thinkingControl: 'none' })).toBe('none')
    expect(getThinkingControl({ thinkingControl: 'toggleable' })).toBe('toggleable')
    expect(getThinkingControl({ thinkingControl: 'adaptive' })).toBe('adaptive')
  })

  it('缺欄位時 fallback 為 toggleable（=現行行為，零劣化）', () => {
    expect(getThinkingControl({ value: 'some-model' })).toBe('toggleable')
    expect(getThinkingControl(null)).toBe('toggleable')
    expect(getThinkingControl(undefined)).toBe('toggleable')
  })

  it('未知 / 髒值也 fallback 為 toggleable，不讓壞資料炸前端', () => {
    expect(getThinkingControl({ thinkingControl: 'disabled' })).toBe('toggleable')
    expect(getThinkingControl({ thinkingControl: '' })).toBe('toggleable')
  })
})

describe('isAdaptiveThinkingModel (desktop)', () => {
  it('只有 thinkingControl === adaptive 時為 true', () => {
    expect(isAdaptiveThinkingModel({ thinkingControl: 'adaptive' })).toBe(true)
    expect(isAdaptiveThinkingModel({ thinkingControl: 'toggleable' })).toBe(false)
    expect(isAdaptiveThinkingModel({ thinkingControl: 'none' })).toBe(false)
    expect(isAdaptiveThinkingModel({})).toBe(false)
  })
})

describe('getVisibleThinkingDepthOptions (desktop)', () => {
  it('none：思考控制全部不顯示，options 清空', () => {
    const model = { thinkingControl: 'none', thinkingDepthOptions: fullOptions }
    expect(getVisibleThinkingDepthOptions(model)).toEqual([])
  })

  it('toggleable（含 fallback 情境）：現行「關閉＋深度檔位」UI 不變，off 保留', () => {
    const model = { thinkingControl: 'toggleable', thinkingDepthOptions: fullOptions }
    expect(getVisibleThinkingDepthOptions(model)).toEqual(fullOptions)

    // 缺 thinkingControl 欄位 → fallback toggleable → 零劣化，options 原樣
    const legacyModel = { thinkingDepthOptions: fullOptions }
    expect(getVisibleThinkingDepthOptions(legacyModel)).toEqual(fullOptions)
  })

  it('adaptive：檔位選擇器不顯示「關閉」選項，其餘檔位保留', () => {
    const model = { thinkingControl: 'adaptive', thinkingDepthOptions: fullOptions }
    expect(getVisibleThinkingDepthOptions(model)).toEqual([autoOption, highOption])
  })

  it('沒有 thinkingDepthOptions 或非陣列時安全回傳空陣列', () => {
    expect(getVisibleThinkingDepthOptions(null)).toEqual([])
    expect(getVisibleThinkingDepthOptions({ thinkingControl: 'adaptive' })).toEqual([])
  })
})
