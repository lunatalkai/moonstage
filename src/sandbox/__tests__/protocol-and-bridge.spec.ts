// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { envelope, isSandboxEnvelope, sandboxOriginFor, targetOriginFor, SANDBOX_PROTOCOL_VERSION } from '../protocol'

describe('協議信封', () => {
  it('envelope 帶版本；isSandboxEnvelope 只認同版本且有 type 的物件', () => {
    const m = envelope({ type: 'ready' })
    expect(m).toEqual({ ms: SANDBOX_PROTOCOL_VERSION, type: 'ready' })
    expect(isSandboxEnvelope(m)).toBe(true)
    expect(isSandboxEnvelope({ ms: 99, type: 'ready' })).toBe(false)
    expect(isSandboxEnvelope({ type: 'ready' })).toBe(false)
    expect(isSandboxEnvelope('ready')).toBe(false)
    expect(isSandboxEnvelope(null)).toBe(false)
  })

  it('不透明 origin 只能用 *；正式站每張卡一個子網域', () => {
    expect(targetOriginFor('null')).toBe('*')
    expect(targetOriginFor('')).toBe('*')
    expect(targetOriginFor('https://c1.hearthroom.club')).toBe('https://c1.hearthroom.club')
    expect(sandboxOriginFor('https://hearthroom.club', 320396)).toBe('https://c320396.hearthroom.club')
    expect(sandboxOriginFor('http://localhost:5173/', 'abc')).toBe('http://cabc.localhost:5173')
  })
})
