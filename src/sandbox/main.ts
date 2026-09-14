/**
 * 殼的進入點：postMessage 握手 → createShell。
 *
 * 安全邊界：
 *   - 殼先對 parent 喊 `ready-shell`（沒有敏感內容，targetOrigin '*'）。
 *   - 第一則 `hello` 必須來自 `window.parent`；它的 origin 從此釘死，之後的訊息 origin 不符
 *     一律丟掉，殼送出去的訊息也只送給這個 origin。
 *   - 這裡不 import 任何宿主模組（請求層、oauth、store…）；build 後由 check-sandbox-boundary 掃。
 */
import { envelope, isSandboxEnvelope, targetOriginFor, type HostToShell, type ShellToHost } from './protocol'
import { createShell, type Shell } from './shell'
import './shell.css'

export function bootSandbox(win: Window & typeof globalThis = window) {
  const doc = win.document
  const mount = doc.getElementById('app') || doc.body
  let hostOrigin: string | null = null
  let shell: Shell | null = null

  const post = (message: ShellToHost) => {
    if (win.parent === win) return
    win.parent.postMessage(envelope(message), targetOriginFor(hostOrigin || ''))
  }

  win.addEventListener('message', (event: MessageEvent) => {
    if (event.source !== win.parent) return
    if (!isSandboxEnvelope(event.data)) return
    const message = event.data as unknown as HostToShell
    if (!shell) {
      if (message.type !== 'hello') return
      hostOrigin = event.origin
      shell = createShell({
        doc,
        win,
        mount,
        config: message.config,
        transport: { send: post },
        debugFromUrl: /[?&]sdkDebug=1\b/.test(win.location.search),
      })
      return
    }
    if (event.origin !== hostOrigin) return
    shell.handle(message)
  })

  win.addEventListener('unhandledrejection', (event) => {
    post({ type: 'debug', level: 'error', args: ['unhandled rejection', String((event as PromiseRejectionEvent).reason)] })
  })

  // 視窗高度跟著鍵盤走：宿主也會送 viewport，這裡是 iframe 自己量得到的部分。
  const vv = win.visualViewport
  if (vv) vv.addEventListener('resize', () => { if (shell) shell.handle({ type: 'viewport', height: vv.height }) })

  post({ type: 'ready-shell' })
  mount.setAttribute('data-sandbox', 'waiting-for-host')
}

if (typeof window !== 'undefined' && !(window as unknown as { __MS_SANDBOX_TEST__?: boolean }).__MS_SANDBOX_TEST__) {
  bootSandbox(window)
}
