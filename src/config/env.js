/**
 * 環境位址的唯一出口（desktop）。
 *
 * 與 mobile/src/config/env.js 為鏡像實作，解析行為必須一致——否則同一份環境
 * 設定在兩端會有不同結果，除錯時極難查。差異只有一處且是刻意的：
 * desktop 只跑在瀏覽器，API 一律走同源代理，沒有 mobile 那種
 * 「APP 包把位址編譯進去」的分支。
 *
 * 值從建構時注入的 .env 檔而來：
 *   .env.development   本地開發
 *   .env.production    正式環境
 *   .env.local         個人本機覆寫（不進版控）
 *
 * 用 --mode 決定載哪一份，例如 `npm run build:h5:prod`。
 */

/**
 * 取一個必須存在的環境變數。
 *
 * 缺值時當場拋錯而不是回傳空字串：靜默失敗會讓聊天或群聊連到錯誤的位址，
 * 症狀是「訊息發不出去」這種沒有明確錯誤的表現，比建構時直接紅掉難查得多。
 */
export function requireEnv(env, key) {
  const raw = env && env[key]
  if (typeof raw !== 'string' || raw.trim() === '') {
    throw new Error(
      `環境變數 ${key} 未設定。請在對應的 .env 檔（.env.development / ` +
      `.env.production）補上，或在 .env.local 覆寫。`
    )
  }
  return raw.trim()
}

function stripTrailingSlash(url) {
  return url.replace(/\/+$/, '')
}

/**
 * API base。
 *
 * desktop 是純 Web，一律走同源相對路徑：開發時由 vite proxy 接、線上由反向
 * 代理接。走絕對位址會踩跨域，所以這裡不從 .env 讀完整網域，只允許覆寫路徑。
 */
export function resolveApiBase(env) {
  const proxyPath = env && env.VITE_API_PROXY_PATH
  return (typeof proxyPath === 'string' && proxyPath.trim()) ? proxyPath.trim() : '/api'
}

/**
 * 聊天 WebSocket 的 base（不含路徑）。
 *
 * WebSocket 沒有同源相對路徑可用，必須是完整的 wss:// URL。
 */
export function resolveWsBase(env) {
  const wsBase = stripTrailingSlash(requireEnv(env, 'VITE_WS_BASE'))
  if (!/^wss?:\/\//.test(wsBase)) {
    throw new Error(`VITE_WS_BASE 必須以 ws:// 或 wss:// 開頭，目前是「${wsBase}」。`)
  }
  return wsBase
}

/**
 * API 的絕對位址（不含路徑）。
 *
 * 只給「整頁跳轉」用，例如 OAuth 授權頁：那不是 XHR，走同源 /api 代理會被反向代理
 * 用 fetch 跟著 302 走到登入頁，把登入頁的 HTML 回在 /api/oauth/authorize 底下，
 * 流程就斷了。XHR 仍走 API_BASE 的同源代理。
 *
 * 沒有另外設定時從 VITE_WS_BASE 推：WS 與 API 在官方部署是同一台。
 * 第三方部署若 API 與 WS 不同機，用 VITE_API_ORIGIN 明確覆寫。
 */
export function resolveApiOrigin(env) {
  const override = env && env.VITE_API_ORIGIN
  if (typeof override === 'string' && override.trim()) {
    const origin = stripTrailingSlash(override.trim())
    if (!/^https?:\/\//.test(origin)) {
      throw new Error(`VITE_API_ORIGIN 必須是 http:// 或 https:// 開頭的絕對位址，目前是「${override}」。`)
    }
    return origin
  }
  const wsBase = resolveWsBase(env)
  return wsBase.replace(/^ws(s?):\/\//, (_, secure) => (secure ? 'https://' : 'http://'))
}

// ---- 以下是綁定當前建構環境的膠水碼 ----

const ENV = import.meta.env

export const API_BASE = resolveApiBase(ENV)
export const WS_BASE = resolveWsBase(ENV)
export const API_ORIGIN = resolveApiOrigin(ENV)

// 環境名稱僅供除錯輸出與問題回報，不要拿它做分支判斷——要判斷就判斷具體的
// 位址或功能開關，否則新增環境時會漏掉分支。
export const ENV_NAME = (ENV.VITE_ENV_NAME || 'unknown').trim()
