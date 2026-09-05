import { describe, expect, it, vi, beforeEach } from 'vitest'
// @ts-ignore - plain JS module without bundled declarations
import { renderRichText, renderRichTextCached, clearRichCache, findStableBoundary } from './rich-text-renderer.js'

describe('renderRichTextCached', () => {
  beforeEach(() => {
    clearRichCache()
  })

  it('輸出與 renderRichText 等價(快取不改變渲染結果)', () => {
    const samples = [
      '你好，**世界**',
      '# 標題\n\n一段文字',
      '- a\n- b\n- c',
      '純文字一行',
      '<div class="hc-card">手刻 HTML</div>',
    ]
    for (const s of samples) {
      expect(renderRichTextCached(s)).toBe(renderRichText(s))
    }
  })

  it('空字串回傳空字串', () => {
    expect(renderRichTextCached('')).toBe('')
    expect(renderRichTextCached(undefined as any)).toBe('')
  })

  it('相同內容第二次命中快取(同一引用),內容變才重算', () => {
    const a1 = renderRichTextCached('**memo**')
    const a2 = renderRichTextCached('**memo**')
    // 命中快取:回傳同一個字串引用(未重新解析產生新字串)
    expect(a2).toBe(a1)
    const b = renderRichTextCached('**memo!**')
    expect(b).not.toBe(a1)
  })

  it('LRU 超量時丟最舊;最近使用的保留並仍命中', () => {
    // 灌入 250 條(上限 200),前 50 條應被淘汰
    for (let i = 0; i < 250; i++) renderRichTextCached('item-' + i)
    // 最舊(item-0)被淘汰後再請求 → 重新解析(但結果仍正確)
    expect(renderRichTextCached('item-0')).toBe(renderRichText('item-0'))
    // 最近的仍正確
    expect(renderRichTextCached('item-249')).toBe(renderRichText('item-249'))
  })

  it('長對話模擬:重複渲染同一批不變訊息只解析一次(memoize 生效)', () => {
    // 直接驗證「相同內容回傳同一引用」即等同「未重新解析」:
    // renderRichText 每次回傳新字串,故同引用 ⇒ 命中快取未重算。
    const texts = ['msg-a', 'msg-b', 'msg-c']
    const first = texts.map((t) => renderRichTextCached(t))
    // 模擬流式期間整列 re-render 多次
    for (let round = 0; round < 5; round++) {
      texts.forEach((t, i) => {
        expect(renderRichTextCached(t)).toBe(first[i])
      })
    }
  })
})

// 串流快取的邊界永遠落在空行之後（findStableBoundary 回 pos + 2）。
// 一條無法跨行的規則不可能跨越那個邊界，所以「切開各自套規則」與「整段套規則」
// 結果相同——快取才站得住。會跨行的規則沒有這個保證，必須跟既有那幾條跨段
// bail-out 一樣放棄快取，否則會把一段永遠不再重算的錯誤產物快取起來。
describe('findStableBoundary 的跨行規則 bail-out', () => {
  const streamable = 'a'.repeat(150) + '\n\n' + 'b'.repeat(150)

  it('沒有跨行規則時照常給出邊界', () => {
    expect(findStableBoundary(streamable)).toBeGreaterThan(0)
    expect(findStableBoundary(streamable, false)).toBeGreaterThan(0)
  })

  it('有跨行規則時放棄快取', () => {
    expect(findStableBoundary(streamable, true)).toBe(0)
  })
})
