import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

// 自動重整只能為「我們自己的檔案載不到」而觸發。與 mobile 同一輪、同一判準。
//
// 2026-08-02 使用者回報「頁面瘋狂自動刷新」：對話被洗掉、往上拉的歷史不見、
// 切去其他分頁再切回來幾乎每次觸發；另有人指出裝擋廣告外掛才會發生、加白名單就好。
// 根因是 resource error 監聽器**無條件**對任何 <script>/<link> 失敗就整頁重載——
// 擋廣告外掛擋掉的第三方腳本失敗也算。
//
// 這機制的用意只有一個：新版部署後舊分頁載不到已刪除的 chunk 就重整。第三方資源
// 失敗與版本無關，重整救不了，卻會沖掉使用者的捲動位置與已載入的對話歷史。
describe('chunk 自動重整的觸發範圍（desktop）', () => {
  const main = readFileSync(resolve(__dirname, '../..', 'src/main.js'), 'utf8')

  it('resource error 分支必須先確認失敗的是我們自己的檔案', () => {
    const start = main.indexOf("window.addEventListener('error'")
    expect(start).toBeGreaterThanOrEqual(0)
    const handler = main.slice(start, main.indexOf('}, true);', start))
    expect(handler).toMatch(/isOwnAssetUrl|sameOrigin|location\.origin/)
  })

  it('同源判斷存在，跨網域資源一律不觸發重整', () => {
    expect(main).toContain('isOwnAssetUrl')
    const start = main.indexOf('isOwnAssetUrl')
    const fn = main.slice(start, start + 700)
    expect(fn).toMatch(/u\.origin !== location\.origin/)
  })

  it('防迴圈旗標仍在，重整不得無限循環', () => {
    expect(main).toContain('lt_chunk_reloaded')
    expect(main).toMatch(/FLAG_TTL_MS/)
  })
})
