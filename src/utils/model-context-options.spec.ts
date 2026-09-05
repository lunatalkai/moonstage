import { describe, expect, it } from 'vitest'
import {
  findModelByValue,
  getContextBudgetLevelOptions,
  getContextBudgetOptions,
  getContextControlMode,
  getEffectiveAutoCompactEnabled,
  getNoLimitCoverageState,
  getStableContextLevelOptions,
  getStableContextOptions,
  isAutoCompactForcedForModel,
  normalizeContextValue,
  normalizeStableContextValue,
} from './model-context-options'

const stableModel = {
  value: 'deepseek-v4-pro',
  isCacheStable: true,
  noLimitEligible: true,
  noLimitCovered: true,
  contextBudgetOptions: [
    { text: '64K', value: 1, tokens: 64000 },
    { text: '96K', value: 2, tokens: 96000 },
    { text: '128K', value: 3, tokens: 128000 },
    { text: '144K', value: 4, tokens: 144000 },
    { text: '168K', value: 5, tokens: 168000 },
  ],
}

const legacyModel = {
  value: 'relay-claude-sonnet-4-5',
  isCacheStable: false,
  contextBudgetOptions: [
    { text: '48K', value: 1, tokens: 48000 },
    { text: '64K', value: 2, tokens: 64000 },
    { text: '80K', value: 3, tokens: 80000 },
    { text: '96K', value: 4, tokens: 96000 },
    { text: '128K', value: 5, tokens: 128000 },
  ],
}

describe('model context options', () => {
  it('uses the stable-context control only for cache-stable models with budget options', () => {
    expect(getContextControlMode(stableModel)).toBe('stable')
    expect(getContextControlMode({ value: 'claude-sonnet-4-6', isCacheStable: false })).toBe('multiplier')
    expect(getContextControlMode(null)).toBe('multiplier')
  })

  it('exposes stable context budget options without duplicate token budgets', () => {
    const options = getStableContextOptions({
      ...stableModel,
      contextBudgetOptions: stableModel.contextBudgetOptions.concat({ text: 'MAX', value: 100, tokens: 168000 }),
    })

    expect(options.map((item) => item.text)).toEqual(['64K', '96K', '128K', '144K', '168K'])
    expect(options.map((item) => item.value)).toEqual([1, 2, 3, 4, 5])
  })

  it('maps stable context budgets to five evenly spaced slider levels', () => {
    const levels = getStableContextLevelOptions(stableModel)

    expect(levels.map((item) => item.text)).toEqual(['64K', '96K', '128K', '144K', '168K'])
    expect(levels.map((item) => item.progress)).toEqual([0, 25, 50, 75, 100])
    expect(levels[0]).toMatchObject({ level: 1, isFloor: true, isCap: false })
    expect(levels[4]).toMatchObject({ level: 5, isFloor: false, isCap: true })
  })

  it('maps legacy multiplier contexts to estimated context capacity levels', () => {
    expect(getContextControlMode(legacyModel)).toBe('multiplier')

    const options = getContextBudgetOptions(legacyModel)
    expect(options.map((item) => item.text)).toEqual(['48K', '64K', '80K', '96K', '128K'])
    expect(options.map((item) => item.value)).toEqual([1, 2, 3, 4, 5])
    expect(options.map((item) => item.tokens)).toEqual([48000, 64000, 80000, 96000, 128000])

    const levels = getContextBudgetLevelOptions(legacyModel)
    expect(levels.map((item) => item.progress)).toEqual([0, 25, 50, 75, 100])
    expect(levels[0]).toMatchObject({ isFloor: true, isCap: false })
    expect(levels[4]).toMatchObject({ isFloor: false, isCap: true })
  })

  it('falls back to estimated legacy capacity levels when old server metadata is missing', () => {
    const options = getContextBudgetOptions({ value: 'legacy-without-options' })

    expect(options.map((item) => item.text)).toEqual(['48K', '64K', '80K', '96K', '128K'])
    expect(options.map((item) => item.value)).toEqual([1, 2, 3, 4, 5])
  })

  it('maps legacy MAX metadata to the 168K safety cap for stable-context controls', () => {
    const options = getStableContextOptions({
      value: 'legacy-stable-model',
      isCacheStable: true,
      contextBudgetOptions: [{ text: 'MAX', value: 100, tokens: 168000 }],
    })

    expect(options).toEqual([{ text: '168K', value: 5, tokens: 168000 }])
  })

  it('uses 144K as the fourth fallback context budget tier', () => {
    const options = getStableContextOptions({
      value: 'fallback-budget-stable-model',
      isCacheStable: true,
      contextBudgetOptions: [{ value: 4 }],
    })

    expect(options).toEqual([{ text: '144K', value: 4, tokens: 144000 }])
  })

  it('normalizes alternate context budget labels without drifting binary-token values', () => {
    const options = getStableContextOptions({
      value: 'binary-token-stable-model',
      isCacheStable: true,
      contextBudgetOptions: [
        { label: '64K', value: 64, tokens: 65536 },
        { value: 96, tokens: 98304 },
      ],
    })

    expect(options.map((item) => item.text)).toEqual(['64K', '96K'])
    expect(options.map((item) => item.value)).toEqual([64, 96])
  })

  it('keeps valid values and defaults invalid values to the 64K floor', () => {
    expect(normalizeStableContextValue(2, stableModel)).toBe(2)
    expect(normalizeStableContextValue(5, stableModel)).toBe(5)
    expect(normalizeStableContextValue(100, stableModel)).toBe(5)
    expect(normalizeStableContextValue(99, stableModel)).toBe(1)
    expect(normalizeStableContextValue(undefined, stableModel)).toBe(1)
  })

  it('normalizes context values for both stable and legacy capacity controls', () => {
    expect(normalizeContextValue(100, stableModel)).toBe(5)
    expect(normalizeContextValue(100, legacyModel)).toBe(5)
    expect(normalizeContextValue(99, legacyModel)).toBe(1)
    expect(normalizeContextValue(undefined, legacyModel)).toBe(1)
  })

  it('finds stable model metadata from V2 model groups', () => {
    const groups = [{
      group: '精選',
      families: [{
        family: 'MiMo V2.5',
        isCacheStable: true,
        contextBudgetOptions: stableModel.contextBudgetOptions,
        variants: [{ value: 'mimo-v2.5', name: 'MiMo V2.5' }],
      }],
    }]

    expect(findModelByValue(groups, 'mimo-v2.5')).toMatchObject({
      value: 'mimo-v2.5',
      family: 'MiMo V2.5',
      isCacheStable: true,
    })
  })

  it('forces auto compact for stable-context models only', () => {
    expect(isAutoCompactForcedForModel(stableModel)).toBe(true)
    expect(getEffectiveAutoCompactEnabled(false, stableModel)).toBe(true)
    expect(getEffectiveAutoCompactEnabled(false, { value: 'qwen:32b' })).toBe(false)
  })

  it('derives no-limit badge state from active membership and current context', () => {
    const activeUser = { isNoLimitMember: true }
    const normalUser = { isNoLimitMember: false }
    const stableRelayModels = [
      'relay-claude-sonnet-4-5',
      'relay-claude-haiku-4-5',
      'relay-claude-sonnet-3-7',
    ]
    const legacyClaude = {
      value: 'relay-claude-sonnet-4-5',
      noLimitEligible: true,
      noLimitCovered: true,
    }
    const unsupported = {
      value: 'z-ai/glm-5',
      noLimitEligible: false,
      noLimitCovered: false,
    }

    expect(getNoLimitCoverageState(normalUser, stableModel, 1)).toBeNull()
    expect(getNoLimitCoverageState(activeUser, stableModel, 1)).toBe('available')
    stableRelayModels.forEach((value) => {
      for (let contextValue = 1; contextValue <= 5; contextValue += 1) {
        expect(getNoLimitCoverageState(activeUser, { ...stableModel, value }, contextValue)).toBe('available')
      }
    })
    expect(getNoLimitCoverageState(activeUser, { ...stableModel, value: 'relay-claude-sonnet-4-6', noLimitEligible: false, noLimitCovered: false }, 1)).toBe('unavailable')
    expect(getNoLimitCoverageState(activeUser, { ...stableModel, value: 'relay-claude-opus-4-6', noLimitEligible: false, noLimitCovered: false }, 1)).toBe('unavailable')
    expect(getNoLimitCoverageState(activeUser, { ...stableModel, value: 'mimo-v2.5', noLimitCovered: true }, 3)).toBe('available')
    expect(getNoLimitCoverageState(activeUser, { ...stableModel, value: 'mimo-v2.5', noLimitCovered: false }, 4)).toBe('unavailable')
    expect(getNoLimitCoverageState(activeUser, legacyClaude, 5)).toBe('available')
    expect(getNoLimitCoverageState(activeUser, legacyClaude, 100)).toBe('available')
    expect(getNoLimitCoverageState(activeUser, unsupported, 1)).toBe('unavailable')
  })
})
