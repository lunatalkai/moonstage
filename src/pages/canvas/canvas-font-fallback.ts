/**
 * 楷體備援。
 *
 * MMD 的卡片常寫 `font-family: "Kaiti","STKaiti",serif`——那是 MMD 的 App 內建的字型，
 * 瀏覽器裡沒有，整張卡就退成黑體，作者一眼看得出「字不對」（owner 2026-09-06）。
 * 這裡在卡片要求楷體時，把霞鶩文楷（LXGW WenKai Screen，SIL OFL 授權）以那些名字
 * 註冊進頁面：拿 CDN 上的 @font-face 定義，把 family 名改成卡片會叫的名字再掛上。
 * 字型檔按 unicode-range 拆成小塊，只有真的用到的字才會下載。
 *
 * 只在偵測到楷體字型名時才載入；沒要求楷體的卡片一個位元組都不會多下載。
 */

const CDN_BASE = 'https://cdn.jsdelivr.net/npm/lxgw-wenkai-screen-webfont@1.7.0/'
const ENTRY_CSS = CDN_BASE + 'style.css'
const SOURCE_FAMILY = 'LXGW WenKai Screen'

/** 卡片會用來叫楷體的名字。同一份 @font-face 用每個名字各註冊一次。 */
export const KAI_ALIASES = ['Kaiti', 'KaiTi', 'STKaiti', '楷体', '楷體', '华文楷体', '華文楷體', 'LXGW WenKai', SOURCE_FAMILY]

const KAI_PATTERN = /kaiti|楷[体體]|wenkai|文楷/i

/** 這段 HTML／CSS 有沒有要求楷體。純函式，給呼叫端決定要不要載。 */
export function needsKaiFallback(html: string): boolean {
  return KAI_PATTERN.test(String(html || ''))
}

/**
 * 把一份 @font-face CSS 改成用別名註冊：family 換名、相對 url 補成絕對。
 * 純函式，可測。
 */
export function aliasFontCss(cssText: string, baseUrl: string, aliases: string[]): string {
  const absolute = String(cssText || '').replace(/url\(\s*(['"]?)(\.\/|(?!https?:|data:|\/))([^'")]+)\1\s*\)/g, (_m, q, _rel, path) => `url(${q}${baseUrl}${path}${q})`)
  const familyRe = new RegExp(`font-family\\s*:\\s*(['"]?)${SOURCE_FAMILY.replace(/ /g, '\\s')}\\1\\s*;`, 'gi')
  if (!familyRe.test(absolute)) return ''
  return aliases
    .map((name) => absolute.replace(familyRe, `font-family: '${name.replace(/'/g, "\\'")}';`))
    .join('\n')
}

/** 入口檔是幾行 @import；跟著抓進來，回傳每份 CSS 的 (文字, 它自己的 base url)。 */
export function resolveImports(entryCss: string, entryBase: string): Array<{ url: string; base: string }> {
  const out: Array<{ url: string; base: string }> = []
  const re = /@import\s+url\(\s*(['"]?)([^'")]+)\1\s*\)/g
  let m: RegExpExecArray | null
  while ((m = re.exec(entryCss))) {
    const url = /^https?:/.test(m[2]) ? m[2] : entryBase + m[2].replace(/^\.\//, '')
    out.push({ url, base: url.slice(0, url.lastIndexOf('/') + 1) })
  }
  return out
}

let loading: Promise<void> | null = null

/**
 * 載入一次，之後都是 no-op。失敗不丟：字型只是外觀，抓不到就維持瀏覽器的退路。
 */
export function ensureKaiFallback(fetchImpl: typeof fetch = fetch, doc: Document = document): Promise<void> {
  if (loading) return loading
  loading = (async () => {
    try {
      const entry = await (await fetchImpl(ENTRY_CSS)).text()
      const parts = resolveImports(entry, CDN_BASE)
      const texts = await Promise.all(parts.map(async (p) => aliasFontCss(await (await fetchImpl(p.url)).text(), p.base, KAI_ALIASES)))
      const css = texts.filter(Boolean).join('\n')
      if (!css) return
      const style = doc.createElement('style')
      style.setAttribute('data-lt-font-fallback', 'kai')
      style.textContent = css
      ;(doc.head || doc.documentElement).appendChild(style)
    } catch (e) {
      // 沒有網路或 CDN 掛了：不重試，這一頁就用瀏覽器自己的字。
    }
  })()
  return loading
}

/** 給測試用：清掉單例。 */
export function resetKaiFallbackForTests() {
  loading = null
}

/**
 * 玩家選的字體要壓過卡片自己寫的 font-family——MMD 的 App 就是這樣（整頁換字型，
 * 卡片 CSS 寫什麼都沒用）。卡片的規則多半帶 !important、又住在 body 裡的 <style>
 * （在頁面樣式之後），純靠順序贏不了，所以這份規則帶 !important、並拉一個 id 把
 * 特異性抬到 (1,x,x)。這是玩家的選擇壓過卡片，不是頁面壓過卡片，所以不放在
 * canvas.css（那份的契約是「頁面樣式讓位」，不寫 !important）；「跟隨卡片」＝拿掉這段。
 */
const FONT_MODE_STYLE_ATTR = 'data-lt-font-mode'

export type CanvasFontMode = 'card' | 'wenkai' | 'system'

export function fontModeCss(mode: CanvasFontMode): string {
  if (mode === 'wenkai') {
    return [
      'html body #app .canvas-root, html body #app .canvas-root *, html body div[data-luna-author-layer] *',
      "{ font-family: 'LXGW WenKai Screen', 'LXGW WenKai', 'Kaiti', 'STKaiti', serif !important; }",
    ].join(' ')
  }
  if (mode === 'system') {
    return [
      'html body #app .canvas-root, html body #app .canvas-root *, html body div[data-luna-author-layer] *',
      "{ font-family: system-ui, -apple-system, 'PingFang TC', 'PingFang SC', 'Noto Sans CJK TC', 'Noto Sans CJK SC', 'Microsoft JhengHei', 'Microsoft YaHei', sans-serif !important; }",
    ].join(' ')
  }
  return ''
}

/** 套用玩家選的字體；'card' 就是把覆蓋拿掉。 */
export function applyFontMode(mode: CanvasFontMode, doc: Document = document) {
  const existing = doc.querySelector(`style[${FONT_MODE_STYLE_ATTR}]`)
  const css = fontModeCss(mode)
  if (!css) {
    if (existing) existing.remove()
    return
  }
  const el = existing || doc.createElement('style')
  el.setAttribute(FONT_MODE_STYLE_ATTR, mode)
  el.textContent = css
  if (!existing) (doc.head || doc.documentElement).appendChild(el)
  if (mode === 'wenkai') ensureKaiFallback()
}
