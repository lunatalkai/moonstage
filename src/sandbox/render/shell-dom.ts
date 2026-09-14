/**
 * 殼的 DOM 骨架：固定的 `data-chat` 節點與 `data-slot` 插槽。作者的樣式與腳本只認這些名字，
 * 所以這裡的結構是契約（docs/sandbox-chat-page.md §4），改了要一起改文件與測試。
 *
 * 平台節點一律 z-index auto、position static（它們只是 root 這個 flex 容器的普通項目）；
 * 舞台 content 2000／full 3000；殼自己的彈層 9000 起。
 */
import type { SandboxTheme, StageState } from '../protocol'
import type { ShellStrings } from '../strings'

export interface ShellRefs {
  root: HTMLElement
  authorCss: HTMLStyleElement
  header: HTMLElement
  headerBack: HTMLButtonElement
  headerTitle: HTMLElement
  headerActions: HTMLElement
  headerExtra: HTMLElement
  statusbar: HTMLElement | null
  messages: HTMLElement
  list: HTMLElement
  listSpacer: HTMLElement
  left: HTMLElement
  right: HTMLElement
  stage: HTMLElement
  composer: HTMLElement
  toolbar: HTMLElement
  input: HTMLTextAreaElement
  send: HTMLButtonElement
  more: HTMLButtonElement
}

export interface BuildShellOptions {
  theme: SandboxTheme
  strings: ShellStrings
  roleName: string
  roleAvatar: string
  /** 功能欄原文非空才建 `[data-slot="statusbar"]`；空就整塊不存在。 */
  hasStatusbar: boolean
  composerVisible: boolean
  backgroundUrl?: string
}

function el<K extends keyof HTMLElementTagNameMap>(doc: Document, tag: K, attrs: Record<string, string> = {}, text?: string): HTMLElementTagNameMap[K] {
  const node = doc.createElement(tag)
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v)
  if (text != null) node.textContent = text
  return node
}

export function buildShell(doc: Document, mount: HTMLElement, options: BuildShellOptions): ShellRefs {
  const authorCss = el(doc, 'style', { 'data-chat': 'author-css' })
  doc.head.appendChild(authorCss)

  const root = el(doc, 'div', { 'data-chat': 'root', 'data-theme': options.theme, 'data-composer': options.composerVisible ? 'visible' : 'hidden' })
  if (options.backgroundUrl) root.style.backgroundImage = `url("${options.backgroundUrl.replace(/"/g, '%22')}")`

  const header = el(doc, 'header', { 'data-chat': 'header' })
  const headerBack = el(doc, 'button', { 'data-chat': 'header-back', type: 'button', title: options.strings.back }, '‹')
  const headerTitle = el(doc, 'div', { 'data-chat': 'header-title' })
  if (options.roleAvatar) headerTitle.appendChild(el(doc, 'img', { src: options.roleAvatar, alt: '' }))
  headerTitle.appendChild(el(doc, 'span', {}, options.roleName))
  const headerActions = el(doc, 'div', { 'data-chat': 'header-actions' })
  const headerExtra = el(doc, 'div', { 'data-slot': 'header-extra' })
  header.append(headerBack, headerTitle, headerActions, headerExtra)

  const statusbar = options.hasStatusbar ? el(doc, 'div', { 'data-slot': 'statusbar' }) : null

  const messages = el(doc, 'main', { 'data-chat': 'messages' })
  const list = el(doc, 'div', { 'data-chat': 'list' })
  const listSpacer = el(doc, 'div', { 'data-chat': 'list-spacer' })
  messages.append(list, listSpacer)

  const left = el(doc, 'div', { 'data-slot': 'left' })
  const right = el(doc, 'div', { 'data-slot': 'right' })
  const stage = el(doc, 'div', { 'data-chat': 'author-stage', 'data-stage': 'closed' })

  const composer = el(doc, 'footer', { 'data-chat': 'composer' })
  const toolbar = el(doc, 'div', { 'data-slot': 'toolbar' })
  const row = el(doc, 'div', { 'data-chat': 'composer-row' })
  const more = el(doc, 'button', { 'data-chat': 'more', type: 'button', title: options.strings.more }, '＋')
  const input = el(doc, 'textarea', { 'data-chat': 'input', rows: '1', placeholder: options.strings.placeholder })
  const send = el(doc, 'button', { 'data-chat': 'send', type: 'button' }, options.strings.send)
  row.append(more, input, send)
  composer.append(toolbar, row)
  composer.hidden = !options.composerVisible

  root.append(header)
  if (statusbar) root.append(statusbar)
  root.append(messages, left, right, stage, composer)
  mount.appendChild(root)

  return { root, authorCss, header, headerBack, headerTitle, headerActions, headerExtra, statusbar, messages, list, listSpacer, left, right, stage, composer, toolbar, input, send, more }
}

export function setStage(refs: ShellRefs, state: StageState) {
  refs.stage.setAttribute('data-stage', state)
}

export function setComposerVisible(refs: ShellRefs, visible: boolean) {
  refs.composer.hidden = !visible
  refs.root.setAttribute('data-composer', visible ? 'visible' : 'hidden')
}

export function setTheme(refs: ShellRefs, theme: SandboxTheme) {
  refs.root.setAttribute('data-theme', theme)
}

export function setViewportHeight(refs: ShellRefs, height: number) {
  if (Number.isFinite(height) && height > 0) refs.root.style.setProperty('--chat-viewport-height', `${Math.round(height)}px`)
}

/** 殼內的確認框（授權送出用）。回傳使用者按了哪個。 */
export function confirmDialog(doc: Document, mount: HTMLElement, opts: { title: string; body: string; ok: string; cancel: string }): Promise<boolean> {
  return new Promise((resolve) => {
    const mask = el(doc, 'div', { 'data-chat': 'alert' })
    const box = el(doc, 'div', { 'data-chat': 'alert-box' })
    box.append(el(doc, 'div', { 'data-chat': 'alert-title' }, opts.title), el(doc, 'div', { 'data-chat': 'alert-body' }, opts.body))
    const buttons = el(doc, 'div', { 'data-chat': 'alert-buttons' })
    const cancel = el(doc, 'button', { type: 'button', 'data-chat': 'alert-cancel' }, opts.cancel)
    const ok = el(doc, 'button', { type: 'button', 'data-chat': 'alert-ok' }, opts.ok)
    buttons.append(cancel, ok)
    box.appendChild(buttons)
    mask.appendChild(box)
    const finish = (value: boolean) => { mask.remove(); resolve(value) }
    cancel.addEventListener('click', () => finish(false))
    ok.addEventListener('click', () => finish(true))
    mount.appendChild(mask)
    ok.focus()
  })
}
