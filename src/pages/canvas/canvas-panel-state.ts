/**
 * 底部功能面板（＋ 呼出的那一片）與彈層的狀態。
 *
 * 兩層是分開的：面板是貼在輸入區上的一片格子，彈層是蓋住整頁的底部抽屜。
 * 規則只有三條，但每一條都是玩家按下去才會發現不對的那種，所以放在這裡讓測試
 * 直接問，而不是散在元件的 if 裡：
 *
 *   1. 開彈層就收面板——兩層疊著，玩家看不出剛剛點到的是哪一個。
 *   2. 同時只有一個彈層——第二個要蓋上來就換掉第一個，不做堆疊。
 *   3. ESC 由外往內關——先關彈層，再關面板。兩層都關著時什麼都不做：ESC 是
 *      卡片也會用的鍵，沒有東西可關就不要吃掉它。
 *
 * 輸入區的展開／折疊不在這裡：它看的是輸入框有沒有焦點，跟這兩層互不相干。
 */

/** '' 代表沒有彈層。 */
export type CanvasSheet =
  | ''
  /** 模型設定：換模型與線路、上下文檔位、思考深度、Agent 模式 */
  | 'model'
  /** 歷史對話 */
  | 'conversations'
  /** 用戶人設：稱呼、性別、自我介紹 */
  | 'persona'
  /** 自訂指令（這段對話一直有效的要求） */
  | 'directives'
  /** AI 筆記 */
  | 'notepad'
  /** 這則回覆的組成（上下文 chip 點開的那一片） */
  | 'context-breakdown'
  /** AI 記事本／永久記憶（AI 自己每輪記下的記錄） */
  | 'memory'
  /** 更換背景 */
  | 'background'
  /** 字體：跟隨卡片／文楷／系統 */
  | 'font'
  /** 一次性確認（重置聊天、開新對話） */
  | 'confirm'

export interface CanvasPanelState {
  /** ＋ 面板開著嗎 */
  more: boolean
  /** 現在是哪一個彈層 */
  sheet: CanvasSheet
}

export function createPanelState(): CanvasPanelState {
  return { more: false, sheet: '' }
}

export function toggleMore(state: CanvasPanelState): CanvasPanelState {
  return { ...state, more: !state.more }
}

export function closeMore(state: CanvasPanelState): CanvasPanelState {
  return { ...state, more: false }
}

export function openSheet(state: CanvasPanelState, sheet: CanvasSheet): CanvasPanelState {
  return { more: false, sheet }
}

export function closeSheet(state: CanvasPanelState): CanvasPanelState {
  return { ...state, sheet: '' }
}

export function isAnyOverlayOpen(state: CanvasPanelState): boolean {
  return Boolean(state.more) || Boolean(state.sheet)
}

export function onEscape(state: CanvasPanelState): CanvasPanelState {
  if (state.sheet) return closeSheet(state)
  if (state.more) return closeMore(state)
  return state
}
