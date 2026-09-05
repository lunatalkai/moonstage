import { describe, it, expect, vi } from 'vitest'
import { withModalDefaults, installModalDefaults, LUNA_CONFIRM_COLOR, LUNA_CANCEL_COLOR } from './modal-defaults'

describe('withModalDefaults', () => {
  it('沒傳 confirmColor 時注入品牌金（取代 uni 內建的 iOS 藍 #007AFF）', () => {
    const out = withModalDefaults({ title: '刪除', content: '確定嗎' })
    expect(out.confirmColor).toBe(LUNA_CONFIRM_COLOR)
  })

  it('危險操作傳入的紅色必須保留，不能被預設值蓋掉', () => {
    const out = withModalDefaults({ title: '移除', confirmColor: '#FF2B2B' })
    expect(out.confirmColor).toBe('#FF2B2B')
  })

  it('沒傳 cancelColor 時注入暗底可讀的灰白（內建 #000 在暗底不可讀）', () => {
    expect(withModalDefaults({}).cancelColor).toBe(LUNA_CANCEL_COLOR)
  })

  it('其餘 options 原樣透傳', () => {
    const cb = vi.fn()
    const out = withModalDefaults({ title: 'T', content: 'C', showCancel: false, success: cb })
    expect(out.title).toBe('T')
    expect(out.content).toBe('C')
    expect(out.showCancel).toBe(false)
    expect(out.success).toBe(cb)
  })

  it('undefined options 不炸', () => {
    expect(withModalDefaults(undefined as never).confirmColor).toBe(LUNA_CONFIRM_COLOR)
  })
})

describe('installModalDefaults', () => {
  it('包住 showModal 後，原呼叫拿到預設色', () => {
    const original = vi.fn()
    const uniLike: Record<string, unknown> = { showModal: original }
    installModalDefaults(uniLike as never)
    ;(uniLike.showModal as (o: unknown) => void)({ title: 'T' })
    expect(original).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'T', confirmColor: LUNA_CONFIRM_COLOR, cancelColor: LUNA_CANCEL_COLOR })
    )
  })

  it('重複安裝不會二次包裝', () => {
    const original = vi.fn()
    const uniLike: Record<string, unknown> = { showModal: original }
    installModalDefaults(uniLike as never)
    const wrapped = uniLike.showModal
    installModalDefaults(uniLike as never)
    expect(uniLike.showModal).toBe(wrapped)
  })

  it('目標沒有 showModal 時安靜跳過', () => {
    expect(() => installModalDefaults({} as never)).not.toThrow()
    expect(() => installModalDefaults(undefined)).not.toThrow()
  })
})
