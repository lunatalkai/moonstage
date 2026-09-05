import { describe, expect, it } from 'vitest'
import { resolveChatWebSocketBase } from '../chat-websocket-url'

describe('聊天串流位址', () => {
  it('走開放 API v1 的串流路徑', () => {
    expect(resolveChatWebSocketBase('wss://api.lunatalk.ai'))
      .toBe('wss://api.lunatalk.ai/open/v1/conversation/ws')
  })

  it('本機設定就連本機', () => {
    expect(resolveChatWebSocketBase('ws://localhost:8888'))
      .toBe('ws://localhost:8888/open/v1/conversation/ws')
  })

  it('尾端斜線不會變成雙斜線', () => {
    expect(resolveChatWebSocketBase('wss://api.example.com/'))
      .toBe('wss://api.example.com/open/v1/conversation/ws')
  })
})

// 前端要能指向臨時實例。漏改串流位址會**靜默測到線上**——代理指到臨時實例、
// 串流仍連正式環境，訊息照樣送出去，測試結果看起來正常但驗的是舊程式。
describe('指向臨時實例', () => {
  it('明確給了位址就用它，不再落回設定值', () => {
    expect(resolveChatWebSocketBase('wss://api.lunatalk.ai', '203.0.113.10:9000'))
      .toBe('ws://203.0.113.10:9000/open/v1/conversation/ws')
  })

  it('沒給位址時用建構時的設定', () => {
    expect(resolveChatWebSocketBase('wss://api.lunatalk.ai', ''))
      .toBe('wss://api.lunatalk.ai/open/v1/conversation/ws')
  })

  it('位址帶了協定也接受——手貼的時候很容易連 http:// 一起貼進來', () => {
    expect(resolveChatWebSocketBase('wss://api.lunatalk.ai', 'http://203.0.113.10:9000'))
      .toBe('ws://203.0.113.10:9000/open/v1/conversation/ws')
  })
})
