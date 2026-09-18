import { describe, it, expect } from 'vitest'
import { contextUsageDisplayForRow } from '../canvas-context-usage'
const t = (key: string) => key

describe('per-turn context entry', () => {
 it('keeps diagnostics reachable when Harper has no token budget', () => {
  expect(contextUsageDisplayForRow({hasContextUsage:true}, null, t)?.label).toBe('canvas.context.details')
 })
 it('does not invent capacity or show an entry for an unmeasured greeting', () => {
  expect(contextUsageDisplayForRow({}, null, t)).toBeNull()
 })
 it('preserves Luna token budget percentages', () => {
  expect(contextUsageDisplayForRow({inputTokens:100}, 1000, t)?.label).toBe('canvas.context.chip')
 })
})
