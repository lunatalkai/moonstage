/**
 * 模型目錄：從「群組 → 家族 → 線路」讀出畫面要的兩件事——有哪些可以選、
 * 現在這一條一輪多少點。
 *
 * 點數為什麼要有自己的一支函式：固定計價的模型每輪就是那個數字；動態計價的
 * 要跑完才知道，只能給區間。把兩種混在同一個欄位顯示，玩家會拿區間的下界去跟
 * 固定價比，得到「這個比較便宜」的錯誤結論。所以格式化只有這一個入口，
 * 動態的永遠寫成區間。
 */

export interface ContextOptionLike {
  text?: string
  value?: number
  tokens?: number
}

export interface ThinkingOptionLike {
  value?: string
  labelKey?: string
  descriptionKey?: string
}

export interface ModelVariantLike {
  value: string
  name?: string
  description?: string
  isMember?: boolean
  fast?: number
  smart?: number
  safe?: number
  costScore?: number
  maxScore?: number
  isSupportMax?: boolean
  billingType?: string
  estMinScore?: number
  estMaxScore?: number
  contextBudgetOptions?: ContextOptionLike[]
  thinkingDepthOptions?: ThinkingOptionLike[]
  defaultThinkingDepth?: string
  thinkingControl?: string
  /**
   * 同一顆模型的不同線路，給玩家看的名字。
   *
   * 線路的內部代號帶著真實供應商的名字，不能出現在畫面上——玩家看到的一律是
   * 這個標籤。沒有標籤的線路就只顯示模型名。
   */
  channelLabel?: string
}

export interface FlatVariant extends ModelVariantLike {
  /** 來自哪個群組（畫面上的分段標題） */
  group: string
  /** 來自哪個家族（同一顆模型的不同線路共用一個家族名） */
  family: string
}

export interface ModelFamilyLike {
  family?: string
  description?: string
  contextBudgetOptions?: ContextOptionLike[]
  thinkingDepthOptions?: ThinkingOptionLike[]
  defaultThinkingDepth?: string
  variants?: ModelVariantLike[]
}

export interface ModelGroupLike {
  group?: string
  desc?: string
  families?: ModelFamilyLike[]
}

/**
 * 攤平成一層。
 *
 * 家族層跟線路層都可能帶上下文檔位與思考檔位；線路自己有就用自己的，沒有才
 * 承家族的——伺服器對舊模型只在家族層給，少了這一補畫面上會變成沒有檔位可選。
 */
export function flattenVariants(groups?: ModelGroupLike[] | null): FlatVariant[] {
  if (!Array.isArray(groups)) return []
  const out: FlatVariant[] = []
  for (const group of groups) {
    const families = Array.isArray(group?.families) ? group.families : []
    for (const family of families) {
      const variants = Array.isArray(family?.variants) ? family.variants : []
      for (const variant of variants) {
        if (!variant || !variant.value) continue
        out.push({
          ...variant,
          group: String(group?.group || ''),
          family: String(family?.family || variant.name || ''),
          contextBudgetOptions: variant.contextBudgetOptions || family?.contextBudgetOptions,
          thinkingDepthOptions: variant.thinkingDepthOptions || family?.thinkingDepthOptions,
          defaultThinkingDepth: variant.defaultThinkingDepth || family?.defaultThinkingDepth,
        })
      }
    }
  }
  return out
}

/**
 * 找一條線路。找不到回 null，不回第一條——回第一條等於在玩家沒動手的情況下
 * 把他選的模型換掉，而畫面上看起來一切正常。
 */
export function findVariant(
  groups: ModelGroupLike[] | null | undefined,
  value: string,
): FlatVariant | null {
  if (!value) return null
  const hit = flattenVariants(groups).find((v) => v.value === value)
  return hit || null
}

/**
 * 顯示用的代號換算。
 *
 * 這一層曾經還負責換算客戶端自己塞的佔位代號。現在不需要了：這一頁進場就把遊玩
 * 設定清成「還不知道」，再去伺服器讀真正的值——手上不會再有一個沒有人挑過的代號。
 *
 * 線路上線前存下的基礎代號另外處理（見 canvas-model-lanes 的 resolveStoredModel）：
 * 那是玩家真的挑過的值，只是目錄裡不再單獨列出它。
 */
export function resolveVariant(
  groups: ModelGroupLike[] | null | undefined,
  value: string,
): FlatVariant | null {
  return findVariant(groups, value)
}

export interface ScoreParts {
  /** 顯示用的字；沒有點數資訊時是空字串 */
  text: string
  /** 是不是區間（動態計價） */
  dynamic: boolean
}

const DASH = '–' // en dash：區間用，跟減號區分

/** 影響每輪點數的兩個設定：上下文檔位（1–5，100＝MAX）與思考深度。 */
export interface ScoreContext {
  context?: number
  thinkingDepth?: string
}

export interface VariantPrice {
  isDynamic: boolean
  /** 固定計價：這一輪的點數 */
  fixed?: number
  /** 動態計價：估算區間 */
  min?: number
  max?: number
  source?: string
  sampleCount?: number
}

/**
 * 思考深度的固定加價，跟伺服器同一張表：只有 deepseek-v4-flash 有，max +10、high／on +5。
 * 沒指定深度時用模型的預設深度。
 */
export function fixedThinkingSurcharge(variant: ModelVariantLike, thinkingDepth?: string): number {
  if (variant.value !== 'deepseek-v4-flash') return 0
  const depth = thinkingDepth || variant.defaultThinkingDepth || ''
  if (depth === 'max') return 10
  if (depth === 'high' || depth === 'on') return 5
  return 0
}

/**
 * 每輪點數的唯一算法（伺服器的 getScoreByModelWithThinkingDepth 同一規則）：
 *   固定計價＝costScore × 檔位；MAX 檔且模型支援 MAX 時用 maxScore，不支援就當第 5 檔；
 *   再加思考深度的固定加價。動態計價＝伺服器估好的區間，已經是該檔位的，不再乘。
 *
 * 由來（2026-09-13）：輸入區左下角原本直接拿 costScore，固定計價的線路選了 128K 之後
 * 面板寫 900、左下角還是 180——同一個數字兩個地方各算各的。
 */
export function variantPrice(variant: ModelVariantLike, opts: ScoreContext = {}): VariantPrice {
  if (variant.billingType === 'dynamic') {
    return {
      isDynamic: true,
      min: Number(variant.estMinScore) || 0,
      max: Number(variant.estMaxScore) || 0,
      source: (variant as any).estSource || 'formula',
      sampleCount: Number((variant as any).estSampleCount) || 0,
    }
  }
  const surcharge = fixedThinkingSurcharge(variant, opts.thinkingDepth)
  const rawContext = Number(opts.context)
  if (rawContext === 100 && variant.isSupportMax) {
    return { isDynamic: false, fixed: (Number(variant.maxScore) || 0) + surcharge }
  }
  const level = rawContext === 100 ? 5 : (Number.isFinite(rawContext) && rawContext > 0 ? rawContext : 1)
  const cost = Number(variant.costScore)
  if (!Number.isFinite(cost) || cost < 0) return { isDynamic: false, fixed: NaN }
  return { isDynamic: false, fixed: cost * level + surcharge }
}

export function scoreParts(variant?: ModelVariantLike | null, opts: ScoreContext = {}): ScoreParts {
  if (!variant) return { text: '', dynamic: false }
  let price = variantPrice(variant, opts)
  if (price.isDynamic) {
    const lo = price.min || 0
    const hi = price.max || 0
    if (lo > 0 && hi > 0) {
      return lo === hi
        ? { text: String(lo), dynamic: true }
        : { text: `${lo}${DASH}${hi}`, dynamic: true }
    }
    // 動態計價但伺服器還沒給估算區間：退回固定計價那套算，總比留白好
    price = variantPrice({ ...variant, billingType: undefined }, opts)
  }
  // 0 要寫出來：免費模型一輪就是不用點。留白會被讀成「還在載入」或「算不出來」。
  // 真正該留白的只有「伺服器沒給這個欄位」。
  if (Number.isFinite(price.fixed)) return { text: String(price.fixed), dynamic: false }
  return { text: '', dynamic: false }
}

export function formatScore(variant?: ModelVariantLike | null, opts: ScoreContext = {}): string {
  return scoreParts(variant, opts).text
}
