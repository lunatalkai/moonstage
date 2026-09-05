/**
 * 「+」面板每一格的圖示。
 *
 * MMD 的面板每格有一張圖，作者的卡對圖示槽（.item-icon 裡的 uni-image）畫了邊框與底色；
 * 我們先前槽裡是空的——美化完就是一排空框（owner 2026-09-05 截圖）。
 * 這裡給每個 key 一個線條圖示：stroke 走 currentColor，跟著卡片的文字色走；
 * 沒對到的 key 用一個通用的點陣圖示，不留空框。
 */
const STROKE = 'fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"'

const ICONS: Record<string, string> = {
  // 模型設定：滑桿
  model: '<line x1="4" y1="7" x2="20" y2="7"/><line x1="4" y1="17" x2="20" y2="17"/><circle cx="9" cy="7" r="2.2"/><circle cx="15" cy="17" r="2.2"/>',
  // 用戶人設：人
  persona: '<circle cx="12" cy="8" r="3.6"/><path d="M4.5 20a7.5 7.5 0 0 1 15 0"/>',
  // 長期指令：清單勾
  directives: '<path d="M4 7h10M4 12h10M4 17h7"/><path d="M16 15.5l2 2 3.5-4"/>',
  // 手帳：筆記本
  notepad: '<rect x="5" y="3.5" width="14" height="17" rx="2"/><line x1="9" y1="3.5" x2="9" y2="20.5"/><path d="M12.5 8.5h3M12.5 12h3"/>',
  // AI 筆記／永久記憶：便條
  memory: '<path d="M5 4h11l3 3v13H5z"/><path d="M16 4v3h3"/><path d="M8.5 11h7M8.5 14.5h7"/>',
  // 存檔並開新對話：存檔
  'new-chat': '<path d="M5 4h11l3 3v13H5z"/><path d="M8 4v5h7V4"/><rect x="8" y="13" width="8" height="4"/>',
  // 讀檔：資料夾
  conversations: '<path d="M3.5 7a1.5 1.5 0 0 1 1.5-1.5h4.5l2 2H19a1.5 1.5 0 0 1 1.5 1.5v9A1.5 1.5 0 0 1 19 19.5H5A1.5 1.5 0 0 1 3.5 18z"/>',
  // 分叉存檔：分岔
  'fork-archive': '<circle cx="7" cy="5" r="2"/><circle cx="17" cy="5" r="2"/><circle cx="12" cy="19" r="2"/><path d="M7 7v2a3 3 0 0 0 3 3h4a3 3 0 0 0 3-3V7M12 12v5"/>',
  // 更換背景：圖片
  background: '<rect x="3.5" y="5" width="17" height="14" rx="2"/><circle cx="9" cy="10" r="1.6"/><path d="M20 16l-4.5-4.5L8 19"/>',
  // 重置聊天：循環
  'reset-chat': '<path d="M20 12a8 8 0 1 1-2.34-5.66"/><path d="M20 4v5h-5"/>',
  // 匯出聊天：下載
  export: '<path d="M12 4v11"/><path d="M7.5 10.5L12 15l4.5-4.5"/><path d="M5 19h14"/>',
  // 回到最新：向下
  bottom: '<path d="M12 5v13"/><path d="M6.5 12.5L12 18l5.5-5.5"/>',
}

const FALLBACK = '<circle cx="6" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="18" cy="12" r="1.6"/>'

export function panelIconSvg(key: string): string {
  const body = ICONS[String(key || '')] || FALLBACK
  return `<svg viewBox="0 0 24 24" ${STROKE} aria-hidden="true" focusable="false">${body}</svg>`
}

export function hasPanelIcon(key: string): boolean {
  return Object.prototype.hasOwnProperty.call(ICONS, String(key || ''))
}
