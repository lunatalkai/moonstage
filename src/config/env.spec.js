import { describe, it, expect } from 'vitest'
import { requireEnv, resolveApiBase, resolveWsBase, resolveApiOrigin } from './env.js'

// 與 mobile/tests/env-config.spec.js 為鏡像套件：兩端的解析行為必須一致，
// 否則同一個環境設定在兩端會有不同結果，除錯時會非常難查。
// 差異只有一處且是刻意的：desktop 是純 Web，沒有「APP 包把位址編譯進去」
// 這回事，API 一律走同源代理。

describe('requireEnv', () => {
  it('回傳存在的值', () => {
    expect(requireEnv({ VITE_WS_BASE: 'wss://api.example.com' }, 'VITE_WS_BASE'))
      .toBe('wss://api.example.com')
  })

  it('缺值時拋錯而非回傳空值', () => {
    expect(() => requireEnv({}, 'VITE_WS_BASE')).toThrow(/VITE_WS_BASE/)
    expect(() => requireEnv({ VITE_WS_BASE: '' }, 'VITE_WS_BASE')).toThrow(/VITE_WS_BASE/)
    expect(() => requireEnv({ VITE_WS_BASE: '   ' }, 'VITE_WS_BASE')).toThrow(/VITE_WS_BASE/)
  })

  it('錯誤訊息指出該去哪裡補', () => {
    expect(() => requireEnv({}, 'VITE_WS_BASE')).toThrow(/\.env/)
  })
})

describe('resolveApiBase', () => {
  // desktop 只跑在瀏覽器，API 一律走同源相對路徑：開發由 vite proxy 接、
  // 線上由反向代理接。這裡不像 mobile 那樣有 APP 分支。
  it('預設走同源代理路徑', () => {
    expect(resolveApiBase({})).toBe('/api')
  })

  it('代理路徑可被覆寫', () => {
    expect(resolveApiBase({ VITE_API_PROXY_PATH: '/backend' })).toBe('/backend')
  })
})

describe('resolveWsBase', () => {
  it('回傳設定的 ws base', () => {
    expect(resolveWsBase({ VITE_WS_BASE: 'wss://api.example.com' }))
      .toBe('wss://api.example.com')
  })

  it('缺失時拋錯', () => {
    expect(() => resolveWsBase({})).toThrow(/VITE_WS_BASE/)
  })

  // 位址誤填 https 的症狀是連線靜默失敗，使用者只看到訊息發不出去。
  it('必須是 ws/wss scheme', () => {
    expect(() => resolveWsBase({ VITE_WS_BASE: 'https://api.example.com' }))
      .toThrow(/ws:\/\/|wss:\/\//)
  })

  it('去掉尾端斜線', () => {
    expect(resolveWsBase({ VITE_WS_BASE: 'wss://api.example.com/' }))
      .toBe('wss://api.example.com')
  })
})


describe('resolveApiOrigin', () => {
  // OAuth 的授權頁是「整頁跳轉」而不是 XHR：走同源 /api 代理會被 Worker 用 fetch 跟著
  // 302 走到登入頁，把登入頁的 HTML 回在 /api/oauth/authorize 底下，流程就斷了。
  // 所以整頁跳轉必須打 API 的絕對位址；沒有另外設定時就從 WS base 推出來。
  it('預設從 VITE_WS_BASE 推出 http(s) 位址', () => {
    expect(resolveApiOrigin({ VITE_WS_BASE: 'wss://api.lunatalk.ai' })).toBe('https://api.lunatalk.ai')
    expect(resolveApiOrigin({ VITE_WS_BASE: 'ws://localhost:8888/' })).toBe('http://localhost:8888')
  })

  it('VITE_API_ORIGIN 可明確覆寫（第三方部署 API 與 WS 不同機時）', () => {
    expect(resolveApiOrigin({ VITE_WS_BASE: 'wss://api.lunatalk.ai', VITE_API_ORIGIN: 'https://api.example.com/' }))
      .toBe('https://api.example.com')
  })

  it('覆寫值必須是 http(s) 絕對位址', () => {
    expect(() => resolveApiOrigin({ VITE_WS_BASE: 'wss://api.lunatalk.ai', VITE_API_ORIGIN: '/api' })).toThrow(/VITE_API_ORIGIN/)
  })
})
