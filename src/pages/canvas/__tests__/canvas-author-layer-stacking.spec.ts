// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { createAuthorAssetRuntime, CONTAINER_ATTR } from '../../../utils/author-asset-mount.js'
import { LAYER_Z_INDEX } from '../../../utils/author-asset-mount.fixtures.js'

/**
 * 作者層要跟輸入區在同一個 stacking context 裡，「降低層級」才真的在輸入框之下。
 *
 * 2026-09-11 社群站用戶：功能欄勾了「降低層級」，手機上打開工具抽屜、輸入區上移之後，
 * 作者的側邊欄分頁照樣蓋在輸入框上、吃掉點擊。量到的原因：容器掛在 body，畫布根
 * （position: fixed，z auto）自己是一個 stacking context，輸入區的 z20 只在裡面算數；
 * body 上的 under 層 z12 跟整個畫布比，永遠在上面。
 */
describe('作者層掛進畫布根節點', () => {
  it('canvas.vue 建 runtime 時把 .canvas-root 當容器掛載點', () => {
    const src = fs.readFileSync(path.resolve(__dirname, '../canvas.vue'), 'utf8')
    const at = src.indexOf('authorAssetRuntime = createAuthorAssetRuntime({')
    expect(at).toBeGreaterThan(0)
    const block = src.slice(at, src.indexOf('});', at))
    expect(block).toMatch(/root:\s*\(document\.querySelector\('\.canvas-root'\)/)
  })

  it('runtime 照 root 選項掛容器，三層都在畫布根之下、不在 body 直屬', () => {
    document.body.innerHTML = '<div class="canvas-root"><div class="composer-scope"></div></div>'
    const root = document.querySelector('.canvas-root') as HTMLElement
    const rt = createAuthorAssetRuntime({ doc: document, layerZIndex: LAYER_Z_INDEX.mobile, root })
    for (const layer of ['under', 'over', 'cover'] as const) {
      const el = rt.mount({ mountLayer: layer, html: '<div class="x"></div>' })
      const container = el.closest(`[${CONTAINER_ATTR}]`) as HTMLElement
      expect(container.parentElement).toBe(root)
      expect(Number(container.style.zIndex)).toBe(LAYER_Z_INDEX.mobile[layer])
    }
    // under 的 z 低於輸入區的 20、over 高於它：同一把尺才比得出來
    expect(LAYER_Z_INDEX.mobile.under).toBeLessThan(20)
    expect(LAYER_Z_INDEX.mobile.over).toBeGreaterThan(20)
    rt.dispose()
    expect(document.querySelectorAll(`[${CONTAINER_ATTR}]`).length).toBe(0)
  })
})
