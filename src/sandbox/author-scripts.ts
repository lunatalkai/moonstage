/**
 * 跑作者的腳本。整卡只跑一次、在 DOM 建好之前、按規則順序。
 *
 * 內聯腳本包成 `(function(){ … }).call(window)` 用間接 eval 跑：頂層 `this === window`、
 * 非嚴格、`document.currentScript` 為 null。頂層的 function／var／let／const／class 顯式回掛到
 * window，作者寫 `onclick="tap()"` 才找得到。一段腳本出錯只廢它自己，錯誤進除錯面板。
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
    try {
      // 間接 eval：全域作用域、非嚴格。
      ;(0, deps.win.eval)(wrapInlineScript(script.code))
    } catch (e) {
      deps.onError(script.ruleName, e)
    }
  }
}
