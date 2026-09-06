import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const read = (rel: string) => readFileSync(resolve(__dirname, '../..', rel), 'utf8')

// 靜默錯誤清單存在的理由是「這支 API 的錯誤由呼叫端自己呈現，不要重複 toast」。
// 對業務錯誤成立——例如重寫的操作層失敗會變成 chat 的系統訊息卡。
//
// 但它被寫成無條件靜默，連逾時、斷線、401 一起吞掉。那三種**沒有任何**替代呈現：
// 系統訊息卡只認 server 回來的 finishReason，傳輸層根本沒走到那一步。結果是使用者
// 按下改寫後畫面毫無反應，而我們在日誌裡也看不到——2026-08-01 兩位使用者回報
// 「按了沒反應、重整就好」，查到最後卡在這個縫上。
//
// Apple HIG 的對應判準：做不到的時候要讓人知道做不到、並幫他理解原因；
// 沒有回饋的動作會讓人重複按，對計費型產品是實害。
describe('靜默錯誤清單不得吞掉傳輸層失敗', () => {
  const main = read('src/api/http-setup.js') // 攔截器從 main.js 搬到這裡（舞台套件共用）

  it('逾時、網路錯誤與 401 一律不受靜默清單影響', () => {
    // 三個分支都必須是無條件呈現，不能再掛 shouldSilenceError 判斷。
    const timeoutBranch = main.slice(main.indexOf('statusCode === -9999'), main.indexOf('statusCode === -9998'))
    const networkBranch = main.slice(main.indexOf('statusCode === -1'), main.indexOf('statusCode >= 500'))
    const unauthorizedBranch = main.slice(main.indexOf('statusCode === 401'), main.indexOf('statusCode >= 402'))

    expect(timeoutBranch).not.toContain('shouldSilenceError')
    expect(networkBranch).not.toContain('shouldSilenceError')
    expect(unauthorizedBranch).not.toContain('shouldSilenceError')
  })

  it('業務錯誤（4xx/5xx）仍可被清單靜默，避免與呼叫端的呈現重複', () => {
    const serverErrorBranch = main.slice(main.indexOf('statusCode >= 500'), main.indexOf('statusCode === 401'))
    expect(serverErrorBranch).toContain('shouldSilenceError')
  })

  it('清單本身保留，且每一項都要寫明由誰呈現', () => {
    const list = main.slice(main.indexOf('const silentErrorApis'), main.indexOf('const isSilentErrorRequest'))
    expect(list).toContain('/conversation/rewrite-by-id')
    // 每個條目都應該有註解說明「錯誤改由誰呈現」——沒有理由的靜默就是下一個黑洞。
    const entries = list.split('\n').filter(line => line.trim().startsWith("'"))
    expect(entries.length).toBeGreaterThan(0)
    entries.forEach(entry => expect(entry).toMatch(/\/\//))
  })
})
