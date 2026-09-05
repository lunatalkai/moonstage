/**
 * 訊息裡的 position:fixed 作者節點搬家去重。
 *
 * 背景：MMD 卡片常讓 AI 每輪重新吐一次觸發標記（跟狀態欄快照同一套邏輯），
 * 我方規則引擎逐則訊息展開，若標記展開出的是 `position:fixed` 面板，每一則
 * 含標記的訊息都會各自展開一份、留在自己的氣泡裡（氣泡的 backdrop-filter
 * 又把它們吸成 containing block）。MMD 真實平台上這類面板是單一、body 級
 * 的節點，觸發幾次都只剩一份——這支測試釘住「搬家去重」要做到同一件事。
 */
import { describe, it, expect } from 'vitest'
import { hoistFixedAuthorNodes } from '../canvas-author-node-hoist'

const FIXED = () => ({ position: 'fixed' })
const STATIC = () => ({ position: 'static' })

function makeDom() {
  const scanRoot = document.createElement('div')
  const container = document.createElement('div')
  document.body.appendChild(scanRoot)
  document.body.appendChild(container)
  return { scanRoot, container }
}

describe('hoistFixedAuthorNodes', () => {
  it('第一次見到的 fixed 節點：搬進容器', () => {
    const { scanRoot, container } = makeDom()
    const panel = document.createElement('div')
    panel.id = 'cb_sb_box'
    scanRoot.appendChild(panel)

    const result = hoistFixedAuthorNodes(scanRoot, container, FIXED)

    expect(result).toEqual({ hoisted: 1, removed: 0 })
    expect(container.contains(panel)).toBe(true)
    expect(scanRoot.contains(panel)).toBe(false)
  })

  it('容器裡已有同 id：訊息串裡新出現的那份直接丟掉，容器裡原本那份不動', () => {
    const { scanRoot, container } = makeDom()
    const original = document.createElement('div')
    original.id = 'cb_sb_box'
    original.setAttribute('data-marker', 'first')
    container.appendChild(original)

    const duplicate = document.createElement('div')
    duplicate.id = 'cb_sb_box'
    duplicate.setAttribute('data-marker', 'second')
    scanRoot.appendChild(duplicate)

    const result = hoistFixedAuthorNodes(scanRoot, container, FIXED)

    expect(result).toEqual({ hoisted: 0, removed: 1 })
    expect(container.children.length).toBe(1)
    expect(container.querySelector('#cb_sb_box')?.getAttribute('data-marker')).toBe('first')
    expect(document.body.contains(duplicate)).toBe(false) // 真的被移除，不是留在別處
  })

  it('多則訊息各自帶同一個觸發面板：處理完只剩一份', () => {
    const { scanRoot, container } = makeDom()
    for (let i = 0; i < 5; i++) {
      const panel = document.createElement('div')
      panel.id = 'cb_sb_box'
      const msg = document.createElement('div')
      msg.className = 'mes item Ai'
      msg.appendChild(panel)
      scanRoot.appendChild(msg)
    }

    hoistFixedAuthorNodes(scanRoot, container, FIXED)

    expect(container.querySelectorAll('#cb_sb_box').length).toBe(1)
    expect(scanRoot.querySelectorAll('#cb_sb_box').length).toBe(0)
  })

  it('position 不是 fixed 的節點：不搬、不刪，留在原地', () => {
    const { scanRoot, container } = makeDom()
    const staticEl = document.createElement('div')
    staticEl.id = 'normal-content'
    scanRoot.appendChild(staticEl)

    const result = hoistFixedAuthorNodes(scanRoot, container, STATIC)

    expect(result).toEqual({ hoisted: 0, removed: 0 })
    expect(scanRoot.contains(staticEl)).toBe(true)
    expect(container.contains(staticEl)).toBe(false)
  })

  it('沒有 id 的節點：即使是 fixed 也不處理——沒有穩定身分無法判斷是不是重複', () => {
    const { scanRoot, container } = makeDom()
    const anonymous = document.createElement('div')
    scanRoot.appendChild(anonymous)

    const result = hoistFixedAuthorNodes(scanRoot, container, FIXED)

    expect(result).toEqual({ hoisted: 0, removed: 0 })
    expect(scanRoot.contains(anonymous)).toBe(true)
  })

  it('已經在容器裡的節點：再掃一次不會重複處理（冪等）', () => {
    const { scanRoot, container } = makeDom()
    const panel = document.createElement('div')
    panel.id = 'cb_sb_box'
    scanRoot.appendChild(panel)

    hoistFixedAuthorNodes(scanRoot, container, FIXED)
    const second = hoistFixedAuthorNodes(scanRoot, container, FIXED)

    expect(second).toEqual({ hoisted: 0, removed: 0 })
    expect(container.querySelectorAll('#cb_sb_box').length).toBe(1)
  })

  it('scanRoot 或 container 缺一個：安全跳過，不拋錯', () => {
    const { scanRoot, container } = makeDom()
    expect(() => hoistFixedAuthorNodes(null, container, FIXED)).not.toThrow()
    expect(() => hoistFixedAuthorNodes(scanRoot, null, FIXED)).not.toThrow()
    expect(hoistFixedAuthorNodes(null, container, FIXED)).toEqual({ hoisted: 0, removed: 0 })
  })

  it('mountTrigger 掛進容器的節點不會被當成「訊息裡的重複」處理——它本來就不在 scanRoot 底下', () => {
    const { scanRoot, container } = makeDom()
    const official = document.createElement('div')
    official.id = 'cb_sb_box'
    container.appendChild(official) // 模擬 mountTrigger 已經掛好的官方那份

    const result = hoistFixedAuthorNodes(scanRoot, container, FIXED)

    expect(result).toEqual({ hoisted: 0, removed: 0 })
    expect(container.children.length).toBe(1)
  })
})
