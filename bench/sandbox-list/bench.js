/**
 * 沙箱殼訊息列表的效能基準：假宿主餵 N 則合成訊息，量 DOM 節點數、堆積、捲動幀時間、追加一則的成本。
 *
 * 用法（在 moonstage 根目錄）：
 *   npm run build:sandbox && python3 -m http.server 4173
 *   開 http://localhost:4173/bench/sandbox-list/?n=300&format=mmd   （format=tavern 走圍欄文件→iframe 那條路）
 *   主控台：await __bench.run()   → 回一份 JSON，也印在右側。
 *
 * 不是測試、不進 build：真實對話拿不到幾百則的樣本，這裡自己造一份，長對話的優化前後都用同一份量。
 * 三種正文輪流出現，對應真卡裡最重的三種形狀：純文字段落、狀態面板（幾百個節點）、圍欄裡的整份 HTML 文件。
 */
(function () {
  const params = new URLSearchParams(location.search)
  const N = Number(params.get('n') || 300)
  const FORMAT = params.get('format') || 'mmd'
  const PROTOCOL = 1
  const frame = document.getElementById('frame')
  const logEl = document.getElementById('log')
  const log = (s) => { logEl.textContent += s + '\n' }

  const PROSE = '「今晚的風有點涼。」她把外套披到你肩上，指尖停了一瞬。**月光**從窗縫漏進來，落在桌上那封還沒拆的信。\n\n你想起白天在碼頭聽見的傳聞：北岸的燈塔三天沒亮了，守塔人失蹤，港務署只說「例行維修」。\n\n她注意到你的沉默。「在想燈塔的事？」\n\n*遠處傳來汽笛。*\n\n- 追問燈塔\n- 先拆那封信\n- 什麼都不說，陪她看海\n'
  const panel = (i) => {
    let rows = ''
    for (let r = 0; r < 30; r++) rows += `<tr><td><span class="k">屬性${r}</span></td><td><b>${(i * 7 + r) % 100}</b></td><td><i>${r % 2 ? '上升' : '持平'}</i></td><td><span class="bar"><span style="width:${(r * 3) % 100}%"></span></span></td><td>${r % 3 === 0 ? '⚠' : '·'}</td></tr>`
    return `<div class="hud"><div class="hud-title">狀態面板 #${i}</div><table>${rows}</table><div class="hud-foot"><span>好感 ${i % 100}</span><span>信任 ${(i * 3) % 100}</span><span>疲勞 ${(i * 5) % 100}</span></div></div>\n\n` + PROSE
  }
  const doc = (i) => '```html\n<!DOCTYPE html>\n<html><head><meta charset="utf-8"><style>body{font:14px sans-serif;background:#222;color:#eee;padding:12px}.c{border:1px solid #555;border-radius:8px;padding:8px}</style></head><body><div class="c"><h3>信 #' + i + '</h3><p>親愛的旅人：燈塔的事別再追了。</p><button onclick="this.textContent=\'已讀\'">讀完</button></div></body></html>\n```\n\n' + PROSE
  const bodyOf = (i) => (i % 3 === 0 ? panel(i) : i % 3 === 1 ? doc(i) : PROSE)
  const messages = []
  for (let i = 0; i < N; i++) {
    const ai = i % 2 === 0
    messages.push({ id: `h${i}`, role: ai ? 'ai' : 'user', content: ai ? bodyOf(i) : `第 ${i} 句：我想知道燈塔怎麼了。`, serverId: ai ? String(1000 + i) : null, state: 'done' })
  }

  const hello = {
    theme: 'dark', locale: 'zh-Hant',
    role: { name: '露娜', avatarUrl: '' }, user: { nickname: '旅人', avatarUrl: '' },
    card: { format: FORMAT, rules: [{ id: 1, name: 'style', find: '{{bench-style}}', replace: '<style>.hud{border:1px solid #446;border-radius:8px;padding:8px;margin:8px 0}.hud table{width:100%;border-collapse:collapse}.hud td{padding:2px 4px;border-bottom:1px solid #223}.bar{display:inline-block;width:60px;height:6px;background:#223}.bar span{display:block;height:100%;background:#6af}</style>' }], statusbar: '' },
    variants: null, capabilities: { saves: false, edit: false, send: true }, composer: true, chrome: 'shell',
  }

  const post = (m) => frame.contentWindow.postMessage({ ms: PROTOCOL, ...m }, '*')
  const fromShell = []
  let readyAt = 0, messagesAt = 0, helloed = false
  const waiters = []
  window.addEventListener('message', (ev) => {
    if (ev.source !== frame.contentWindow || !ev.data || ev.data.ms !== PROTOCOL) return
    fromShell.push(ev.data)
    if (ev.data.type === 'ready-shell' && !helloed) { helloed = true; post({ type: 'hello', config: hello }) }
    if (ev.data.type === 'ready') readyAt = performance.now()
    for (const w of waiters.splice(0)) w(ev.data)
  })
  const nextFromShell = (type) => new Promise((res) => { const w = (m) => { if (m.type === type) res(m); else waiters.push(w) }; waiters.push(w) })

  const win = () => frame.contentWindow
  const idoc = () => frame.contentDocument
  const scroller = () => idoc().querySelector('#scrollview')
  const raf = () => new Promise((r) => win().requestAnimationFrame(() => r()))
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
  const heap = () => (win().performance.memory ? Math.round(win().performance.memory.usedJSHeapSize / 1048576) : null)
  const gc = async () => { if (window.gc) { window.gc(); await sleep(50) } }
  const count = (sel) => idoc().querySelectorAll(sel).length

  const snapshot = async (label) => {
    await gc()
    const out = {
      label,
      nodes: count('*'),
      bubbles: count('[data-chat="message"]'),
      mountedBubbles: count('[data-chat="message"] [data-chat="message-body"]'),
      iframes: count('iframe'),
      heapMB: heap(),
      scrollHeight: scroller().scrollHeight,
    }
    return out
  }

  /** 從頂捲到底再捲回來，記每一幀的間隔與 long task。 */
  const sweep = async (label, stepPx) => {
    const sv = scroller()
    const longTasks = []
    let po = null
    try { po = new (win().PerformanceObserver)((list) => { for (const e of list.getEntries()) longTasks.push(Math.round(e.duration)) }); po.observe({ type: 'longtask', buffered: false }) } catch (e) { /* 沒有 longtask 就只看幀 */ }
    const frames = []
    const max = sv.scrollHeight - sv.clientHeight
    const step = stepPx || Math.max(40, Math.round(sv.clientHeight * 0.6))
    let last = performance.now()
    const tick = async () => { await raf(); const now = performance.now(); frames.push(now - last); last = now }
    sv.scrollTop = 0
    await tick(); await tick()
    last = performance.now()
    for (let y = 0; y <= max; y += step) { sv.scrollTop = y; await tick() }
    for (let y = max; y >= 0; y -= step) { sv.scrollTop = y; await tick() }
    await sleep(100)
    if (po) po.disconnect()
    frames.sort((a, b) => a - b)
    const p = (q) => Math.round(frames[Math.min(frames.length - 1, Math.floor(frames.length * q))] * 10) / 10
    return { label, frames: frames.length, p50: p(0.5), p95: p(0.95), max: Math.round(frames[frames.length - 1]), longTasks: longTasks.length, longTaskMs: longTasks.reduce((a, b) => a + b, 0) }
  }

  /** 追加一輪：玩家一則、AI 一則串 20 段再定稿，量從 new 到 DOM 更新完的牆鐘。 */
  const appendRound = async (i) => {
    const t0 = performance.now()
    let busy = 0
    let po = null
    try { po = new (win().PerformanceObserver)((list) => { for (const e of list.getEntries()) busy += e.duration }); po.observe({ type: 'longtask', buffered: false }) } catch (e) { /* */ }
    post({ type: 'message.new', message: { id: `l${i}u`, role: 'user', content: '再說一次燈塔的事。', serverId: null } })
    post({ type: 'message.new', message: { id: `l${i}`, role: 'ai', content: '', serverId: null } })
    const body = bodyOf(i * 2)
    const chunk = Math.ceil(body.length / 20)
    for (let k = 1; k <= 20; k++) { post({ type: 'message.stream', id: `l${i}`, content: body.slice(0, k * chunk) }); await raf() }
    post({ type: 'message.done', id: `l${i}`, content: body, serverId: String(9000 + i) })
    await raf(); await raf()
    if (po) po.disconnect()
    return { wallMs: Math.round(performance.now() - t0), longTaskMs: Math.round(busy) }
  }

  async function run() {
    logEl.textContent = ''
    log(`n=${N} format=${FORMAT} ua=${navigator.userAgent.split(') ')[0]})`)
    if (!helloed) await nextFromShell('ready-shell').then(() => {})
    while (!helloed) await sleep(20)
    await sleep(50)
    const before = await snapshot('empty')
    messagesAt = performance.now()
    post({ type: 'messages', messages })
    await nextFromShell('ready')
    const coldMs = Math.round(readyAt - messagesAt)
    await raf(); await raf(); await sleep(300)
    const loaded = await snapshot('loaded')
    const sweep1 = await sweep('sweep-cold')
    const sweep2 = await sweep('sweep-warm')
    const sweep3 = await sweep('sweep-fine-120px', 120)
    const appendMs = []
    for (let i = 1; i <= 5; i++) appendMs.push(await appendRound(i))
    const after = await snapshot('after-append')
    const result = { n: N, format: FORMAT, coldMs, before, loaded, sweeps: [sweep1, sweep2, sweep3], appendMs, after, fromShell: fromShell.length }
    log(JSON.stringify(result, null, 2))
    return result
  }

  window.__bench = { run, post, messages, hello, snapshot, sweep, appendRound, fromShell }
  log('ready: await __bench.run()')
})()
