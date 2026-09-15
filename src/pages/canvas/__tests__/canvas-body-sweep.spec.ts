// @vitest-environment jsdom
/**
 * 離開對話頁的兜底掃除：進頁面時不在、離開時在的 html／body 直接子節點與 head 樣式要被移除；
 * 裝著 App 的那棵、Vue 自己管的節點、建置工具注入的樣式要留下。
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { captureBodySnapshot, sweepForeignNodes } from '../canvas-body-snapshot'

beforeEach(() => {
  document.head.innerHTML = '<style id="base">body{}</style>'
  document.body.innerHTML = '<div id="app"><div class="canvas-root"></div></div><div id="pre-existing"></div>'
})

describe('sweepForeignNodes', () => {
  it('掃掉進頁後塞進 body／html／head 的外來節點，留下本來就在的與 App 本身', () => {
    const snap = captureBodySnapshot(document)
    const rail = document.createElement('div'); rail.className = 'card-rail'; document.body.appendChild(rail)
    const bubble = document.createElement('div'); bubble.className = 'card-avatar'; document.body.appendChild(bubble)
    const onHtml = document.createElement('div'); document.documentElement.appendChild(onHtml)
    const style = document.createElement('style'); style.textContent = 'body{background:#000}'; document.head.appendChild(style)
    const link = document.createElement('link'); link.rel = 'stylesheet'; link.href = 'https://x/card.css'; document.head.appendChild(link)
    const script = document.createElement('script'); document.body.appendChild(script)

    const r = sweepForeignNodes(document, snap)
    expect(r.removed).toBe(5)
    expect(document.querySelector('.card-rail')).toBeNull()
    expect(document.querySelector('.card-avatar')).toBeNull()
    expect(onHtml.isConnected).toBe(false)
    expect(style.isConnected).toBe(false)
    expect(link.isConnected).toBe(false)
    expect(document.getElementById('app')).not.toBeNull()
    expect(document.getElementById('pre-existing')).not.toBeNull()
    expect(document.getElementById('base')).not.toBeNull()
    expect(script.isConnected).toBe(true)
  })

  it('Vue 管的節點與開發模式注入的樣式不碰', () => {
    const snap = captureBodySnapshot(document)
    const teleported = document.createElement('div'); (teleported as any).__vueParentComponent = {}; document.body.appendChild(teleported)
    const devStyle = document.createElement('style'); devStyle.setAttribute('data-vite-dev-id', '/x.css'); document.head.appendChild(devStyle)
    const r = sweepForeignNodes(document, snap)
    expect(r.removed).toBe(0)
    expect(teleported.isConnected).toBe(true)
    expect(devStyle.isConnected).toBe(true)
  })

  it('打包器替下一頁動態掛進 <head> 的同源樣式表與模組是宿主的，不掃；卡片塞的外鏈樣式與 <style> 照掃', () => {
    const snapshot = captureBodySnapshot(document)
    const own = document.createElement('link'); own.rel = 'stylesheet'; own.href = '/assets/BoardPage-abc.css'; document.head.appendChild(own)
    const ownScript = document.createElement('script'); ownScript.src = '/assets/chunk.js'; document.head.appendChild(ownScript)
    const cdn = document.createElement('link'); cdn.rel = 'stylesheet'; cdn.href = 'https://cdn.example.com/theme.css'; document.head.appendChild(cdn)
    const style = document.createElement('style'); style.textContent = 'body{background:red}'; document.head.appendChild(style)
    sweepForeignNodes(document, snapshot)
    expect(document.head.contains(own)).toBe(true)
    expect(document.head.contains(ownScript)).toBe(true)
    expect(document.head.contains(cdn)).toBe(false)
    expect(document.head.contains(style)).toBe(false)
  })

  it('沒有快照就什麼都不做', () => {
    const foreign = document.createElement('div'); document.body.appendChild(foreign)
    expect(sweepForeignNodes(document, null).removed).toBe(0)
    expect(foreign.isConnected).toBe(true)
  })
})
