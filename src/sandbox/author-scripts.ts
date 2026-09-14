/**
 * 跑作者的腳本。整卡只跑一次、在 DOM 建好之前、按規則順序。
 *
 * 內聯腳本當真正的 <script> 元素掛進 head 執行（見 runInlineScript）；語法上只有包在函式裡才合法的
 * 寫法（頂層 return）退回 `(function(){ … }).call(window)` 的間接 eval，頂層宣告顯式回掛到 window。
 * 一段腳本出錯只廢它自己，錯誤進除錯面板。
 *
 * 外鏈 `<script src>` 只認 https；按順序插進 head，不等前一個載完（跟原站一樣——作者的
 * 關鍵訂閱要寫在外鏈之前的內聯腳本裡）。載入失敗不中斷整張卡，除錯面板留一行。
 */
import type { AuthorScript } from './rules'

const DECL_RE = /^(?:async\s+)?function\s*\*?\s*([A-Za-z_$][\w$]*)|^(?:const|let|var)\s+([A-Za-z_$][\w$]*)|^class\s+([A-Za-z_$][\w$]*)/

/** 頂層宣告的名字（以最淺縮排的行為頂層）。 */
export function topLevelNames(code: string): string[] {
  const lines = code.split('\n')
  let minIndent = Number.POSITIVE_INFINITY
  for (const line of lines) {
    if (!line.trim()) continue
    const indent = line.match(/^\s*/)![0].length
    if (indent < minIndent) minIndent = indent
  }
  const names: string[] = []
  for (const line of lines) {
    const indent = line.match(/^\s*/)![0].length
    if (indent !== minIndent) continue
    const m = DECL_RE.exec(line.trim())
    if (!m) continue
    const name = m[1] || m[2] || m[3]
    if (name && !names.includes(name)) names.push(name)
  }
  return names
}

export function wrapInlineScript(code: string): string {
  const hoist = topLevelNames(code).map((n) => `if (typeof ${n} !== 'undefined') this.${n} = ${n};`).join('')
  return `(function(){\n${code}\n;${hoist}\n}).call(window)`
}

export interface RunScriptsDeps {
  doc: Document
  win: Window & typeof globalThis
  onError(ruleName: string, error: unknown): void
  onExternalError(ruleName: string, src: string): void
}

/** 這個文件會不會真的執行 <script> 元素（測試用的 DOM 不會；那就退回間接 eval）。 */
const scriptElementsRun = new WeakMap<Document, boolean>()
function canRunScriptElements(doc: Document, win: Window & typeof globalThis): boolean {
  const known = scriptElementsRun.get(doc)
  if (known != null) return known
  const w = win as unknown as Record<string, unknown>
  delete w.__msScriptProbe
  const el = doc.createElement('script')
  el.textContent = 'window.__msScriptProbe = 1'
  doc.head.appendChild(el)
  el.remove()
  const ok = w.__msScriptProbe === 1
  delete w.__msScriptProbe
  scriptElementsRun.set(doc, ok)
  return ok
}

/**
 * 跑一段內聯腳本：優先當真正的 <script> 元素掛進 head——頂層的 function／var 自然就是全域、
 * document.currentScript 有值，跟舊頁（與 MMD 舊頁）的行為一樣；舊頁寫法的多段引擎靠這個互相找得到。
 * 語法錯誤（例如頂層 return，那是包在函式裡才合法的寫法）就退回包函式的間接 eval 再跑一次。
 * 執行期錯誤走 window 的 error 事件轉給 onError，不會中斷後面的腳本。
 */
export function runInlineScript(code: string, ruleName: string, deps: RunScriptsDeps) {
  if (!canRunScriptElements(deps.doc, deps.win)) {
    try { (0, deps.win.eval)(wrapInlineScript(code)) } catch (e) { deps.onError(ruleName, e) }
    return
  }
  let syntaxError: unknown = null
  const onErr = (ev: ErrorEvent) => {
    if (ev.error instanceof SyntaxError) { syntaxError = ev.error; ev.preventDefault(); return }
    deps.onError(ruleName, ev.error || ev.message)
    ev.preventDefault()
  }
  deps.win.addEventListener('error', onErr)
  try {
    const el = deps.doc.createElement('script')
    el.setAttribute('data-chat', 'author-script')
    el.textContent = code
    deps.doc.head.appendChild(el)
  } finally {
    deps.win.removeEventListener('error', onErr)
  }
  if (syntaxError) {
    try { (0, deps.win.eval)(wrapInlineScript(code)) } catch (e) { deps.onError(ruleName, e) }
  }
}

export function runAuthorScripts(scripts: AuthorScript[], deps: RunScriptsDeps) {
  const loaded = new Set<string>()
  for (const script of scripts) {
    if (script.kind === 'external') {
      if (loaded.has(script.src)) continue
      loaded.add(script.src)
      const el = deps.doc.createElement('script')
      el.src = script.src
      el.async = false
      el.addEventListener('error', () => deps.onExternalError(script.ruleName, script.src))
      deps.doc.head.appendChild(el)
      continue
    }
    runInlineScript(script.code, script.ruleName, deps)
  }
}
