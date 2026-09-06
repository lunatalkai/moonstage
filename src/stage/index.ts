/**
 * `moonstage/stage`：把舞台當套件用。
 *
 *   import { installMoonStage, MoonStage, browserHost } from 'moonstage/stage'
 *   import 'moonstage/stage.css'
 *   installMoonStage(app, { host, i18n })      // 一次
 *   <MoonStage :role-id="roleId" />            // 路由頁裡
 *
 * 宿主給的東西：token（host.auth）、API 位址（host.api）、提示／確認框、儲存、導頁、語系、剪貼簿。
 * 舞台自己帶：請求層、vuex 狀態、五語文案（只補宿主沒有的 key）、uni 替身、樣式（全部 scope 在 .ms-stage）。
 * build：`npm run build:stage`（vite.stage.config.ts）。
 */
import type { App } from 'vue'
import type { StageHost } from '@/host/stage-host'
import { setStageHost } from '@/host/stage-host'
import { installUniShim } from './uni-shim'
import fui from '@/common/fui-app'
import http from '@/components/firstui/fui-request'
import requestUrl from '@/config/request-url'
import messages from '@/locale/index'
import { setupHttp } from '@/api/http-setup'
import { useExternalAuth, getFreshAccessToken, refreshAccessToken, clearTokens, redirectToLogin } from '@/common/open-oauth'
import loading from '@/utils/loadingManager.js'

export { browserHost, setStageHost, useStageHost } from '@/host/stage-host'
export type { StageHost } from '@/host/stage-host'
export { default as MoonStage } from './MoonStage.vue'
export { STAGE_ROUTE_OPTIONS } from './uni-app-shim'

export interface StageAuth {
  /** 宿主的 bearer token；回 null 表示沒登入。舞台每次請求前都會問一次，快取由宿主管。 */
  getAccessToken(): Promise<string | null>
  /** 伺服器回 401 且換不到 token：宿主決定要送去登入還是提示。 */
  onUnauthorized(): void
  /** 目前登入的人（給畫布顯示用）。給了就視為已登入；沒給就當訪客——訪客送訊息會被畫布擋下並丟 notLogin。 */
  user?: { id: string; nickName?: string; avatar?: string }
}

export interface StageApi {
  /** 開放 API 的主機，例如 'https://api.lunatalk.ai'（路徑表是相對的 /open/v1/...）。 */
  base: string
}

export interface StageI18n {
  /** vue-i18n 的 global：只補宿主沒有的 key，宿主自己的文案永遠優先。 */
  getLocaleMessage(locale: string): Record<string, unknown>
  mergeLocaleMessage(locale: string, message: Record<string, unknown>): void
  availableLocales?: string[]
}

export interface InstallMoonStageOptions {
  host: StageHost
  auth: StageAuth
  api: StageApi
  i18n?: StageI18n
}

let installed = false

/** 一個 app 只裝一次；重複呼叫直接回。 */
export async function installMoonStage(app: App, options: InstallMoonStageOptions): Promise<void> {
  if (installed) return
  installed = true
  const { host, auth, api, i18n } = options

  setStageHost(host)
  installUniShim(host)
  useExternalAuth(auth)

  // vuex 狀態的持久化在建立時就讀 uni 儲存，所以要等 uni 替身裝好才 import。
  const store = (await import('@/store')).default
  app.use(store)
  // 畫布送訊息前看的是 store 的 hasLogin（沒登入就丟 notLogin 回頭），playground 是登入流程寫進去的；
  // 嵌入時登入態在宿主手上，這裡照宿主給的填。
  if (auth.user) {
    store.commit('setSignedIn', true)
    store.commit('setUserInfo', { ...store.state.userInfo, id: String(auth.user.id), nickName: auth.user.nickName || '', avatar: auth.user.avatar || '' })
  }
  host.events.on('notLogin', () => auth.onUnauthorized())

  const toast = hostToast(host)
  setupHttp(http, {
    host: api.base.replace(/\/+$/, ''),
    loading,
    toast,
    getLocale: () => host.locale.get(),
    getFreshAccessToken,
    refreshAccessToken,
    clearTokens,
    redirectToLogin,
  })

  const g = app.config.globalProperties as Record<string, unknown>
  g.fui = fui
  g.http = http
  g.requestUrl = requestUrl
  g.$loading = loading
  g.$toast = toast

  if (i18n) mergeStageMessages(i18n)
}

/** 攔截器用的提示物件：跟 playground 的 toastManager 同一組方法名，內容轉給宿主。 */
function hostToast(host: StageHost) {
  const say = (text: unknown, kind: 'info' | 'success' | 'error' | 'warning') => host.ui.toast(String(text || ''), kind)
  const texts: Record<string, string> = {}
  return {
    setTexts: (t: Record<string, string>) => Object.assign(texts, t),
    success: (c?: unknown) => say(c || texts.success, 'success'),
    error: (c?: unknown) => say(c || texts.error, 'error'),
    warning: (c?: unknown) => say(c || texts.warning, 'warning'),
    info: (c?: unknown) => say(c, 'info'),
    loading: () => {},
    networkError: (c?: unknown) => say(c || texts.networkError || 'Network error', 'error'),
    timeout: (c?: unknown) => say(c || texts.timeout || 'Request timed out', 'error'),
    serverError: (c?: unknown) => say(c || texts.serverError || 'Server error', 'error'),
    unauthorized: (c?: unknown) => say(c || texts.unauthorized || 'Please sign in again', 'error'),
  }
}

/** 舞台的五語文案併進宿主的 i18n；宿主已有的 key 一律不覆蓋。 */
export function mergeStageMessages(i18n: StageI18n): void {
  for (const [locale, table] of Object.entries(messages as Record<string, Record<string, unknown>>)) {
    const existing = i18n.getLocaleMessage(locale) || {}
    const add: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(table)) if (!(key in existing)) add[key] = value
    if (Object.keys(add).length) i18n.mergeLocaleMessage(locale, add)
  }
}
