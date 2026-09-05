/**
 * 上下文用量：這一輪送進模型的那份提示詞，占玩家選的上下文容量幾成。
 *
 * ── 口徑 ──
 * 分子＝這一則 AI 回覆存下來的輸入 token（伺服器按上游回報的 prompt_tokens 記，
 * 含快取命中的部分）；分母＝這一則所用模型、在玩家目前上下文檔位下的容量 token。
 * 這正是伺服器判斷「該不該整理記憶」用的同一組數字（真實輸入 ≥ 容量的 92% 就整理），
 * 所以玩家看到「接近上限」的那一刻，跟伺服器開始整理記憶的那一刻是同一刻。
 *
 * ── 近似 ──
 * 歷史列沒有記下生成當時的檔位，分母一律用「現在的檔位」。玩家中途調過檔位的話，
 * 舊列的百分比會跟著現在的容量重算——這是刻意的：它回答的是「以現在的設定，
 * 這一輪算滿不滿」，玩家調檔位就是為了看這個。
 *
 * ── 脫敏 ──
 * 對外只露百分比與一個粗略等級。token 數、容量大小、模型視窗、線路都不出這支檔案：
 * 那些是內部口徑，放到畫面上只會讓玩家拿去跟別家比、或反推我們的成本結構。
 */

export type ContextUsageLevel = 'low' | 'mid' | 'high' | 'full'

export interface ContextUsage {
  /** 1–100 的整數 */
  percent: number
  level: ContextUsageLevel
}

export interface ContextUsageDisplay {
  /** 常駐 chip 上的字，例如「上下文 38%」 */
  label: string
  /** 懸停／長按看到的一句說明 */
  tip: string
  level: ContextUsageLevel
}

interface ContextOptionLike {
  value?: number
  tokens?: number
}

/**
 * 「接近上限」的門檻跟伺服器整理記憶的水位線同一個數（0.92）：
 * 玩家看到這一級就代表下一輪很可能會先整理記憶再回覆。
 */
export const CONTEXT_USAGE_FULL_PERCENT = 92
export const CONTEXT_USAGE_HIGH_PERCENT = 75
export const CONTEXT_USAGE_MID_PERCENT = 45

export function contextUsageLevel(percent: number): ContextUsageLevel {
  if (percent >= CONTEXT_USAGE_FULL_PERCENT) return 'full'
  if (percent >= CONTEXT_USAGE_HIGH_PERCENT) return 'high'
  if (percent >= CONTEXT_USAGE_MID_PERCENT) return 'mid'
  return 'low'
}

/** 從模型的檔位表挑出玩家目前檔位的容量；找不到就 null（不猜一個）。 */
export function contextBudgetTokens(
  options: ContextOptionLike[] | null | undefined,
  level: number | string | null | undefined,
): number | null {
  if (!Array.isArray(options) || !options.length) return null
  const wanted = Number(level)
  if (!Number.isFinite(wanted)) return null
  const hit = options.find((o) => Number(o?.value) === wanted)
  const tokens = Number(hit?.tokens)
  return Number.isFinite(tokens) && tokens > 0 ? tokens : null
}

export function computeContextUsage(input: {
  inputTokens?: number | string | null
  budgetTokens?: number | null
}): ContextUsage | null {
  const used = Number(input.inputTokens)
  const budget = Number(input.budgetTokens)
  if (!Number.isFinite(used) || used <= 0) return null
  if (!Number.isFinite(budget) || budget <= 0) return null
  // 彈性升檔時真實輸入可能略高於玩家選的容量；畫面封頂在 100，不出現 100 以上的數字。
  const percent = Math.min(100, Math.max(1, Math.round((used / budget) * 100)))
  return { percent, level: contextUsageLevel(percent) }
}

type Translate = (key: string, params?: Record<string, unknown>) => string

export function formatContextUsage(usage: ContextUsage | null, t: Translate): ContextUsageDisplay | null {
  if (!usage) return null
  const levelText = t(`canvas.context.level.${usage.level}`)
  return {
    label: t('canvas.context.chip', { percent: usage.percent }),
    tip: t('canvas.context.tip', { percent: usage.percent, level: levelText }),
    level: usage.level,
  }
}
