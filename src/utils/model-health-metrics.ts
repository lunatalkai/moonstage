export type ModelAvailabilityStatus = 'green' | 'yellow' | 'red' | 'unknown'
export type ModelLatencySource = 'ttfb' | 'avg' | 'none'
export type ModelLatencyTone = 'usual' | 'measured' | 'elevated' | 'extreme' | 'unknown'
export type ModelSignalTone = 'muted' | 'warning'

export interface GatewayHealthLike {
  state?: string
  totalRequests?: number
  streamReliability?: number
  avgTtfbMs?: number
}

export interface ModelStatusLike {
  status?: string
  failureRate?: number
  avgLatencyMs?: number
  sampleCount?: number
  windowTotalCalls?: number
  confidence?: string
  latencyBaseline?: ModelLatencyBaselineLike | null
  performance?: ModelPerformanceLike | null
  gatewayHealth?: GatewayHealthLike | null
}

export interface ModelPerformanceMetricLike {
  current?: number
  baseline?: number
  ratio?: number
  sampleCount?: number
  baselineSampleCount?: number
  signal?: string
}

export interface ModelPerformanceLike {
  latencyMs?: ModelPerformanceMetricLike | null
  firstTokenLatencyMs?: ModelPerformanceMetricLike | null
  charsPerSecond?: ModelPerformanceMetricLike | null
  tokensPerSecond?: ModelPerformanceMetricLike | null
  outputRate?: ModelPerformanceMetricLike | null
}

export interface ModelLatencyBaselineLike {
  currentAvgMs?: number
  baselineAvgMs?: number
  ratio?: number
  sampleCount?: number
  baselineSampleCount?: number
  signal?: string
}

export interface ModelLatencySignal {
  source: ModelLatencySource
  latencyMs: number
  level: number
  tone: ModelLatencyTone
  labelKey: string
  sourceLabelKey: string
  valueText: string
  bars: boolean[]
}

export interface ModelAvailabilitySignal {
  status: ModelAvailabilityStatus
  labelKey: string
}

export interface ModelSignalBadge {
  key: string
  tone: ModelSignalTone
}

export interface ModelPerformanceChip {
  key: string
  labelKey: string
  valueText: string
  tone: Exclude<ModelLatencyTone, 'unknown'> | 'muted'
}

const validAvailabilityStatuses = new Set(['green', 'yellow', 'red', 'unknown'])

const normalizeStatus = (status?: string): ModelAvailabilityStatus => {
  return validAvailabilityStatuses.has(status || '')
    ? status as ModelAvailabilityStatus
    : 'unknown'
}

const positiveNumber = (value?: number): number => {
  const numeric = Number(value)
  return Number.isFinite(numeric) && numeric > 0 ? numeric : 0
}

const finiteMetric = (value?: number | string | null): number | null => {
  if (value === undefined || value === null || value === '') return null
  const numeric = Number(value)
  return Number.isFinite(numeric) ? numeric : null
}

const latencySignalFor = (
  latencyMs: number,
  source: ModelLatencySource,
  baseline?: ModelLatencyBaselineLike | null,
): Omit<ModelLatencySignal, 'source' | 'latencyMs' | 'sourceLabelKey' | 'bars'> => {
  if (latencyMs <= 0 || source === 'none') {
    return { level: 0, tone: 'unknown', labelKey: 'modelSelect.speedObserving', valueText: '' }
  }

  switch (baseline?.signal) {
    case 'normal':
      return { level: 4, tone: 'usual', labelKey: 'modelSelect.latencyAsUsual', valueText: formatLatencyValue(latencyMs) }
    case 'elevated':
      return { level: 2, tone: 'elevated', labelKey: 'modelSelect.latencyHigherThanUsual', valueText: formatLatencyValue(latencyMs) }
    case 'extreme':
      return { level: 1, tone: 'extreme', labelKey: 'modelSelect.latencyMuchHigherThanUsual', valueText: formatLatencyValue(latencyMs) }
    default:
      break
  }

  return { level: 4, tone: 'measured', labelKey: 'modelSelect.latencyMeasured', valueText: formatLatencyValue(latencyMs) }
}

const formatLatencyValue = (latencyMs: number): string => {
  if (latencyMs < 1000) {
    return `${Math.round(latencyMs)}ms`
  }
  return `${(latencyMs / 1000).toFixed(1)}s`
}

export const getModelLatencySignal = (status?: ModelStatusLike | null): ModelLatencySignal => {
  const gatewayHealth = status?.gatewayHealth || null
  const gatewayRequests = positiveNumber(gatewayHealth?.totalRequests)
  const gatewayTtfbMs = positiveNumber(gatewayHealth?.avgTtfbMs)
  const avgLatencyMs = positiveNumber(status?.avgLatencyMs)
  const sampleCount = positiveNumber(status?.sampleCount)
  const latencyBaseline = status?.latencyBaseline || null
  const measuredTtfb = positiveNumber(status?.performance?.firstTokenLatencyMs?.current)

  let source: ModelLatencySource = 'none'
  let latencyMs = 0
  let latencySignalBaseline: ModelLatencyBaselineLike | null = null
  if (measuredTtfb > 0) {
    source = 'ttfb'
    latencyMs = measuredTtfb
    latencySignalBaseline = status?.performance?.firstTokenLatencyMs || null
  } else if (gatewayRequests > 0 && gatewayTtfbMs > 0) {
    source = 'ttfb'
    latencyMs = gatewayTtfbMs
  } else if (sampleCount >= 3 && avgLatencyMs > 0) {
    source = 'avg'
    latencyMs = avgLatencyMs
    latencySignalBaseline = latencyBaseline
  }

  const signal = latencySignalFor(latencyMs, source, latencySignalBaseline)
  return {
    source,
    latencyMs,
    ...signal,
    sourceLabelKey: source === 'ttfb'
      ? 'modelSelect.firstTokenLatency'
      : source === 'avg'
        ? 'modelSelect.avgDuration'
        : 'modelSelect.latency',
    bars: [1, 2, 3, 4].map(index => index <= signal.level),
  }
}

const formatMetricValue = (value: number): string => {
  if (value >= 100 || Number.isInteger(value)) {
    return `${Math.round(value)}`
  }
  return value.toFixed(1)
}

const performanceToneFor = (signal?: string): ModelPerformanceChip['tone'] => {
  switch (signal) {
    case 'normal':
      return 'usual'
    case 'elevated':
    case 'reduced':
      return 'elevated'
    case 'extreme':
      return 'extreme'
    case 'observing':
      return 'muted'
    default:
      return 'measured'
  }
}

export const getModelPerformanceChips = (status?: ModelStatusLike | null): ModelPerformanceChip[] => {
  const performance = status?.performance || null
  if (!performance) {
    return []
  }

  const chips: ModelPerformanceChip[] = []
  const charsPerSecond = positiveNumber(performance.charsPerSecond?.current)
  const tokensPerSecond = positiveNumber(performance.tokensPerSecond?.current)
  const outputRate = finiteMetric(performance.outputRate?.current)
  if (charsPerSecond > 0) {
    chips.push({
      key: 'charsPerSecond',
      labelKey: 'modelSelect.metricCharsPerSecond',
      valueText: formatMetricValue(charsPerSecond),
      tone: performanceToneFor(performance.charsPerSecond?.signal),
    })
  }
  if (tokensPerSecond > 0) {
    chips.push({
      key: 'tokensPerSecond',
      labelKey: 'modelSelect.metricTokensPerSecond',
      valueText: formatMetricValue(tokensPerSecond),
      tone: performanceToneFor(performance.tokensPerSecond?.signal),
    })
  }
  if (outputRate !== null) {
    chips.push({
      key: 'outputRate',
      labelKey: 'modelSelect.metricOutputRate',
      valueText: `${Math.round(outputRate)}%`,
      tone: performanceToneFor(performance.outputRate?.signal),
    })
  }
  return chips
}

export const getModelAvailabilitySignal = (status?: ModelStatusLike | null): ModelAvailabilitySignal => {
  const availability = normalizeStatus(status?.status)
  const suffix = availability.charAt(0).toUpperCase() + availability.slice(1)
  return {
    status: availability,
    labelKey: `modelSelect.status${suffix}`,
  }
}

export const getModelSignalBadges = (status?: ModelStatusLike | null): ModelSignalBadge[] => {
  if (!status) {
    return []
  }

  const badges: ModelSignalBadge[] = []
  const sampleCount = finiteMetric(status.sampleCount)
  const windowTotalCalls = finiteMetric(status.windowTotalCalls)
  const confidence = status.confidence || ''
  const gatewayHealth = status.gatewayHealth || null
  const gatewayRequests = finiteMetric(gatewayHealth?.totalRequests)
  const streamReliability = finiteMetric(gatewayHealth?.streamReliability)
  const failureRate = positiveNumber(status.failureRate)
  const latencyBaselineSignal = status.latencyBaseline?.signal || ''
  const availability = normalizeStatus(status.status)

  if (
    (windowTotalCalls !== null && windowTotalCalls < 10)
    || (windowTotalCalls === null && sampleCount !== null && sampleCount < 10)
    || (windowTotalCalls === null && sampleCount === null && gatewayRequests !== null && gatewayRequests < 10)
    || confidence === 'none'
    || confidence === 'low'
  ) {
    badges.push({ key: 'modelSelect.signalInsufficientSample', tone: 'muted' })
  }
  if (latencyBaselineSignal === 'extreme') {
    badges.push({ key: 'modelSelect.signalLatencyExtreme', tone: 'warning' })
  } else if (latencyBaselineSignal === 'elevated') {
    badges.push({ key: 'modelSelect.signalLatencyElevated', tone: 'warning' })
  }
  if (streamReliability !== null && streamReliability < 0.9) {
    badges.push({ key: 'modelSelect.signalStreamIssue', tone: 'warning' })
  }
  if ((failureRate >= 30 || gatewayHealth?.state === 'degraded') && availability === 'green') {
    badges.push({ key: 'modelSelect.signalErrorRateHigh', tone: 'warning' })
  }

  return badges.slice(0, 2)
}

export const getModelHealthMetrics = (status?: ModelStatusLike | null) => ({
  availability: getModelAvailabilitySignal(status),
  latency: getModelLatencySignal(status),
  performanceChips: getModelPerformanceChips(status),
  badges: getModelSignalBadges(status),
})

export interface AaIntelligenceLike {
  aaIntelligenceIndex?: number | string | null
}

// Third-party (Artificial Analysis) intelligence index lives on the family
// and/or variant of modelListV2, not on the health `status` object. Prefer
// the variant-level value (channel-specific) and fall back to the family.
export const getAaIntelligenceIndex = (
  family?: AaIntelligenceLike | null,
  variant?: AaIntelligenceLike | null,
): number | null => {
  const variantIndex = finiteMetric(variant?.aaIntelligenceIndex)
  if (variantIndex !== null && variantIndex > 0) {
    return Math.round(variantIndex)
  }
  const familyIndex = finiteMetric(family?.aaIntelligenceIndex)
  if (familyIndex !== null && familyIndex > 0) {
    return Math.round(familyIndex)
  }
  return null
}

export interface AaAgenticLike {
  aaAgenticIndex?: number | string | null
}

// Agent 分數：模型在多步、要用工具的任務上的表現。跟綜合智力分開下發，因為兩者
// 常常不一致——一個模型可以很會寫、卻不會自己把一串準備工作跑完，而 LunaTalk 的
// Agent 模式吃的是後者。伺服器沒有值時整項不下發，這裡回 null 讓畫面直接不顯示；
// 回 0 的話畫面會顯示「Agent 0 分」，那是在說這個模型很差，而不是在說我們沒資料。
export const getAaAgenticIndex = (
  family?: AaAgenticLike | null,
  variant?: AaAgenticLike | null,
): number | null => {
  const variantIndex = finiteMetric(variant?.aaAgenticIndex)
  if (variantIndex !== null && variantIndex > 0) {
    return Math.round(variantIndex)
  }
  const familyIndex = finiteMetric(family?.aaAgenticIndex)
  if (familyIndex !== null && familyIndex > 0) {
    return Math.round(familyIndex)
  }
  return null
}

export interface UsageRankLike {
  usageRank?: number | string | null
  usageTotal?: number | string | null
  usageShare?: number | string | null
}

export interface UsageRankInfo {
  rank: number
  total: number
  share: number
}

// 全球角色扮演用量名次（OpenRouter 週榜）。
//
// 名次不在就整組回 null：只給總數的話畫面會出現「共 48」而沒有名次，讀起來像
// 資料壞了。佔比取到小數一位——榜尾那些模型都是 0.x%，取整數會全部變成 0%。
export const getUsageRank = (
  family?: UsageRankLike | null,
  variant?: UsageRankLike | null,
): UsageRankInfo | null => {
  const pick = (source?: UsageRankLike | null): UsageRankInfo | null => {
    const rank = finiteMetric(source?.usageRank)
    if (rank === null || rank <= 0) return null
    const total = finiteMetric(source?.usageTotal) || 0
    const share = finiteMetric(source?.usageShare) || 0
    return { rank: Math.round(rank), total: Math.round(total), share: Math.round(share * 10) / 10 }
  }
  return pick(variant) || pick(family)
}
