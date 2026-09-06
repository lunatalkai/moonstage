/**
 * StageHost：舞台對宿主的唯一依賴。
 *
 * 舞台（canvas 與它的工具模組）要嵌進別的站台時，不能再直接碰
 * `uni.*`、`window.location`、全域 http、vuex。宿主能力全部經這個介面注入：
 *   - playground（uni-app 殼）給 `uniHost()`，行為與原本逐一相同；
 *   - 純瀏覽器宿主給 `browserHost()`，或在它上面覆寫 toast／confirm／nav 成自家的。
 *
 * 分期見 docs/technical-design/MoonstageStagePackage_TechnicalDesign_20260906_V1.0.md §4／§6。
 * PR1 只接 storage／toast／locale／clipboard／events／scroll；http 與 socket 在 PR2／PR3。
 */

export type ToastKind = 'info' | 'success' | 'error' | 'warning'

export interface StageHost {
  ui: {
    toast(text: string, kind?: ToastKind): void
    confirm(options: { title?: string; content: string; confirmText?: string; cancelText?: string }): Promise<boolean>
    loading(on: boolean): void
  }
  storage: {
    get(key: string): string | null
    set(key: string, value: string): void
    remove(key: string): void
  }
  nav: {
    back(): void
    toEntry(): void
    toLogin(returnTo?: string): void
  }
  locale: {
    get(): string
    set(locale: string): void
  }
  clipboard: {
    write(text: string): Promise<void>
  }
  events: {
    on(name: string, fn: (payload: any) => void): () => void
    emit(name: string, payload?: any): void
  }
  scrollTo(el: Element | null, options?: { offset?: number }): void
}

type UniLike = Record<string, any>

function uniGlobal(): UniLike | null {
  const g = globalThis as any
  return g && typeof g.uni === 'object' && g.uni ? (g.uni as UniLike) : null
}

/** 純瀏覽器實作。宿主通常只覆寫 ui／nav；storage、events、clipboard 直接可用。 */
export function browserHost(overrides: Partial<StageHost> = {}): StageHost {
  const listeners = new Map<string, Set<(p: any) => void>>()
  const base: StageHost = {
    ui: {
      toast: (text) => { if (text) console.info('[stage] ' + text) },
      confirm: async (o) => (typeof window !== 'undefined' && typeof window.confirm === 'function' ? window.confirm(o.content) : false),
      loading: () => {},
    },
    storage: {
      get: (key) => { try { return typeof localStorage === 'undefined' ? null : localStorage.getItem(key) } catch { return null } },
      set: (key, value) => { try { localStorage.setItem(key, value) } catch { /* 隱私模式或配額滿：靜默 */ } },
      remove: (key) => { try { localStorage.removeItem(key) } catch { /* 同上 */ } },
    },
    nav: {
      back: () => { if (typeof history !== 'undefined') history.back() },
      toEntry: () => {},
      toLogin: () => {},
    },
    locale: {
      get: () => (typeof navigator !== 'undefined' && navigator.language) || 'en',
      set: () => {},
    },
    clipboard: {
      write: async (text) => { if (typeof navigator !== 'undefined' && navigator.clipboard) await navigator.clipboard.writeText(text) },
    },
    events: {
      on: (name, fn) => {
        if (!listeners.has(name)) listeners.set(name, new Set())
        listeners.get(name)!.add(fn)
        return () => { listeners.get(name)?.delete(fn) }
      },
      emit: (name, payload) => { listeners.get(name)?.forEach((fn) => { try { fn(payload) } catch (e) { console.warn('[stage] event handler failed', name, e) } }) },
    },
    scrollTo: (el) => { if (el && typeof (el as any).scrollIntoView === 'function') (el as any).scrollIntoView({ behavior: 'smooth', block: 'start' }) },
  }
  return { ...base, ...overrides, ui: { ...base.ui, ...(overrides.ui || {}) }, nav: { ...base.nav, ...(overrides.nav || {}) } }
}

/**
 * uni-app 殼用的實作：每一項都是原本 canvas 直接呼叫的那個 uni API，行為不變。
 * storage 只存字串——uni.setStorageSync 允許任何值，但跨宿主只能承諾字串。
 */
export function uniHost(): StageHost {
  const u = () => uniGlobal() || ({} as UniLike)
  return browserHost({
    ui: {
      toast: (text) => { if (text) u().showToast?.({ title: String(text), icon: 'none' }) },
      confirm: (o) => new Promise((resolve) => {
        u().showModal?.({ title: o.title || '', content: o.content, confirmText: o.confirmText, cancelText: o.cancelText, success: (r: any) => resolve(!!r?.confirm), fail: () => resolve(false) })
      }),
      loading: (on) => { on ? u().showLoading?.({ mask: true }) : u().hideLoading?.() },
    },
    storage: {
      get: (key) => { try { const v = u().getStorageSync?.(key); return v === '' || v === undefined || v === null ? null : String(v) } catch { return null } },
      set: (key, value) => { try { u().setStorageSync?.(key, value) } catch { /* 同 browserHost */ } },
      remove: (key) => { try { u().removeStorageSync?.(key) } catch { /* 同上 */ } },
    },
    nav: {
      back: () => u().navigateBack?.(),
      toEntry: () => u().reLaunch?.({ url: '/pages/play/entry' }),
      toLogin: (returnTo) => u().reLaunch?.({ url: '/pages/login/login' + (returnTo ? '?returnTo=' + encodeURIComponent(returnTo) : '') }),
    },
    locale: {
      get: () => u().getLocale?.() || 'en',
      set: (locale) => u().setLocale?.(locale),
    },
    clipboard: {
      write: (text) => new Promise((resolve, reject) => { u().setClipboardData?.({ data: text, success: () => resolve(), fail: reject }) }),
    },
    events: {
      on: (name, fn) => { u().$on?.(name, fn); return () => u().$off?.(name, fn) },
      emit: (name, payload) => u().$emit?.(name, payload),
    },
  })
}

let current: StageHost | null = null
let autoUni: StageHost | null = null
let autoBrowser: StageHost | null = null

/** 宿主在掛舞台前呼叫一次。沒呼叫時：有 uni 全域就當 uni-app 殼，否則純瀏覽器。 */
export function setStageHost(host: StageHost | null): void {
  current = host
}

/**
 * 沒設定宿主時每次都重新看 uni 全域在不在（測試會在 beforeEach 才放上去），
 * 但同一種只建一份——events 的訂閱表要活在實例上。
 */
export function useStageHost(): StageHost {
  if (current) return current
  if (uniGlobal()) return (autoUni ||= uniHost())
  return (autoBrowser ||= browserHost())
}
