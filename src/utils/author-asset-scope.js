/**
 * 作者範圍（author scope）：把「這張卡的程式碼跑出來的副作用」全部記在帳上，離開對話頁
 * 時一筆一筆收回去。
 *
 * 為什麼需要它
 * ------------
 * 作者容器（author-asset-mount.js）只管自己那幾個 fixed 容器。作者腳本卻不一定乖乖待在
 * 容器裡：`document.body.appendChild(hud)` 直接往頁面根部塞面板、`setInterval` 每秒把面板
 * 重新畫回去、`window.addEventListener('keydown', …)` 接快捷鍵、`document.onkeydown = …`
 * 直接改屬性。訊息串裡的 <script>/<style> 又是複製一份放進 <head> 才會執行，也沒有人
 * 記得把它們拿掉。結果就是：離開這張卡之後，HUD 面板、底部列、快捷鍵、每秒重畫的計時器
 * 全都還活在下一頁上，玩家只能重新整理。
 *
 * 做法：歸因，不是掃地
 * --------------------
 * 不是「離開時把 body 底下不認識的東西全砍掉」——宿主自己也會往 body 掛東西（Teleport
 * 的對話框、站台的提示），砍錯了會把宿主弄壞。這裡只認「作者程式碼執行期間」發生的事：
 *
 * - 每段作者程式碼都在一個「窗口」裡跑（run / wrap）。窗口開著的時候：
 *   - <html>/<head>/<body> 直接子節點的新增，記下來（MutationObserver，只看第一層，
 *     容器裡面的東西本來就會跟容器一起走）；
 *   - setTimeout / setInterval / requestAnimationFrame 的登記，記下編號，回呼再包一層
 *     窗口——作者在計時器裡再開計時器、再塞節點，一樣算到這張卡頭上；
 *   - window / document / html / body 上的 addEventListener，記下來，回呼同樣包窗口。
 * - 作者節點上的 inline handler（onclick="…"）沒經過我們的手，改在 window 的捕獲階段
 *   認出「事件目標在作者的 DOM 裡」就把窗口打開，冒泡到 window 時關上；不冒泡的事件靠
 *   一個 0ms 的原生計時器兜底關窗。
 * - `window.onresize = …` 這類直接賦值攔不到，改成進場拍一次快照、離場把改過的還回去。
 * - 我們自己替作者放進 <head> 的 <script>/<style>，用 adopt 記帳。
 *
 * dispose 的時候把帳上的東西全部收掉：節點移除、計時器清掉、監聽拆掉、on* 屬性還原、
 * 補丁撤掉。窗口外發生的事一律不碰——那是宿主自己的。
 *
 * 不做的事
 * --------
 * - window 上的全域變數／函式不刪：卡片常把工具函式掛在 window 上，跟宿主的程式庫
 *   分不開，刪錯的代價比留著高。留著的全域不會畫東西也不會動，下一張卡看不到它。
 * - localStorage 不碰。
 * - 外連（src=）的 <script> 是非同步載入執行的，頂層程式碼不在任何窗口裡；它開的計時器與
 *   監聽只有在後續進了窗口（例如被我們包過的回呼再呼叫）才會被記到。
 * - `await` / `.then` 之後的延續也一樣不在窗口裡（微任務不經過我們包的計時器）。作者在
 *   fetch 回來之後才塞的節點記不到；同步的初始化、計時器回呼、事件回呼裡做的事都記得到，
 *   實際會殘留的卡幾乎都是後者。
 * - 宿主替作者做的事（透過 luna 意圖 API 送出、提示、改背景）在 suspend 裡跑，不記帳。
 */

import { isHostResourceNode } from '@/common/host-resource'

const TIMER_METHODS = [
  { set: 'setTimeout', clear: 'clearTimeout' },
  { set: 'setInterval', clear: 'clearInterval' },
  { set: 'requestAnimationFrame', clear: 'cancelAnimationFrame' },
]

// 作者節點上 inline handler 可能接的事件。捕獲階段在 window 上聽，只在目標落在作者 DOM
// 裡時才開窗；passive 宣告我們不會 preventDefault，不影響捲動效能。
const GESTURE_EVENTS = [
  'click', 'dblclick', 'mousedown', 'mouseup', 'pointerdown', 'pointerup',
  'touchstart', 'touchend', 'touchmove', 'keydown', 'keyup', 'keypress',
  'input', 'change', 'submit', 'focusin', 'focusout', 'wheel', 'scroll',
]

function ownDescriptor(target, name) {
  try { return Object.getOwnPropertyDescriptor(target, name) || null } catch (e) { return null }
}

function restoreProperty(target, name, descriptor, original) {
  try {
    if (descriptor) Object.defineProperty(target, name, descriptor)
    else delete target[name]
  } catch (e) { /* 下面再補救 */ }
  // 瀏覽器裡 addEventListener 是原型鏈上的，刪掉自有屬性就回到原生；有些宿主（測試環境的全域
  // 代理）把它做成 accessor、賦值時寫穿到底層物件，光還原描述子拿不回來，再用賦值寫回原本那份。
  let current
  try { current = target[name] } catch (e) { return }
  if (current === original) return
  try { target[name] = original } catch (e) { /* 收尾不得拋錯 */ }
}

/** 沿原型鏈收集 on* 事件屬性名：window 的在自己身上，document / body 的在原型上。 */
function handlerKeys(target) {
  const keys = new Set()
  let proto = target
  let hops = 0
  while (proto && hops < 12) {
    let names = []
    try { names = Object.getOwnPropertyNames(proto) } catch (e) { names = [] }
    for (let i = 0; i < names.length; i++) {
      const key = names[i]
      if (key.length > 2 && key.charCodeAt(0) === 111 && key.charCodeAt(1) === 110 && /^on[a-z]+$/.test(key)) keys.add(key)
    }
    proto = Object.getPrototypeOf(proto)
    hops++
  }
  return keys
}

/**
 * @param {Object} options
 * @param {Document} options.doc
 * @param {Window} [options.win]                   預設 doc.defaultView
 * @param {(el: Element) => boolean} [options.isAuthorRoot]  這個節點是不是作者容器（inline handler 歸因用）
 * @param {(node: Node) => boolean} [options.isOwnNode]      宿主自己在窗口內放的節點，不記帳（例如容器本身）
 */
function createAuthorScope(options) {
  const config = options || {}
  const doc = config.doc
  const win = config.win || (doc && doc.defaultView) || null
  // 宿主的同源資源（打包器動態掛的樣式表與模組）永遠不是作者的，不看時序。
  const isHostResource = function (node) { return isHostResourceNode(node, doc) }
  const isAuthorRoot = typeof config.isAuthorRoot === 'function' ? config.isAuthorRoot : function () { return false }
  const isOwnNode = typeof config.isOwnNode === 'function' ? config.isOwnNode : function () { return false }

  let depth = 0
  let disposed = false
  const trackedNodes = new Set()
  const adoptedNodes = new Set()
  // 'clearTimeout:12' → { clearName, id }；rAF 與 timeout 的編號各自獨立，所以鍵要帶方法名
  const timers = new Map()
  // { target, type, wrapped, options }
  const listeners = []
  // target → Map(type+capture → Map(original → wrapped))
  const listenerIndex = new Map()
  const patches = []
  const native = {}
  // target → 原生 addEventListener / removeEventListener（補丁前抓的）
  const nativeAdd = new Map()
  const nativeRemove = new Map()
  const handlerSnapshots = []
  let observer = null
  let pendingGestureClose = null

  const eventTargets = [win, doc, doc && doc.documentElement, doc && doc.body].filter(Boolean)

  // ── 窗口 ────────────────────────────────────────────────────────────
  function collect() {
    if (!observer) return
    attribute(observer.takeRecords())
  }

  function attribute(records) {
    for (let i = 0; i < records.length; i++) {
      const added = records[i].addedNodes
      for (let j = 0; j < added.length; j++) {
        const node = added[j]
        if (node.nodeType !== 1) continue
        if (isOwnNode(node) || isHostResource(node)) continue
        trackedNodes.add(node)
      }
    }
  }

  function enter() {
    // 開窗前先把佇列裡宿主的紀錄倒掉：同一個同步任務裡宿主先掛了節點再叫作者的程式，
    // 不倒掉的話關窗那一刻會把宿主的節點一起算到作者頭上。
    if (depth === 0 && observer) {
      try { observer.takeRecords() } catch (e) { /* 倒不掉就算了 */ }
    }
    depth++
  }
  function leave() {
    depth--
    if (depth <= 0) {
      depth = 0
      collect()
    }
  }

  function run(fn, thisArg, args) {
    if (disposed || typeof fn !== 'function') return typeof fn === 'function' ? fn.apply(thisArg, args || []) : undefined
    enter()
    try {
      return fn.apply(thisArg, args || [])
    } finally {
      leave()
    }
  }

  function wrap(fn) {
    if (typeof fn !== 'function') return fn
    return function () {
      return run(fn, this, arguments)
    }
  }

  /**
   * 在作者窗口裡暫時退出：宿主替作者做事（送出訊息、提示、改背景）時開的計時器、掛的節點
   * 是宿主的，不能算到作者頭上——否則作者按鈕叫出的提示，其消失計時器會在離場時被清掉，
   * 那則提示就永遠留在下一頁。先把作者到此為止的動作結帳，跑宿主的程式，再把宿主留下的
   * 紀錄倒掉、回到原本的窗口深度。
   */
  function suspend(fn, thisArg, args) {
    if (typeof fn !== 'function') return undefined
    if (disposed || depth === 0) return fn.apply(thisArg, args || [])
    const saved = depth
    collect()
    depth = 0
    try {
      return fn.apply(thisArg, args || [])
    } finally {
      if (observer) {
        try { observer.takeRecords() } catch (e) { /* 倒不掉就算了 */ }
      }
      depth = saved
    }
  }

  function owns(node) {
    let el = node
    while (el) {
      if (trackedNodes.has(el) || adoptedNodes.has(el)) return true
      if (el.nodeType === 1 && isAuthorRoot(el)) return true
      el = el.parentNode
    }
    return false
  }

  function adopt(node) {
    if (disposed || !node) return false
    adoptedNodes.add(node)
    return true
  }

  // ── 觀察頁面根部 ─────────────────────────────────────────────────────
  function startObserver() {
    const MO = win && win.MutationObserver
    if (typeof MO !== 'function') return
    observer = new MO(function (records) {
      // 窗口外送達的紀錄一律不看：那是宿主自己的動作
      if (depth > 0) attribute(records)
    })
    const roots = [doc.documentElement, doc.head, doc.body].filter(Boolean)
    for (let i = 0; i < roots.length; i++) {
      try { observer.observe(roots[i], { childList: true }) } catch (e) { /* 某個根不存在就略過 */ }
    }
  }

  // ── 計時器 ───────────────────────────────────────────────────────────
  function patchTimers() {
    if (!win) return
    TIMER_METHODS.forEach(function (pair) {
      const setName = pair.set
      const clearName = pair.clear
      const originalSet = win[setName]
      const originalClear = win[clearName]
      if (typeof originalSet !== 'function') return
      native[setName] = originalSet
      native[clearName] = originalClear
      patches.push({ target: win, name: setName, descriptor: ownDescriptor(win, setName), original: originalSet })
      win[setName] = function (callback) {
        const args = Array.prototype.slice.call(arguments)
        if (depth > 0 && !disposed && typeof callback === 'function') args[0] = wrap(callback)
        const id = originalSet.apply(win, args)
        if (depth > 0 && !disposed) timers.set(clearName + ':' + id, { clearName: clearName, id: id })
        return id
      }
      if (typeof originalClear === 'function') {
        patches.push({ target: win, name: clearName, descriptor: ownDescriptor(win, clearName), original: originalClear })
        win[clearName] = function (id) {
          timers.delete(clearName + ':' + id)
          return originalClear.apply(win, arguments)
        }
      }
    })
  }

  // ── 監聽 ─────────────────────────────────────────────────────────────
  function indexFor(target, type, capture) {
    let byType = listenerIndex.get(target)
    if (!byType) { byType = new Map(); listenerIndex.set(target, byType) }
    const key = type + (capture ? '|c' : '|b')
    let byListener = byType.get(key)
    if (!byListener) { byListener = new Map(); byType.set(key, byListener) }
    return byListener
  }

  function captureFlag(options) {
    return typeof options === 'object' && options !== null ? !!options.capture : !!options
  }

  function patchListeners() {
    eventTargets.forEach(function (target) {
      const originalAdd = target.addEventListener
      const originalRemove = target.removeEventListener
      if (typeof originalAdd !== 'function' || typeof originalRemove !== 'function') return
      nativeAdd.set(target, originalAdd)
      nativeRemove.set(target, originalRemove)
      patches.push({ target: target, name: 'addEventListener', descriptor: ownDescriptor(target, 'addEventListener'), original: originalAdd })
      patches.push({ target: target, name: 'removeEventListener', descriptor: ownDescriptor(target, 'removeEventListener'), original: originalRemove })
      target.addEventListener = function (type, listener, options) {
        if (depth > 0 && !disposed && listener) {
          const index = indexFor(target, type, captureFlag(options))
          let wrapped = index.get(listener)
          if (!wrapped) {
            wrapped = function (event) {
              return run(function () {
                return typeof listener === 'function' ? listener.call(target, event) : listener.handleEvent(event)
              })
            }
            index.set(listener, wrapped)
            listeners.push({ target: target, type: type, wrapped: wrapped, options: options })
          }
          return originalAdd.call(target, type, wrapped, options)
        }
        return originalAdd.apply(target, arguments)
      }
      target.removeEventListener = function (type, listener, options) {
        const byType = listenerIndex.get(target)
        const index = byType && byType.get(type + (captureFlag(options) ? '|c' : '|b'))
        const wrapped = index && index.get(listener)
        if (wrapped) {
          index.delete(listener)
          return originalRemove.call(target, type, wrapped, options)
        }
        return originalRemove.apply(target, arguments)
      }
    })
  }

  // ── inline handler：靠事件目標歸因 ───────────────────────────────────
  let gestureCapture = null
  let gestureBubble = null
  function listenGestures() {
    if (!win || typeof win.addEventListener !== 'function') return
    const originalAdd = nativeAdd.get(win)
    if (typeof originalAdd !== 'function') return
    gestureCapture = function (event) {
      if (disposed || depth > 0) return
      if (!owns(event.target)) return
      enter()
      let closed = false
      const close = function () {
        if (closed) return
        closed = true
        pendingGestureClose = null
        leave()
      }
      pendingGestureClose = close
      // 不冒泡的事件（focusin 之外的 focus、scroll……）或作者 stopPropagation 時，冒泡階段
      // 到不了 window，靠原生計時器兜底關窗。用原生的，否則這顆計時器會記到作者帳上。
      const setTimer = native.setTimeout || win.setTimeout
      try { setTimer.call(win, close, 0) } catch (e) { close() }
    }
    gestureBubble = function () {
      if (pendingGestureClose) pendingGestureClose()
    }
    GESTURE_EVENTS.forEach(function (type) {
      originalAdd.call(win, type, gestureCapture, { capture: true, passive: true })
      originalAdd.call(win, type, gestureBubble, { capture: false, passive: true })
    })
  }

  function unlistenGestures() {
    if (!win || !gestureCapture) return
    const originalRemove = nativeRemove.get(win)
    if (typeof originalRemove !== 'function') return
    GESTURE_EVENTS.forEach(function (type) {
      try { originalRemove.call(win, type, gestureCapture, true) } catch (e) { /* 收尾不得拋錯 */ }
      try { originalRemove.call(win, type, gestureBubble, false) } catch (e) { /* 收尾不得拋錯 */ }
    })
    gestureCapture = null
    gestureBubble = null
  }

  // ── on* 屬性快照 ─────────────────────────────────────────────────────
  function snapshotHandlers() {
    eventTargets.forEach(function (target) {
      const values = new Map()
      handlerKeys(target).forEach(function (key) {
        let value
        try { value = target[key] } catch (e) { return }
        if (value != null && typeof value !== 'function') return
        values.set(key, value)
      })
      handlerSnapshots.push({ target: target, values: values })
    })
  }

  function restoreHandlers() {
    handlerSnapshots.forEach(function (entry) {
      entry.values.forEach(function (value, key) {
        let current
        try { current = entry.target[key] } catch (e) { return }
        if (current === value) return
        try { entry.target[key] = value } catch (e) { /* 收尾不得拋錯 */ }
      })
    })
    handlerSnapshots.length = 0
  }

  // ── 收尾 ─────────────────────────────────────────────────────────────
  function dispose() {
    if (disposed) return
    disposed = true
    depth = 0

    // 佇列裡剩下的紀錄都是窗口外發生的（窗口一關就收過了），不看
    if (observer) {
      try { observer.disconnect() } catch (e) { /* 收尾不得拋錯 */ }
      observer = null
    }

    timers.forEach(function (entry) {
      const clear = native[entry.clearName]
      try { if (typeof clear === 'function') clear.call(win, entry.id) } catch (e) { /* 收尾不得拋錯 */ }
    })
    timers.clear()

    listeners.forEach(function (entry) {
      const originalRemove = nativeRemove.get(entry.target)
      try { originalRemove.call(entry.target, entry.type, entry.wrapped, entry.options) } catch (e) { /* 收尾不得拋錯 */ }
    })
    listeners.length = 0
    listenerIndex.clear()

    unlistenGestures()
    if (pendingGestureClose) pendingGestureClose = null

    restoreHandlers()

    // 節點最後拆：作者的 dispose 回呼可能還會碰到自己的節點
    const remove = function (node) {
      try { if (node && node.parentNode) node.parentNode.removeChild(node) } catch (e) { /* 收尾不得拋錯 */ }
    }
    adoptedNodes.forEach(remove)
    trackedNodes.forEach(remove)
    adoptedNodes.clear()
    trackedNodes.clear()

    // 補丁反序撤掉，同一個屬性被包兩層時才會還原成最初的樣子
    for (let i = patches.length - 1; i >= 0; i--) {
      restoreProperty(patches[i].target, patches[i].name, patches[i].descriptor, patches[i].original)
    }
    patches.length = 0
  }

  if (doc) {
    startObserver()
    snapshotHandlers()
    patchTimers()
    patchListeners()
    // 手勢監聽掛在補丁之後，但用的是補丁前抓的原生方法：這幾顆是我們的，不記到作者帳上
    listenGestures()
  }

  return {
    run: run,
    wrap: wrap,
    suspend: suspend,
    adopt: adopt,
    owns: owns,
    dispose: dispose,
    isDisposed: function () { return disposed },
    isActive: function () { return depth > 0 },
    // 驗證用
    trackedNodeCount: function () { return trackedNodes.size + adoptedNodes.size },
    timerCount: function () { return timers.size },
    listenerCount: function () { return listeners.length },
  }
}

export { createAuthorScope, GESTURE_EVENTS }
