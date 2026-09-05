import { describe, it, expect, beforeEach } from 'vitest'
import { nextBubbleId, __resetBubbleCounter } from './bubble-id'

describe('bubble-id', () => {
	beforeEach(() => __resetBubbleCounter())

	it('returns monotonically increasing values', () => {
		const a = nextBubbleId()
		const b = nextBubbleId()
		const c = nextBubbleId()
		expect(b).toBeGreaterThan(a)
		expect(c).toBeGreaterThan(b)
	})

	it('produces 1000 unique ids in a tight loop (no clock dependence)', () => {
		const seen = new Set<number>()
		for (let i = 0; i < 1000; i++) seen.add(nextBubbleId())
		expect(seen.size).toBe(1000)
	})

	it('result is a number (drop-in replace for Date.now())', () => {
		expect(typeof nextBubbleId()).toBe('number')
	})

	it('is roughly aligned with Date.now()', () => {
		const before = Date.now()
		const id = nextBubbleId()
		const after = Date.now()
		expect(id).toBeGreaterThanOrEqual(before)
		expect(id).toBeLessThanOrEqual(after + 2000)
	})
})
