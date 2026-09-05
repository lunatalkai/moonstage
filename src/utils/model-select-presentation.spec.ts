import { describe, expect, it } from 'vitest'
import {
  familyPriceDisplay,
  familyKey,
  dedupeFamilies,
  laneMetrics,
  detailMetrics,
  familyStatusTone,
  variantStatusTone,
  mergeFreeModelFamilies,
  monogramHue,
  normalizeTabIndex,
  sortFamilies,
  SORT_MODES,
  MONOGRAM_HUES,
  uptimeBucketTone,
  pinFamilyToTop,
} from './model-select-presentation'

/**
 * 選單呈現層的純計算。設計依據：docs/design/model-select-v3.md §3.4／§3.55。
 *
 * **這份案例與 mobile 的 tests/chat/model-select-presentation.spec.js 是同一組。**
 * 兩端各一份實作，語意必須一致——計價一旦漂移，就是使用者看到一個數字、
 * 被扣另一個。改任何一邊都要把另一邊一起改。
 */

const fixedVariant = (value: string, costScore: number, extra: Record<string, any> = {}) => ({
  value, costScore, billingType: 'fixed', ...extra,
})

const dynamicVariant = (value: string, min: number, max: number, extra: Record<string, any> = {}) => ({
  value, costScore: min, billingType: 'dynamic', estMinScore: min, estMaxScore: max, ...extra,
})

const family = (name: string, variants: any[], extra: Record<string, any> = {}) => ({
  family: name, variants, bestStatus: 'green', ...extra,
})

describe('familyPriceDisplay — 列上永遠回答「至少多少」', () => {
  it('所有線路固定且同價 → 只給數字，不加「起」', () => {
    const f = family('MiMo V2.5', [fixedVariant('mimo-v2.5-snow', 25), fixedVariant('mimo-v2.5-mist', 25)])
    expect(familyPriceDisplay(f)).toEqual({ amountText: '25', from: false, dynamic: false, original: null })
  })

  it('固定但線路有價差 → 取最低並標「起」', () => {
    const f = family('DeepSeek V4 Flash', [
      fixedVariant('deepseek-v4-flash-ripple', 25),
      fixedVariant('deepseek-v4-flash-mist', 25),
      fixedVariant('official-deepseek-v4-flash', 30),
    ])
    expect(familyPriceDisplay(f)).toMatchObject({ amountText: '25', from: true, dynamic: false })
  })

  it('任一線路浮動 → 前綴 ~，而且下限要跨固定與浮動一起取', () => {
    // owner 2026-08-25 問的那個情況：同一個家族一部分固定、一部分浮動。
    const f = family('DeepSeek V4 Flash', [
      fixedVariant('deepseek-v4-flash-ripple', 25),
      fixedVariant('deepseek-v4-flash-mist', 25),
      dynamicVariant('official-deepseek-v4-flash', 154, 353),
    ])
    expect(familyPriceDisplay(f)).toMatchObject({ amountText: '~25', from: true, dynamic: true })
  })

  it('全部浮動且估值相同 → 有 ~ 但沒有「起」', () => {
    const f = family('GPT-5.4', [dynamicVariant('gpt-5.4', 300, 780)])
    expect(familyPriceDisplay(f)).toMatchObject({ amountText: '~300', from: false, dynamic: true })
  })

  it('折扣中 → 帶原價，數字仍是折後的', () => {
    const f = family('Gemini 3 Flash',
      [fixedVariant('gemini-3-flash-preview', 30, { originalCostScore: 43 })],
      { discountUntilTs: 1756000000 })
    expect(familyPriceDisplay(f)).toMatchObject({ amountText: '30', original: 43 })
  })

  it('免費模型是 0，不是空白', () => {
    const f = family('免費模型', [fixedVariant('BaseBot-1', 0), fixedVariant('BaseBot-2', 0)])
    expect(familyPriceDisplay(f)).toMatchObject({ amountText: '0', from: false })
  })

  it('沒有 variants 時不炸，回 null', () => {
    expect(familyPriceDisplay(family('壞掉的', []))).toBeNull()
    expect(familyPriceDisplay(null)).toBeNull()
  })
})

describe('familyStatusTone — 只有例外態才亮', () => {
  it('正常不給任何點：一頁 50 列全綠燈等於沒有燈', () => {
    expect(familyStatusTone(family('X', [fixedVariant('x', 1)], { bestStatus: 'green' }))).toBeNull()
  })

  it('偏慢給 warning', () => {
    expect(familyStatusTone(family('X', [fixedVariant('x', 1)], { bestStatus: 'yellow' }))).toBe('warning')
  })

  it('異常給 danger', () => {
    expect(familyStatusTone(family('X', [fixedVariant('x', 1)], { bestStatus: 'red' }))).toBe('danger')
  })

  it('伺服器明講信心不足才給 unknown（空心）', () => {
    const f = family('X', [fixedVariant('x', 1, { status: { status: 'green', confidence: 'none' } })])
    expect(familyStatusTone(f)).toBe('unknown')
  })

  it('沒有 status 物件不等於資料不足——不要無端掛灰點', () => {
    expect(familyStatusTone(family('X', [fixedVariant('x', 1)]))).toBeNull()
  })
})

describe('mergeFreeModelFamilies — 免費模型收成一列', () => {
  it('兩個號碼併成一個家族，號碼變成 variants', () => {
    const input = [
      family('免費模型一', [fixedVariant('BaseBot-1', 0)]),
      family('免費模型二', [fixedVariant('BaseBot-2', 0)]),
      family('GLM-5.2', [fixedVariant('glm-5.2-mist', 40)]),
    ]
    const out = mergeFreeModelFamilies(input)
    expect(out).toHaveLength(2)
    expect(out[0].family).toBe('免費模型')
    expect(out[0].variants.map((v: any) => v.value)).toEqual(['BaseBot-1', 'BaseBot-2'])
    expect(out[0].isFreeModelGroup).toBe(true)
  })

  it('併起來之後保留第一個號碼的位置，不要跳到列表最前面', () => {
    const input = [
      family('GLM-5.2', [fixedVariant('glm-5.2-mist', 40)]),
      family('免費模型一', [fixedVariant('BaseBot-1', 0)]),
      family('免費模型二', [fixedVariant('BaseBot-2', 0)]),
    ]
    expect(mergeFreeModelFamilies(input).map(f => f.family)).toEqual(['GLM-5.2', '免費模型'])
  })

  it('只有一個號碼可選時照樣收成「免費模型」，不要露出號碼', () => {
    const out = mergeFreeModelFamilies([family('免費模型一', [fixedVariant('BaseBot-1', 0)])])
    expect(out[0].family).toBe('免費模型')
    expect(out[0].variants).toHaveLength(1)
  })

  it('沒有免費模型時原樣返回', () => {
    const input = [family('GLM-5.2', [fixedVariant('glm-5.2-mist', 40)])]
    expect(mergeFreeModelFamilies(input)).toEqual(input)
  })
})

describe('sortFamilies — 同分一律回到預設次序', () => {
  const a = family('A', [fixedVariant('a', 40)], { aaIntelligenceIndex: 40 })
  const b = family('B', [fixedVariant('b', 25)], { aaIntelligenceIndex: 61 })
  const c = family('C', [fixedVariant('c', 25)], { aaIntelligenceIndex: 40 })
  const list = [a, b, c]

  it('default 不動原順序', () => {
    expect(sortFamilies(list, 'default').map(f => f.family)).toEqual(['A', 'B', 'C'])
  })

  it('價格低到高', () => {
    expect(sortFamilies(list, 'price').map(f => f.family)).toEqual(['B', 'C', 'A'])
  })

  it('智力高到低', () => {
    expect(sortFamilies(list, 'intelligence').map(f => f.family)).toEqual(['B', 'A', 'C'])
  })

  it('同分保持原本的相對次序，否則每次進頁順序都在跳', () => {
    const sorted = sortFamilies(list, 'intelligence').map(f => f.family)
    expect(sorted.indexOf('A')).toBeLessThan(sorted.indexOf('C'))
  })

  it('不認得的排序值退回 default，不要回空陣列', () => {
    expect(sortFamilies(list, 'nonsense').map(f => f.family)).toEqual(['A', 'B', 'C'])
  })

  it('不就地改動輸入陣列', () => {
    sortFamilies(list, 'price')
    expect(list.map(f => f.family)).toEqual(['A', 'B', 'C'])
  })

  it('SORT_MODES 的每一個值都排得動', () => {
    for (const mode of SORT_MODES) expect(sortFamilies(list, mode)).toHaveLength(3)
  })
})

describe('normalizeTabIndex — 分類切換的參數形狀', () => {
  // 由來：v3 的側欄直接送數字，但既有的 tabChange 收的是元件事件物件（e.index）。
  // 數字進去之後 e.index 是 undefined → modelTabs[undefined] → 空陣列，畫面只顯示
  // 「暫無模型」，完全看不出是參數形狀不對。桌面實測踩到（mobile 走另一條路沒事）。
  it('接得住元件送的事件物件', () => {
    expect(normalizeTabIndex({ index: 3 })).toBe(3)
  })

  it('接得住直接送的數字', () => {
    expect(normalizeTabIndex(2)).toBe(2)
    expect(normalizeTabIndex(0)).toBe(0)
  })

  it('「全部」的 -1 原樣傳回，由呼叫端決定怎麼處理', () => {
    expect(normalizeTabIndex(-1)).toBe(-1)
    expect(normalizeTabIndex({ index: -1 })).toBe(-1)
  })

  it('認不出來的一律回 -1（退回全部），不要回 undefined 讓它變成空列表', () => {
    for (const bad of [undefined, null, {}, { index: 'x' }, 'x', NaN]) {
      expect(normalizeTabIndex(bad as any)).toBe(-1)
    }
  })
})

describe('monogramHue — 沒有品牌素材時的退路', () => {
  it('同一個名字永遠同一個色相', () => {
    expect(monogramHue('Llama 4')).toBe(monogramHue('Llama 4'))
  })

  it('落在審過的色盤裡，不是任意 hash（避開髒黃綠）', () => {
    for (const name of ['Llama 4', 'Mistral', '未知模型', 'Yi', '']) {
      expect(MONOGRAM_HUES).toContain(monogramHue(name))
    }
  })

  it('CJK 名字也穩定', () => {
    expect(monogramHue('智譜清言')).toBe(monogramHue('智譜清言'))
  })
})

describe('sortFamilies 熱門 — 伺服器補上 usageShare 之後才真的會動', () => {
  // 由來：這個排序寫好的時候 server 端還沒有全球用量欄位，於是它一直靜默退回
  // 預設次序——而「排序沒作用」跟「這一批剛好就是這個順序」在畫面上分不出來。
  const mk = (name: string, share?: number) => ({
    family: name,
    variants: [{ value: name.toLowerCase(), costScore: 30, billingType: 'fixed' }],
    ...(share === undefined ? {} : { usageShare: share }),
  })

  it('佔比高的排前面', () => {
    const list = [mk('A', 3.4), mk('B', 39.0), mk('C', 4.9)]
    expect(sortFamilies(list, 'popular').map(f => f.family)).toEqual(['B', 'C', 'A'])
  })

  it('沒有用量欄位的模型沉底，但不消失', () => {
    const list = [mk('NoData'), mk('B', 39.0)]
    expect(sortFamilies(list, 'popular').map(f => f.family)).toEqual(['B', 'NoData'])
  })

  it('全部都沒有資料時整份退回預設次序（降級，不是報錯）', () => {
    const list = [mk('A'), mk('B'), mk('C')]
    expect(sortFamilies(list, 'popular').map(f => f.family)).toEqual(['A', 'B', 'C'])
  })
})

describe('familyKey / dedupeFamilies — 清單鍵必須唯一，否則重排會炸掉整頁', () => {
  // 由來（2026-08-27 beta 實測）：「全部」把每個分類的 families 攤平，而同一個模型
  // 同時出現在「精選」與它的品牌分類裡——43 列裡有 10 個名字各出現兩次。
  // v-for 的 :key 是 family.family，於是有重複鍵。
  //
  // 重複鍵在**順序不變**時是潛伏的：Vue 照位置 patch，看起來一切正常。一旦排序讓
  // 清單重排，keyed patch 就會拿到 undefined 的 vnode：
  //   TypeError: Cannot read properties of undefined (reading 'key')
  // 而且那之後整個組件的 patch 都壞掉——選項點了不會變、連「確認」都關不掉浮層。
  // 症狀（浮層卡死）與根因（清單鍵重複）差了三層，這就是它值得一條測試的原因。
  const f = (name: string, value: string) => ({
    family: name,
    variants: [{ value, costScore: 30, billingType: 'fixed' }],
  })

  it('同一個模型出現在兩個分類 → 只留一列，位置取第一次出現的地方', () => {
    const input = [
      f('精選佔位', 'x'),
      f('DeepSeek V4 Flash', 'deepseek-v4-flash'),
      f('GLM-5.2', 'glm-5.2'),
      f('DeepSeek V4 Flash', 'deepseek-v4-flash'),
    ]
    const out = dedupeFamilies(input)
    expect(out.map(x => x.family)).toEqual(['精選佔位', 'DeepSeek V4 Flash', 'GLM-5.2'])
  })

  it('去重之後的清單，familyKey 一定唯一——這就是不會炸的那個保證', () => {
    const input = [
      f('DeepSeek V4 Flash', 'deepseek-v4-flash'),
      f('DeepSeek V4 Flash', 'deepseek-v4-flash'),
      f('MiMo V2.5', 'mimo-v2.5'),
      f('MiMo V2.5', 'mimo-v2.5'),
    ]
    const keys = dedupeFamilies(input).map(familyKey)
    expect(new Set(keys).size).toBe(keys.length)
  })

  it('排序之後鍵仍然唯一（重排正是重複鍵發作的時機）', () => {
    const input = [
      { ...f('A', 'a'), usageShare: 1 },
      { ...f('B', 'b'), usageShare: 9 },
      { ...f('A', 'a'), usageShare: 1 },
    ]
    const keys = sortFamilies(dedupeFamilies(input), 'popular').map(familyKey)
    expect(new Set(keys).size).toBe(keys.length)
    expect(keys.length).toBe(2)
  })

  it('沒有重複時原樣返回，不動順序也不動內容', () => {
    const input = [f('A', 'a'), f('B', 'b')]
    expect(dedupeFamilies(input)).toEqual(input)
  })

  it('壞資料不炸：null／缺 family 的項目要有可用的鍵，不能都變成同一個空字串', () => {
    expect(() => dedupeFamilies(null as any)).not.toThrow()
    const out = dedupeFamilies([f('A', 'a'), { variants: [{ value: 'z' }] } as any, { variants: [{ value: 'y' }] } as any])
    const keys = out.map(familyKey)
    expect(new Set(keys).size).toBe(keys.length)
  })
})

describe('sortFamilies — 沒有觀測資料的一律沉底，不論排序方向', () => {
  // 由來（2026-08-27 owner 回報）：選「首字最快」時，**完全沒量到延遲的模型跑到最前面**。
  //
  // 根因是 tie-break 的守衛把語意吃掉了。缺資料原本用 Infinity 當哨兵，比較式是
  // `a - b`；`Infinity - 500` 得到 `Infinity`，而 tie-break 的 `Number.isFinite(r)`
  // 判它不是有效比較 → 退回原始索引，於是缺資料的項目跟**每一個**項目都「同分」，
  // 位置由它原本在清單裡的位置決定——原本排前面的就留在前面。
  //
  // 教訓：哨兵值 + 算術比較，在「無限大」這個邊界上會跟 tie-break 打架。所以缺資料
  // 改成顯式的 null，由排序框架統一沉底，而不是靠每個指標各自挑一個哨兵。
  // fixture 要長得像**畫面會顯示的**那種資料：只給 avgLatencyMs 而沒有樣本數時，
  // getModelLatencySignal 會判 source='none'（畫面不顯示首字），那在新規則下等於
  // 沒有資料——所以這裡要給足夠的樣本數，否則測的是「全部都缺資料」。
  const withLatency = (name: string, ms: number | null) => ({
    family: name,
    variants: [{
      value: name.toLowerCase(), costScore: 30, billingType: 'fixed',
      ...(ms === null ? {} : {
        status: { status: 'green', confidence: 'high', sampleCount: 50, windowTotalCalls: 50, avgLatencyMs: ms },
      }),
    }],
  })

  it('首字最快：沒量到延遲的排最後，即使它原本在清單最前面', () => {
    const list = [
      withLatency('NoData1', null),
      withLatency('Slow', 9000),
      withLatency('NoData2', null),
      withLatency('Fast', 900),
    ]
    expect(sortFamilies(list, 'latency').map(f => f.family))
      .toEqual(['Fast', 'Slow', 'NoData1', 'NoData2'])
  })

  it('最穩定：沒有失敗率資料的排最後；失敗率 0 是真資料，必須排最前', () => {
    const mk = (name: string, rate: number | null) => ({
      family: name,
      variants: [{
        value: name, costScore: 30, billingType: 'fixed',
        ...(rate === null ? {} : {
          status: { status: 'green', confidence: 'high', sampleCount: 500, windowTotalCalls: 500, failureRate: rate },
        }),
      }],
    })
    expect(sortFamilies([mk('NoData', null), mk('Flaky', 0.3), mk('Perfect', 0)], 'stability')
      .map(f => f.family)).toEqual(['Perfect', 'Flaky', 'NoData'])
  })

  it('價格低：算不出價格的排最後，不要因為「無限大」而變成跟誰都同分', () => {
    const priced = (name: string, cost: number | null) => ({
      family: name,
      variants: cost === null ? [] : [{ value: name, costScore: cost, billingType: 'fixed' }],
    })
    expect(sortFamilies([priced('NoPrice', null), priced('Pricey', 300), priced('Cheap', 7)], 'price')
      .map(f => f.family)).toEqual(['Cheap', 'Pricey', 'NoPrice'])
  })

  it('輸出最快：沒量到吐字速度的排最後', () => {
    const tps = (name: string, v: number | null) => ({
      family: name,
      variants: [{
        value: name, costScore: 30, billingType: 'fixed',
        ...(v === null ? {} : {
          status: { status: 'green', confidence: 'high', sampleCount: 50, windowTotalCalls: 50,
                    performance: { tokensPerSecond: { current: v } } },
        }),
      }],
    })
    expect(sortFamilies([tps('NoData', null), tps('Slow', 20), tps('Fast', 400)], 'throughput')
      .map(f => f.family)).toEqual(['Fast', 'Slow', 'NoData'])
  })

  it('智力高／熱門：沒有分數的同樣沉底', () => {
    const iq = (name: string, v?: number) => ({
      family: name, variants: [{ value: name, costScore: 30, billingType: 'fixed' }],
      ...(v === undefined ? {} : { aaIntelligenceIndex: v }),
    })
    expect(sortFamilies([iq('NoScore'), iq('Low', 20), iq('High', 59)], 'intelligence')
      .map(f => f.family)).toEqual(['High', 'Low', 'NoScore'])

    const pop = (name: string, v?: number) => ({
      family: name, variants: [{ value: name, costScore: 30, billingType: 'fixed' }],
      ...(v === undefined ? {} : { usageShare: v }),
    })
    expect(sortFamilies([pop('NoRank'), pop('Some', 2), pop('Top', 39)], 'popular')
      .map(f => f.family)).toEqual(['Top', 'Some', 'NoRank'])
  })

  it('沉底的那一群彼此保持原本的相對次序，不要在裡面亂跳', () => {
    const list = [
      withLatency('NoA', null), withLatency('Fast', 100),
      withLatency('NoB', null), withLatency('NoC', null),
    ]
    expect(sortFamilies(list, 'latency').map(f => f.family))
      .toEqual(['Fast', 'NoA', 'NoB', 'NoC'])
  })

  it('全部都沒資料時整份退回預設次序（降級，不是亂序）', () => {
    const list = [withLatency('A', null), withLatency('B', null), withLatency('C', null)]
    expect(sortFamilies(list, 'latency').map(f => f.family)).toEqual(['A', 'B', 'C'])
  })
})

describe('finite 的 null 陷阱（兩端實作漂移的來源）', () => {
  // 由來：`Number(null) === 0`。mobile 沒用可選鏈，寫成 `finite(s && s.failureRate)`，
  // status 不存在時 `s && …` 得到 null → Number(null) → 0 → 「失敗率 0」＝最穩定，
  // 於是完全沒有遙測的模型被排到「最穩定」的第一名。desktop 用 `?.` 得到 undefined
  // → NaN → null，所以同一組測試在 desktop 綠、mobile 紅。
  //
  // 兩份同語意實作靠「大家都記得避開這個陷阱」是不成立的，所以把 null/undefined
  // 擋在 finite 裡面，讓兩端都不可能踩到。
  it('沒有失敗率遙測的模型不得被當成「失敗率 0」', () => {
    const noTelemetry = { family: 'NoTelemetry', variants: [{ value: 'n', costScore: 30, billingType: 'fixed' }] }
    const perfect = {
      family: 'Perfect',
      variants: [{ value: 'p', costScore: 30, billingType: 'fixed',
                   status: { status: 'green', confidence: 'high', sampleCount: 500, windowTotalCalls: 500, failureRate: 0 } }],
    }
    expect(sortFamilies([noTelemetry, perfect], 'stability').map(f => f.family))
      .toEqual(['Perfect', 'NoTelemetry'])
  })
})

describe('sortFamilies — 排序用的值必須就是畫面顯示的值', () => {
  // 由來（2026-08-27 owner 回報「首字最快把沒觀測資料的排前面」的深層版本）：
  //
  // 排序讀的是 status.avgLatencyMs（整輪耗時），畫面顯示的「首字」走
  // getModelLatencySignal——它優先用真 TTFB，其次 gateway TTFB，只有在 sampleCount ≥ 3
  // 時才退回 avgLatencyMs，否則 source='none' 完全不顯示。
  //
  // 於是排序是照一個「畫面上根本看不到的數字」在排：Grok 4.5 畫面顯示首字 1.0s 卻排在
  // 第 23 位，而三個畫面上沒有首字的 GPT 排在最前面。使用者看到的是「最快的排最後、
  // 沒資料的排最前」——兩件事都錯，而且從畫面上無從理解。
  //
  // 所以這一組釘住的是一條不變式：**排序取的值 === 畫面顯示的值**。畫面不顯示
  // （沒量到／樣本不足）就等於沒有資料，沉底。
  const fam = (name: string, status: any) => ({
    family: name,
    variants: [{ value: name, costScore: 30, billingType: 'fixed', ...(status ? { status } : {}) }],
  })

  it('首字：優先用真 TTFB，而不是整輪耗時', () => {
    const ttfbFast = fam('TtfbFast', {
      status: 'green', confidence: 'high', sampleCount: 50,
      avgLatencyMs: 40000, // 整輪很久
      performance: { firstTokenLatencyMs: { current: 900 } }, // 但首字很快
    })
    const avgFast = fam('AvgFast', {
      status: 'green', confidence: 'high', sampleCount: 50,
      avgLatencyMs: 3000,
      performance: { firstTokenLatencyMs: { current: 8000 } },
    })
    // 照 avgLatencyMs 排會是 AvgFast 在前；照畫面顯示的首字排，TtfbFast 才該在前。
    expect(sortFamilies([avgFast, ttfbFast], 'latency').map(f => f.family))
      .toEqual(['TtfbFast', 'AvgFast'])
  })

  it('首字：樣本不足到畫面不顯示時，等於沒有資料 → 沉底', () => {
    const notShown = fam('NotShown', {
      status: 'green', confidence: 'none', sampleCount: 1,
      avgLatencyMs: 100, // 數字很小，但畫面不會顯示它
    })
    const shown = fam('Shown', {
      status: 'green', confidence: 'high', sampleCount: 50,
      performance: { firstTokenLatencyMs: { current: 5000 } },
    })
    expect(sortFamilies([notShown, shown], 'latency').map(f => f.family))
      .toEqual(['Shown', 'NotShown'])
  })

  it('最穩定：畫面標「樣本不足」時，失敗率不可信 → 沉底', () => {
    const untrusted = fam('Untrusted', {
      status: 'green', confidence: 'none', sampleCount: 1, windowTotalCalls: 1, failureRate: 0,
    })
    const trusted = fam('Trusted', {
      status: 'green', confidence: 'high', sampleCount: 500, windowTotalCalls: 500, failureRate: 0.2,
    })
    expect(sortFamilies([untrusted, trusted], 'stability').map(f => f.family))
      .toEqual(['Trusted', 'Untrusted'])
  })

  it('輸出最快：畫面沒有吐字速度 chip 時 → 沉底', () => {
    const noChip = fam('NoChip', { status: 'green', confidence: 'high', sampleCount: 50 })
    const withChip = fam('WithChip', {
      status: 'green', confidence: 'high', sampleCount: 50,
      performance: { tokensPerSecond: { current: 120 } },
    })
    expect(sortFamilies([noChip, withChip], 'throughput').map(f => f.family))
      .toEqual(['WithChip', 'NoChip'])
  })

  it('用呼叫端指定的「代表線路」，跟畫面顯示的是同一條', () => {
    // 家族有兩條線路：第一條沒有 status，第二條很快。畫面顯示的是使用者選中的那條。
    const family = {
      family: 'TwoLanes',
      variants: [
        { value: 'lane-a', costScore: 30, billingType: 'fixed' },
        { value: 'lane-b', costScore: 30, billingType: 'fixed',
          status: { status: 'green', confidence: 'high', sampleCount: 50,
                    performance: { firstTokenLatencyMs: { current: 500 } } } },
      ],
    }
    const slow = fam('Slow', {
      status: 'green', confidence: 'high', sampleCount: 50,
      performance: { firstTokenLatencyMs: { current: 9000 } },
    })
    // 指定代表線路 = lane-b（有資料）→ TwoLanes 該排前面
    expect(sortFamilies([slow, family], 'latency',
      { primaryVariantOf: (f: any) => f.variants.find((v: any) => v.value === 'lane-b') || f.variants[0] })
      .map(f => f.family)).toEqual(['TwoLanes', 'Slow'])

    // 指定代表線路 = lane-a（沒資料）→ TwoLanes 沉底
    expect(sortFamilies([slow, family], 'latency',
      { primaryVariantOf: (f: any) => f.variants[0] })
      .map(f => f.family)).toEqual(['Slow', 'TwoLanes'])
  })
})

describe('variantStatusTone — 「不知道」不是「有狀況」', () => {
  // 由來（2026-08-27，server 端契約變更前的自查）：線路列的點燈只分 green / red，
  // 其餘一律 amber：
  //   v-if="getAvailabilityStatusClass(v) !== 'green'"
  //   :class="... === 'red' ? 'danger' : 'warning'"
  //
  // server 正在把「45 分鐘內沒有任何證據」的模型從 green 改成 unknown（沒證據就別
  // 假裝綠）。改完之後那一大批低流量模型會集體掛黃點——而黃點在我們的視覺語彙裡
  // 是「偏慢／有狀況」。使用者會讀成「這條線路怪怪的」，而真相是「我們沒有資料」。
  //
  // 「不知道」與「有問題」必須是兩種視覺。空心點表示前者，實心黃點保留給後者。
  it('red 是實心紅', () => {
    expect(variantStatusTone({ status: 'red' })).toBe('danger')
  })

  it('yellow 是實心黃', () => {
    expect(variantStatusTone({ status: 'yellow' })).toBe('warning')
  })

  it('green 不點燈——一頁 50 列全綠等於沒有燈', () => {
    expect(variantStatusTone({ status: 'green' })).toBeNull()
  })

  it('unknown 是空心，不得是黃色', () => {
    expect(variantStatusTone({ status: 'unknown' })).toBe('unknown')
  })

  it('認不得的狀態值當成 unknown，不要當成有問題', () => {
    // server 之後可能再加狀態值；預設落到「不知道」比落到「有狀況」安全——
    // 前者只是少講一件事，後者是講錯一件事。
    expect(variantStatusTone({ status: 'brand-new-value' })).toBe('unknown')
    expect(variantStatusTone({})).toBe('unknown')
  })

  it('完全沒有 status 物件 → 不點燈', () => {
    // 這跟 status:'unknown' 不同：前者是這一輪沒帶遙測回來，後者是伺服器明講不知道。
    expect(variantStatusTone(null)).toBeNull()
    expect(variantStatusTone(undefined)).toBeNull()
  })
})

describe('laneMetrics — 線路列第二行', () => {
  // 空間只夠兩個指標（手機 390px 實測，三個就截斷）。所以這一層的工作是
  // **決定哪兩個值得佔位**，而不是把有的都塞出去。
  //
  // server 契約（2026-08-27 與 server session 對齊）：
  // - 首字/完整回覆率只由真實對話供給，探針不供給 → probeOnly 時兩個都空
  // - performance.current 是中位數，p90 是尾巴；落差本身才是資訊
  // - outputRate（有沒有吐字）與 completionRate（有沒有講完）是兩個不同的壞法
  const st = (extra: any = {}) => ({ status: 'green', confidence: 'high', sampleCount: 50, windowTotalCalls: 50, ...extra })

  it('探針撐起來的線路：兩個值都空 → 標記為尚無使用資料', () => {
    // 不是「其中一個空」——首字與完整回覆率同源，沒有真實對話就一起沒有。
    const m = laneMetrics(st({ probeOnly: true }))
    expect(m.noUsageData).toBe(true)
    expect(m.latencyMs).toBeNull()
    expect(m.completionRate).toBeNull()
  })

  it('完全沒有效能資料也算尚無使用資料', () => {
    expect(laneMetrics(st()).noUsageData).toBe(true)
  })

  // 沒有速度資料時，這一列先前整行換成「尚無使用資料」——而使用者把那句話讀成
  // 「這條線路從來沒人用過」，於是永遠不點它，於是它永遠拿不到速度資料。正式站
  // 95 條線路裡有 57 條卡在這個迴圈裡。
  //
  // 可用率是**探針就能撐起來的**，而且跨線路可比。那 57 條全部都有 ≥20 筆可用率
  // 樣本，所以這一列不必空著。
  it('沒有速度資料但可用率樣本夠 → 給可用率，不再是一句「沒資料」', () => {
    const m = laneMetrics(st({ uptime: { percent24h: 98.41, samples24h: 63 } }))
    expect(m.noUsageData).toBe(false)
    expect(m.uptimePercent).toBe(98.41)
    expect(m.latencyMs).toBeNull()
  })

  it('探針撐起來的線路一樣給可用率——探針正是可用率的來源', () => {
    const m = laneMetrics(st({ probeOnly: true, uptime: { percent24h: 100, samples24h: 30 } }))
    expect(m.noUsageData).toBe(false)
    expect(m.uptimePercent).toBe(100)
    // 速度仍然一個都不給：探針是 5 個 token 的非串流請求，量的不是首字。
    expect(m.latencyMs).toBeNull()
    expect(m.outputRate).toBeNull()
  })

  it('可用率樣本不足就不給——寧可承認沒資料，也不要一個 100%（3 筆）', () => {
    const m = laneMetrics(st({ uptime: { percent24h: 100, samples24h: 3 } }))
    expect(m.noUsageData).toBe(true)
    expect(m.uptimePercent).toBeNull()
  })

  it('有速度資料時不擠可用率進來——那一列只夠兩個指標', () => {
    const m = laneMetrics(st({
      performance: { firstTokenLatencyMs: { current: 4700 }, outputRate: { current: 99 } },
      uptime: { percent24h: 98, samples24h: 60 },
    }))
    expect(m.noUsageData).toBe(false)
    expect(m.latencyMs).toBe(4700)
    expect(m.uptimePercent).toBeNull()
  })

  it('有真實對話 → 給首字與完整回覆率', () => {
    const m = laneMetrics(st({
      performance: { firstTokenLatencyMs: { current: 4700 }, completionRate: { current: 96 } },
    }))
    expect(m.noUsageData).toBe(false)
    expect(m.latencyMs).toBe(4700)
    expect(m.completionRate).toBe(96)
  })

  it('首字只報中位數，不report 尾巴——極值擺在中位數旁邊會被讀成「它就是這麼慢」', () => {
    // server 的 performance.*.current 本身就是中位數（P50）。先前把 p90 一起顯示成
    // 「9.7s→44.1s」，owner 判定那是誤導：使用者會把尾巴當成常態。
    const m = laneMetrics(st({
      performance: { firstTokenLatencyMs: { current: 4000, p90: 15000 } },
    }))
    expect(m.latencyMs).toBe(4000)
    expect('latencyP90Ms' in m).toBe(false)
  })

  it('出字率原值回報，不設門檻——列上永遠顯示它', () => {
    // 先前只在低於 88 時才回值（列上三段擠不下，所以只讓「壞消息」佔位）。
    // 現在列上固定顯示出字率，就沒有「值不值得佔位」這回事了：正常也要看得到。
    const good = laneMetrics(st({
      performance: { firstTokenLatencyMs: { current: 1000 }, outputRate: { current: 99 } },
    }))
    expect(good.outputRate).toBe(99)

    const bad = laneMetrics(st({
      performance: { firstTokenLatencyMs: { current: 1000 }, outputRate: { current: 62 } },
    }))
    expect(bad.outputRate).toBe(62)
  })

  it('沒有 status 不炸', () => {
    expect(laneMetrics(null).noUsageData).toBe(true)
    expect(() => laneMetrics(undefined)).not.toThrow()
  })
})

describe('detailMetrics — 展開層的兩欄 KV', () => {
  const fam = (extra: any = {}) => ({ family: 'X', variants: [{ value: 'x', costScore: 30 }], ...extra })

  it('全球用量保留名次不只給佔比', () => {
    // 收合列在 en 下第三段會被截斷，只給佔比的話英文使用者兩處都看不到名次。
    const m = detailMetrics(fam({ usageRank: 17, usageTotal: 48, usageShare: 0.6 }), null)
    expect(m.usage).toEqual({ rank: 17, total: 48, share: 0.6 })
  })

  it('可用率樣本不足時整列不出現，不寫「100%（3 筆）」', () => {
    const few = detailMetrics(fam(), { status: { uptime: { percent24h: 100, samples24h: 3 } } })
    expect(few.uptime).toBeNull()

    const enough = detailMetrics(fam(), { status: { uptime: { percent24h: 99.2, samples24h: 96 } } })
    expect(enough.uptime).toMatchObject({ percent24h: 99.2 })
  })

  it('72h 只在「剛從故障恢復」時追加：24h 明顯比 72h 好才顯示', () => {
    const recovered = detailMetrics(fam(), {
      status: { uptime: { percent24h: 99.5, samples24h: 96, percent72h: 91.0, samples72h: 288 } },
    })
    expect(recovered.uptime?.percent72h).toBe(91.0)

    // 落差不到 1 個百分點 → 沒有資訊量，不佔位
    const steady = detailMetrics(fam(), {
      status: { uptime: { percent24h: 99.5, samples24h: 96, percent72h: 99.1, samples72h: 288 } },
    })
    expect(steady.uptime?.percent72h).toBeNull()

    // 反向落差（24h 比 72h 差）不特別標——燈號已經在講了
    const degrading = detailMetrics(fam(), {
      status: { uptime: { percent24h: 90.0, samples24h: 96, percent72h: 99.0, samples72h: 288 } },
    })
    expect(degrading.uptime?.percent72h).toBeNull()
  })

  it('Agent 表現沒有值時仍然回一列（值為 null），讓 KV 的列組固定', () => {
    // 固定列組才能跨卡片比較——那正是選 KV 而不是 chips 的理由。
    expect(detailMetrics(fam(), null).agentic).toBeNull()
    expect(detailMetrics(fam({ aaAgenticIndex: 50 }), null).agentic).toBe(50)
  })

  it('上下文檔位給範圍', () => {
    const m = detailMetrics(fam({ contextBudgetOptions: [
      { text: '48K', value: 1, tokens: 48000 },
      { text: '128K', value: 4, tokens: 128000 },
    ] }), null)
    expect(m.contextRange).toEqual({ min: '48K', max: '128K' })
  })

  it('只有一個檔位時 min === max，呼叫端自己決定顯示成一個還是一段', () => {
    const m = detailMetrics(fam({ contextBudgetOptions: [{ text: '48K', value: 1, tokens: 48000 }] }), null)
    expect(m.contextRange).toEqual({ min: '48K', max: '48K' })
  })
})

describe('detailMetrics 的佔比要四捨五入到小數一位', () => {
  // 由來：實測畫面上出現「佔 0.32893907412701234%」。getUsageRank 早就把佔比取到
  // 小數一位了，detailMetrics 卻直接吐原始浮點數——兩個函式對**同一個顯示值**各算
  // 一次，於是漂開。凡是會進畫面的數字，格式化只能有一個地方決定。
  it('原始浮點數不得直接進畫面', () => {
    const m = detailMetrics({ family: 'X', variants: [], usageRank: 30, usageTotal: 48, usageShare: 0.32893907412701234 }, null)
    expect(m.usage?.share).toBe(0.3)
  })

  it('小數一位是刻意的：取整數會把 0.4% 變成 0%', () => {
    const m = detailMetrics({ family: 'X', variants: [], usageRank: 40, usageTotal: 48, usageShare: 0.44 }, null)
    expect(m.usage?.share).toBe(0.4)
  })
})

describe('uptimeBucketTone — 逐小時狀態方塊的配色', () => {
  // 方塊等高，顏色是唯一的訊息，所以分檔錯了整張圖就是錯的。
  // 門檻跟 server 判燈號同一組（綠 >=95 / 黃 75-95 / 紅 <75）——兩邊不同高的話，
  // 會出現「圖上一格綠、燈卻是紅」這種沒人認帳的畫面。
  it('沒有請求的那一小時是 no-data，不是 0%', () => {
    // 畫成 0% 會被讀成「那小時全掛了」。冷門線路整排沒資料是常態。
    expect(uptimeBucketTone({ total: 0, percent: 0 })).toBe('none')
    expect(uptimeBucketTone({ total: 0, percent: 100 })).toBe('none')
    expect(uptimeBucketTone(null)).toBe('none')
    expect(uptimeBucketTone({})).toBe('none')
  })

  it('門檻對齊 server：95 是綠的下緣，75 是黃的下緣', () => {
    expect(uptimeBucketTone({ total: 10, percent: 100 })).toBe('green')
    expect(uptimeBucketTone({ total: 10, percent: 95 })).toBe('green')
    expect(uptimeBucketTone({ total: 10, percent: 94.9 })).toBe('amber')
    expect(uptimeBucketTone({ total: 10, percent: 75 })).toBe('amber')
    expect(uptimeBucketTone({ total: 10, percent: 74.9 })).toBe('red')
    expect(uptimeBucketTone({ total: 10, percent: 0 })).toBe('red')
  })

  it('一格樣本太少時不配色：1-2 筆算出來的百分比是雜訊不是訊息', () => {
    // 一格只有 1 筆而那筆失敗 → 0%，會畫出一格刺眼的紅，但它什麼也沒證明。
    // server 側同樣用 5 筆下限，兩邊要一致。
    expect(uptimeBucketTone({ total: 1, percent: 0 })).toBe('none')
    expect(uptimeBucketTone({ total: 4, percent: 0 })).toBe('none')
    expect(uptimeBucketTone({ total: 4, percent: 100 })).toBe('none')
    expect(uptimeBucketTone({ total: 5, percent: 100 })).toBe('green')
    expect(uptimeBucketTone({ total: 5, percent: 0 })).toBe('red')
  })

  it('有請求但 percent 缺值 → no-data，不要猜成 0', () => {
    expect(uptimeBucketTone({ total: 5 })).toBe('none')
    expect(uptimeBucketTone({ total: 5, percent: null })).toBe('none')
  })
})

describe('pinFamilyToTop — 目前使用釘最上面', () => {
  const fam = (n, v) => ({ family: n, variants: [{ value: v || (n + '-1') }] })
  const names = (list) => list.map(f => f.family)

  it('把選中的那條線路所屬的家族搬到第一位，其餘維持原本相對次序', () => {
    const out = pinFamilyToTop([fam('A'), fam('B'), fam('C'), fam('D')], 'C-1')
    expect(names(out)).toEqual(['C', 'A', 'B', 'D'])
  })

  // 由來：手機端點下面某個模型的線路，那一列會直接跳到頁面最上面，人在下面就
  // 看不見了——症狀是「點完就消失」。根因是釘住的目標取的是**當下選中**，而點
  // 線路正好會改變當下選中，於是使用者自己的動作把自己看的東西搬走了。
  it('只認傳進來的目標，不自己判斷誰被選中', () => {
    const list = [fam('A'), fam('B')]
    expect(names(pinFamilyToTop(list, 'B-1'))).toEqual(names(pinFamilyToTop(list, 'B-1')))
  })
})

describe('sortFamilies — 新品在預設瀏覽序裡置頂', () => {
  // 由來：新品剛上架時全球用量榜上還沒有它，usageShare 是 null，於是照「沒有觀測
  // 資料一律沉底」被排到最後面——我們剛接進來的模型在預設排序下反而最不容易被
  // 看到，跟「新品」徽章想達到的效果正好相反。
  const fam = (name, share, isNew) => ({
    family: name,
    usageShare: share,
    badges: isNew ? ['new'] : [],
    variants: [{ value: name + '-a', status: {} }],
  })
  const names = (list) => list.map(f => f.family)

  it('熱門：新品排在前面，兩組各自照熱度排', () => {
    const list = [
      fam('OldHot', 30, false),
      fam('NewCold', null, true),
      fam('OldCold', 5, false),
      fam('NewWarm', 10, true),
    ]
    expect(names(sortFamilies(list, 'popular', {}))).toEqual(
      ['NewWarm', 'NewCold', 'OldHot', 'OldCold']
    )
  })

  it('使用者明確挑了某個排序時不置頂——他要的是那個排序', () => {
    const list = [
      fam('CheapOld', 1, false),
      fam('PriceyNew', 100, true),
    ]
    list[0].variants[0].costScore = 1
    list[1].variants[0].costScore = 100
    // 價格由低到高：新品不該因為是新品就插到便宜的前面
    const out = names(sortFamilies(list, 'price', {}))
    expect(out[0]).toBe('CheapOld')
  })

  it('沒有 badges 欄位不當成新品，也不炸', () => {
    const noBadges = { family: 'X', usageShare: 5, variants: [{ value: 'x', status: {} }] }
    const isNew = fam('N', null, true)
    expect(names(sortFamilies([noBadges, isNew], 'popular', {}))).toEqual(['N', 'X'])
  })
})

describe('pinFamilyToTop — 免費模型改過名，用名字比對會永遠對不上', () => {
  // 由來：release review 抓到的。pin 目標取自原始目錄的 family 名（BaseBot），
  // 但清單上的免費那一列已經被 mergeFreeModelFamilies 改名成「免費模型」。
  // 用名字比對永遠不相等 → 免費檔位使用者的「目前使用」永遠釘不到，而新的排序
  // 又把沒有 usageShare 的沉底，於是它落在整份清單的最底部。
  it('用選中的線路 value 比對，改過名的家族也釘得到', () => {
    const list = [
      { family: 'A', variants: [{ value: 'a-1' }] },
      // 免費那一列：家族名已改成顯示名，但 variants 仍是原本的 BaseBot-*
      { family: '免費模型', variants: [{ value: 'BaseBot-1' }, { value: 'BaseBot-2' }] },
      { family: 'C', variants: [{ value: 'c-1' }] },
    ]
    const out = pinFamilyToTop(list, 'BaseBot-1')
    expect(out.map(f => f.family)).toEqual(['免費模型', 'A', 'C'])
  })

  it('找不到、沒指定、或本來就在第一位 → 次序完全不動', () => {
    const list = [
      { family: 'A', variants: [{ value: 'a-1' }] },
      { family: 'B', variants: [{ value: 'b-1' }] },
    ]
    const names = (l) => l.map(f => f.family)
    expect(names(pinFamilyToTop(list, null))).toEqual(['A', 'B'])
    expect(names(pinFamilyToTop(list, 'nope'))).toEqual(['A', 'B'])
    expect(names(pinFamilyToTop(list, 'a-1'))).toEqual(['A', 'B'])
  })
})

describe('uptimeBucketTone — 優先用 server 算好的 state', () => {
  // server 的註解明講不要讓前端拿 percent 自己分檔：兩邊各存一份門檻會慢慢分岔，
  // 而分岔之後沒有任何測試看得見——列上的燈跟方塊圖會對同一段時間給出不同顏色。
  it('有 state 就用 state，不再自己看 percent', () => {
    expect(uptimeBucketTone({ state: 'normal', total: 10, percent: 10 })).toBe('green')
    expect(uptimeBucketTone({ state: 'degraded', total: 10, percent: 100 })).toBe('amber')
    expect(uptimeBucketTone({ state: 'error', total: 10, percent: 100 })).toBe('red')
    expect(uptimeBucketTone({ state: 'no_data', total: 10, percent: 100 })).toBe('none')
  })

  it('認不得的 state 當成沒有資料，不猜', () => {
    expect(uptimeBucketTone({ state: 'brand-new-state', total: 10, percent: 100 })).toBe('none')
  })

  it('沒有 state 才退回 percent 分檔（相容還沒帶 state 的舊回應）', () => {
    expect(uptimeBucketTone({ total: 10, percent: 100 })).toBe('green')
    expect(uptimeBucketTone({ total: 10, percent: 80 })).toBe('amber')
    expect(uptimeBucketTone({ total: 10, percent: 10 })).toBe('red')
    expect(uptimeBucketTone({ total: 0, percent: 0 })).toBe('none')
  })
})
