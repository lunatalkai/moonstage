/**
 * AI 筆記／永久記憶的純邏輯——mobile memoryPage 那一頁的規則搬過來，元件只負責畫。
 *
 * 兩種身分共用同一份清單：Agent 模式開著時它是「AI 記事本」（角色自己每輪記下的），
 * 沒開時是「永久記憶」（背景整理出來的）。清單本身一樣，差的是標題與空態文案，
 * 那些由頁面決定，這裡不碰。
 */

export interface MemoryAtom {
  atomId: string
  atomValue: string
  atomType?: string
  importance?: number
  createTime?: string
  /** 伺服器宣告這一條是誰寫的；舊資料沒有這個欄位 */
  sourceOperation?: string
}

export interface MemoryTimeLabels {
  now: string
  min: string
  hour: string
  day: string
  month: string
}

/** 伺服器回的是裸陣列；也容忍包在 {atoms:[...]} 裡。沒有 atomId 的列畫不出 key 也刪不掉，直接丟掉。 */
export function normalizeMemoryAtoms(payload: unknown): MemoryAtom[] {
  const raw = Array.isArray(payload)
    ? payload
    : (payload && typeof payload === 'object' && Array.isArray((payload as any).atoms) ? (payload as any).atoms : [])
  const out: MemoryAtom[] = []
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue
    const atomId = String((item as any).atomId || '')
    if (!atomId) continue
    out.push({
      atomId,
      atomValue: typeof (item as any).atomValue === 'string' ? (item as any).atomValue : '',
      atomType: (item as any).atomType ? String((item as any).atomType) : undefined,
      importance: Number((item as any).importance) || 0,
      createTime: (item as any).createTime ? String((item as any).createTime) : undefined,
      sourceOperation: (item as any).sourceOperation ? String((item as any).sourceOperation) : undefined,
    })
  }
  return out
}

/** 重要度高的在前（同 mobile）。回新陣列，不動原本那份。 */
export function sortMemoryAtoms(atoms: MemoryAtom[]): MemoryAtom[] {
  return [...(Array.isArray(atoms) ? atoms : [])].sort((a, b) => (b.importance || 0) - (a.importance || 0))
}

/** 來源由伺服器宣告。舊資料沒有這個標記是合法狀態——舊系統寫的本來就沒標，拿不到值一律當成自動整理。 */
export function isAgentMemoryAtom(atom: MemoryAtom | null | undefined): boolean {
  return !!atom && atom.sourceOperation === 'agent_notebook'
}

/**
 * 收行門檻用字數而不是量測高度：字數判斷失準的代價只是偶爾多一個「展開」，
 * 那不會壞掉任何東西；量高度要等渲染完再問一次，捲動時會抖。
 */
export function isLongMemoryAtom(atom: MemoryAtom | null | undefined): boolean {
  return !!atom && typeof atom.atomValue === 'string' && atom.atomValue.length > 90
}

/** 相對時間，跟 mobile 同一套口徑（分／時／天／月）。伺服器時間跑在前面時不顯示負數。 */
export function memoryRelativeTime(timeStr: string | undefined, labels: MemoryTimeLabels, now: number = Date.now()): string {
  if (!timeStr) return ''
  const ts = new Date(timeStr).getTime()
  if (!Number.isFinite(ts)) return ''
  const diff = Math.max(0, now - ts)
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return labels.now
  if (mins < 60) return mins + labels.min
  const hours = Math.floor(mins / 60)
  if (hours < 24) return hours + labels.hour
  const days = Math.floor(hours / 24)
  if (days < 30) return days + labels.day
  return Math.floor(days / 30) + labels.month
}

/** 刪除回應要 2xx 且 ok=true 才算成功（同 mobile utils/memory-delete-response）。 */
export function applyMemoryDeleteResponse(atoms: MemoryAtom[], atomId: string, response: any): MemoryAtom[] {
  const statusCode = Number(response?.statusCode)
  const ok = Number.isFinite(statusCode) && statusCode >= 200 && statusCode < 300 && response?.data?.ok === true
  if (!ok) {
    const error: any = new Error(response?.data?.error || 'Memory deletion failed')
    error.response = response
    throw error
  }
  return (Array.isArray(atoms) ? atoms : []).filter((atom) => atom?.atomId !== atomId)
}
