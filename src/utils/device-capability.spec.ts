import { describe, expect, it } from 'vitest'
import { detectLowEndDevice, prefersReducedMotion } from './device-capability'

// 建立假的 navigator / window，只帶測試關心的欄位
function nav(fields: Record<string, unknown> = {}) {
  return fields as unknown as Navigator
}
function win(reduced = false) {
  return {
    matchMedia: (q: string) => ({
      matches: reduced && q.includes('prefers-reduced-motion'),
    }),
  } as unknown as Window
}

describe('detectLowEndDevice', () => {
  it('高配機器（多核 + 大記憶體 + 無 reduced-motion）→ 非低端', () => {
    const n = nav({ hardwareConcurrency: 16, deviceMemory: 8 })
    expect(detectLowEndDevice(n, win(false))).toBe(false)
  })

  it('系統要求 prefers-reduced-motion → 判為低端（不論硬體）', () => {
    const n = nav({ hardwareConcurrency: 16, deviceMemory: 8 })
    expect(detectLowEndDevice(n, win(true))).toBe(true)
  })

  it('deviceMemory ≤ 4GB → 低端', () => {
    expect(detectLowEndDevice(nav({ hardwareConcurrency: 8, deviceMemory: 4 }), win(false))).toBe(true)
    expect(detectLowEndDevice(nav({ hardwareConcurrency: 8, deviceMemory: 2 }), win(false))).toBe(true)
  })

  it('hardwareConcurrency ≤ 4 核 → 低端', () => {
    expect(detectLowEndDevice(nav({ hardwareConcurrency: 4, deviceMemory: 8 }), win(false))).toBe(true)
    expect(detectLowEndDevice(nav({ hardwareConcurrency: 2, deviceMemory: 8 }), win(false))).toBe(true)
  })

  it('探測不到能力（欄位 undefined）→ 保守不誤判為低端', () => {
    expect(detectLowEndDevice(nav({}), win(false))).toBe(false)
  })

  it('欄位為 0 / 非數字 → 視為探測不到，不誤判', () => {
    expect(detectLowEndDevice(nav({ hardwareConcurrency: 0, deviceMemory: 0 }), win(false))).toBe(false)
  })

  it('門檻可透過 opts 覆寫', () => {
    // 8 核在預設門檻(4)下非低端，把門檻拉到 8 就命中
    expect(detectLowEndDevice(nav({ hardwareConcurrency: 8 }), win(false), { coreThreshold: 8 })).toBe(true)
  })

  it('matchMedia 不存在時不拋錯', () => {
    const n = nav({ hardwareConcurrency: 16, deviceMemory: 8 })
    expect(detectLowEndDevice(n, {} as unknown as Window)).toBe(false)
  })
})

describe('prefersReducedMotion', () => {
  it('reduce 時回傳 true', () => {
    expect(prefersReducedMotion(win(true))).toBe(true)
  })
  it('非 reduce 時回傳 false', () => {
    expect(prefersReducedMotion(win(false))).toBe(false)
  })
  it('matchMedia 缺失時安全回傳 false', () => {
    expect(prefersReducedMotion({} as unknown as Window)).toBe(false)
  })
})
