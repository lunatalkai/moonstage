import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

import { buildDevProxy } from '../../build/dev-proxy.js'

// 這兩條守的不變量沒變，但斷言對象換了。
//
// 原本一條讀 manifest.json 的 h5.devServer.proxy、一條比對 dev:h5:local 的命令
// 字串長相。前者從來就不生效——desktop 走 vite，proxy 由 vite.config.js 的
// server.proxy 提供（見 build/dev-proxy.js），manifest 裡那份被 uni 忽略；
// 後者把實作細節寫死成字串，換一種等價寫法就紅，但真正該保護的是行為。
//
// 現在斷言真正生效的那條路徑，以及 local 模式下 WebSocket 確實跟著走本機。
describe('default Desktop H5 API proxy', () => {
  it('targets the production API for the normal dev:h5 release-validation path', () => {
    // 不帶任何 DEV_PROXY_* 覆寫時 = 一般 dev:h5，/api 必須指向正式站，
    // 這樣本機驗收看到的才是線上行為。
    const proxy = buildDevProxy({})

    expect(proxy['/api'].target).toBe('https://api.lunatalk.ai')
  })

  it('points both HTTP and WebSocket at the local server in dev:h5:local', () => {
    const packagePath = path.resolve(process.cwd(), 'package.json')
    const packageJson = JSON.parse(fs.readFileSync(packagePath, 'utf8'))
    const local = packageJson.scripts['dev:h5:local']

    // HTTP 與 WebSocket 必須同時指向本機。只設其中一個，症狀是聊天靜默連到
    // 正式站——頁面看起來正常，只有聊天走錯，而且不會有任何錯誤訊息。
    expect(local).toContain('DEV_PROXY_API=http://localhost:8888')
    expect(local).toContain('VITE_WS_BASE=ws://localhost:8888')
  })

  it('lets an explicit override point the proxy at a temporary backend', () => {
    // 取代舊 set-api-target.js 的 API_TARGET：把 dev proxy 指到生產機上
    // 臨時測試實例，驗一批伺服器行為不必走上線流程。
    const proxy = buildDevProxy({ DEV_PROXY_API: 'http://10.0.0.9:9000' })

    expect(proxy['/api'].target).toBe('http://10.0.0.9:9000')
  })
})
