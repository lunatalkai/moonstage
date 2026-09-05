import { describe, expect, it, beforeAll } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

const CSS_PATH = path.resolve(__dirname, '../html-card.css')

function loadCssOnce() {
  if (document.getElementById('__hc_css_test__')) return
  const css = fs.readFileSync(CSS_PATH, 'utf8')
  const styleTag = document.createElement('style')
  styleTag.id = '__hc_css_test__'
  styleTag.textContent = css
  document.head.appendChild(styleTag)
}

function makeClassEl(className: string) {
  const el = document.createElement('div')
  el.className = className
  document.body.appendChild(el)
  return el
}

function makeTagEl(tagName: string) {
  const el = document.createElement(tagName)
  document.body.appendChild(el)
  return el
}

// 施工單：HC 組件三真 bug 修復 · 修 1 — .hc-d / .hc-n 效果錯位歸位
// 社群實測 + 截圖核對：.hc-d（對話）應斜體，代碼原本寫成 font-weight:bold；
// .hc-n（旁白）應縮小字級，代碼原本寫成 font-style:italic——兩者症狀完全對調。
//
// 修 3 — hc-f 手機無 .hc-wrap 時裁切：預設帶上換行行為，且不影響已搭配
// .hc-wrap 的既有卡片。desktop/mobile 共用同一份 html-card.css，本檔驗證同一
// 份修復在 desktop 端也生效。
describe('html-card.css · hc-d/hc-n/hc-v/hc-f 真實渲染行為（jsdom 實際套用 CSS 檔核算）', () => {
  beforeAll(() => {
    loadCssOnce()
  })

  it('.hc-d（對話）渲染為斜體，不再是粗體', () => {
    const el = makeClassEl('hc-d')
    const style = getComputedStyle(el)
    expect(style.fontStyle).toBe('italic')
    expect(style.fontWeight).not.toBe('bold')
  })

  it('.hc-n（旁白）渲染為較小字級，不再是斜體', () => {
    const el = makeClassEl('hc-n')
    const style = getComputedStyle(el)
    expect(style.fontStyle).not.toBe('italic')
    expect(style.fontSize).toBe('13px')
  })

  it('.hc-v（強調數值）維持粗體，本次修復不影響（回歸保護）', () => {
    const el = makeClassEl('hc-v')
    const style = getComputedStyle(el)
    expect(style.fontWeight).toBe('bold')
  })

  it('.hc-f 預設允許換行，避免無 .hc-wrap 時把子項擠出邊界裁切', () => {
    const el = makeClassEl('hc-f')
    const style = getComputedStyle(el)
    expect(style.flexWrap).toBe('wrap')
  })

  it('.hc-f 搭配 .hc-wrap 的既有換行行為不變（回歸保護）', () => {
    const el = makeClassEl('hc-f hc-wrap')
    const style = getComputedStyle(el)
    expect(style.flexWrap).toBe('wrap')
  })

  it('hc-bar 與 hc-meter light DOM host 都提供滿寬 block sizing', () => {
    for (const tagName of ['hc-bar', 'hc-meter']) {
      const style = getComputedStyle(makeTagEl(tagName))
      expect(style.display).toBe('block')
      expect(style.width).toBe('100%')
    }
  })
})
