export type ContextControlMode = 'multiplier' | 'stable'

export interface ContextBudgetOption {
  text?: string
  label?: string
  name?: string
  value: number
  tokens?: number
}

export interface ContextBudgetLevelOption extends ContextBudgetOption {
  level: number
  progress: number
  isFloor: boolean
  isCap: boolean
}

export interface ThinkingDepthOption {
  text?: string
  label?: string
  labelKey?: string
  value: string
}

// 邊界 7（模型思考能力三檔聲明制）
export type ThinkingControl = 'none' | 'toggleable' | 'adaptive'

export interface ContextCapableModel {
  value?: string
  family?: string
  isCacheStable?: boolean
  contextBudgetOptions?: ContextBudgetOption[]
  noLimitEligible?: boolean
  noLimitCovered?: boolean
  thinkingControl?: string
  thinkingDepthOptions?: ThinkingDepthOption[]
}

export interface NoLimitUserLike {
  isNoLimitMember?: boolean
}

export type NoLimitCoverageState = 'available' | 'unavailable'

export interface ModelFamily {
  family?: string
  isCacheStable?: boolean
  contextBudgetOptions?: ContextBudgetOption[]
  variants?: ContextCapableModel[]
}

export interface ModelGroupLike {
  families?: ModelFamily[]
  models?: ContextCapableModel[]
}

const stableFallbackContextBudgetTokens: Record<number, number> = {
  1: 64000,
  2: 96000,
  3: 128000,
  4: 144000,
  5: 168000,
  100: 168000,
}

const legacyFallbackContextBudgetTokens: Record<number, number> = {
  1: 48000,
  2: 64000,
  3: 80000,
  4: 96000,
  5: 128000,
  100: 128000,
}

const defaultLegacyContextBudgetOptions: ContextBudgetOption[] = [
  { text: '48K', value: 1, tokens: 48000 },
  { text: '64K', value: 2, tokens: 64000 },
  { text: '80K', value: 3, tokens: 80000 },
  { text: '96K', value: 4, tokens: 96000 },
  { text: '128K', value: 5, tokens: 128000 },
]

const formatBudgetText = (value: number, tokens?: number): string => {
  if (Number.isFinite(value) && value >= 64) {
    return `${Math.round(value)}K`
  }
  // 先取到區域變數再判斷：`Number.isFinite(tokens)` 不會讓型別檢查知道
  // `tokens` 之後不再是 undefined，底下三處除法就全是「可能除以 undefined」。
  const tokenCount = Number(tokens)
  if (Number.isFinite(tokenCount) && tokenCount > 0) {
    const binaryK = tokenCount / 1024
    if (Math.abs(binaryK - Math.round(binaryK)) < 0.01) {
      return `${Math.round(binaryK)}K`
    }
    return `${Math.round(tokenCount / 1000)}K`
  }
  return String(value)
}

const normalizeOption = (
  item: ContextBudgetOption,
  fallbackTokens: Record<number, number>,
  collapseStableMax: boolean,
): ContextBudgetOption | null => {
  const rawValue = Number(item?.value)
  if (!Number.isFinite(rawValue) || rawValue <= 0) return null
  const tokens = Number(item?.tokens)
  const normalizedTokens = Number.isFinite(tokens) && tokens > 0 ? tokens : fallbackTokens[rawValue]
  const value = collapseStableMax && rawValue === 100 && normalizedTokens === 168000 ? 5 : rawValue
  const explicitText = item?.text || item?.label || item?.name || ''
  const text = collapseStableMax && rawValue === 100 && normalizedTokens === 168000
    ? '168K'
    : String(explicitText || formatBudgetText(value, normalizedTokens))

  return {
    text,
    value,
    ...(normalizedTokens ? { tokens: normalizedTokens } : {}),
  }
}

export const getStableContextOptions = (model?: ContextCapableModel | null): ContextBudgetOption[] => {
  if (!model?.isCacheStable || !Array.isArray(model.contextBudgetOptions)) return []

  const out: ContextBudgetOption[] = []
  const seen = new Map<number, number>()
  for (const raw of model.contextBudgetOptions) {
    const option = normalizeOption(raw, stableFallbackContextBudgetTokens, true)
    if (!option) continue
    const key = option.tokens || option.value
    const existingIndex = seen.get(key)
    if (existingIndex === undefined) {
      seen.set(key, out.length)
      out.push(option)
    } else if (out[existingIndex].value === 100 && option.value !== 100) {
      out[existingIndex] = option
    }
  }
  return out
}

export const getLegacyContextOptions = (model?: ContextCapableModel | null): ContextBudgetOption[] => {
  const source = Array.isArray(model?.contextBudgetOptions) && !model?.isCacheStable
    ? model.contextBudgetOptions
    : defaultLegacyContextBudgetOptions
  const out: ContextBudgetOption[] = []
  const seen = new Set<number>()
  for (const raw of source) {
    const option = normalizeOption(raw, legacyFallbackContextBudgetTokens, false)
    if (!option) continue
    const key = option.tokens || option.value
    if (seen.has(key)) continue
    seen.add(key)
    out.push(option)
  }
  return out.length > 0 ? out : defaultLegacyContextBudgetOptions
}

export const getContextBudgetOptions = (model?: ContextCapableModel | null): ContextBudgetOption[] => {
  const stableOptions = getStableContextOptions(model)
  return stableOptions.length > 0 ? stableOptions : getLegacyContextOptions(model)
}

export const getStableContextLevelOptions = (
  model?: ContextCapableModel | null,
): ContextBudgetLevelOption[] => {
  const options = getStableContextOptions(model)
  const maxIndex = Math.max(options.length - 1, 1)
  return options.map((option, index) => ({
    ...option,
    level: index + 1,
    progress: Math.round((index / maxIndex) * 100),
    isFloor: index === 0,
    isCap: index === options.length - 1,
  }))
}

export const getContextBudgetLevelOptions = (
  model?: ContextCapableModel | null,
): ContextBudgetLevelOption[] => {
  const options = getContextBudgetOptions(model)
  const maxIndex = Math.max(options.length - 1, 1)
  return options.map((option, index) => ({
    ...option,
    level: index + 1,
    progress: Math.round((index / maxIndex) * 100),
    isFloor: index === 0,
    isCap: index === options.length - 1,
  }))
}

export const getContextControlMode = (model?: ContextCapableModel | null): ContextControlMode => {
  return getStableContextOptions(model).length > 0 ? 'stable' : 'multiplier'
}

// 邊界 7：缺欄位 / 未知值 → fallback 'toggleable'（=現行行為，零劣化）。
const THINKING_CONTROL_VALUES: ThinkingControl[] = ['none', 'toggleable', 'adaptive']

export const getThinkingControl = (model?: ContextCapableModel | null): ThinkingControl => {
  const value = model?.thinkingControl
  return (THINKING_CONTROL_VALUES as string[]).includes(value as string)
    ? (value as ThinkingControl)
    : 'toggleable'
}

export const isAdaptiveThinkingModel = (model?: ContextCapableModel | null): boolean => {
  return getThinkingControl(model) === 'adaptive'
}

// none → 思考控制全部不顯示；adaptive → 過濾掉「關閉」選項（off，關不掉）；
// toggleable（含 fallback）→ 現行「關閉＋深度檔位」UI 不變。
export const getVisibleThinkingDepthOptions = (
  model?: ContextCapableModel | null,
): ThinkingDepthOption[] => {
  const list = Array.isArray(model?.thinkingDepthOptions) ? model!.thinkingDepthOptions! : []
  const control = getThinkingControl(model)
  if (control === 'none') return []
  if (control === 'adaptive') return list.filter((item) => !item || item.value !== 'off')
  return list
}

const mergeStableFamilyMetadata = (
  family?: ModelFamily | null,
  variant?: ContextCapableModel | null,
): ContextCapableModel | null => {
  if (!family) return variant || null
  const out: ContextCapableModel = {
    ...(variant || {}),
    family: family.family || variant?.family,
  }
  if (!out.isCacheStable && family.isCacheStable) {
    out.isCacheStable = family.isCacheStable
  }
  if (!Array.isArray(out.contextBudgetOptions) && Array.isArray(family.contextBudgetOptions)) {
    out.contextBudgetOptions = family.contextBudgetOptions
  }
  return out
}

export const findModelByValue = (
  groups?: ModelGroupLike[] | null,
  modelValue?: string | null,
): ContextCapableModel | null => {
  if (!Array.isArray(groups) || !modelValue) return null
  for (const group of groups) {
    const families = Array.isArray(group?.families) ? group.families : []
    for (const family of families) {
      const variants = Array.isArray(family?.variants) ? family.variants : []
      for (const variant of variants) {
        if (variant?.value === modelValue) {
          return mergeStableFamilyMetadata(family, variant)
        }
      }
    }

    const models = Array.isArray(group?.models) ? group.models : []
    for (const model of models) {
      if (model?.value === modelValue) return model
    }
  }
  return null
}

export const isAutoCompactForcedForModel = (model?: ContextCapableModel | null): boolean => {
  return getContextControlMode(model) === 'stable'
}

export const getEffectiveAutoCompactEnabled = (
  autoCompactEnabled: boolean,
  model?: ContextCapableModel | null,
): boolean => {
  return isAutoCompactForcedForModel(model) || Boolean(autoCompactEnabled)
}

export const getNoLimitCoverageState = (
  userInfo?: NoLimitUserLike | null,
  model?: ContextCapableModel | null,
  contextValue?: number | string | null,
): NoLimitCoverageState | null => {
  if (!userInfo?.isNoLimitMember) return null
  if (!model) return 'unavailable'

  const eligible = Boolean(model.noLimitEligible || model.noLimitCovered)
  if (!eligible) return 'unavailable'

  if (getContextControlMode(model) === 'stable') {
    return model.noLimitCovered === true ? 'available' : 'unavailable'
  }

  return model.noLimitCovered === false ? 'unavailable' : 'available'
}

export const normalizeStableContextValue = (
  value: number | string | undefined | null,
  model?: ContextCapableModel | null,
): number => {
  const options = getStableContextOptions(model)
  if (options.length === 0) {
    const numeric = Number(value)
    return Number.isFinite(numeric) && numeric > 0 ? numeric : 1
  }

  const numeric = Number(value)
  if (Number.isFinite(numeric) && options.some((item) => item.value === numeric)) {
    return numeric
  }

  const legacyTokens = stableFallbackContextBudgetTokens[numeric]
  if (legacyTokens) {
    const byTokens = options.find((item) => item.tokens === legacyTokens)
    if (byTokens) return byTokens.value
    if (numeric === 100) {
      const stableCap = options.find((item) => item.value === 5)
      if (stableCap) return stableCap.value
    }
  }

  return options[0].value
}

export const normalizeContextValue = (
  value: number | string | undefined | null,
  model?: ContextCapableModel | null,
): number => {
  if (getContextControlMode(model) === 'stable') {
    return normalizeStableContextValue(value, model)
  }
  const options = getLegacyContextOptions(model)
  const numeric = Number(value)
  if (Number.isFinite(numeric) && options.some((item) => item.value === numeric)) {
    return numeric
  }
  if (numeric === 100) {
    const maxOption = options[options.length - 1]
    if (maxOption) return maxOption.value
  }
  return options[0]?.value || 1
}
