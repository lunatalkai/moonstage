// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest'
import { createEventBus, SDK_EVENTS } from '../sdk/events'
import { installMessageScope } from '../scope'

describe('事件匯流排：補發規則', () => {
  it('12 個事件名固定', () => {
    expect(SDK_EVENTS).toEqual(['ready', 'message:new', 'message:done', 'message:stream', 'message:mount', 'message:unmount', 'input:change', 'conversation:switch', 'theme:change', 'back', 'stage:close', 'dispose'])
  })

  it('mount／done 對晚訂閱者補發；ready 不補發；不認得的事件名不報錯', () => {
    const bus = createEventBus()
    bus.emit('message:mount', { id: 'l1' }, { key: 'l1' })
    bus.emit('message:done', { id: 'l1' }, { key: 'l1:done' })
    bus.emit('ready')
    const seen: string[] = []
    bus.on('message:mount', (p) => seen.push(`mount:${(p as { id: string }).id}`))
    bus.on('message:done', (p) => seen.push(`done:${(p as { id: string }).id}`))
    bus.on('ready', () => seen.push('ready'))
    bus.on('nope:event', () => seen.push('nope'))
    expect(seen).toEqual(['mount:l1', 'done:l1'])
  })

  it('同一則訊息重掛：補發記錄只留最新一份；forget 後不再補發', () => {
    const bus = createEventBus()
    bus.emit('message:mount', { id: 'l1', content: '' }, { key: 'l1' })
    bus.emit('message:mount', { id: 'l1', content: '完整' }, { key: 'l1' })
    const seen: unknown[] = []
    bus.on('message:mount', (p) => seen.push(p))
    expect(seen).toEqual([{ id: 'l1', content: '完整' }])
    bus.forget('l1')
    const later: unknown[] = []
    bus.on('message:mount', (p) => later.push(p))
    expect(later).toEqual([])
  })

  it('回呼丟錯只廢它自己；載荷只有一個實參', () => {
    const errors: string[] = []
    const bus = createEventBus({ onError: (ev) => errors.push(ev) })
    const args: number[] = []
    bus.on('message:new', () => { throw new Error('boom') })
    bus.on('message:new', function (this: unknown, ...a: unknown[]) { args.push(a.length) })
    bus.emit('message:new', { id: 'l1' })
    expect(errors).toEqual(['message:new'])
    expect(args).toEqual([1])
  })
})

describe('訊息作用域：回呼內只看得到當前氣泡', () => {
  let scope: ReturnType<typeof installMessageScope> | null = null
  afterEach(() => { scope?.uninstall(); scope = null; document.body.innerHTML = '' })

  function twoBubbles() {
    document.body.innerHTML = `
      <div data-chat="root">
        <div data-slot="statusbar"><b id="hud">hud</b></div>
        <article data-chat="message" id="m1"><div data-chat="message-body"><button class="btn" id="b1">1</button></div></article>
        <article data-chat="message" id="m2"><div data-chat="message-body"><button class="btn" id="b2">2</button></div></article>
      </div>`
    return { m1: document.getElementById('m1')!, m2: document.getElementById('m2')! }
  }

  it('回呼外：就是一般的文件——氣泡內部與平台節點都查得到（舊頁寫法的點火器靠這個撿引擎片段）', () => {
    twoBubbles()
    scope = installMessageScope(document)
    expect(document.querySelector('.btn')).not.toBeNull()
    expect(document.querySelectorAll('.btn').length).toBe(2)
    expect(document.getElementById('b1')).not.toBeNull()
    expect(document.querySelector('[data-chat="root"]')).not.toBeNull()
    expect(document.getElementById('hud')).not.toBeNull()
    expect(document.body.querySelector('.btn')).not.toBeNull()
  })

  it('回呼內：先在游標氣泡裡找，氣泡根自己也算；別的氣泡內部不給', () => {
    const { m2 } = twoBubbles()
    scope = installMessageScope(document)
    scope.run(m2, () => {
      expect(document.querySelector('.btn')!.id).toBe('b2')
      expect(document.querySelector('[data-chat="message"]')).toBe(m2)
      expect(document.getElementById('b2')).not.toBeNull()
      expect(document.getElementById('b1')).toBeNull()
      expect(Array.from(document.querySelectorAll('.btn')).map((e) => e.id)).toEqual(['b2'])
      expect(document.querySelector('[data-chat="root"]')).not.toBeNull()
    })
    expect(scope.current()).toBeNull()
  })

  it('使用者事件的捕獲階段自動收窄到事件所在的氣泡', () => {
    const { m1 } = twoBubbles()
    scope = installMessageScope(document)
    let seen: string | null = null
    // 補丁裝上後，回呼外 document.getElementById 查不到氣泡內容；拿節點要走 Element 級查詢。
    const b1 = document.body.querySelector('#b1')!
    b1.addEventListener('click', () => { seen = document.querySelector('.btn')!.id })
    b1.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    expect(seen).toBe('b1')
    expect(m1).toBeTruthy()
  })
})
