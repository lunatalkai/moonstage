/**
 * 進出畫布的邊界。
 *
 * 卡片沒有沙盒：它會往 <body> 加自己的主題 class，那個 class 掛著整套 !important。
 * 離開對話頁不收乾淨的話，玩家帶著上一張卡的美化走到別的頁面去，而他完全看不出
 * 那是哪來的。
 *
 * 另一半是長按：手機那一端沒有三個點，長按是唯一的入口，判定錯了等於整組動作消失。
 */
import { describe, it, expect, vi } from 'vitest'
import { captureBodySnapshot, restoreBodySnapshot } from '../canvas-body-snapshot'
import { createLongPress, LONG_PRESS_MS, LONG_PRESS_CANCEL_PX } from '../canvas-longpress'

describe('離開畫布時把文件還原', () => {
  it('卡片加在 body / html 上的 class 與 inline style 都放回去', () => {
    document.body.className = 'platform-base'
    document.body.style.cssText = 'overflow: hidden;'
    document.documentElement.className = ''
    document.documentElement.style.cssText = ''

    const snapshot = captureBodySnapshot(document)

    // 卡片動手
    document.body.className = 'platform-base kg kg-light'
    document.body.style.cssText = 'overflow: hidden; background: #000;'
    document.documentElement.className = 'lt-immersive zs-tz1'
    document.documentElement.style.cssText = '--ys1: #123456;'

    expect(restoreBodySnapshot(document, snapshot)).toBe(true)
    expect(document.body.className).toBe('platform-base')
    expect(document.body.style.cssText).toBe('overflow: hidden;')
    expect(document.documentElement.className).toBe('')
    expect(document.documentElement.style.cssText).toBe('')
  })

  it('沒有快照就不動任何東西——寧可不還原，也不要清掉不是我們加的', () => {
    document.body.className = 'whatever'
    expect(restoreBodySnapshot(document, null)).toBe(false)
    expect(document.body.className).toBe('whatever')
  })
})

describe('長按', () => {
  function harness(overrides: any = {}) {
    let fn: (() => void) | null = null
    let scheduled = -1
    const triggered: number[] = []
    const handle = createLongPress({
      onTrigger: () => triggered.push(1),
      vibrate: overrides.vibrate || (() => {}),
      setTimer: (f, ms) => { fn = f; scheduled = ms; return 1 },
      clearTimer: () => { fn = null },
    })
    return { handle, fire: () => fn && fn(), scheduledMs: () => scheduled, triggered }
  }

  const touch = (x: number, y: number) => ({ touches: [{ clientX: x, clientY: y }] } as any)

  it('按住 450ms 才算長按', () => {
    const h = harness()
    h.handle.start(touch(10, 10))
    expect(h.scheduledMs()).toBe(LONG_PRESS_MS)
    h.fire()
    expect(h.triggered).toHaveLength(1)
  })

  it('觸發時震一下', () => {
    const buzz: number[] = []
    const h = harness({ vibrate: (ms: number) => buzz.push(ms) })
    h.handle.start(touch(10, 10))
    h.fire()
    expect(buzz).toEqual([10])
  })

  it('拖超過 8px 就取消——那是在捲動，不是長按', () => {
    const h = harness()
    h.handle.start(touch(10, 10))
    h.handle.move(touch(10, 10 + LONG_PRESS_CANCEL_PX + 1))
    h.fire()
    expect(h.triggered).toHaveLength(0)
  })

  it('手指微幅晃動不算取消', () => {
    const h = harness()
    h.handle.start(touch(10, 10))
    h.handle.move(touch(12, 11))
    h.fire()
    expect(h.triggered).toHaveLength(1)
  })

  it('抬手就結束，不會延後才彈出來', () => {
    const h = harness()
    h.handle.start(touch(10, 10))
    h.handle.end()
    h.fire()
    expect(h.triggered).toHaveLength(0)
  })

  it('震動在某些瀏覽器會拋例外，不得把選單一起帶走', () => {
    const h = harness({ vibrate: () => { throw new Error('blocked') } })
    h.handle.start(touch(10, 10))
    h.fire()
    expect(h.triggered).toHaveLength(1)
  })
})
