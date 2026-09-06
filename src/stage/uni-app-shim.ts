/**
 * `@dcloudio/uni-app` 頁面生命週期的替身。
 *
 * 舞台當成普通 Vue 元件掛進別的站台時沒有 uni 的頁面堆疊；這裡把 canvas 用到的幾個
 * 鉤子對到 Vue 自己的生命週期，路由參數改由宿主 provide 進來。
 * 只在套件 build（vite.stage.config.ts）裡以 alias 取代真的 `@dcloudio/uni-app`；playground 不經過這裡。
 */
import { inject, onActivated, onBeforeUnmount, onDeactivated, onMounted, type InjectionKey } from 'vue'

export type StageRouteOptions = Record<string, string>

/** 宿主在 <MoonStage> 裡 provide；canvas 的 onLoad(options) 拿到的就是它。 */
export const STAGE_ROUTE_OPTIONS: InjectionKey<StageRouteOptions> = Symbol('moonstage-route-options')

/** uni 的 onLoad 在 setup 期間同步呼叫（掛載之前），這裡照樣。 */
export function onLoad(fn: (options: StageRouteOptions) => void): void {
  const options = inject(STAGE_ROUTE_OPTIONS, {} as StageRouteOptions)
  fn({ ...options })
}

export function onReady(fn: () => void): void {
  onMounted(fn)
}

/** 進頁面＝掛載；被 keep-alive 收起再放回也算一次 show。 */
export function onShow(fn: () => void): void {
  onMounted(fn)
  onActivated(fn)
}

/** 離開但沒銷毀（keep-alive）＝hide；分頁切到背景也當 hide，跟 uni 在 H5 的行為一致。 */
export function onHide(fn: () => void): void {
  onDeactivated(fn)
  if (typeof document === 'undefined') return
  const onVisibility = () => { if (document.visibilityState === 'hidden') fn() }
  onMounted(() => document.addEventListener('visibilitychange', onVisibility))
  onBeforeUnmount(() => document.removeEventListener('visibilitychange', onVisibility))
}

export function onUnload(fn: () => void): void {
  onBeforeUnmount(fn)
}

/** 瀏覽器沒有實體返回鍵可攔；宿主的路由自己管。 */
export function onBackPress(_fn: (options: { from: string }) => boolean | void): void {}

export function onPageScroll(_fn: (e: { scrollTop: number }) => void): void {}
export function onReachBottom(_fn: () => void): void {}
export function onPullDownRefresh(_fn: () => void): void {}
