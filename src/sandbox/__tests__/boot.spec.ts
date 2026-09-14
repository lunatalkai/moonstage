// @vitest-environment jsdom
/**
 * 殼的進入點：ready-shell 每 500ms 重喊直到 hello 到；hello 只認 window.parent，之後釘死 origin。
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { bootSandbox } from '../main'
import { envelope, type SandboxHelloConfig } from '../protocol'

const config: SandboxHelloConfig = {
  theme: 'dark', locale: 'zh-Hant', role: { name: 'A', avatarUrl: '' }, user: { nickname: 'B', avatarUrl: '' },
  card: { rules: [], statusbar: '' }, capabilities: { saves: false, edit: false, send: true }, composer: true,
}

function fakeWindow() {
  document.body.innerHTML = '<div id="app"></div>'
  const parent = { postMessage: vi.fn() }
  const listeners: Record<string, ((e: any) => void)[]> = {}
  const win = {
    document,
    parent,
    location: { search: '' },
    visualViewport: null,
    addEventListener: (type: string, fn: (e: any) => void) => { (listeners[type] ||= []).push(fn) },
    setInterval: (fn: () => void, ms: number) => setInterval(fn, ms),
    clearInterval: (id: number) => clearInterval(id),
    getComputedStyle: window.getComputedStyle.bind(window),
    requestAnimationFrame: (fn: () => void) => setTimeout(fn, 0),
    setTimeout, clearTimeout, Date, Promise, Object, JSON, Math, String, Number, Array, RegExp, Error,
  } as unknown as Window & typeof globalThis
  const dispatch = (data: unknown, source: unknown = parent, origin = 'https://host.test') => {
    for (const fn of listeners.message || []) fn({ data, source, origin })
  }
  return { win, parent, dispatch }
}

afterEach(() => { vi.useRealTimers() })

describe('bootSandbox 握手', () => {
  it('ready-shell 每 500ms 重喊；hello 到了就停', () => {
    vi.useFakeTimers()
    const { win, parent, dispatch } = fakeWindow()
    bootSandbox(win)
    expect(parent.postMessage).toHaveBeenCalledTimes(1)
    expect(parent.postMessage.mock.calls[0][0]).toMatchObject({ type: 'ready-shell' })
    vi.advanceTimersByTime(1000)
    expect(parent.postMessage).toHaveBeenCalledTimes(3)
    dispatch(envelope({ type: 'hello', config }))
    vi.advanceTimersByTime(3000)
    const readyShells = parent.postMessage.mock.calls.filter((c) => c[0]?.type === 'ready-shell')
    expect(readyShells).toHaveLength(3)
    expect(document.querySelector('[data-chat=root]')).not.toBeNull()
  })

  it('沒等到 hello 十秒後不再喊', () => {
    vi.useFakeTimers()
    const { win, parent } = fakeWindow()
    bootSandbox(win)
    vi.advanceTimersByTime(30_000)
    const n = parent.postMessage.mock.calls.length
    expect(n).toBeGreaterThan(15)
    expect(n).toBeLessThanOrEqual(22)
    vi.advanceTimersByTime(30_000)
    expect(parent.postMessage.mock.calls.length).toBe(n)
  })

  it('hello 不是來自 parent 的一律不理', () => {
    const { win, dispatch } = fakeWindow()
    bootSandbox(win)
    dispatch(envelope({ type: 'hello', config }), { other: true })
    expect(document.querySelector('[data-chat=root]')).toBeNull()
  })
})
