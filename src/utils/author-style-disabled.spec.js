// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest'

import { applyDisabledStyleAttr } from './author-style-disabled.js'
import { createAuthorAssetRuntime } from './author-asset-mount.js'
import { LAYER_Z_INDEX } from './author-asset-mount.fixtures.js'

describe('作者寫的 <style disabled> 真的關掉', () => {
  beforeEach(() => { document.body.innerHTML = '' })

  it('屬性翻成 .disabled；沒寫的不動；已經關的不重複算', () => {
    const root = document.createElement('div')
    root.innerHTML = '<style data-mmd-theme="day">:root{--b:#fff}</style><style data-mmd-theme="night" disabled>:root{--b:#000}</style>'
    document.body.appendChild(root)
    const day = root.querySelector('[data-mmd-theme=day]')
    const night = root.querySelector('[data-mmd-theme=night]')
    expect(!!night.disabled).toBe(false) // 瀏覽器不認屬性，這就是問題本身（jsdom 連這個屬性都沒有，用 !! 比）
    expect(applyDisabledStyleAttr(root)).toBe(1)
    expect(night.disabled).toBe(true)
    expect(!!day.disabled).toBe(false)
    expect(applyDisabledStyleAttr(root)).toBe(0)
  })

  it('root 自己就是 <style disabled> 時也處理', () => {
    const s = document.createElement('style')
    s.setAttribute('disabled', '')
    document.head.appendChild(s)
    expect(applyDisabledStyleAttr(s)).toBe(1)
    expect(s.disabled).toBe(true)
    s.remove()
  })

  it('掛載層：掛上去的資產裡的 <style disabled> 一掛就是關的', () => {
    const rt = createAuthorAssetRuntime({ doc: document, layerZIndex: LAYER_Z_INDEX.desktop })
    const el = rt.mount({ mountLayer: 'over', html: '<style data-t="a">.x{}</style><style data-t="b" disabled>.y{}</style><div class="w"></div>' })
    expect(!!el.querySelector('[data-t=a]').disabled).toBe(false)
    expect(el.querySelector('[data-t=b]').disabled).toBe(true)
  })
})
