/**
 * 開放 API v1 的身分：OAuth 2.1 authorization code + PKCE（S256）。
 *
 * 這個客戶端沒有站台金鑰、不送 cookie、也不送任何內部帳號識別。所有請求的身分
 * 只有一個來源：`Authorization: Bearer <access token>`。
 *
 * 三步：
 *   1. 動態註冊（每個來源一次，client_id 存本機）
 *   2. 導向 /oauth/authorize，使用者在 LunaTalk 登入並同意後帶 code 回來
 *   3. 用 code + code_verifier 換 access token / refresh token
 *
 * `resource` 永遠是開放 API 的正式識別字串，跟你實際連哪個環境無關——伺服器用它
 * 判斷這張 token 能不能用在開放 API 上，不是用它決定往哪裡送請求。
 */

import { API_BASE, API_ORIGIN } from '@/config/env'

export const OPEN_API_RESOURCE = 'https://api.lunatalk.ai/open/v1'
export const OPEN_API_SCOPE = 'mcp:card-writer'
export const OAUTH_CLIENT_NAME = 'Moonstage'
export const OAUTH_CALLBACK_ROUTE = '/pages/oauth/callback'
export const LOGIN_ROUTE = '/pages/login/login'

const CLIENT_ID_KEY = 'lt.openchat.oauth.clientId'
const TOKENS_KEY = 'lt.openchat.oauth.tokens'
const FLOW_KEY = 'lt.openchat.oauth.flow'

/** access token 剩不到這麼多秒就先換一張，免得請求送出途中剛好過期。 */
const REFRESH_SKEW_SECONDS = 60

export type OpenAuthTokens = {
  accessToken: string
  refreshToken: string
  expiresAt: number
}

type PendingFlow = {
  codeVerifier: string
  state: string
  returnTo: string
}

function storage(): Storage | null {
  try {
    if (typeof localStorage !== 'undefined') return localStorage
  } catch (_) {
    // 隱私模式可能整個禁用 Web Storage。
  }
  return null
}

function readJSON<T>(key: string): T | null {
  const store = storage()
  if (!store) return null
  try {
    const raw = store.getItem(key)
    return raw ? (JSON.parse(raw) as T) : null
  } catch (_) {
    return null
  }
}

function writeJSON(key: string, value: unknown): void {
  const store = storage()
  if (!store) return
  try {
    store.setItem(key, JSON.stringify(value))
  } catch (_) {
    // 寫不進去就是這一輪登入不會被記住，不該讓整個流程炸掉。
  }
}

function removeKey(key: string): void {
  try {
    storage()?.removeItem(key)
  } catch (_) {
    /* 同上 */
  }
}

/** 註冊時登記的回呼位址。走 history 路由，網址不能有 fragment（伺服器會拒絕）。 */
export function getRedirectUri(): string {
  if (typeof window === 'undefined') return ''
  return `${window.location.origin}${OAUTH_CALLBACK_ROUTE}`
}

function randomString(bytes = 32): string {
  const buf = new Uint8Array(bytes)
  crypto.getRandomValues(buf)
  return base64UrlEncode(buf)
}

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = ''
  for (const b of bytes) binary += String.fromCharCode(b)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

async function codeChallengeS256(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))
  return base64UrlEncode(new Uint8Array(digest))
}

type RawResponse = { statusCode: number; data: any }

/**
 * OAuth 端點自己就是取得身分的地方，不能走全域攔截器（那會想附上還不存在的 token）。
 */
function rawRequest(
  path: string,
  method: 'GET' | 'POST',
  body?: Record<string, string> | Record<string, unknown>,
  contentType = 'application/json',
): Promise<RawResponse> {
  return new Promise((resolve, reject) => {
    uni.request({
      url: `${API_BASE}${path}`,
      method,
      header: { 'content-type': contentType },
      data: contentType === 'application/x-www-form-urlencoded'
        ? formEncode(body as Record<string, string>)
        : body,
      success: (res: any) => resolve({ statusCode: res.statusCode, data: res.data }),
      fail: (err: any) => reject(err),
    })
  })
}

function formEncode(params: Record<string, string>): string {
  return Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== null && v !== '')
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
    .join('&')
}

export function getClientId(): string {
  try {
    return storage()?.getItem(CLIENT_ID_KEY) || ''
  } catch (_) {
    return ''
  }
}

/** 動態註冊。同一個來源只做一次，之後重用存下來的 client_id。 */
export async function ensureClientId(): Promise<string> {
  const existing = getClientId()
  if (existing) return existing

  const res = await rawRequest('/oauth/register', 'POST', {
    client_name: OAUTH_CLIENT_NAME,
    redirect_uris: [getRedirectUri()],
    grant_types: ['authorization_code', 'refresh_token'],
  })
  const clientId = res.data?.client_id
  if (res.statusCode >= 400 || !clientId) {
    throw new Error(`oauth_register_failed:${res.data?.error || res.statusCode}`)
  }
  try {
    storage()?.setItem(CLIENT_ID_KEY, String(clientId))
  } catch (_) {
    /* 存不下就是每次登入都重新註冊，仍然可用 */
  }
  return String(clientId)
}

const DEFAULT_RETURN_TO = '/pages/play/entry'

/**
 * 登入後只回到站內頁面：`/pages/...` 加上可選的查詢字串。任何帶協定、`//`、
 * 控制字元或不是頁面路徑的值都回入口頁——returnTo 來自網址參數，偽造的
 * 登入連結才不能把剛拿到身分的人帶去任意地方。
 */
export function sanitizeReturnTo(value: unknown): string {
  if (typeof value !== 'string') return DEFAULT_RETURN_TO
  const v = value.trim()
  if (!/^\/pages\/[A-Za-z0-9_\-/]+(\?[^#\s]*)?$/.test(v)) return DEFAULT_RETURN_TO
  if (v.startsWith('//') || /[\\\u0000-\u001f]/.test(v)) return DEFAULT_RETURN_TO
  return v
}

/**
 * 開始登入：註冊 → 產生 PKCE → 整頁導向授權端點。
 * returnTo 是登入完成後要回到的站內路徑。
 */
export async function beginAuthorization(returnTo = DEFAULT_RETURN_TO): Promise<void> {
  const clientId = await ensureClientId()
  const codeVerifier = randomString(48)
  const state = randomString(16)
  writeJSON(FLOW_KEY, { codeVerifier, state, returnTo: sanitizeReturnTo(returnTo) } as PendingFlow)

  const challenge = await codeChallengeS256(codeVerifier)
  const query = [
    'response_type=code',
    `client_id=${encodeURIComponent(clientId)}`,
    `redirect_uri=${encodeURIComponent(getRedirectUri())}`,
    `scope=${encodeURIComponent(OPEN_API_SCOPE)}`,
    `resource=${encodeURIComponent(OPEN_API_RESOURCE)}`,
    `state=${encodeURIComponent(state)}`,
    `code_challenge=${encodeURIComponent(challenge)}`,
    'code_challenge_method=S256',
  ].join('&')

  // 整頁跳轉打 API 絕對位址：走 /api 同源代理會被反向代理跟著 302 走掉（見 config/env）。
  window.location.assign(`${API_ORIGIN}/oauth/authorize?${query}`)
}

/** 授權碼換 token。state 對不上代表這不是我們發起的那一次流程。 */
export async function completeAuthorization(code: string, state: string): Promise<string> {
  const flow = readJSON<PendingFlow>(FLOW_KEY)
  if (!flow || !flow.codeVerifier) throw new Error('oauth_flow_missing')
  if (!state || state !== flow.state) throw new Error('oauth_state_mismatch')

  const clientId = getClientId()
  if (!clientId) throw new Error('oauth_client_missing')

  const res = await rawRequest(
    '/oauth/token',
    'POST',
    {
      grant_type: 'authorization_code',
      code,
      client_id: clientId,
      redirect_uri: getRedirectUri(),
      code_verifier: flow.codeVerifier,
      resource: OPEN_API_RESOURCE,
    },
    'application/x-www-form-urlencoded',
  )
  if (res.statusCode >= 400 || !res.data?.access_token) {
    throw new Error(`oauth_token_failed:${res.data?.error || res.statusCode}`)
  }
  storeTokens(res.data)
  removeKey(FLOW_KEY)
  return sanitizeReturnTo(flow.returnTo)
}

function storeTokens(payload: any): OpenAuthTokens {
  const expiresIn = Number(payload.expires_in)
  const tokens: OpenAuthTokens = {
    accessToken: String(payload.access_token || ''),
    refreshToken: String(payload.refresh_token || getTokens()?.refreshToken || ''),
    expiresAt: Date.now() + (Number.isFinite(expiresIn) && expiresIn > 0 ? expiresIn : 3600) * 1000,
  }
  writeJSON(TOKENS_KEY, tokens)
  return tokens
}

/**
 * 嵌進別的站台時，身分由宿主管：token 從宿主拿、失效交給宿主處理，
 * 本檔的 OAuth 流程與本機 token 儲存整個不參與。playground 不呼叫這個，行為不變。
 */
export interface ExternalAuth {
  getAccessToken(): Promise<string | null>
  onUnauthorized(): void
}
let externalAuth: ExternalAuth | null = null
let externalTokenCache = ''
export function useExternalAuth(auth: ExternalAuth | null): void {
  externalAuth = auth
  externalTokenCache = ''
}

export function getTokens(): OpenAuthTokens | null {
  if (externalAuth) {
    return externalTokenCache ? { accessToken: externalTokenCache, refreshToken: '', expiresAt: Number.MAX_SAFE_INTEGER } : null
  }
  const tokens = readJSON<OpenAuthTokens>(TOKENS_KEY)
  return tokens && tokens.accessToken ? tokens : null
}

export function getAccessToken(): string {
  return getTokens()?.accessToken || ''
}

export function isSignedIn(): boolean {
  if (externalAuth) return true
  return !!getAccessToken()
}

export function clearTokens(): void {
  if (externalAuth) {
    externalTokenCache = ''
    return
  }
  removeKey(TOKENS_KEY)
  removeKey(FLOW_KEY)
}

let refreshInFlight: Promise<string> | null = null

/**
 * 換一張 access token。同時有多個請求撞到過期時只會真的換一次。
 * 換不到就把身分清掉，回空字串——呼叫端據此決定要不要送使用者去登入。
 */
export function refreshAccessToken(): Promise<string> {
  if (externalAuth) return externalAuth.getAccessToken().then((token) => { externalTokenCache = token || ''; return externalTokenCache })
  if (refreshInFlight) return refreshInFlight
  refreshInFlight = (async () => {
    const tokens = getTokens()
    const clientId = getClientId()
    if (!tokens?.refreshToken || !clientId) {
      clearTokens()
      return ''
    }
    try {
      const res = await rawRequest(
        '/oauth/token',
        'POST',
        {
          grant_type: 'refresh_token',
          refresh_token: tokens.refreshToken,
          client_id: clientId,
          resource: OPEN_API_RESOURCE,
        },
        'application/x-www-form-urlencoded',
      )
      if (res.statusCode >= 400 || !res.data?.access_token) {
        clearTokens()
        return ''
      }
      return storeTokens(res.data).accessToken
    } catch (_) {
      // 網路失敗不代表身分失效，保留 token 讓下一次再試。
      return ''
    } finally {
      refreshInFlight = null
    }
  })()
  return refreshInFlight
}

/** 取一張可用的 access token，快過期就先換。沒有身分時回空字串。 */
export async function getFreshAccessToken(): Promise<string> {
  if (externalAuth) {
    externalTokenCache = (await externalAuth.getAccessToken()) || ''
    return externalTokenCache
  }
  const tokens = getTokens()
  if (!tokens) return ''
  if (tokens.expiresAt - Date.now() > REFRESH_SKEW_SECONDS * 1000) return tokens.accessToken
  const refreshed = await refreshAccessToken()
  return refreshed || (getTokens()?.accessToken ?? '')
}

/** 身分沒了就回登入頁，並記下原本要去哪裡。 */
export function redirectToLogin(returnTo?: string): void {
  if (externalAuth) {
    externalAuth.onUnauthorized()
    return
  }
  const target = sanitizeReturnTo(returnTo || currentRoute())
  try {
    uni.reLaunch({ url: `${LOGIN_ROUTE}?returnTo=${encodeURIComponent(target)}` })
  } catch (_) {
    if (typeof window !== 'undefined') window.location.assign(LOGIN_ROUTE)
  }
}

function currentRoute(): string {
  try {
    const pages = getCurrentPages()
    const page: any = pages[pages.length - 1]
    if (page?.route) return `/${page.route}`
  } catch (_) {
    /* 冷啟動時可能還沒有頁面堆疊 */
  }
  return '/pages/play/entry'
}
