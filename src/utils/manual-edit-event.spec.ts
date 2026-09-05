import { describe, expect, it } from 'vitest'

import {
  claimManualEditRequest,
  createManualEditRequestId,
} from './manual-edit-event.js'

function createStorage() {
  const values = new Map<string, string>()
  return {
    getItem(key: string) {
      return values.get(key) ?? null
    },
    setItem(key: string, value: string) {
      values.set(key, value)
    },
  }
}

describe('manual edit event ownership', () => {
  it('lets only one cached chat instance claim the same Rewrite event', () => {
    const storage = createStorage()
    const payload = { requestId: 'manual-edit-one' }

    expect(claimManualEditRequest(payload, storage)).toBe(true)
    expect(claimManualEditRequest(payload, storage)).toBe(false)
  })

  it('keeps later Rewrite actions distinct and preserves old payload compatibility', () => {
    const storage = createStorage()

    expect(claimManualEditRequest({ requestId: 'manual-edit-one' }, storage)).toBe(true)
    expect(claimManualEditRequest({ requestId: 'manual-edit-two' }, storage)).toBe(true)
    expect(claimManualEditRequest({}, storage)).toBe(true)
    expect(createManualEditRequestId(() => 123, () => 0.5)).toBe('manual-edit-123-i')
  })
})
