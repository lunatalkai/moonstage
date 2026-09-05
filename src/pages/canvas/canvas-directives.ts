/**
 * 長期指令的清單狀態。
 *
 * 「這段對話一直有效的要求」——每一輪都會帶上去，所以它跟一次性的訊息不同：
 * 加、改、刪都是立刻生效的動作，玩家按下去之後畫面上要看得出來發生了什麼。
 *
 * 抽成純函式的理由是這幾條規則都只在邊界上出錯，而邊界很難在瀏覽器裡踩到：
 * 上限到了還讓人按新增（送出去被伺服器擋，玩家只看到一句失敗）、對話還沒建立
 * 就送出（400，看起來像壞了）、編輯中又點另一條（兩條同時進編輯態）。
 */

export interface DirectiveItem {
  sourceId: string
  text: string
  /** 'manual'＝玩家自己寫的；其餘是系統從對話裡整理出來的 */
  origin?: string
  status?: string
}

export interface DirectiveState {
  loading: boolean
  loadFailed: boolean
  list: DirectiveItem[]
  maxCount: number
  maxLength: number
  /** 正在編輯哪一條；'' ＝沒有 */
  editingSourceId: string
  editingText: string
  /** 底下那格還沒送出的字 */
  draft: string
  /** 留在面板裡的錯誤訊息。彈層蓋在提示之上，提示會被藏在後面。 */
  error: string
}

/**
 * 上限的預設值只是「還不知道」時的佔位。真正的數字由伺服器每次回傳——
 * 寫死在客戶端的話，伺服器放寬之後玩家會被一個已經不存在的限制擋住。
 */
export const DIRECTIVE_FALLBACK_MAX_COUNT = 10
export const DIRECTIVE_FALLBACK_MAX_LENGTH = 200

export function createDirectiveState(): DirectiveState {
  return {
    loading: false,
    loadFailed: false,
    list: [],
    maxCount: DIRECTIVE_FALLBACK_MAX_COUNT,
    maxLength: DIRECTIVE_FALLBACK_MAX_LENGTH,
    editingSourceId: '',
    editingText: '',
    draft: '',
    error: '',
  }
}

/** 伺服器回的清單在 `list` 這個鍵底下，不是 `directives`。 */
export function readDirectiveResponse(raw: any): Pick<DirectiveState, 'list' | 'maxCount' | 'maxLength'> {
  const src = raw && typeof raw === 'object' ? raw : {}
  const list = Array.isArray(src.list) ? src.list : []
  const maxCount = Number(src.maxCount)
  const maxLength = Number(src.maxLength)
  return {
    list: list
      .filter((row: any) => row && row.sourceId)
      .map((row: any) => ({
        sourceId: String(row.sourceId),
        text: String(row.text || ''),
        origin: String(row.origin || ''),
        status: String(row.status || ''),
      })),
    maxCount: Number.isFinite(maxCount) && maxCount > 0 ? maxCount : DIRECTIVE_FALLBACK_MAX_COUNT,
    maxLength: Number.isFinite(maxLength) && maxLength > 0 ? maxLength : DIRECTIVE_FALLBACK_MAX_LENGTH,
  }
}

/** 「(3/10)」那個數字。 */
export function directiveCountText(state: DirectiveState): string {
  return `(${state.list.length}/${state.maxCount})`
}

export type DirectiveBlockReason = '' | 'no-conversation' | 'limit' | 'empty' | 'too-long'

/**
 * 現在按得下新增嗎？按不下時回一個原因，讓畫面把原因寫出來。
 *
 * 對話還沒建立是最容易被漏掉的一種：選開場白的玩家還沒開始對話，指令沒有地方
 * 掛。這時候不能只是把鍵變灰——玩家不知道要等什麼。
 */
export function addBlockReason(state: DirectiveState, hasConversation: boolean): DirectiveBlockReason {
  if (!hasConversation) return 'no-conversation'
  if (state.list.length >= state.maxCount) return 'limit'
  if (!String(state.draft || '').trim()) return 'empty'
  if (String(state.draft).length > state.maxLength) return 'too-long'
  return ''
}

export function canAddDirective(state: DirectiveState, hasConversation: boolean): boolean {
  return addBlockReason(state, hasConversation) === ''
}

/** 一次只有一條在編輯態：兩條同時可編輯時，玩家分不出剛剛改的是哪一條。 */
export function startEditDirective(state: DirectiveState, item: DirectiveItem): DirectiveState {
  return { ...state, editingSourceId: item.sourceId, editingText: item.text, error: '' }
}

export function cancelEditDirective(state: DirectiveState): DirectiveState {
  return { ...state, editingSourceId: '', editingText: '', error: '' }
}

/** 改成空白等於刪掉，但玩家按的是「儲存」——不要替他做刪除這個決定。 */
export function canSaveEdit(state: DirectiveState): boolean {
  const text = String(state.editingText || '').trim()
  return Boolean(state.editingSourceId) && Boolean(text) && text.length <= state.maxLength
}
