/**
 * 畫布 @layer 內對 uni-* 節點寫的尺寸／display 一律無效：uni-app H5 對這些元素的基礎樣式
 * 不在任何 layer 裡，永遠贏過 layer 內的規則。2026-09-05 同一天踩兩次（「⋯」浮層每格 266px、
 * 「+」面板圖示跑到槽外），兩次都是把規則搬到 canvas-theme-vars.css（layer 外）才好。
 * 這條是棘輪：layer 內的 uni-* 元素選擇器不得比現在多；要壓 uni 基礎樣式去 layer 外的檔。
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const css = readFileSync(resolve(__dirname, '../canvas.css'), 'utf8')

describe('@layer 內的 uni-* 元素選擇器', () => {
  it('不比基線多（現存：頭像那組 4 個，見 .header-role-img／.avatar）', () => {
    const layer = css.slice(css.indexOf('@layer lt-base'))
    const stripped = layer.replace(/\/\*[\s\S]*?\*\//g, '')
    const hits = stripped.match(/(?:^|[^.\w-])uni-[a-z]+/gm) || []
    expect(hits.length, `layer 內的 uni-* 元素選擇器：${hits.map(h => h.trim()).join(', ')}`).toBeLessThanOrEqual(4)
  })
})
