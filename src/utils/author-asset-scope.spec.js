// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from 'vitest'

import { createAuthorScope } from './author-asset-scope.js'

const ROOT_ATTR = 'data-test-author-root'

function makeScope() {
  return createAuthorScope({
    doc: document,
    win: window,
    isAuthorRoot: (el) => el.hasAttribute && el.hasAttribute(ROOT_ATTR),
    isOwnNode: (node) => node.hasAttribute && node.hasAttribute(ROOT_ATTR),
  })
}

function wait(ms) {
  return new Promise((resolve) => { nativeSetTimeout(resolve, ms) })
}

const nativeSetTimeout = window.setTimeout
const nativeSetInterval = window.setInterval
const nativeAdd = window.addEventListener

describe('author scope', () => {
  let scope
  beforeEach(() => {
    document.body.innerHTML = '<div id="app"><div id="chat"></div></div>'
    document.head.innerHTML = ''
  })
  afterEach(() => {
    if (scope) scope.dispose()
    scope = null
  })

  describe('頁面根部的節點', () => {
    it('作者在窗口內塞到 body 的節點，離場時移除；窗口外（宿主）塞的不動', () => {
      scope = makeScope()
      scope.run(() => {
        const hud = document.createElement('div')
        hud.id = 'author-hud'
        document.body.appendChild(hud)
      })
      const hostTeleport = document.createElement('div')
      hostTeleport.id = 'host-dialog'
      document.body.appendChild(hostTeleport)

      expect(document.getElementById('author-hud')).not.toBeNull()
      expect(scope.trackedNodeCount()).toBe(1)

      scope.dispose()
      expect(document.getElementById('author-hud')).toBeNull()
      expect(document.getElementById('host-dialog')).not.toBeNull()
      expect(document.getElementById('app')).not.toBeNull()
    })

    it('窗口內加到 <html> 或 <head> 的也算', () => {
      scope = makeScope()
      scope.run(() => {
        const style = document.createElement('style')
        style.id = 'author-style'
        document.head.appendChild(style)
        const bar = document.createElement('div')
        bar.id = 'author-bar'
        document.documentElement.appendChild(bar)
      })
      scope.dispose()
      expect(document.getElementById('author-style')).toBeNull()
      expect(document.getElementById('author-bar')).toBeNull()
    })

    it('宿主宣告是自己的節點（作者容器）不記帳', () => {
      scope = makeScope()
      scope.run(() => {
        const container = document.createElement('div')
        container.setAttribute(ROOT_ATTR, '')
        document.body.appendChild(container)
      })
      expect(scope.trackedNodeCount()).toBe(0)
    })

    it('窗口內掛進 <head> 的同源樣式表與腳本是宿主的（打包器替下一頁動態載入），離場時不動；作者的外鏈照拆', () => {
      scope = makeScope()
      scope.run(() => {
        const own = document.createElement('link'); own.rel = 'stylesheet'; own.href = '/assets/BoardPage-abc.css'; document.head.appendChild(own)
        const ownScript = document.createElement('script'); ownScript.src = '/assets/chunk.js'; document.head.appendChild(ownScript)
        const cdn = document.createElement('link'); cdn.rel = 'stylesheet'; cdn.href = 'https://cdn.example.com/theme.css'; document.head.appendChild(cdn)
        const inline = document.createElement('script'); inline.textContent = 'window.__x = 1'; document.head.appendChild(inline)
      })
      scope.dispose()
      expect(document.head.querySelector('link[href="/assets/BoardPage-abc.css"]')).not.toBeNull()
      expect(document.head.querySelector('script[src="/assets/chunk.js"]')).not.toBeNull()
      expect(document.head.querySelector('link[href="https://cdn.example.com/theme.css"]')).toBeNull()
      expect(document.head.querySelectorAll('script:not([src])').length).toBe(0)
    })

    it('adopt 的節點離場時一起拆', () => {
      scope = makeScope()
      const style = document.createElement('style')
      document.head.appendChild(style)
      scope.adopt(style)
      scope.dispose()
      expect(style.parentNode).toBeNull()
    })
  })

  describe('計時器', () => {
    it('窗口內開的 interval，以及它回呼裡再開的 interval，離場後都停', async () => {
      scope = makeScope()
      let outer = 0
      let inner = 0
      scope.run(() => {
        window.setInterval(() => {
          outer++
          if (outer === 1) window.setInterval(() => { inner++ }, 5)
        }, 5)
      })
      await wait(40)
      expect(outer).toBeGreaterThan(0)
      expect(inner).toBeGreaterThan(0)
      expect(scope.timerCount()).toBe(2)

      scope.dispose()
      const outerAtDispose = outer
      const innerAtDispose = inner
      await wait(40)
      expect(outer).toBe(outerAtDispose)
      expect(inner).toBe(innerAtDispose)
    })

    it('計時器回呼裡塞到 body 的節點也記到作者帳上', async () => {
      scope = makeScope()
      scope.run(() => {
        window.setTimeout(() => {
          const late = document.createElement('div')
          late.id = 'late-hud'
          document.body.appendChild(late)
        }, 5)
      })
      await wait(30)
      expect(document.getElementById('late-hud')).not.toBeNull()
      scope.dispose()
      expect(document.getElementById('late-hud')).toBeNull()
    })

    it('窗口外（宿主）開的計時器不受影響，作者自己清掉的不再追蹤', async () => {
      scope = makeScope()
      let host = 0
      window.setTimeout(() => { host++ }, 10)
      scope.run(() => {
        const id = window.setInterval(() => {}, 5)
        window.clearInterval(id)
      })
      expect(scope.timerCount()).toBe(0)
      scope.dispose()
      await wait(30)
      expect(host).toBe(1)
    })

    it('離場後 window 上的計時器方法還原成原生的', () => {
      scope = makeScope()
      expect(window.setTimeout).not.toBe(nativeSetTimeout)
      scope.dispose()
      expect(window.setTimeout).toBe(nativeSetTimeout)
      expect(window.setInterval).toBe(nativeSetInterval)
    })
  })

  describe('監聽', () => {
    it('窗口內掛在 window / document 的監聽，離場後拆掉；宿主的留著', () => {
      scope = makeScope()
      let author = 0
      let host = 0
      scope.run(() => {
        window.addEventListener('keydown', () => { author++ })
        document.addEventListener('keydown', () => { author++ })
      })
      window.addEventListener('keydown', () => { host++ })
      expect(scope.listenerCount()).toBe(2)

      document.body.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true }))
      expect(author).toBe(2)
      expect(host).toBe(1)

      scope.dispose()
      document.body.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true }))
      expect(author).toBe(2)
      expect(host).toBe(2)
      expect(window.addEventListener).toBe(nativeAdd)
    })

    it('作者自己 removeEventListener 拿得掉（同一個原函式對得上包裝）', () => {
      scope = makeScope()
      let count = 0
      const fn = () => { count++ }
      scope.run(() => {
        window.addEventListener('resize', fn)
        window.removeEventListener('resize', fn)
      })
      window.dispatchEvent(new Event('resize'))
      expect(count).toBe(0)
    })

    it('監聽回呼裡開的計時器與塞的節點也記帳', async () => {
      scope = makeScope()
      scope.run(() => {
        window.addEventListener('resize', () => {
          window.setInterval(() => {}, 5)
          const panel = document.createElement('div')
          panel.id = 'resize-panel'
          document.body.appendChild(panel)
        })
      })
      window.dispatchEvent(new Event('resize'))
      expect(scope.timerCount()).toBe(1)
      expect(document.getElementById('resize-panel')).not.toBeNull()
      scope.dispose()
      expect(document.getElementById('resize-panel')).toBeNull()
    })

    it('直接賦值的 on* 屬性離場時還原', () => {
      scope = makeScope()
      const before = document.onkeydown
      scope.run(() => {
        document.onkeydown = () => {}
        window.onresize = () => {}
      })
      expect(document.onkeydown).not.toBe(before)
      scope.dispose()
      expect(document.onkeydown).toBe(before)
      expect(window.onresize).toBeNull()
    })
  })

  describe('作者節點上的 inline handler', () => {
    it('點在作者容器裡的按鈕，handler 開的計時器與塞的節點記到作者帳上', async () => {
      scope = makeScope()
      const container = document.createElement('div')
      container.setAttribute(ROOT_ATTR, '')
      const button = document.createElement('button')
      button.setAttribute('onclick', 'window.setInterval(function(){}, 5); var p = document.createElement("div"); p.id = "click-panel"; document.body.appendChild(p)')
      container.appendChild(button)
      document.body.appendChild(container)

      button.click()
      expect(scope.timerCount()).toBe(1)
      expect(document.getElementById('click-panel')).not.toBeNull()
      expect(scope.isActive()).toBe(false)

      scope.dispose()
      expect(document.getElementById('click-panel')).toBeNull()
    })

    it('點在宿主自己的 UI 上，什麼都不記', () => {
      scope = makeScope()
      const hostButton = document.createElement('button')
      hostButton.setAttribute('onclick', 'window.setTimeout(function(){}, 5)')
      document.getElementById('app').appendChild(hostButton)
      hostButton.click()
      expect(scope.timerCount()).toBe(0)
    })

    it('不冒泡的事件也會關窗（靠原生計時器兜底）', async () => {
      scope = makeScope()
      const container = document.createElement('div')
      container.setAttribute(ROOT_ATTR, '')
      const input = document.createElement('input')
      container.appendChild(input)
      document.body.appendChild(container)
      input.dispatchEvent(new Event('scroll', { bubbles: false }))
      expect(scope.isActive()).toBe(true)
      await wait(5)
      expect(scope.isActive()).toBe(false)
    })
  })

  describe('宿主替作者做事（suspend）', () => {
    it('窗口內經 suspend 跑的宿主程式：它開的計時器與掛的節點不記帳，離場後還活著', async () => {
      scope = makeScope()
      let hostFired = 0
      scope.run(() => {
        const before = document.createElement('div')
        before.id = 'author-before'
        document.body.appendChild(before)

        scope.suspend(() => {
          window.setTimeout(() => { hostFired++ }, 10)
          const toast = document.createElement('div')
          toast.id = 'host-toast'
          document.body.appendChild(toast)
        })

        const after = document.createElement('div')
        after.id = 'author-after'
        document.body.appendChild(after)
      })
      expect(scope.timerCount()).toBe(0)
      expect(scope.trackedNodeCount()).toBe(2)
      expect(scope.isActive()).toBe(false)

      scope.dispose()
      expect(document.getElementById('author-before')).toBeNull()
      expect(document.getElementById('author-after')).toBeNull()
      expect(document.getElementById('host-toast')).not.toBeNull()
      await wait(30)
      expect(hostFired).toBe(1)
    })

    it('宿主程式裡再回頭叫作者的回呼，作者那段照樣記帳', () => {
      scope = makeScope()
      scope.run(() => {
        scope.suspend(() => {
          const hostNode = document.createElement('div')
          hostNode.id = 'host-node'
          document.body.appendChild(hostNode)
          scope.run(() => {
            const authorNode = document.createElement('div')
            authorNode.id = 'author-nested'
            document.body.appendChild(authorNode)
          })
        })
      })
      expect(scope.trackedNodeCount()).toBe(1)
      scope.dispose()
      expect(document.getElementById('host-node')).not.toBeNull()
      expect(document.getElementById('author-nested')).toBeNull()
    })

    it('窗口外呼叫 suspend 只是直接執行', () => {
      scope = makeScope()
      let ran = false
      expect(scope.suspend(() => { ran = true; return 7 })).toBe(7)
      expect(ran).toBe(true)
    })
  })

  describe('收尾', () => {
    it('dispose 冪等，之後 run 只是直接執行、不再記帳', () => {
      scope = makeScope()
      scope.dispose()
      scope.dispose()
      let ran = false
      scope.run(() => {
        ran = true
        const n = document.createElement('div')
        n.id = 'after-dispose'
        document.body.appendChild(n)
      })
      expect(ran).toBe(true)
      expect(scope.trackedNodeCount()).toBe(0)
      expect(document.getElementById('after-dispose')).not.toBeNull()
      document.getElementById('after-dispose').remove()
    })

    it('作者在 dispose 前把自己的節點搬進了別處，一樣拆得掉', () => {
      scope = makeScope()
      let hud
      scope.run(() => {
        hud = document.createElement('div')
        document.body.appendChild(hud)
      })
      const holder = document.createElement('div')
      document.body.appendChild(holder)
      holder.appendChild(hud)
      scope.dispose()
      expect(hud.parentNode).toBeNull()
      expect(holder.parentNode).toBe(document.body)
    })
  })
})
