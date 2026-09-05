// 模型支不支援多步，由**伺服器宣告**（模型目錄的 supportsMultiPass），
// 前端不自己維護清單——否則每加一個模型就要發一次前端版，漏了就是
// 「明明支援卻顯示不支援」。同一個形狀見 model-onboarding 的聲明制。

export type PassBlockOutcome = 'ok' | 'failed' | 'skipped' | 'skipped_moderation'

export interface PassBlock {
  passType: string
  outcome: PassBlockOutcome
  format: string
  payload?: string
  usageRef: string
}

const PASS_BLOCK_OUTCOMES = new Set<PassBlockOutcome>([
  'ok',
  'failed',
  'skipped',
  'skipped_moderation',
])

export function isMultiPassModelSupported(preference: any): boolean {
  // 支不支援由伺服器在偏好設定裡回報（modelSupported）。拿不到時保守回 false：
  // 寧可暫時顯示不支援，也不要讓用戶開了一個伺服器會拒絕的設定。
  return !!(preference && preference.modelSupported)
}

function unwrapResponseBody(raw: any): any {
  let body = raw && typeof raw === 'object' ? raw : {}
  if (body.data && typeof body.data === 'object') body = body.data
  if (body.data && typeof body.data === 'object') body = body.data
  return body
}

export function normalizeMultiPassPreference(raw: any) {
  const body = unwrapResponseBody(raw)
  return {
    multiPassEnabled: body.multiPassEnabled === true,
    // 伺服器沒說支援就是不支援，不猜。
    modelSupported: !!body.modelSupported,
    runtimeEnabled: body.runtimeEnabled === true,
    // costWarning：撥開之前要不要先彈一次高消費提醒。
    //
    // 沒說就是不提醒。這裡不能學 modelSupported 的保守方向（拿不到就當不支援）：
    // 那邊保守是少給一個功能，這邊保守會變成對每一個模型都攔一次，包括便宜到
    // 不需要攔的——提醒到處都是，使用者就會學會直接點掉，真正該攔的那次也一起
    // 被點掉了。名單在伺服器，舊版伺服器沒有這個欄位，行為就跟改動前一樣。
    costWarning: body.costWarning === true,
  }
}

export function normalizePassBlock(raw: unknown): PassBlock | null {
  let value: any = raw
  if (typeof value === 'string') {
    try { value = JSON.parse(value) } catch (_) { return null }
  }
  if (!value || typeof value !== 'object' || !PASS_BLOCK_OUTCOMES.has(value.outcome)) return null

  const payload = typeof value.payload === 'string' ? value.payload : ''
  if (value.outcome === 'ok' && !payload.trim()) return null
  return {
    passType: typeof value.passType === 'string' ? value.passType : '',
    outcome: value.outcome,
    format: typeof value.format === 'string' ? value.format : '',
    ...(value.outcome === 'ok' ? { payload } : {}),
    usageRef: typeof value.usageRef === 'string' ? value.usageRef : '',
  }
}

export function getPassBlockPresentation(raw: unknown):
  | { kind: 'hidden' }
  | { kind: 'notice'; block: PassBlock }
  | { kind: 'content'; block: PassBlock; format: string; payload: string } {
  const block = normalizePassBlock(raw)
  if (!block) return { kind: 'hidden' }
  if (block.outcome !== 'ok') return { kind: 'notice', block }
  return { kind: 'content', block, format: block.format, payload: block.payload || '' }
}

export function isMultiPassEffective(preference: unknown): boolean {
  const normalized = normalizeMultiPassPreference(preference)
  return normalized.multiPassEnabled
    && normalized.runtimeEnabled
    && normalized.modelSupported
}

function passBlockIdentity(block: PassBlock): string {
  if (block.usageRef) return `usage:${block.usageRef}`
  return JSON.stringify([block.passType, block.outcome, block.format, block.payload || ''])
}

export function attachPassBlock(messages: any[], rawBlock: unknown, chatId?: string | number): boolean {
  if (!Array.isArray(messages)) return false
  const block = normalizePassBlock(rawBlock)
  if (!block) return false

  const expectedId = chatId == null ? '' : String(chatId)
  let index = expectedId
    ? messages.findIndex(item => item && item.type === 0 && String(item.id) === expectedId)
    : -1
  if (index < 0) {
    for (let i = messages.length - 1; i >= 0; i -= 1) {
      if (messages[i] && messages[i].type === 0) {
        index = i
        break
      }
    }
  }
  if (index < 0) return false

  const current: PassBlock[] = Array.isArray(messages[index].passBlocks) ? messages[index].passBlocks : []
  const identity = passBlockIdentity(block)
  if (current.some(item => passBlockIdentity(item) === identity)) return false
  messages.splice(index, 1, { ...messages[index], passBlocks: [...current, block] })
  return true
}

/**
 * 把準備軌跡帶過「用伺服器歷史重建時間軸」這一步。
 *
 * 回合結束後客戶端會重抓一次歷史並整條換掉 talkList。思考過程活得下來是因為
 * 它落盤，伺服器會再送回來；準備軌跡只存在記憶體裡，重建之後那則訊息換成一個
 * 全新的物件，面板就跟著消失——用戶等了一分多鐘、也付了錢，看到的卻是過程被抹掉。
 *
 * 這裡只帶軌跡本身與收合狀態，不做整列合併：整列合併會把已經被伺服器改掉的
 * 內容用舊值蓋回去。重新整理頁面仍然沒有軌跡（它本來就不落盤），那是預期。
 */
export function carryPrepTrailAcrossHistoryRebuild(messages: any[], lastKnownMessages: any[]): any[] {
  if (!Array.isArray(messages)) return []
  if (!Array.isArray(lastKnownMessages)) return messages

  // 串流期間的暫時 id 在重建後會換成伺服器 id，所以 id 與 chatId 都當索引鍵。
  const trailByKey = new Map<string, { prepTrail: any[]; prepTrailCollapsed: boolean }>()
  for (const row of lastKnownMessages) {
    if (!row || !Array.isArray(row.prepTrail) || !row.prepTrail.length) continue
    const entry = {
      prepTrail: row.prepTrail,
      // 沒記過就當收起：重建不該替用戶把面板展開。
      prepTrailCollapsed: row.prepTrailCollapsed !== false,
    }
    for (const key of [row.id, row.chatId]) {
      const k = key == null ? '' : String(key)
      if (k) trailByKey.set(k, entry)
    }
  }
  if (!trailByKey.size) return messages

  return messages.map(row => {
    if (!row || typeof row !== 'object') return row
    if (Array.isArray(row.prepTrail) && row.prepTrail.length) return row
    const entry = trailByKey.get(String(row.id ?? '')) || trailByKey.get(String(row.chatId ?? ''))
    if (!entry) return row
    const carried: any = {
      ...row,
      prepTrail: entry.prepTrail,
      prepTrailCollapsed: entry.prepTrailCollapsed,
    }
    // 伺服器仍然說這一輪是中斷態，就把「繼續」那個入口一起帶回來。
    //
    // 軌跡有兩個來源：伺服器落盤的那份，與記憶體裡剛跑出來的那份。走到這裡代表
    // 伺服器那份沒讀到、用了記憶體那份——而中斷卡的顯示綁在 agentInterrupted 上，
    // 只補軌跡不補標記的話，畫面會變成「有準備過程、沒有繼續」，而底下那條系統
    // 訊息會補上一顆「重試」——重試是從頭重跑，正好把斷點丟掉。
    if (row.finishReason === 'agent_progress_preserved' && !row.agentInterrupted) {
      carried.agentInterrupted = true
      carried.isApplicationError = false
      carried.systemOnly = false
    }
    return carried
  })
}

/**
 * 串流期間重建氣泡時，決定準備過程面板該收起還是保持展開。
 *
 * 一輪串流會重建氣泡三五十次，每次都是新物件。先前每次重建都把
 * prepTrailCollapsed 寫死成 true——用戶點開，下一個 chunk 就把它關上，
 * 手感是「點了沒反應」。生成結束後不再重建，所以那時點開才留得住。
 *
 * 跟思考過程的 resolvePendingThinkingCollapsed 同語意：只認「還沒寫完的那則
 * AI 氣泡」的展開狀態，寫完的上一則不算數（那是上一輪的，不該影響新的一則）。
 */
export function resolvePendingPrepTrailCollapsed(
  talkList: Array<{ type?: number; chatFinish?: boolean; prepTrailCollapsed?: boolean }> | undefined,
  fallbackCollapsed: boolean | undefined,
): boolean {
  const fallback = fallbackCollapsed !== false
  if (!Array.isArray(talkList) || talkList.length === 0) return fallback
  const last = talkList[talkList.length - 1]
  if (last && last.type === 0 && last.chatFinish !== true && last.prepTrailCollapsed === false) {
    return false
  }
  return fallback
}

export function applyReplayPassBlocks(messages: any[], chatId: string | number, rawReplay: unknown): number {
  const body = unwrapResponseBody(rawReplay)
  if (!Array.isArray(body.passBlocks)) return 0
  return body.passBlocks.reduce(
    (count: number, block: unknown) => count + (attachPassBlock(messages, block, chatId) ? 1 : 0),
    0,
  )
}

/**
 * 把伺服器送回的準備軌跡掛到對應的訊息上。
 *
 * 這是「重整之後軌跡還在」的客戶端那一半。先前軌跡只活在記憶體裡，重整就沒了，
 * 而使用者已經為那段過程付過錢——同一則訊息上的思考過程活得下來，正是因為它落盤。
 *
 * 伺服器送的是 `{ [operationId]: step[] }`，而訊息認的是 chatId，所以用
 * `operations[]` 當中介：它同時帶 assistantChatId 與 sourceChatId。
 *
 * 中斷的那一輪沒有 AI 列，軌跡就掛在使用者那則上——否則使用者付了錢卻看不到
 * 任何過程，正是這條線要修的症狀。
 *
 * **不覆蓋已經在畫面上的軌跡**：串流剛結束那一刻，記憶體那份比伺服器新
 * （伺服器可能還沒寫完最後一步），用舊的蓋掉新的畫面會倒退。
 *
 * 欄位不存在是常態（沒有 agent 輪次的那些頁）。判斷用「有沒有鍵」而不是
 * truthiness，避免「空物件」與「沒有」走進不同分支。
 */
export function applyServerPrepTraces(
  messages: any[],
  operations: any[] | undefined,
  traces: Record<string, any[]> | undefined,
): any[] {
  if (!Array.isArray(messages)) return []
  if (!traces || !Array.isArray(operations)) return messages
  const traceKeys = Object.keys(traces)
  if (!traceKeys.length) return messages

  // chatId → 軌跡。優先掛 AI 列；沒有 AI 列（中斷）才退回來源列。
  const byChatId = new Map<string, any[]>()
  for (const operation of operations) {
    if (!operation || typeof operation !== 'object') continue
    const trail = traces[String(operation.operationId ?? '')]
    if (!Array.isArray(trail) || !trail.length) continue
    const target = operation.assistantChatId || operation.sourceChatId
    const key = target == null ? '' : String(target)
    if (key) byChatId.set(key, trail)
  }
  if (!byChatId.size) return messages

  return messages.map(row => {
    if (!row || typeof row !== 'object') return row
    if (Array.isArray(row.prepTrail) && row.prepTrail.length) return row
    // **id 與 chatId 兩個都要查。**
    //
    // 真實的訊息列把 chat UUID 放在 `id`，而且根本沒有 `chatId` 欄位——只查
    // chatId 的話這個函式在線上是徹底的 no-op，而單元測試會照樣全綠。
    // 這正是第一版的實際情況（2026-08-08 QA 抓到）：伺服器有送、DOM 沒掛上。
    //
    // 隔壁的 carryPrepTrailAcrossHistoryRebuild 一直是兩個都收，我寫新的時候
    // 只看了一個。
    const trail = byChatId.get(String(row.id ?? '')) || byChatId.get(String(row.chatId ?? ''))
    if (!trail) return row
    // 沒記過就當收起：重建不該替使用者把面板展開。
    return { ...row, prepTrail: trail, prepTrailCollapsed: true }
  })
}
