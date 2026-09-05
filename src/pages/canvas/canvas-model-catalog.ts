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

export function scoreParts(variant?: ModelVariantLike | null): ScoreParts {
  if (!variant) return { text: '', dynamic: false }
  if (variant.billingType === 'dynamic') {
    const lo = Number(variant.estMinScore)
    const hi = Number(variant.estMaxScore)
    if (Number.isFinite(lo) && Number.isFinite(hi) && lo > 0 && hi > 0) {
      return lo === hi
        ? { text: String(lo), dynamic: true }
        : { text: `${lo}${DASH}${hi}`, dynamic: true }
    }
  }
  // 0 要寫出來：免費模型一輪就是不用點。留白會被讀成「還在載入」或「算不出來」。
  // 真正該留白的只有「伺服器沒給這個欄位」。
  const cost = Number(variant.costScore)
  if (Number.isFinite(cost) && cost >= 0) return { text: String(cost), dynamic: false }
  return { text: '', dynamic: false }
}

export function formatScore(variant?: ModelVariantLike | null): string {
  return scoreParts(variant).text
}
