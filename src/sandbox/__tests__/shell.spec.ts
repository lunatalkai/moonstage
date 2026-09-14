// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest'
import { createShell, type Shell } from '../shell'
import type { SandboxHelloConfig, ShellToHost } from '../protocol'

function config(over: Partial<SandboxHelloConfig> = {}): SandboxHelloConfig {
  return {
    theme: 'dark',
    locale: 'zh-Hant',
    role: { name: '露娜', avatarUrl: '' },
    user: { nickname: '小明', avatarUrl: '' },
    card: { rules: [], statusbar: '' },
    capabilities: { saves: false, edit: false, send: true },
    composer: true,
    ...over,
  }
}

let shell: Shell | null = null
let sent: ShellToHost[] = []
const boot = (cfg: SandboxHelloConfig) => {
  sent = []
  document.body.innerHTML = '<div id="app"></div>'
  shell = createShell({ doc: document, win: window as Window & typeof globalThis, mount: document.getElementById('app')!, config: cfg, transport: { send: (m) => sent.push(m) } })
  return shell
}
afterEach(() => { shell?.dispose(); shell = null; delete (window as unknown as Record<string, unknown>).sdk })

const SCRIPT_RULE = (code: string) => ({ id: 1, name: 'kit', find: '{{eg-kit}}', replace: `<script>${code}</script>` })

describe('殼：冷啟動與事件順序', () => {
  it('腳本在 DOM 之前跑、sdk 掛在 window；冷啟動 new→mount→done，ready 最後；載荷恰好四鍵', () => {
    const s = boot(config({
      card: { rules: [SCRIPT_RULE(`
        window.__log = [];
        window.__top = { sdk: typeof sdk, bubbles: document.querySelectorAll('[data-chat="message"]').length, cs: document.currentScript, self: this === window };
        ['message:new','message:mount','message:done','ready'].forEach(function (ev) {
          sdk.on(ev, function (p) { window.__log.push(ev + ':' + (p ? p.id : 'undefined') + ':' + (p ? Object.keys(p).sort().join(',') : '')); });
        });
      `)], statusbar: '' },
    }))
    const w = window as unknown as { __log: string[]; __top: { sdk: string; bubbles: number; cs: unknown; self: boolean } }
    expect(w.__top).toEqual({ sdk: 'object', bubbles: 0, cs: null, self: true })
    s.handle({ type: 'messages', messages: [{ id: 'greeting', role: 'ai', content: '你好，{{user}}', serverId: null }] })
    expect(w.__log).toEqual([
      'message:new:greeting:content,id,role,serverId',
      'message:mount:greeting:content,id,role,serverId',
      'message:done:greeting:content,id,role,serverId',
      'ready:undefined:',
    ])
    expect(sent.some((m) => m.type === 'ready')).toBe(true)
    expect(s.refs.list.querySelector('[data-chat="message-body"]')!.innerHTML).toContain('你好，小明')
    expect(s.refs.list.querySelector('[data-chat="message"]')!.getAttribute('data-state')).toBe('done')
    expect(s.refs.list.querySelector('[data-chat="message"]')!.hasAttribute('data-msg-id')).toBe(false)
  })

  it('送出後：user new/mount、ai new/mount(pending 占位)、stream、done 一次且帶 serverId，再 mount', () => {
    const s = boot(config({ card: { rules: [SCRIPT_RULE(`window.__ev = []; ['message:new','message:mount','message:stream','message:done'].forEach(function (ev) { sdk.on(ev, function (p) { window.__ev.push([ev, p.id, p.content, 'serverId' in p ? p.serverId : 'absent']); }); });`)], statusbar: '' } }))
    s.handle({ type: 'messages', messages: [] })
    const ev = (window as unknown as { __ev: unknown[] }).__ev
    ev.length = 0
    s.handle({ type: 'message.new', message: { id: 'l1', role: 'user', content: '嗨', serverId: null } })
    s.handle({ type: 'message.new', message: { id: 'l2', role: 'ai', content: '', serverId: null } })
    const body = s.refs.list.querySelectorAll('[data-chat="message-body"]')[1] as HTMLElement
    expect(body.getAttribute('data-generating')).toBe('1')
    expect(body.textContent).toContain('正在回覆')
    s.handle({ type: 'message.stream', id: 'l2', content: '<content>你' })
    s.handle({ type: 'message.stream', id: 'l2', content: '<content>你好</content>' })
    expect(body.getAttribute('data-generating')).toBeNull()
    expect(body.innerHTML).not.toContain('<content>')
    s.handle({ type: 'message.done', id: 'l2', content: '<content>你好</content>', serverId: '9527' })
    expect(ev).toEqual([
      ['message:new', 'l1', '嗨', null],
      ['message:mount', 'l1', '嗨', null],
      ['message:new', 'l2', '', null],
      ['message:mount', 'l2', '', null],
      ['message:stream', 'l2', '<content>你', 'absent'],
      ['message:stream', 'l2', '<content>你好</content>', 'absent'],
      ['message:done', 'l2', '<content>你好</content>', '9527'],
      ['message:mount', 'l2', '<content>你好</content>', '9527'],
    ])
    expect(s.refs.list.querySelectorAll('[data-chat="message"]')[1].getAttribute('data-msg-id')).toBe('9527')
  })

  it('一到就是定稿的訊息（宿主先 new 再 done、內容相同）：new → mount → done，不重畫也不再 mount', () => {
    const s = boot(config({ card: { rules: [SCRIPT_RULE(`window.__ev = []; ['message:new','message:mount','message:done'].forEach(function (ev) { sdk.on(ev, function (p) { window.__ev.push([ev, p.id, p.serverId]); }); });`)], statusbar: '' } }))
    s.handle({ type: 'messages', messages: [] })
    const ev = (window as unknown as { __ev: unknown[] }).__ev
    ev.length = 0
    s.handle({ type: 'message.new', message: { id: 'l1', role: 'ai', content: '哈囉', serverId: '77', state: 'done' } })
    const bodyBefore = s.refs.list.querySelector('[data-chat="message-body"]')
    s.handle({ type: 'message.done', id: 'l1', content: '哈囉', serverId: '77' })
    expect(ev).toEqual([
      ['message:new', 'l1', '77'],
      ['message:mount', 'l1', '77'],
      ['message:done', 'l1', '77'],
    ])
    expect(s.refs.list.querySelector('[data-chat="message-body"]')).toBe(bodyBefore)
    // 內容真的變了才重畫、再 mount
    s.handle({ type: 'message.done', id: 'l1', content: '哈囉！', serverId: '77' })
    expect(ev.slice(3)).toEqual([['message:done', 'l1', '77'], ['message:mount', 'l1', '77']])
  })

  it('晚訂閱：mount/done 補發所有已掛氣泡；ready 不補發；回呼內 querySelector 只看當前氣泡', () => {
    const s = boot(config({ card: { rules: [{ id: 2, find: '/按鈕/', replace: '<button class="hello-btn">hi</button>' }], statusbar: '' } }))
    s.handle({ type: 'messages', messages: [
      { id: 'h1', role: 'ai', content: '按鈕', serverId: '1' },
      { id: 'h2', role: 'ai', content: '按鈕', serverId: '2' },
    ] })
    const sdk = (window as unknown as { sdk: { on(e: string, cb: (p?: unknown) => void): void } }).sdk
    const mounted: string[] = []
    const done: string[] = []
    let ready = 0
    sdk.on('message:mount', (p) => {
      const btn = document.querySelector('.hello-btn') as HTMLElement | null
      const owner = btn ? btn.closest('[data-chat="message"]')!.getAttribute('data-msg-id') : 'none'
      mounted.push(`${(p as { id: string }).id}@${owner}`)
    })
    sdk.on('message:done', (p) => done.push((p as { id: string }).id))
    sdk.on('ready', () => { ready++ })
    expect(mounted).toEqual(['h1@1', 'h2@2'])
    expect(done).toEqual(['h1', 'h2'])
    expect(ready).toBe(0)
    // 回呼外看不到氣泡內容
    expect(document.querySelector('.hello-btn')).toBeNull()
  })
})

describe('殼：功能欄、樣式、主題、輸入區、舞台與返回', () => {
  it('statusbar 非空才有節點且過規則；style 合成 author-css；主題切換發 theme:change', () => {
    const s = boot(config({ theme: 'light', card: { rules: [{ id: 1, find: '{{hud}}', replace: '<style>.hud{color:red}</style><div class="hud">HUD</div>' }], statusbar: '{{hud}}' } }))
    expect(s.refs.statusbar!.innerHTML).toContain('<div class="hud">HUD</div>')
    expect(s.refs.authorCss.textContent).toBe('.hud{color:red}')
    expect(s.refs.root.getAttribute('data-theme')).toBe('light')
    let changed = 0
    s.sdk.on('theme:change', () => { changed++ })
    s.handle({ type: 'theme', theme: 'dark' })
    expect(s.refs.root.getAttribute('data-theme')).toBe('dark')
    expect(changed).toBe(1)
    const none = boot(config())
    expect(none.refs.statusbar).toBeNull()
  })

  it('輸入區：打字發 input:change（字串）並鏡射給宿主；送出走 request 並在宿主回覆後清空', async () => {
    const s = boot(config())
    s.handle({ type: 'messages', messages: [] })
    const seen: unknown[] = []
    s.sdk.on('input:change', (p) => seen.push(p))
    s.refs.input.value = '你好'
    s.refs.input.dispatchEvent(new Event('input'))
    expect(seen).toEqual(['你好'])
    expect(sent.at(-1)).toEqual({ type: 'input', value: '你好' })
    s.refs.send.click()
    const req = sent.find((m) => m.type === 'request') as { reqId: number; op: string; args: unknown[] }
    expect(req.op).toBe('message.send')
    expect(req.args).toEqual(['你好'])
    s.handle({ type: 'reply', reqId: req.reqId, ok: true })
    await Promise.resolve()
    await Promise.resolve()
    expect(s.refs.input.value).toBe('')
  })

  it('generation busy 時送出鈕停用；composer.hide 同步 data-composer', () => {
    const s = boot(config())
    s.handle({ type: 'generation', busy: true })
    expect(s.refs.send.disabled).toBe(true)
    expect(s.refs.root.getAttribute('data-busy')).toBe('1')
    s.sdk.composer.hide()
    expect(s.refs.root.getAttribute('data-composer')).toBe('hidden')
    expect(s.refs.composer.hidden).toBe(true)
    expect(sent.at(-1)).toEqual({ type: 'composer', visible: false })
  })

  it('舞台：open 設 data-stage 並通知宿主；宿主的 back 先關舞台（發 stage:close）、再一次才交回宿主', () => {
    const s = boot(config())
    const closed: number[] = []
    let back = 0
    s.sdk.on('stage:close', () => closed.push(1))
    s.sdk.on('back', () => { back++ })
    s.sdk.stage.open('full')
    expect(s.refs.stage.getAttribute('data-stage')).toBe('full')
    expect(sent.at(-1)).toEqual({ type: 'stage', state: 'full' })
    s.handle({ type: 'back' })
    expect(closed).toEqual([1])
    expect(s.refs.stage.getAttribute('data-stage')).toBe('closed')
    expect(sent.at(-1)).toEqual({ type: 'back-handled', handled: true })
    s.handle({ type: 'back' })
    expect(back).toBe(1)
    expect(sent.at(-1)).toEqual({ type: 'back-handled', handled: false })
    // 作者自己 close 不發 stage:close
    s.sdk.stage.open('content')
    s.sdk.stage.close()
    expect(closed).toEqual([1])
  })

  it('切會話：清氣泡（unmount）、關舞台、清補發記錄、發 conversation:switch；訂閱不清', () => {
    const s = boot(config())
    s.handle({ type: 'messages', messages: [{ id: 'h1', role: 'ai', content: 'a', serverId: '1' }] })
    const log: string[] = []
    s.sdk.on('message:unmount', (p) => log.push(`un:${(p as { id: string }).id}`))
    s.sdk.on('conversation:switch', () => log.push('switch'))
    s.sdk.stage.open('content')
    s.handle({ type: 'conversation.switch' })
    expect(log).toEqual(['un:h1', 'switch'])
    expect(s.refs.list.childElementCount).toBe(0)
    expect(s.refs.stage.getAttribute('data-stage')).toBe('closed')
    const late: string[] = []
    s.sdk.on('message:mount', (p) => late.push((p as { id: string }).id))
    expect(late).toEqual([])
    s.handle({ type: 'messages', messages: [{ id: 'h9', role: 'ai', content: 'b', serverId: '9' }] })
    expect(late).toEqual(['h9'])
  })

  it('存檔：宿主宣告 saves 並預載 → save.get 立即可用；set 走 request，宿主拒絕時 reject 對應碼', async () => {
    const s = boot(config({ capabilities: { saves: true, edit: false, send: true }, saves: { hp: 5 } }))
    expect(s.sdk.save.get('hp')).toBe(5)
    const p = s.sdk.save.set('hp', 6)
    const req = sent.find((m) => m.type === 'request' && (m as { op: string }).op === 'save.set') as { reqId: number }
    s.handle({ type: 'reply', reqId: req.reqId, ok: false, error: { code: 'NETWORK' } })
    await expect(p).rejects.toMatchObject({ code: 'NETWORK' })
    expect(s.sdk.save.get('hp')).toBe(5)
  })
})
