/**
 * 殼內除錯面板：`?sdkDebug=1` 或宿主 hello 帶 debug 時顯示。作者的 `sdk.debug.log`、
 * 腳本錯誤、外鏈載入失敗、未處理的 Promise 失敗都進這裡；同一行也轉給宿主 console。
 */
export interface DebugPanel {
  log(...args: unknown[]): void
  warn(...args: unknown[]): void
  error(...args: unknown[]): void
  enabled: boolean
}

function format(args: unknown[]): string {
  return args.map((a) => {
    if (typeof a === 'string') return a
    if (a instanceof Error) return `${a.name}: ${a.message}`
    try { return JSON.stringify(a) } catch { return String(a) }
  }).join(' ')
}

export function createDebugPanel(doc: Document, mount: HTMLElement, enabled: boolean, forward: (level: 'log' | 'warn' | 'error', args: unknown[]) => void): DebugPanel {
  let panel: HTMLElement | null = null
  const ensure = () => {
    if (panel) return panel
    panel = doc.createElement('div')
    panel.setAttribute('data-chat', 'sdk-debug')
    mount.appendChild(panel)
    return panel
  }
  const write = (level: 'log' | 'warn' | 'error', args: unknown[]) => {
    forward(level, args)
    if (!enabled) return
    const line = doc.createElement('div')
    line.setAttribute('data-level', level)
    line.textContent = `${new Date().toISOString().slice(11, 19)} ${format(args)}`
    const p = ensure()
    p.appendChild(line)
    while (p.childElementCount > 200) p.removeChild(p.firstElementChild!)
    p.scrollTop = p.scrollHeight
  }
  return {
    enabled,
    log: (...args) => write('log', args),
    warn: (...args) => write('warn', args),
    error: (...args) => write('error', args),
  }
}
