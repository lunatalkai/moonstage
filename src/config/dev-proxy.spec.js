import { describe, it, expect } from 'vitest'
import { buildDevProxy, DEV_PROXY_DEFAULTS } from '../../build/dev-proxy.js'

describe('buildDevProxy', () => {
  it('falls back to the default target without env', () => {
    const proxy = buildDevProxy({})
    expect(proxy['/api'].target).toBe(DEV_PROXY_DEFAULTS['/api'])
  })

  it('env overrides the target', () => {
    const proxy = buildDevProxy({ DEV_PROXY_API: 'http://localhost:8888' })
    expect(proxy['/api'].target).toBe('http://localhost:8888')
  })

  it('rewrite strips the prefix', () => {
    const proxy = buildDevProxy({})
    expect(proxy['/api'].rewrite('/api/user/info')).toBe('/user/info')
  })

  it('proxies WebSocket upgrades', () => {
    const proxy = buildDevProxy({})
    expect(proxy['/api'].ws).toBe(true)
  })

  it('blank env counts as unset', () => {
    const proxy = buildDevProxy({ DEV_PROXY_API: '   ' })
    expect(proxy['/api'].target).toBe(DEV_PROXY_DEFAULTS['/api'])
  })
})
