/**
 * 畫布的存檔：這張卡（roleId）的對話清單。
 *
 * 「只列本角色」不是客戶端過濾出來的——伺服器的 /conversation/archives 依 roleId
 * 只回這張卡的段落，客戶端要做的是把 roleId 送上去。這裡管的是清單到畫面之間的
 * 那幾件小事：目前這段標出來、沒名字的給「序號＋建立日」當預設名、最後一句當摘要、
 * 滿檔判定、以及刪掉目前這段之後該接手哪一段。
 */

export interface ServerArchive {
  conversationId: string
  title?: string | null
  isCurrent?: boolean
  messageCount?: number
  lastMessage?: string
  createTime?: string | null
  lastUpdateTime?: string | null
}

export interface ArchiveRow {
  key: string
  /** 畫面上的名字：有 title 用 title，沒有就是預設名「存檔 k・建立日」 */
  name: string
  /** 玩家自己取的名字；空字串代表沒取（改名輸入框的初值） */
  title: string
  summary: string
  time: string
  countText: string
  current: boolean
  createdAt: number
  updatedAt: number
}

export interface ArchiveLabels {
  /** 沒取名的段的預設名：n 是建立順序的序號，createdAt 是建立時間（毫秒） */
  defaultName: (n: number, createdAt: number) => string
  messages: (n: number) => string
}

export function archiveRequestQuery(roleId: string): { roleId: string } {
  return { roleId: String(roleId || '') }
}

function toMillis(raw: string | null | undefined): number {
  if (!raw) return 0
  const ms = new Date(raw).getTime()
  return Number.isNaN(ms) ? 0 : ms
}

function formatTime(raw: string | null | undefined): string {
  if (!raw) return ''
  const date = new Date(raw)
  if (Number.isNaN(date.getTime())) return String(raw)
  return date.toLocaleDateString()
}

/**
 * 伺服器回的是最近更新在前；序號照建立時間由舊到新（1 是最早開的那段），這樣新開的、
 * 分叉出來的段永遠拿到最大的號碼，而且不會因為玩家切換或繼續聊而跳號。
 * owner 2026-09-14：預設名就用「序號＋建立日」，不拿內容取名、也不叫模型取名——
 * 玩過很久之後內容取的名字自己也認不得。建立時間同一秒時用 id 決勝，不然兩段的號碼
 * 會隨伺服器回傳的順序對調（同一秒開兩段是探針做得到的事，玩家連點也做得到）。
 * 剩下的不穩定只有一種：刪掉前面的一段，後面的號碼會往前補一號。
 */
export function buildArchiveRows(list: ServerArchive[] | undefined, labels: ArchiveLabels): ArchiveRow[] {
  if (!Array.isArray(list)) return []
  const rows = list
    .filter((item) => item && typeof item.conversationId === 'string' && item.conversationId)
    .map((item) => {
      const title = String(item.title || '').trim()
      const count = Number(item.messageCount || 0)
      return {
        key: item.conversationId,
        name: title,
        title,
        summary: String(item.lastMessage || '').trim(),
        time: formatTime(item.lastUpdateTime || item.createTime),
        countText: labels.messages(count),
        current: item.isCurrent === true,
        createdAt: toMillis(item.createTime),
        updatedAt: toMillis(item.lastUpdateTime),
      } as ArchiveRow
    })
  const byCreation = [...rows].sort((a, b) => (a.createdAt - b.createdAt) || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0))
  byCreation.forEach((row, index) => {
    if (!row.name) row.name = labels.defaultName(index + 1, row.createdAt)
  })
  return rows
}

export function isArchiveFull(count: number, limit: number): boolean {
  if (!limit || limit <= 0) return false
  return count >= limit
}

/** 刪掉某一段之後要切到哪一段：剩下裡最近更新的那段；沒有剩下就是空字串。 */
export function nextArchiveAfterDelete(rows: ArchiveRow[], deletedKey: string): string {
  const rest = rows.filter((row) => row.key !== deletedKey)
  if (!rest.length) return ''
  const sorted = [...rest].sort((a, b) => b.updatedAt - a.updatedAt)
  return sorted[0].key
}
