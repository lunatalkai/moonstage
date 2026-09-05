/**
 * 作者可用的意圖 API（掛在 window.luna）。
 *
 * 零 import 的純模組，兩端共用同一份，由 check-author-runtime-parity.mjs 擋著
 * 逐位元組一致。兩端的 DOM 接法不同，所以宿主動作由呼叫端以 host 轉接注入，
 * 邏輯本身不分端。
 *
 * ── 為什麼是「意圖」而不是選擇器 ──
 * 競品的作者是直接抓平台 DOM 的：抓輸入框的 textarea、在送出鍵上掛 capture
 * 監聽、往聊天容器塞 style 再用 500ms 輪詢對抗重繪。那些卡靠猜平台內部結構
 * 活著，平台一改版就整批壞掉。這裡把它們歸納成幾個「作者想做什麼」，
 * 平台保證這幾個意圖可用，內部結構怎麼變都不關作者的事。
 *
 * ── 不提供通用儲存 ──
 * 玩家偏好進伺服器（跨裝置是副產品）、遊戲進度進對話訊息（回溯免費正確）、
 * 當場狀態用記憶體變數。三類都有更好的歸宿，通用 KV 是多的。
 *
 * ── 同步呼叫不以 throw 表達「不支援」 ──
 * 競品的存檔讀取在預覽環境會同步拋例外，作者沒 catch 就整卡不工作、頁面
 * 還不報錯。這裡同步方法一律回傳布林，非同步一律可 catch 且帶明確錯誤碼。
 */

/** 使用者手勢之後多久內算「同一次互動」。超過就不是手勢送出。 */
const GESTURE_WINDOW_MS = 1000

/** 限頻窗口與次數。防自問自答迴圈與洗版。 */
const RATE_WINDOW_MS = 60000
const SEND_LIMIT_PER_WINDOW = 6
const INPUT_LIMIT_PER_WINDOW = 60

/** beforeSend 的 handler 執行時間上限。逾時一律送原文，不讓卡片卡住送出。 */
const BEFORE_SEND_BUDGET_MS = 50

const ERR_RATE_LIMITED = 'rate_limited'
const ERR_NOT_GESTURE = 'not_a_gesture'
const ERR_UNSUPPORTED = 'not_supported'
const ERR_COMPOSING = 'ime_composing'

function makeRateLimiter(limit, windowMs, now) {
  let stamps = []
  return function allow() {
    const t = now()
    stamps = stamps.filter((s) => t - s < windowMs)
    if (stamps.length >= limit) return false
    stamps.push(t)
    return true
  }
}

/**
 * 建立意圖 API。
 *
 * @param {Object} options
 * @param {Object} options.host     宿主動作轉接（每端自己實作）
 * @param {Object} [options.runtime] 作者資產執行期，供 on() 訂閱事件
 * @param {Function} [options.now]  時間來源，測試可注入
 */
function createLunaIntentApi(options) {
  const config = options || {}
  const host = config.host || {}
  const runtime = config.runtime || null
  const now = config.now || function () { return Date.now() }

  const allowSend = makeRateLimiter(SEND_LIMIT_PER_WINDOW, RATE_WINDOW_MS, now)
  const allowInput = makeRateLimiter(INPUT_LIMIT_PER_WINDOW, RATE_WINDOW_MS, now)

  let lastGestureAt = -Infinity
  let beforeSendHandler = null

  function call(name, args) {
    const fn = host[name]
    if (typeof fn !== 'function') return { ok: false, code: ERR_UNSUPPORTED }
    return { ok: true, value: fn.apply(host, args || []) }
  }

  function isComposing() {
    return typeof host.isComposing === 'function' && host.isComposing() === true
  }

  function writeInput(name, text) {
    // 輸入法組字期間改草稿會跟拼音打架，作者按鈕那條路徑撞不上這個狀況。
    if (isComposing()) return false
    if (!allowInput()) return false
    return call(name, [String(text == null ? '' : text)]).ok
  }

  /**
   * 送出前改寫。競品用它做骰檢定：偵測輸入裡的檢定標記、本地擲骰、把結果接到
   * 訊息後面再送。
   *
   * 任何失敗都送原文，不阻斷送出——這是唯一會讓使用者按了送出卻什麼都沒發生
   * 的失敗模式，寧可不改寫也不能卡住。
   */
  function runBeforeSend(text) {
    if (typeof beforeSendHandler !== 'function') return text
    const startedAt = now()
    let out
    try {
      out = beforeSendHandler(text)
    } catch (e) {
      return text
    }
    if (typeof out !== 'string') return text
    if (now() - startedAt > BEFORE_SEND_BUDGET_MS) return text
    return out
  }

  const api = {
    input: {
      get: function () {
        const r = call('getInput')
        return r.ok ? String(r.value == null ? '' : r.value) : ''
      },
      set: function (text) {
        return writeInput('setInput', text)
      },
      append: function (text) {
        return writeInput('appendInput', text)
      },
    },

    /**
     * 送出目前輸入框的內容。
     *
     * 必須在使用者點擊的當幀呼叫——先 await 再送就不算手勢了。定時器裡自動送
     * 會變成自問自答，所以非手勢一律拒絕。
     */
    send: function () {
      if (now() - lastGestureAt > GESTURE_WINDOW_MS) {
        return Promise.reject({ code: ERR_NOT_GESTURE })
      }
      if (!allowSend()) {
        return Promise.reject({ code: ERR_RATE_LIMITED })
      }
      const current = api.input.get()
      const rewritten = runBeforeSend(current)
      if (rewritten !== current) {
        // 改寫後先回填輸入框再送：使用者送出的就是他看得到的那串字，
        // 不存在「顯示一套、送出另一套」。
        if (isComposing()) return Promise.reject({ code: ERR_COMPOSING })
        call('setInput', [rewritten])
      }
      const r = call('submit')
      if (!r.ok) return Promise.reject({ code: ERR_UNSUPPORTED })
      return Promise.resolve(r.value)
    },

    background: {
      /** 換聊天背景。寫穿到伺服器，換裝置再進來還在。 */
      set: function (url) {
        return call('setBackground', [String(url == null ? '' : url)]).ok
      },
    },

    scroll: {
      toTop: function () { return call('scrollToTop').ok },
      toBottom: function () { return call('scrollToBottom').ok },
    },

    /** 訂閱平台事件。事件名不在表內一律忽略——拼錯不會靜默生效。 */
    on: function (event, handler) {
      if (!runtime || typeof runtime.subscribe !== 'function') return false
      return runtime.subscribe(event, handler)
    },

    /** 註冊送出前改寫。一個角色只有一個 handler，重複註冊以最後一次為準。 */
    beforeSend: function (handler) {
      beforeSendHandler = typeof handler === 'function' ? handler : null
      return true
    },
  }

  // 給宿主用的內部方法，不掛進作者看得到的 api 物件。
  return {
    api: api,
    /** 宿主在使用者點擊時呼叫，標記「現在是手勢期間」。 */
    noteUserGesture: function () { lastGestureAt = now() },
    /** 宿主在自己的送出路徑上呼叫，讓作者的改寫也套用在使用者手打的訊息上。 */
    applyBeforeSend: runBeforeSend,
  }
}

export {
  createLunaIntentApi,
  GESTURE_WINDOW_MS,
  RATE_WINDOW_MS,
  SEND_LIMIT_PER_WINDOW,
  INPUT_LIMIT_PER_WINDOW,
  BEFORE_SEND_BUDGET_MS,
  ERR_RATE_LIMITED,
  ERR_NOT_GESTURE,
  ERR_UNSUPPORTED,
  ERR_COMPOSING,
}
