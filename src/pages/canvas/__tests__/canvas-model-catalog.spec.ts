/**
 * 模型目錄的攤平與點數顯示。
 *
 * 目錄是「群組 → 家族 → 線路」三層，畫面上要的是「現在用的那一條」跟它一輪多少點。
 * 固定計價的模型看 costScore；動態計價的一輪多少點要跑完才知道，只能給一個區間。
 * 兩者混在一起顯示會讓玩家以為便宜的比較貴（見專案記憶：混合計價陷阱），所以
 * 格式化只有一個入口。
 */
import { describe, it, expect } from 'vitest'
import catalog from './fixtures/model-catalog.json'
import {
  flattenVariants,
  findVariant,
  resolveVariant,
  formatScore,
  scoreParts,
} from '../canvas-model-catalog'

const STATIC_VALUE = 'deepseek-v4-flash-ripple'
const DYNAMIC_VALUE = 'official-deepseek-v4-flash-provider-n'

describe('模型目錄攤平', () => {
  it('把群組／家族／線路攤成一層，並帶上它來自哪個群組與家族', () => {
    const list = flattenVariants(catalog as any)
    expect(list.length).toBe(4)
    const first = list[0]
    expect(first.value).toBe(STATIC_VALUE)
    expect(first.group).toBe('Global Top')
    expect(first.family).toBe('DeepSeek V4 Flash')
  })

  it('空目錄不炸', () => {
    expect(flattenVariants(null as any)).toEqual([])
    expect(flattenVariants([] as any)).toEqual([])
    expect(flattenVariants([{ group: 'x' }] as any)).toEqual([])
  })

  it('家族層的上下文與思考檔位會補給沒有自己那一份的線路', () => {
    const list = flattenVariants([
      {
        group: 'g',
        families: [{
          family: 'f',
          contextBudgetOptions: [{ text: '64K', value: 1 }],
          thinkingDepthOptions: [{ value: 'off' }],
          defaultThinkingDepth: 'off',
          variants: [{ value: 'v1', name: 'V1' }],
        }],
      },
    ] as any)
    expect(list[0].contextBudgetOptions).toEqual([{ text: '64K', value: 1 }])
    expect(list[0].thinkingDepthOptions).toEqual([{ value: 'off' }])
    expect(list[0].defaultThinkingDepth).toBe('off')
  })

  it('找得到指定的線路，找不到就回 null（不要回第一條——那會把玩家的選擇悄悄換掉）', () => {
    expect(findVariant(catalog as any, STATIC_VALUE)?.name).toBe('DeepSeek V4 Flash')
    expect(findVariant(catalog as any, '不存在的模型')).toBe(null)
    expect(findVariant(catalog as any, '')).toBe(null)
  })
})

// 客戶端不再自己編一個模型代號：進場先把遊玩設定清成「還不知道」，再去伺服器讀。
// 所以這一層只認目錄裡真的有的代號，一個佔位值都不換算。
describe('照字面查目錄', () => {
  it('目錄裡有的代號查得到', () => {
    expect(resolveVariant(catalog as any, STATIC_VALUE)?.value).toBe(STATIC_VALUE)
  })

  it('查不到就是回 null，不亂挑一條頂上，也不換算任何佔位代號', () => {
    expect(resolveVariant(catalog as any, 'qwen:32b')).toBe(null)
    expect(resolveVariant(catalog as any, '不存在的模型')).toBe(null)
    expect(resolveVariant(catalog as any, '')).toBe(null)
  })
})

describe('一輪多少點', () => {
  it('固定計價：就是 costScore', () => {
    const v = findVariant(catalog as any, STATIC_VALUE)!
    expect(formatScore(v)).toBe('25')
    expect(scoreParts(v)).toEqual({ text: '25', dynamic: false })
  })

  it('動態計價：給區間，不給那個會誤導人的單一數字', () => {
    const v = findVariant(catalog as any, DYNAMIC_VALUE)!
    expect(v.costScore).toBe(120)
    expect(formatScore(v)).toBe('36–64')
    expect(scoreParts(v)).toEqual({ text: '36–64', dynamic: true })
  })

  it('動態計價但沒有區間時退回 costScore', () => {
    expect(formatScore({ value: 'x', billingType: 'dynamic', costScore: 40 } as any)).toBe('40')
  })

  it('上下界一樣就不寫成區間', () => {
    expect(formatScore({
      value: 'x', billingType: 'dynamic', estMinScore: 30, estMaxScore: 30,
    } as any)).toBe('30')
  })

  it('免費模型是 0，要寫出來——留白會讓人以為還在載入或算不出來', () => {
    expect(formatScore({ value: 'x', costScore: 0 } as any)).toBe('0')
  })

  it('沒有線路或伺服器沒給點數才留白', () => {
    expect(formatScore(null)).toBe('')
    expect(formatScore({ value: 'x' } as any)).toBe('')
    expect(scoreParts(null)).toEqual({ text: '', dynamic: false })
  })
})
