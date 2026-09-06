import { describe, expect, it, vi } from 'vitest'
import { defineComponent, h } from 'vue'
import { mount } from '@vue/test-utils'
import { onHide, onShow } from './uni-app-shim'

function setVisibility(state: DocumentVisibilityState) {
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => state })
  document.dispatchEvent(new Event('visibilitychange'))
}

// 分頁切到背景＝hide、回到前景＝show，要成對：hide 收起作者容器（側邊欄），
// 沒有 show 就沒人把它放回來（社群站 2026-09-07 回報「切後台回來側邊欄沒了」）。
describe('uni-app-shim onShow / onHide', () => {
  it('回到前景觸發 onShow，切到背景觸發 onHide，卸載後都不再觸發', () => {
    const show = vi.fn()
    const hide = vi.fn()
    const Page = defineComponent({
      setup() {
        onShow(show)
        onHide(hide)
        return () => h('div')
      },
    })
    const wrapper = mount(Page)
    expect(show).toHaveBeenCalledTimes(1) // 掛載算一次 show

    setVisibility('hidden')
    expect(hide).toHaveBeenCalledTimes(1)
    expect(show).toHaveBeenCalledTimes(1)

    setVisibility('visible')
    expect(show).toHaveBeenCalledTimes(2)
    expect(hide).toHaveBeenCalledTimes(1)

    wrapper.unmount()
    setVisibility('hidden')
    setVisibility('visible')
    expect(show).toHaveBeenCalledTimes(2)
    expect(hide).toHaveBeenCalledTimes(1)
  })
})
