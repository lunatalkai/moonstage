import { describe, it, expect } from 'vitest'

import {
  createLunaIntentApi,
  SEND_LIMIT_PER_WINDOW,
  INPUT_LIMIT_PER_WINDOW,
  ERR_RATE_LIMITED,
  ERR_NOT_GESTURE,
  ERR_UNSUPPORTED,
} from './luna-intent-api.js'

function makeHost(over) {
  const calls = []
  let draft = ''
  let composing = false
  const host = Object.assign({
    getInput: () => draft,
    setInput: (t) => { draft = t; calls.push(['setInput', t]); return true },
    appendInput: (t) => { draft += t; calls.push(['appendInput', t]); return true },
    submit: () => { calls.push(['submit', draft]); return true },
    setBackground: (u) => { calls.push(['setBackground', u]); return true },
    scrollToTop: () => { calls.push(['scrollToTop']); return true },
    scrollToBottom: () => { calls.push(['scrollToBottom']); return true },
    isComposing: () => composing,
  }, over || {})
  return {
    host,
    calls,
    setComposing: (v) => { composing = v },
    draft: () => draft,
  }
}

function makeApi(over) {
  const h = makeHost(over && over.host)
  let clock = 1000
  const built = createLunaIntentApi({
    host: h.host,
    runtime: (over && over.runtime) || null,
    now: () => clock,
  })
  return {
    ...h,
    ...built,
    tick: (ms) => { clock += ms },
    at: () => clock,
  }
}

describe('luna intent api', () => {
  describe('輸入框', () => {
    it('get / set / append 轉給宿主', () => {
      const a = makeApi()
      expect(a.api.input.set('你好')).toBe(true)
      expect(a.api.input.get()).toBe('你好')
      expect(a.api.input.append('世界')).toBe(true)
      expect(a.draft()).toBe('你好世界')
    })

    it('輸入法組字期間拒絕寫入，回 false 不拋錯', () => {
      const a = makeApi()
      a.setComposing(true)
      expect(a.api.input.set('x')).toBe(false)
      expect(a.api.input.append('y')).toBe(false)
      expect(a.draft()).toBe('')
    })

    it('寫入超過限頻後拒絕', () => {
      const a = makeApi()
      for (let i = 0; i < INPUT_LIMIT_PER_WINDOW; i++) {
        expect(a.api.input.set('x')).toBe(true)
      }
      expect(a.api.input.set('x')).toBe(false)
    })

    it('宿主沒有實作該動作時回 false，不拋錯', () => {
      const a = makeApi({ host: { setInput: undefined } })
      expect(a.api.input.set('x')).toBe(false)
    })
  })

  describe('送出', () => {
    it('手勢期間可以送出', async () => {
      const a = makeApi()
      a.api.input.set('嗨')
      a.noteUserGesture()
      await expect(a.api.send()).resolves.toBeTruthy()
      expect(a.calls.some((c) => c[0] === 'submit')).toBe(true)
    })

    // 非手勢送出就是自問自答的來源。競品對此有專門的授權路徑，我們直接拒絕。
    it('沒有手勢時拒絕送出', async () => {
      const a = makeApi()
      await expect(a.api.send()).rejects.toMatchObject({ code: ERR_NOT_GESTURE })
    })

    it('手勢過期後拒絕送出（await 之後再送就不算手勢）', async () => {
      const a = makeApi()
      a.noteUserGesture()
      a.tick(1500)
      await expect(a.api.send()).rejects.toMatchObject({ code: ERR_NOT_GESTURE })
    })

    it('送出超過限頻後拒絕', async () => {
      const a = makeApi()
      for (let i = 0; i < SEND_LIMIT_PER_WINDOW; i++) {
        a.noteUserGesture()
        await a.api.send()
      }
      a.noteUserGesture()
      await expect(a.api.send()).rejects.toMatchObject({ code: ERR_RATE_LIMITED })
    })

    it('宿主沒有送出能力時回明確錯誤碼，不是靜默失敗', async () => {
      const a = makeApi({ host: { submit: undefined } })
      a.noteUserGesture()
      await expect(a.api.send()).rejects.toMatchObject({ code: ERR_UNSUPPORTED })
    })
  })

  describe('beforeSend', () => {
    it('改寫後的文字先回填輸入框再送出', async () => {
      const a = makeApi()
      a.api.input.set('攻擊')
      a.api.beforeSend((text) => text + ' 🎲12')
      a.noteUserGesture()
      await a.api.send()
      expect(a.draft()).toBe('攻擊 🎲12')
      const submit = a.calls.filter((c) => c[0] === 'submit').pop()
      expect(submit[1]).toBe('攻擊 🎲12')
    })

    it('回傳原字串＝不改寫', async () => {
      const a = makeApi()
      a.api.input.set('普通訊息')
      a.api.beforeSend((text) => text)
      a.noteUserGesture()
      await a.api.send()
      expect(a.draft()).toBe('普通訊息')
    })

    // 下面三條是同一個保證的三種失敗形態：不管 handler 怎麼壞，送出都不能被卡住。
    it('handler 拋錯時送原文，不阻斷送出', async () => {
      const a = makeApi()
      a.api.input.set('原文')
      a.api.beforeSend(() => { throw new Error('boom') })
      a.noteUserGesture()
      await expect(a.api.send()).resolves.toBeTruthy()
      expect(a.draft()).toBe('原文')
    })

    it('handler 回傳非字串時送原文', async () => {
      const a = makeApi()
      a.api.input.set('原文')
      a.api.beforeSend(() => ({ nope: true }))
      a.noteUserGesture()
      await a.api.send()
      expect(a.draft()).toBe('原文')
    })

    it('handler 逾時時送原文', async () => {
      const a = makeApi()
      a.api.input.set('原文')
      a.api.beforeSend((text) => { a.tick(500); return text + ' 改過' })
      a.noteUserGesture()
      await a.api.send()
      expect(a.draft()).toBe('原文')
    })

    it('重複註冊以最後一次為準', async () => {
      const a = makeApi()
      a.api.input.set('x')
      a.api.beforeSend((t) => t + '1')
      a.api.beforeSend((t) => t + '2')
      a.noteUserGesture()
      await a.api.send()
      expect(a.draft()).toBe('x2')
    })

    it('宿主自己的送出路徑也能套用改寫', () => {
      const a = makeApi()
      a.api.beforeSend((t) => t + '!')
      expect(a.applyBeforeSend('使用者手打的')).toBe('使用者手打的!')
    })
  })

  describe('背景與捲動', () => {
    it('background.set 轉給宿主（宿主負責寫穿伺服器）', () => {
      const a = makeApi()
      expect(a.api.background.set('https://x/bg.png')).toBe(true)
      expect(a.calls).toContainEqual(['setBackground', 'https://x/bg.png'])
    })

    it('scroll 兩個方向都轉得出去', () => {
      const a = makeApi()
      expect(a.api.scroll.toTop()).toBe(true)
      expect(a.api.scroll.toBottom()).toBe(true)
    })
  })

  describe('事件與邊界', () => {
    it('on 轉給資產執行期', () => {
      const seen = []
      const a = makeApi({ runtime: { subscribe: (e, h) => { seen.push(e); return true } } })
      expect(a.api.on('message:done', () => {})).toBe(true)
      expect(seen).toEqual(['message:done'])
    })

    it('沒有執行期時 on 回 false，不拋錯', () => {
      expect(makeApi().api.on('message:done', () => {})).toBe(false)
    })

    // 通用儲存刻意不提供：偏好進伺服器、進度進對話訊息、當場狀態用記憶體。
    it('不提供 storage', () => {
      expect(makeApi().api.storage).toBeUndefined()
    })

    it('所有同步方法都不拋錯，即使宿主什麼都沒實作', () => {
      const a = createLunaIntentApi({ host: {} })
      expect(() => {
        a.api.input.get()
        a.api.input.set('x')
        a.api.input.append('x')
        a.api.background.set('x')
        a.api.scroll.toTop()
        a.api.scroll.toBottom()
        a.api.on('message:done', () => {})
        a.api.beforeSend(() => 'x')
      }).not.toThrow()
    })
  })
})
