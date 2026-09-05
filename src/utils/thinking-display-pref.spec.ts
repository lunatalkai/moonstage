// @vitest-environment jsdom
import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest'
import { getShowThinkingProcess, setShowThinkingProcess } from './thinking-display-pref'

// 施工單：模型思考能力三檔聲明制（邊界 7）· adaptive 模型「顯示思考過程」顯示層開關
//
// 純顯示層偏好（不影響生成與計費），本地裝置持久化即可，不需要 server 欄位。
// 對照 mobile/src/utils/thinking-display-pref.js 的同一份合約。
describe('thinking-display-pref · 顯示思考過程 本地偏好 (desktop)', () => {
  let store: Record<string, unknown>

  beforeEach(() => {
    store = {}
    ;(globalThis as any).uni = {
      getStorageSync: vi.fn((key: string) => store[key]),
      setStorageSync: vi.fn((key: string, value: unknown) => { store[key] = value }),
    }
  })

  afterEach(() => {
    // @ts-expect-error
    delete globalThis.uni
  })

  it('預設 = 顯示（尚未寫入任何偏好時回傳 true）', () => {
    expect(getShowThinkingProcess('role-1')).toBe(true)
  })

  it('write 後能原樣讀回（關閉 / 重新開啟）', () => {
    setShowThinkingProcess('role-1', false)
    expect(getShowThinkingProcess('role-1')).toBe(false)

    setShowThinkingProcess('role-1', true)
    expect(getShowThinkingProcess('role-1')).toBe(true)
  })

  it('per-roleId 隔離：角色 A 關閉不影響角色 B（預設仍顯示）', () => {
    setShowThinkingProcess('role-a', false)
    expect(getShowThinkingProcess('role-a')).toBe(false)
    expect(getShowThinkingProcess('role-b')).toBe(true)
  })

  it('roleId 為空時讀寫都是安全 no-op，讀取回傳預設 true', () => {
    expect(() => setShowThinkingProcess('', false)).not.toThrow()
    expect(getShowThinkingProcess('')).toBe(true)
  })

  it('storage 壞掉時安全降級，讀取回傳 true、寫入不拋錯', () => {
    ;(globalThis as any).uni.getStorageSync = vi.fn(() => { throw new Error('storage broken') })
    ;(globalThis as any).uni.setStorageSync = vi.fn(() => { throw new Error('storage broken') })

    expect(getShowThinkingProcess('role-broken')).toBe(true)
    expect(() => setShowThinkingProcess('role-broken', false)).not.toThrow()
  })
})
