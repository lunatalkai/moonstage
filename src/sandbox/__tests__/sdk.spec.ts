// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { createSdk, RATE_LIMITS, type SdkHost } from '../sdk/create-sdk'
import { createEventBus } from '../sdk/events'
import { SdkError } from '../sdk/errors'

function fakeHost(over: Partial<SdkHost> & { requests?: Array<{ op: string; args: unknown[] }>; allow?: boolean; gesture?: boolean; generating?: boolean } = {}) {
  let draft = ''
  let cursor = 0
  let visible = true
  let stage: 'closed' | 'content' | 'full' = 'closed'
  const stageEl = document.createElement('div')
  const requests = over.requests || []
  let clock = 0
  const host: SdkHost & { tick(ms: number): void; requests: typeof requests } = {
    input: {
      get: () => draft, set: (t) => { draft = t; cursor = t.length }, focus() {}, blur() {},
      getCursor: () => cursor, setCursor: (n) => { cursor = n }, composing: () => false,
    },
    composer: { show: () => { visible = true }, hide: () => { visible = false }, visible: () => visible },
    stage: { open: (m) => { stage = m }, close: () => { stage = 'closed' }, el: () => stageEl, visible: () => stage !== 'closed' },
    role: () => ({ name: '露娜', avatarUrl: 'r.png' }),
    user: () => ({ nickname: '小明', avatarUrl: 'u.png' }),
    capabilities: { saves: true, edit: true, send: true },
    request: async (op, args) => { requests.push({ op, args }); return null },
    inGesture: () => !!over.gesture,
    askSendPermission: async () => over.allow !== false,
    busy: () => !!over.generating,
    debug() {},
    now: () => clock,
    tick: (ms) => { clock += ms },
    requests,
    ...over,
  }
  return host
}

const expectCode = async (p: Promise<unknown> | (() => unknown), code: string) => {
  try {
    await (typeof p === 'function' ? p() : p)
  } catch (e) {
    expect(e).toBeInstanceOf(SdkError)
    expect((e as SdkError).code).toBe(code)
    return
  }
  throw new Error(`expected ${code}`)
}

describe('sdk 的形狀', () => {
  it('恰好 11 個鍵、30 個能力、version 是值 "1"、沒有 once/off', () => {
    const { sdk } = createSdk(fakeHost(), createEventBus())
    expect(Object.keys(sdk).sort()).toEqual(['cache', 'composer', 'debug', 'input', 'message', 'on', 'role', 'save', 'stage', 'user', 'version'])
    const caps = [
      ...Object.keys(sdk.input).map((k) => `input.${k}`), ...Object.keys(sdk.composer).map((k) => `composer.${k}`),
      ...Object.keys(sdk.message).map((k) => `message.${k}`), ...Object.keys(sdk.cache).map((k) => `cache.${k}`),
      ...Object.keys(sdk.save).map((k) => `save.${k}`), ...Object.keys(sdk.stage).map((k) => `stage.${k}`),
      'role.get', 'user.get', 'on', 'debug.log', 'version',
    ]
    expect(caps.length).toBe(30)
    expect(sdk.version).toBe('1')
    expect((sdk as unknown as { once?: unknown }).once).toBeUndefined()
    expect((sdk as unknown as { off?: unknown }).off).toBeUndefined()
    expect(sdk.role.get()).toEqual({ name: '露娜', avatarUrl: 'r.png' })
    expect(sdk.user.get()).toEqual({ nickname: '小明', avatarUrl: 'u.png' })
  })
})

describe('input／composer／stage', () => {
  it('set/add/insert/clear 改草稿；insert 落在游標處', () => {
    const { sdk } = createSdk(fakeHost(), createEventBus())
    sdk.input.set('你好')
    sdk.input.add('！')
    sdk.input.setCursor(0)
    sdk.input.insert('嗨，')
    expect(sdk.input.get()).toBe('嗨，你好！')
    sdk.input.clear()
    expect(sdk.input.get()).toBe('')
    expect(() => sdk.input.set(1 as unknown as string)).toThrow(SdkError)
  })

  it('composing 時改草稿 → INVALID_ARGS', () => {
    const host = fakeHost()
    host.input.composing = () => true
    const { sdk } = createSdk(host, createEventBus())
    expect(() => sdk.input.set('x')).toThrowError(expect.objectContaining({ code: 'INVALID_ARGS' }))
  })

  it('composer.hide 後 visible() 為 false；stage.el 關著也回節點、visible 才是開關', () => {
    const { sdk } = createSdk(fakeHost(), createEventBus())
    sdk.composer.hide()
    expect(sdk.composer.visible()).toBe(false)
    expect(sdk.stage.visible()).toBe(false)
    expect(sdk.stage.el()).toBeTruthy()
    sdk.stage.open()
    expect(sdk.stage.visible()).toBe(true)
    sdk.stage.close()
    expect(sdk.stage.visible()).toBe(false)
  })
})

describe('message.send', () => {
  it('手勢內直接送、走手勢限頻（3／分）', async () => {
    const host = fakeHost({ gesture: true })
    const { sdk } = createSdk(host, createEventBus())
    for (let i = 0; i < 3; i++) await sdk.message.send(`m${i}`)
    expect(host.requests.map((r) => r.args[0])).toEqual(['m0', 'm1', 'm2'])
    await expectCode(sdk.message.send('m3'), 'RATE_LIMITED')
    host.tick(RATE_LIMITS['message.send.gesture'].windowMs)
    await sdk.message.send('m4')
    expect(host.requests.length).toBe(4)
  })

  it('非手勢先問使用者；拒絕 → UNAUTHORIZED、不送出', async () => {
    const host = fakeHost({ allow: false })
    const { sdk } = createSdk(host, createEventBus())
    await expectCode(sdk.message.send('x'), 'UNAUTHORIZED')
    expect(host.requests.length).toBe(0)
  })

  it('生成中 → BUSY，不占限頻；空訊息 → INVALID_ARGS；沒帶文字用草稿', async () => {
    const host = fakeHost({ gesture: true, generating: true })
    const { sdk } = createSdk(host, createEventBus())
    await expectCode(sdk.message.send('x'), 'BUSY')
    const idle = fakeHost({ gesture: true })
    const s2 = createSdk(idle, createEventBus()).sdk
    await expectCode(s2.message.send('   '), 'INVALID_ARGS')
    s2.input.set('草稿')
    await s2.message.send()
    expect(idle.requests[0].args).toEqual(['草稿'])
  })

  it('宿主沒接 send → NOT_SUPPORTED；edit 沒接 → HOST_DENIED；edit 限頻 10／分', async () => {
    const off = fakeHost({ capabilities: { saves: false, edit: false, send: false } })
    const { sdk } = createSdk(off, createEventBus())
    await expectCode(sdk.message.send('x'), 'NOT_SUPPORTED')
    await expectCode(sdk.message.edit('1', 'x'), 'HOST_DENIED')
    const on = fakeHost()
    const s2 = createSdk(on, createEventBus()).sdk
    for (let i = 0; i < 10; i++) await s2.message.edit('9', `t${i}`)
    await expectCode(s2.message.edit('9', 'more'), 'RATE_LIMITED')
  })
})

describe('save／cache', () => {
  it('預載前 get/keys 同步丟 HOST_DENIED；預載後可用；key 含冒號 INVALID_ARGS；set 走宿主並限頻 20／分', async () => {
    const host = fakeHost()
    const c = createSdk(host, createEventBus())
    expect(() => c.sdk.save.get('a')).toThrowError(expect.objectContaining({ code: 'HOST_DENIED' }))
    expect(() => c.sdk.save.keys()).toThrowError(expect.objectContaining({ code: 'HOST_DENIED' }))
    c.loadSaves({ hp: 3 })
    expect(c.sdk.save.keys()).toEqual(['hp'])
    expect(c.sdk.save.get('hp')).toBe(3)
    expect(() => c.sdk.save.get('hp:cur')).toThrowError(expect.objectContaining({ code: 'INVALID_ARGS' }))
    await expectCode(c.sdk.save.set('hp:cur', 1), 'INVALID_ARGS')
    await c.sdk.save.set('hp_cur', { v: 1 })
    expect(host.requests.at(-1)).toEqual({ op: 'save.set', args: ['hp_cur', { v: 1 }] })
    expect(c.sdk.save.get('hp_cur')).toEqual({ v: 1 })
    for (let i = 0; i < 19; i++) await c.sdk.save.set('hp_cur', i)
    await expectCode(c.sdk.save.set('hp_cur', 'x'), 'RATE_LIMITED')
    await c.sdk.save.remove('hp')
    expect(c.sdk.save.keys()).toEqual(['hp_cur'])
  })

  it('宿主沒接存檔 → 預載也不會讓它可用（HOST_DENIED）', () => {
    const c = createSdk(fakeHost({ capabilities: { saves: false, edit: true, send: true } }), createEventBus())
    c.loadSaves({})
    expect(() => c.sdk.save.keys()).toThrowError(expect.objectContaining({ code: 'HOST_DENIED' }))
  })

  it('cache 純記憶體、get 不存在回 undefined', () => {
    const { sdk } = createSdk(fakeHost(), createEventBus())
    expect(sdk.cache.get('k')).toBeUndefined()
    sdk.cache.set('k', { a: 1 })
    expect(sdk.cache.get('k')).toEqual({ a: 1 })
    sdk.cache.remove('k')
    expect(sdk.cache.get('k')).toBeUndefined()
  })
})
