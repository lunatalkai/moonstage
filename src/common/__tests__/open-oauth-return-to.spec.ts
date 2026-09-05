import { describe, expect, it } from 'vitest'
import { sanitizeReturnTo } from '../open-oauth'

describe('sanitizeReturnTo', () => {
  it('keeps in-app page paths, with or without a query string', () => {
    expect(sanitizeReturnTo('/pages/play/entry')).toBe('/pages/play/entry')
    expect(sanitizeReturnTo('/pages/canvas/canvas?roleId=abc-123')).toBe('/pages/canvas/canvas?roleId=abc-123')
  })

  it('falls back to the entry page for anything that is not an in-app path', () => {
    for (const bad of ['https://evil.example/x', '//evil.example', '/evil', 'pages/play/entry', '/pages/../x', '', undefined, 42, '/pages/play/entry#/pages/x', 'javascript:alert(1)']) {
      expect(sanitizeReturnTo(bad)).toBe('/pages/play/entry')
    }
  })
})
