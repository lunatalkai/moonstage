import { describe, it, expect } from 'vitest'
import { scanSource, ALLOWED } from '../../scripts/check-hardcoded-endpoints.mjs'

// 與 mobile/tests/check-hardcoded-endpoints.spec.js 為鏡像套件。
//
// 這支 gate 擋的是「後端位址又被寫死回程式碼」。難的不是抓到網域，是不要誤報——
// 誤報一多，下一個人就會學會忽略它，gate 等於不存在。所以每條放行規則都對應
// 一個真實存在的合理用法。
//
// 它上線當天就在 desktop 抓到兩處真實遺漏（openim-manager.js 與
// community/main.vue 把 IM 圖片網址寫死成 .pro），那兩處是導入環境設定時漏掉的。

const scan = (text, file = 'src/utils/foo.js') => scanSource(file, text)

describe('scanSource：該抓的', () => {
  it('抓到寫死的 API 位址', () => {
    expect(scan(`const host = "https://api.lunatalk.ai";`)).toHaveLength(1)
  })

  // 初版掃描只寫 https?://，漏掉 wss://，而 mobile 的 share-chat.vue
  // WebSocket 寫死測試環境正是這樣躲過檢查的。
  it('抓到寫死的 WebSocket 位址', () => {
    expect(scan(`url: "wss://api.lunatalk.ai/x"`)).toHaveLength(1)
  })

  it('抓到藏在 replace 呼叫裡的位址', () => {
    expect(scan(`url.replace(/localhost:9000/g, 'https://api.lunatalk.ai')`)).toHaveLength(1)
  })
})

describe('scanSource：不該抓的', () => {
  it('放行註解裡的範例位址', () => {
    expect(scan(`// 例如: https://api.example.com/x`)).toHaveLength(0)
    expect(scan(` * @returns https://api.lunatalk.ai`)).toHaveLength(0)
  })

  // 這三類不隨環境變化，理由見 src/config/env.js 的 SITE_ORIGIN 註解。
  it('放行 objects / downloads / 站台主網域', () => {
    expect(scan(`url.replace('objects.example.com', 'objects.example.org')`)).toHaveLength(0)
    expect(scan(`src="https://downloads.lunatalk.ai/a.png"`)).toHaveLength(0)
    expect(scan(`item: 'https://lunatalk.ai/pages/square/main'`)).toHaveLength(0)
  })

  it('放行設定檔與允許清單內的檔案', () => {
    expect(scanSource('src/config/env.js', `const A = "https://api.lunatalk.ai"`)).toHaveLength(0)
    expect(scanSource('build/dev-proxy.js', `target: 'https://api.example.com'`)).toHaveLength(0)
    expect(scanSource('src/config/env.js', `const O = 'https://api.lunatalk.ai'`)).toHaveLength(0)
  })

  it('放行 locale 與測試檔', () => {
    expect(scanSource('src/locale/en.json', `"x": "https://api.lunatalk.ai"`)).toHaveLength(0)
    expect(scanSource('src/foo.spec.js', `expect(u).toBe('https://api.example.com')`)).toHaveLength(0)
  })
})

describe('回報內容', () => {
  it('指出行號與命中的位址', () => {
    const [hit] = scan(`line1\nconst h = "https://api.lunatalk.ai";`)
    expect(hit.line).toBe(2)
    expect(hit.match).toContain('api.lunatalk.ai')
  })
})

describe('ALLOWED', () => {
  // 用萬用規則（例如放行整個 utils/）會讓 gate 隨時間失效，
  // 因為新檔案會自動落進放行範圍。
  it('允許清單逐檔明列', () => {
    expect(Array.isArray(ALLOWED.files)).toBe(true)
    expect(ALLOWED.files.every(f => typeof f === 'string')).toBe(true)
  })
})
