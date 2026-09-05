const CHAT_WS_PATH = '/open/v1/conversation/ws'

/**
 * 決定聊天串流連線的位址。
 *
 * 一般情況直接用建構時設定的位址（`VITE_WS_BASE`），自架或指向其他環境只要改
 * 那一個設定。explicitBase 是執行期覆寫，用來指向臨時實例。
 *
 * 這個覆寫存在的理由是安全：漏改串流位址會**靜默測到線上**——代理指到臨時實例、
 * 串流仍連正式環境，訊息照樣送出去，測試結果看起來正常但驗的是舊程式。給一個
 * 統一的入口，比要人記得同時手改兩個檔案可靠。
 */
export function resolveChatWebSocketBase(wsBase: string, explicitBase?: string): string {
  const explicit = (explicitBase || '').trim()
  if (explicit) {
    // 手貼的時候很容易連 http:// 一起貼進來，剝掉而不是拒絕。
    const bare = explicit.replace(/^[a-z]+:\/\//i, '').replace(/\/+$/, '')
    // 臨時實例是明文 HTTP，沒有憑證。
    return `ws://${bare}${CHAT_WS_PATH}`
  }
  return `${(wsBase || '').trim().replace(/\/+$/, '')}${CHAT_WS_PATH}`
}
