/**
 * 多條開場白。
 *
 * 酒館的玩家習慣是：第一句還沒開始對話之前，可以左右換一條開場白再開始。
 * 卡片裡那組字叫 alternate_greetings，畫面上是 `.swipe_left / .swipes-counter /
 * .swipe_right`。我們照這個習慣做。MMD 沒有這個功能——它資料層那個字串陣列
 * （prologue）是另一件事：「你可以选择开场」給玩家挑的第一句話，點了填進輸入框、
 * 由玩家送出（見下方 buildPrologueList）。2026-09-04 作者回報的事故正是把兩者混成
 * 一個：玩家一點開場選項，第一則訊息就被換掉。
 *
 * 一個關鍵時序：伺服器是在 `conversation/start` 當下建立對話並落下開場白的。
 * 所以有替代開場白的卡必須**等到玩家真的送出第一句**才 start，並把選到的
 * 索引一起帶上；沒有替代開場白的卡維持原本行為（進頁面就 start），
 * 免得每張卡都多一次「按了送出才建立對話」的延遲。
 */

export interface GreetingState {
  /** 主開場白 + 替代開場白，主的永遠在 index 0 */
  list: string[]
  /** 目前選到第幾條 */
  index: number
}

/** 我方自訂的上限。酒館原始碼沒有上限，但無上限的清單在 UI 上沒有意義。 */
export const MAX_GREETINGS = 20

/**
 * 從角色詳情組出開場白清單。
 *
 * `welcomeAlternates` 在舊版伺服器上不存在——那不是錯誤，是「這台伺服器還沒有
 * 這個欄位」，一律當成空陣列。
 */
export function buildGreetingList(detail: any): string[] {
  const main = typeof detail?.roleWelcome === 'string' ? detail.roleWelcome : ''
  const rawAlternates = detail?.welcomeAlternates ?? detail?.roleWelcomeAlternates
  const alternates = Array.isArray(rawAlternates)
    ? rawAlternates.filter((s: any) => typeof s === 'string' && s.trim() !== '')
    : []
  const list = main ? [main, ...alternates] : alternates.slice()
  return list.slice(0, MAX_GREETINGS)
}

/** 有沒有得選。只有一條就不畫箭頭與計數器。 */
export function hasAlternates(list: string[]): boolean {
  return list.length > 1
}

/** 左右切換。到頭到尾就停住，不繞回去——繞回去會讓「第 1／5」失去方向感。 */
export function stepGreeting(state: GreetingState, delta: number): number {
  if (!state.list.length) return 0
  const next = state.index + delta
  if (next < 0) return 0
  if (next > state.list.length - 1) return state.list.length - 1
  return next
}

/**
 * 這張卡要不要把 start 押後到第一次送出。
 *
 * 只有「有得選」才押後：沒得選卻押後，玩家看到的是一個空白對話頁，
 * 而他什麼都還沒做錯。
 */
export function shouldDeferStart(list: string[]): boolean {
  return hasAlternates(list)
}

/**
 * 送出時要帶的 greetingIndex。0 是主開場白，也是伺服器的預設值。
 * 沒有替代開場白時不帶——舊版伺服器收到未知欄位不一定友善。
 */
export function greetingIndexForStart(state: GreetingState): number | undefined {
  if (!hasAlternates(state.list)) return undefined
  return state.index
}

// ── 開場選項（MMD prologue）──────────────────────────────────────────────
//
// MMD 實測（2026-09-04，以訪客身分開一張公開卡）：「你可以选择开场」是 .chat-body 裡訊息列
// 之後的獨立區塊；點一條＝把輸入框的字**換成**那一條（不是追加），區塊留著、不送出、
// 不動 AI 的開場白。它跟替代開場白是兩份資料（伺服器 role/detail 分別回 prologue 與
// welcomeAlternates），畫面上也是兩個機制：這裡不押後開對話、不帶 greetingIndex。

/** 伺服器端上限一致；再多的清單在畫面上也沒有意義。 */
export const MAX_PROLOGUE = 20

/** 從角色詳情組出開場選項。舊版伺服器沒有這個欄位＝空陣列，不是錯誤。 */
export function buildPrologueList(detail: any): string[] {
  const raw = detail?.prologue
  if (!Array.isArray(raw)) return []
  return raw
    .filter((s: any) => typeof s === 'string' && s.trim() !== '')
    .slice(0, MAX_PROLOGUE)
}

/**
 * 區塊什麼時候在畫面上。
 *
 * 有選項、而且玩家還沒說過第一句：一旦他送出了（自己打的或挑的），「選開場」就沒有
 * 意義了。只看有沒有使用者訊息、不看對話有沒有建立——有替代開場白的卡是押後開對話的，
 * 那時對話還不存在，但開場選項照樣要能挑。
 */
export function shouldShowPrologue(prologue: string[], messages: Array<{ type?: any } | null | undefined>): boolean {
  if (!prologue.length) return false
  return !messages.some((m) => m && String(m.type) === '1')
}
