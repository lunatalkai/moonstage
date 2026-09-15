/**
 * 舞台自己的殼（頂欄、彈層）底色是亮是暗，字就跟著換。
 *
 * 作者的卡會把這些殼漆成自己的顏色（例如日間主題 `.topTabbar { background: var(--lb) !important }`），
 * 但作者只對 MMD 的節點名寫過字色——我們的返回鍵、模型 chip、欄位標題不在他的清單裡。
 * 站台在深色主題時字是白的，殼一被漆成米白就白字白底，整排看不見（owner 2026-09-12 截圖）。
 * MMD 的頂欄 icon 日夜都看得見，我們也得。
 *
 * 做法：量每個殼「實際看到的底色」（自己的底色疊在祖先的底色上，半透明照 alpha 混），
 * 亮就標 data-lt-tone="light"、暗就標 "dark"，CSS 照標記給字色（canvas.css，layer 外、
 * :where() 歸零特異性，作者指名 color 的規則永遠贏）。作者切日夜、卡片載入、彈層打開
 * 都會重量一次（canvas.vue 的 syncCardTheme 與 canvas-popup.vue）。
 */
import { parseCssColor } from './canvas-card-theme'

export type ChromeTone = 'light' | 'dark'

export interface RGBA { r: number; g: number; b: number; a: number }

/** 有這些節點就量：頂欄、彈層。輸入區作者通常不漆，等真的碰到再加。 */
export const CHROME_TONE_SELECTORS = ['.topTabbar', '.u-popup__content'] as const

/** 頁面預設底：量不到任何底色時當作深色（舞台的預設主題）。 */
const DEFAULT_PAGE_BG: RGBA = { r: 15, g: 18, b: 23, a: 1 }

/**
 * 解析 getComputedStyle 回來的顏色。除了 rgb／rgba／#hex，Chrome 對 color-mix() 的結果
 * 會回 `color(srgb 0.95 0.95 0.96 / 0.07)`（0–1 的分量），也要認得。
 */
export function parseComputedColor(value: string | undefined | null): RGBA | null {
  const v = String(value || '').trim()
  const m = v.match(/^color\(srgb\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)\s*(?:\/\s*([\d.]+%?)\s*)?\)$/i)
  if (m) {
    const a = m[4] === undefined ? 1 : (m[4].endsWith('%') ? parseFloat(m[4]) / 100 : +m[4])
    return { r: Math.round(+m[1] * 255), g: Math.round(+m[2] * 255), b: Math.round(+m[3] * 255), a }
  }
  if (/^transparent$/i.test(v)) return { r: 0, g: 0, b: 0, a: 0 }
  return parseCssColor(v)
}

/** top 疊在 bottom 上（一般 alpha 混色）。 */
export function blendOver(top: RGBA, bottom: RGBA): RGBA {
  const a = top.a + bottom.a * (1 - top.a)
  if (a <= 0) return { r: 0, g: 0, b: 0, a: 0 }
  const mix = (t: number, b: number) => Math.round((t * top.a + b * bottom.a * (1 - top.a)) / a)
  return { r: mix(top.r, bottom.r), g: mix(top.g, bottom.g), b: mix(top.b, bottom.b), a }
}

export function relativeLuminance(c: RGBA): number {
  const f = (x: number) => { const s = x / 255; return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4) }
  return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b)
}

/** 亮度過半就是亮底，字用深色；否則字用淺色。 */
export function toneForBackground(c: RGBA): ChromeTone {
  return relativeLuminance(c) > 0.5 ? 'light' : 'dark'
}

/** 漸層背景的第一個色標：作者的頂欄常是 linear-gradient，background-color 是透明的，顏色在這裡。 */
const GRADIENT_COLOR = /(rgba?\([^)]*\)|color\(srgb[^)]*\)|#[0-9a-f]{3,8}\b|transparent)/i
export function firstGradientColor(backgroundImage: string | null | undefined): RGBA | null {
  const v = String(backgroundImage || '')
  if (!/gradient\(/i.test(v)) return null
  const m = v.match(GRADIENT_COLOR)
  return m ? parseComputedColor(m[1]) : null
}

/** 一層的底：background-color 疊上漸層的第一個色標（漸層畫在底色之上）。都沒有就 null。 */
function layerBackground(view: Window, el: Element, pseudo?: string): RGBA | null {
  const cs = view.getComputedStyle(el, pseudo)
  // 偽元素沒有 content 就不存在（jsdom 對偽元素回的是元素本身的樣式，content 也會是 normal，一樣略過）
  if (pseudo && (!cs.content || cs.content === 'none' || cs.content === 'normal')) return null
  const bg = parseComputedColor(cs.backgroundColor)
  const grad = firstGradientColor(cs.backgroundImage)
  let acc: RGBA | null = bg && bg.a > 0 ? bg : null
  if (grad && grad.a > 0) acc = acc ? blendOver(grad, acc) : grad
  return acc
}

/**
 * 這個節點實際看到的底色：從最外層往內，每一層的底色照 alpha 疊上去（含漸層的第一個色標）；
 * 節點自己的 ::before／::after 有底的話也疊上去（作者常拿偽元素當頂欄的底）。全透明就是頁面預設底。
 */
export function effectiveBackground(el: Element, fallback: RGBA = DEFAULT_PAGE_BG): RGBA {
  const chain: Element[] = []
  for (let node: Element | null = el; node; node = node.parentElement) chain.push(node)
  let acc: RGBA = { ...fallback }
  const view = el.ownerDocument?.defaultView
  if (!view) return acc
  for (let i = chain.length - 1; i >= 0; i -= 1) {
    const layer = layerBackground(view, chain[i])
    if (layer) acc = blendOver(layer, acc)
  }
  for (const pseudo of ['::before', '::after']) {
    const layer = layerBackground(view, el, pseudo)
    if (layer) acc = blendOver(layer, acc)
  }
  return acc
}

/**
 * 頂欄實際看到的底色，給宿主塗到系統狀態列（theme-color）——狀態列跟頁首同色，
 * 手機上看起來就是一整片，而不是頂著一條站台底色。沒有頂欄（還沒掛）就 null。
 */
export function chromeTopColor(scope: ParentNode | null | undefined = typeof document === 'undefined' ? null : document, fallbackEl?: Element | null): string | null {
  const el = (scope && scope.querySelector('.topTabbar')) || fallbackEl || null
  if (!el) return null
  const c = effectiveBackground(el)
  return `rgb(${c.r}, ${c.g}, ${c.b})`
}

/** 量所有殼，把色調寫在 data-lt-tone 上。沒有那個節點就略過。 */
export function syncChromeTone(scope: ParentNode | null | undefined = typeof document === 'undefined' ? null : document): void {
  if (!scope) return
  for (const selector of CHROME_TONE_SELECTORS) {
    for (const el of scope.querySelectorAll(selector)) {
      const tone = toneForBackground(effectiveBackground(el))
      if (el.getAttribute('data-lt-tone') !== tone) el.setAttribute('data-lt-tone', tone)
    }
  }
}
