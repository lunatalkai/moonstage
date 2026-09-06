import { afterEach, describe, expect, it, vi } from 'vitest'
import { browserHost, setStageHost, uniHost, useStageHost } from '../stage-host'

afterEach(() => {
  setStageHost(null)
  delete (globalThis as any).uni
  localStorage.clear()
})

describe('browserHost', () => {
  it('storage 走 localStorage，缺的回 null', () => {
    const host = browserHost()
    expect(host.storage.get('k')).toBeNull()
    host.storage.set('k', 'v')
    expect(host.storage.get('k')).toBe('v')
    host.storage.remove('k')
    expect(host.storage.get('k')).toBeNull()
  })

  it('events：on 回退訂函式，emit 只叫還在的', () => {
    const host = browserHost()
    const seen: any[] = []
    const off = host.events.on('x', (p) => seen.push(p))
    host.events.emit('x', 1)
    off()
    host.events.emit('x', 2)
    expect(seen).toEqual([1])
  })

  it('宿主只覆寫 toast 時，其餘 ui 仍是預設', async () => {
    const toast = vi.fn()
    const host = browserHost({ ui: { toast } as any })
    host.ui.toast('hi')
    expect(toast).toHaveBeenCalledWith('hi')
    expect(typeof host.ui.confirm).toBe('function')
  })
})

describe('uniHost', () => {
  it('每一項都轉成原本的 uni 呼叫；storage 只承諾字串、空字串當缺', async () => {
    const uni = {
      showToast: vi.fn(), getStorageSync: vi.fn((k: string) => (k === 'empty' ? '' : 'raw')), setStorageSync: vi.fn(), removeStorageSync: vi.fn(),
      getLocale: vi.fn(() => 'zh-Hant'), reLaunch: vi.fn(), navigateBack: vi.fn(),
      setClipboardData: vi.fn((o: any) => o.success()), $on: vi.fn(), $off: vi.fn(), $emit: vi.fn(),
      showModal: vi.fn((o: any) => o.success({ confirm: true })),
    }
    ;(globalThis as any).uni = uni
    const host = uniHost()
    host.ui.toast('t')
    expect(uni.showToast).toHaveBeenCalledWith({ title: 't', icon: 'none' })
    expect(host.storage.get('empty')).toBeNull()
    expect(host.storage.get('k')).toBe('raw')
    host.storage.set('k', 'v')
    expect(uni.setStorageSync).toHaveBeenCalledWith('k', 'v')
    expect(host.locale.get()).toBe('zh-Hant')
    host.nav.toEntry()
    expect(uni.reLaunch).toHaveBeenCalledWith({ url: '/pages/play/entry' })
    await host.clipboard.write('c')
    expect(uni.setClipboardData).toHaveBeenCalled()
    const off = host.events.on('e', () => {})
    off()
    expect(uni.$on).toHaveBeenCalled()
    expect(uni.$off).toHaveBeenCalled()
    await expect(host.ui.confirm({ content: 'sure?' })).resolves.toBe(true)
  })
})

describe('useStageHost', () => {
  it('沒設定時：有 uni 全域就是 uni 殼，否則純瀏覽器；設定過就用設定的', () => {
    expect(useStageHost().locale.get()).toBe(navigator.language || 'en')
    setStageHost(null)
    ;(globalThis as any).uni = { getLocale: () => 'ko' }
    expect(useStageHost().locale.get()).toBe('ko')
    const custom = browserHost({ locale: { get: () => 'ja', set: () => {} } })
    setStageHost(custom)
    expect(useStageHost().locale.get()).toBe('ja')
  })
})
