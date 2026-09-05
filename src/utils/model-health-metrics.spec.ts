import { describe, expect, it } from 'vitest'
import {
  getAaIntelligenceIndex,
  getAaAgenticIndex,
  getUsageRank,
  getModelHealthMetrics,
  getModelLatencySignal,
  getModelSignalBadges,
} from './model-health-metrics'

describe('model health metrics', () => {
  it('uses gateway TTFB as the primary first-token latency source', () => {
    const signal = getModelLatencySignal({
      avgLatencyMs: 48000,
      sampleCount: 20,
      gatewayHealth: {
        totalRequests: 12,
        avgTtfbMs: 2600,
      },
    })

    expect(signal.source).toBe('ttfb')
    expect(signal.latencyMs).toBe(2600)
    expect(signal.level).toBe(4)
    expect(signal.tone).toBe('measured')
    expect(signal.valueText).toBe('2.6s')
  })

  it('uses server measured TTFT before average duration', () => {
    const metrics = getModelHealthMetrics({
      avgLatencyMs: 12000,
      sampleCount: 20,
      performance: {
        firstTokenLatencyMs: {
          current: 1400,
          baseline: 1200,
          ratio: 1.17,
          sampleCount: 4,
          baselineSampleCount: 12,
          signal: 'normal',
        },
      },
    })

    expect(metrics.latency.source).toBe('ttfb')
    expect(metrics.latency.latencyMs).toBe(1400)
    expect(metrics.latency.tone).toBe('usual')
    expect(metrics.latency.valueText).toBe('1.4s')
  })

  it('shows average duration neutrally when TTFB and baseline are unavailable', () => {
    const signal = getModelLatencySignal({
      avgLatencyMs: 24500,
      sampleCount: 42,
    })

    expect(signal.source).toBe('avg')
    expect(signal.level).toBe(4)
    expect(signal.tone).toBe('measured')
    expect(signal.labelKey).toBe('modelSelect.latencyMeasured')
    expect(signal.valueText).toBe('24.5s')
  })

  it('keeps speed unknown when there is no reliable latency sample', () => {
    const signal = getModelLatencySignal({
      avgLatencyMs: 9000,
      sampleCount: 1,
      confidence: 'low',
    })

    expect(signal.source).toBe('none')
    expect(signal.level).toBe(0)
    expect(signal.tone).toBe('unknown')
  })

  it('labels missing latency telemetry as observing instead of no data', () => {
    const signal = getModelLatencySignal({
      status: 'green',
      failureRate: 0,
      avgLatencyMs: 0,
      message: '正常',
    })

    expect(signal.source).toBe('none')
    expect(signal.labelKey).toBe('modelSelect.speedObserving')
  })

  it('does not penalize large models with fixed absolute latency thresholds', () => {
    const metrics = getModelHealthMetrics({
      status: 'green',
      avgLatencyMs: 12000,
      sampleCount: 52,
      confidence: 'high',
    })

    expect(metrics.availability.status).toBe('green')
    expect(metrics.latency.level).toBe(4)
    expect(metrics.latency.tone).toBe('measured')
    expect(metrics.latency.valueText).toBe('12.0s')
  })

  it('uses the model self baseline when it is available', () => {
    const metrics = getModelHealthMetrics({
      status: 'green',
      avgLatencyMs: 12000,
      sampleCount: 52,
      confidence: 'high',
      latencyBaseline: {
        currentAvgMs: 12000,
        baselineAvgMs: 10000,
        ratio: 1.2,
        sampleCount: 5,
        baselineSampleCount: 20,
        signal: 'normal',
      },
    })

    expect(metrics.latency.tone).toBe('usual')
    expect(metrics.latency.labelKey).toBe('modelSelect.latencyAsUsual')
    expect(metrics.latency.valueText).toBe('12.0s')
  })

  it('flags latency only when it is high relative to the model self baseline', () => {
    const metrics = getModelHealthMetrics({
      status: 'green',
      avgLatencyMs: 32000,
      sampleCount: 52,
      confidence: 'high',
      latencyBaseline: {
        currentAvgMs: 32000,
        baselineAvgMs: 10000,
        ratio: 3.2,
        sampleCount: 5,
        baselineSampleCount: 20,
        signal: 'extreme',
      },
    })

    expect(metrics.latency.tone).toBe('extreme')
    expect(metrics.latency.labelKey).toBe('modelSelect.latencyMuchHigherThanUsual')
    expect(metrics.badges.map(item => item.key)).toContain('modelSelect.signalLatencyExtreme')
  })

  it('formats output speed and output rate as measured performance chips', () => {
    const metrics = getModelHealthMetrics({
      status: 'green',
      avgLatencyMs: 12000,
      sampleCount: 52,
      confidence: 'high',
      performance: {
        charsPerSecond: {
          current: 200,
          baseline: 180,
          ratio: 1.11,
          sampleCount: 4,
          baselineSampleCount: 12,
          signal: 'normal',
        },
        tokensPerSecond: {
          current: 11.11,
          baseline: 10,
          ratio: 1.11,
          sampleCount: 4,
          baselineSampleCount: 12,
          signal: 'normal',
        },
        outputRate: {
          current: 100,
          baseline: 98,
          ratio: 1.02,
          sampleCount: 4,
          baselineSampleCount: 12,
          signal: 'normal',
        },
      },
    })

    expect(metrics.performanceChips).toEqual([
      { key: 'charsPerSecond', labelKey: 'modelSelect.metricCharsPerSecond', valueText: '200', tone: 'usual' },
      { key: 'tokensPerSecond', labelKey: 'modelSelect.metricTokensPerSecond', valueText: '11.1', tone: 'usual' },
      { key: 'outputRate', labelKey: 'modelSelect.metricOutputRate', valueText: '100%', tone: 'usual' },
    ])
  })

  it('emits compact warning badges for insufficient sample data and stream instability', () => {
    const badges = getModelSignalBadges({
      status: 'yellow',
      failureRate: 12,
      sampleCount: 4,
      confidence: 'low',
      gatewayHealth: {
        totalRequests: 4,
        avgTtfbMs: 3500,
        streamReliability: 0.75,
      },
    })

    expect(badges.map(item => item.key)).toEqual([
      'modelSelect.signalInsufficientSample',
      'modelSelect.signalStreamIssue',
    ])
  })

  it('does not infer low usage when telemetry fields are absent', () => {
    const badges = getModelSignalBadges({
      status: 'green',
      failureRate: 0,
      avgLatencyMs: 0,
      message: '正常',
    })

    expect(badges).toEqual([])
  })

  it('flags insufficient sample data from the recent window even with enough lifetime samples', () => {
    const badges = getModelSignalBadges({
      status: 'green',
      failureRate: 0,
      avgLatencyMs: 43203,
      sampleCount: 80,
      windowTotalCalls: 0,
      confidence: 'high',
    })

    expect(badges.map(item => item.key)).toEqual([
      'modelSelect.signalInsufficientSample',
    ])
  })

  it('treats zero stream reliability as a stream issue', () => {
    const badges = getModelSignalBadges({
      status: 'green',
      failureRate: 0,
      sampleCount: 20,
      confidence: 'high',
      gatewayHealth: {
        totalRequests: 8,
        avgTtfbMs: 1800,
        streamReliability: 0,
      },
    })

    expect(badges.map(item => item.key)).toEqual([
      'modelSelect.signalStreamIssue',
    ])
  })

  it('does not duplicate high error rate when availability already shows it', () => {
    const badges = getModelSignalBadges({
      status: 'yellow',
      failureRate: 35,
      sampleCount: 20,
      confidence: 'high',
    })

    expect(badges).toEqual([])
  })

  it('uses an explicit error-rate signal when gateway degrades before the traffic light changes', () => {
    const badges = getModelSignalBadges({
      status: 'green',
      failureRate: 0,
      sampleCount: 20,
      confidence: 'high',
      gatewayHealth: {
        totalRequests: 20,
        state: 'degraded',
      },
    })

    expect(badges.map(item => item.key)).toEqual([
      'modelSelect.signalErrorRateHigh',
    ])
  })
})

describe('AA intelligence index', () => {
  it('prefers the variant index over the family index', () => {
    const value = getAaIntelligenceIndex(
      { aaIntelligenceIndex: 40 },
      { aaIntelligenceIndex: 70 },
    )

    expect(value).toBe(70)
  })

  it('falls back to the family index when the variant has none', () => {
    const value = getAaIntelligenceIndex(
      { aaIntelligenceIndex: 55 },
      {},
    )

    expect(value).toBe(55)
  })

  it('rounds fractional index values', () => {
    const value = getAaIntelligenceIndex({}, { aaIntelligenceIndex: 62.6 })

    expect(value).toBe(63)
  })

  it('returns null when neither variant nor family carries an index', () => {
    expect(getAaIntelligenceIndex({}, {})).toBeNull()
    expect(getAaIntelligenceIndex(null, null)).toBeNull()
  })

  it('returns null when the index is zero or negative', () => {
    expect(getAaIntelligenceIndex({ aaIntelligenceIndex: 0 }, {})).toBeNull()
    expect(getAaIntelligenceIndex({}, { aaIntelligenceIndex: -5 })).toBeNull()
  })
})

describe('getAaAgenticIndex — Agent 分數與綜合智力是兩個問題', () => {
  it('優先取 variant 的值，退回 family', () => {
    expect(getAaAgenticIndex({ aaAgenticIndex: 30 }, { aaAgenticIndex: 44 })).toBe(44)
    expect(getAaAgenticIndex({ aaAgenticIndex: 30 }, {})).toBe(30)
  })

  it('沒有值時回 null，而不是 0', () => {
    // 0 會被畫面顯示成「Agent 0 分」，那跟「這一項沒有資料」是兩件事。
    expect(getAaAgenticIndex({}, {})).toBeNull()
    expect(getAaAgenticIndex({ aaAgenticIndex: 0 }, { aaAgenticIndex: 0 })).toBeNull()
    expect(getAaAgenticIndex(null, null)).toBeNull()
  })

  it('跟智力分數互不影響', () => {
    const f = { aaIntelligenceIndex: 52, aaAgenticIndex: 0 }
    expect(getAaIntelligenceIndex(f, null)).toBe(52)
    expect(getAaAgenticIndex(f, null)).toBeNull()
  })
})

describe('getUsageRank — 全球用量名次', () => {
  it('取得名次、總數與佔比', () => {
    const f = { usageRank: 3, usageTotal: 48, usageShare: 4.981 }
    expect(getUsageRank(f, null)).toEqual({ rank: 3, total: 48, share: 5.0 })
  })

  it('佔比取到小數一位——整數會把 0.4% 顯示成 0%', () => {
    expect(getUsageRank({ usageRank: 40, usageTotal: 48, usageShare: 0.44 }, null)?.share).toBe(0.4)
  })

  it('沒有名次就整組回 null，不要只給總數', () => {
    expect(getUsageRank({ usageTotal: 48 }, null)).toBeNull()
    expect(getUsageRank({}, {})).toBeNull()
    expect(getUsageRank(null, null)).toBeNull()
  })

  it('variant 優先於 family', () => {
    expect(getUsageRank({ usageRank: 9, usageTotal: 48 }, { usageRank: 1, usageTotal: 48 })?.rank).toBe(1)
  })
})
