/**
 * uni.showModal 的 LunaTalk 預設按鈕色。
 *
 * uni-h5 把按鈕文字色寫進 inline style，CSS 只能用 !important 蓋掉——但那會把
 * 危險操作（刪除 / 移除確認）刻意傳入的紅色一起吃掉，警示語義就沒了。
 * 因此改在呼叫端補預設值：沒傳的拿品牌色，傳了的原樣保留。
 *
 * 內建預設是 confirmColor #007AFF（iOS 藍，在暗底對比僅約 3.6:1）與
 * cancelColor #000（暗底上根本看不見），兩個都不適合 LunaTalk 的暗色介面。
 *
 * 樣式面（面板 / 遮罩 / 圓角）在 common/uni-modal.css，僅 H5 生效；
 * APP-PLUS 走系統原生彈窗，一致性只靠這裡的顏色參數。
 */
export const LUNA_CONFIRM_COLOR = '#F5C542'
export const LUNA_CANCEL_COLOR = 'rgba(232, 234, 237, 0.72)'

type ModalOptions = Record<string, unknown>

export function withModalDefaults<T extends ModalOptions>(options: T): T {
  return {
    confirmColor: LUNA_CONFIRM_COLOR,
    cancelColor: LUNA_CANCEL_COLOR,
    ...(options || {}),
  } as T
}

/**
 * 包住全域 uni.showModal，讓 180+ 處既有呼叫不必逐處改就拿到品牌預設色。
 * 重複安裝是安全的（用標記位擋住二次包裝）。
 */
const INSTALLED = '__lunaModalDefaults'

export function installModalDefaults(target: { showModal?: unknown } | undefined): void {
  if (!target || typeof target.showModal !== 'function') return
  if ((target as Record<string, unknown>)[INSTALLED]) return
  const original = target.showModal as (o: ModalOptions) => unknown
  target.showModal = ((options: ModalOptions) => original(withModalDefaults(options || {}))) as never
  ;(target as Record<string, unknown>)[INSTALLED] = true
}
