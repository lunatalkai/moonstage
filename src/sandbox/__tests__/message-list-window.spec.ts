// @vitest-environment jsdom
/**
 * 訊息列表的視窗化（跟 MMD 沙箱一致：氣泡捲出螢幕就銷毀、捲回來重建）與「載入更早的歷史」的插入。
 * 這裡直接測 createMessageList，用假的觀察者與假的捲動容器（jsdom 沒有版面）。
 */
import { describe, it, expect, vi } from 'vitest'
import { createMessageList, type MessageListVirtualize } from '../render/message-list'
import { createEventBus } from '../sdk/events'
import type { SandboxMessage } from '../protocol'

const tick = () => new Promise((r) => setTimeout(r, 0))

function harness(over: { clientHeight?: number } = {}) {
  document.body.innerHTML = '<div id="list"></div>'
  const list = document.getElementById('list')!
  const bus = createEventBus()
  const log: string[] = []
  for (const ev of ['message:new', 'message:mount', 'message:done', 'message:unmount', 'message:stream'] as const) {
    bus.on(ev, (p) => log.push(`${ev.slice(8)}:${(p as { id: string }).id}`))
  }
  const near = new Map<HTMLElement, (near: boolean) => void>()
  const scroller = { scrollTop: 0, clientHeight: over.clientHeight ?? 0, scrollHeight: 0, getBoundingClientRect: () => ({ top: 0, bottom: 800, height: 800 }) } as unknown as HTMLElement
  const virtualize: MessageListVirtualize = {
    scroller,
    observe: (frame, cb) => { near.set(frame, cb); return () => near.delete(frame) },
  }
  const mountFrontend = vi.fn()
  const ml = createMessageList({
    doc: document, list, bus, render: (c) => `<p>${c}</p>`, strings: { generating: '…' },
    roleName: 'AI', roleAvatar: '', userName: 'me', userAvatar: '', virtualize, mountFrontend,
  })
  const frames = () => Array.from(list.querySelectorAll('[data-chat="message-frame"]')) as HTMLElement[]
  const frameOf = (id: string) => frames()[ml.ids().indexOf(id)]
  const say = (id: string, isNear: boolean) => near.get(frameOf(id))!(isNear)
  return { ml, bus, log, list, frames, frameOf, say, scroller, mountFrontend }
}

const msgs = (n: number, prefix = 'h'): SandboxMessage[] =>
  Array.from({ length: n }, (_, i) => ({ id: `${prefix}${i}`, role: i % 2 ? 'user' : 'ai', content: `m${i}`, serverId: i % 2 ? null : String(100 + i), state: 'done' as const }))

describe('訊息列表視窗化', () => {
  it('冷啟動：每則都有外框、都發 new 與 done；只有最末幾則真的掛著並發 mount，其餘是等高空殼', () => {
    const h = harness()
    h.ml.reset(msgs(20))
    expect(h.frames()).toHaveLength(20)
    expect(h.ml.mountedIds()).toEqual(['h16', 'h17', 'h18', 'h19'])
    expect(h.log.filter((l) => l.startsWith('new:'))).toHaveLength(20)
    expect(h.log.filter((l) => l.startsWith('done:'))).toHaveLength(20)
    expect(h.log.filter((l) => l.startsWith('mount:'))).toEqual(['mount:h16', 'mount:h17', 'mount:h18', 'mount:h19'])
    const hollow = h.frameOf('h0')
    expect(hollow.getAttribute('data-virtual')).toBe('1')
    expect(hollow.style.height).toBe('160px')
    expect(hollow.children).toHaveLength(0)
    expect(h.ml.bubbleOf('h0')).toBeNull()
    expect(h.ml.bubbleOf('h19')).not.toBeNull()
  })

  it('視窗高度已知時，冷啟動掛到撐滿三個螢幕高為止', () => {
    const h = harness({ clientHeight: 800 })
    h.ml.reset(msgs(40))
    // 800 × 3 ／ 估高 160 = 15 則
    expect(h.ml.mountedIds()).toHaveLength(15)
  })

  it('捲回來：空殼重建、發 mount、前端區塊重掛；捲出去：發 unmount、變回空殼、mount 補發記錄拿掉但 done 留著', async () => {
    const h = harness()
    h.ml.reset(msgs(10))
    h.log.length = 0
    h.say('h2', true)
    await tick()
    expect(h.log).toEqual(['mount:h2'])
    expect(h.ml.mountedIds()).toEqual(['h2', 'h6', 'h7', 'h8', 'h9'])
    expect(h.frameOf('h2').hasAttribute('data-virtual')).toBe(false)
    expect(h.mountFrontend).toHaveBeenCalledWith(expect.any(HTMLElement))
    const calls = h.mountFrontend.mock.calls.length

    h.log.length = 0
    h.say('h2', false)
    await tick()
    expect(h.log).toEqual(['unmount:h2'])
    expect(h.ml.mountedIds()).toEqual(['h6', 'h7', 'h8', 'h9'])
    expect(h.frameOf('h2').getAttribute('data-virtual')).toBe('1')
    // 晚訂閱：mount 只補真的掛著的；done 對每一則都補（定稿只發一次的契約靠這個）
    const late: string[] = []
    h.bus.on('message:mount', (p) => late.push(`mount:${(p as { id: string }).id}`))
    h.bus.on('message:done', (p) => late.push(`done:${(p as { id: string }).id}`))
    expect(late.filter((l) => l.startsWith('mount:'))).toEqual(['mount:h6', 'mount:h7', 'mount:h8', 'mount:h9'])
    expect(late.filter((l) => l.startsWith('done:'))).toHaveLength(10)

    // 再捲回來：前端區塊重掛（跟 MMD 銷毀重建一致）
    h.say('h2', true)
    await tick()
    expect(h.mountFrontend.mock.calls.length).toBe(calls + 1)
  })

  it('串流中的與最末兩則永遠掛著；新訊息進來後，舊的末端不在視窗附近就拆掉', async () => {
    const h = harness()
    h.ml.reset(msgs(6))
    h.say('h4', false); h.say('h5', false)
    await tick()
    expect(h.ml.mountedIds()).toEqual(['h2', 'h3', 'h4', 'h5'])
    h.say('h2', false); h.say('h3', false)
    await tick()
    expect(h.ml.mountedIds()).toEqual(['h4', 'h5'])

    h.ml.add({ id: 'l1', role: 'user', content: '嗨', serverId: null })
    h.ml.add({ id: 'l2', role: 'ai', content: '', serverId: null })
    await tick()
    // h4、h5 不再是末端，又不在視窗附近 → 拆掉；l1、l2 是末端且 l2 串流中
    expect(h.ml.mountedIds()).toEqual(['l1', 'l2'])
    h.say('l2', false); h.say('l1', false)
    h.ml.stream('l2', '你好')
    await tick()
    expect(h.ml.mountedIds()).toEqual(['l1', 'l2'])
    h.ml.done('l2', '你好', '9')
    await tick()
    expect(h.ml.mountedIds()).toEqual(['l1', 'l2'])
  })

  it('insertBefore：插在指定那則之前（DOM 與 ids 同序）、先當空殼、發 new 與 done、不捲到底、捲動位置補償', () => {
    const h = harness()
    h.ml.reset(msgs(4))
    h.log.length = 0
    h.scroller.scrollTop = 500
    // 假裝每個外框 160 高（jsdom 沒版面）：插入一則列表就長 160
    Object.defineProperty(h.scroller, 'scrollHeight', { get: () => 160 * h.frames().length, configurable: true })
    h.ml.insertBefore({ id: 'p1', role: 'ai', content: 'old1', serverId: '1', state: 'done' }, 'h0')
    h.ml.insertBefore({ id: 'p2', role: 'user', content: 'old2', serverId: null, state: 'done' }, 'h0')
    expect(h.ml.ids()).toEqual(['p1', 'p2', 'h0', 'h1', 'h2', 'h3'])
    expect(h.frames().map((f) => f.getAttribute('data-virtual') || '-')).toEqual(['1', '1', '-', '-', '-', '-'])
    expect(h.log).toEqual(['new:p1', 'done:p1', 'new:p2', 'done:p2'])
    expect(h.scroller.scrollTop).toBe(500 + 320)
  })

  it('掛回畫面上方的空殼，長出來的高度補進 scrollTop；停在底部時維持在底部', async () => {
    const h = harness()
    h.ml.reset(msgs(8))
    let height = 3000
    Object.defineProperty(h.scroller, 'scrollHeight', { get: () => height, configurable: true })
    h.scroller.scrollTop = 1000
    ;(h.scroller as unknown as { clientHeight: number }).clientHeight = 800
    // h1 在畫面上方（rect 在視窗頂之上）：空殼 160 → 真身 400
    const f = h.frameOf('h1')
    let rebuilt = false
    f.getBoundingClientRect = () => ({ top: -600, bottom: rebuilt ? -200 : -440, height: rebuilt ? 400 : 160 } as DOMRect)
    const origMount = h.bus.emit
    h.bus.emit = (ev, p, o) => { if (ev === 'message:mount' && (p as { id: string }).id === 'h1') { rebuilt = true; height += 240 } return origMount(ev, p, o) }
    h.say('h1', true)
    await tick()
    expect(h.ml.mountedIds()).toContain('h1')
    expect(h.scroller.scrollTop).toBe(1240)

    // 停在底部：底部的空殼掛回來後仍貼底
    h.scroller.scrollTop = height - 800
    const f2 = h.frameOf('h2')
    f2.getBoundingClientRect = () => ({ top: 100, bottom: 260, height: 160 } as DOMRect)
    h.say('h2', true)
    await tick()
    // 貼底＝scrollTop 設成 scrollHeight（瀏覽器會夾到最大值；假容器不夾）
    expect(h.scroller.scrollTop).toBe(height)
  })

  it('remove 空殼不發 unmount（已經拆過）；remove 掛著的照發', async () => {
    const h = harness()
    h.ml.reset(msgs(6))
    h.log.length = 0
    h.ml.remove('h0')
    expect(h.log).toEqual([])
    h.ml.remove('h5')
    expect(h.log).toEqual(['unmount:h5'])
    expect(h.ml.ids()).toEqual(['h1', 'h2', 'h3', 'h4'])
  })
})
