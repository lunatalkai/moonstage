/**
 * 畫布的宿主選擇器契約。
 *
 * 作者的卡片（CSS／JS）是照別的平台寫的：它不知道我們的內部結構，只知道它在
 * 原平台抓得到什麼。所以這份表不是「我們的 class 命名」，是「作者手上那張卡
 * 會打到的名字」——每一條都來自實測的卡片樣式與腳本，不是憑空對齊。
 *
 * 三組別名同時掛在同一個節點上：
 *   primary  MMD 名（卡片實際打得到宿主 chrome 的那一套，作者的期待在這裡）
 *   alias    SillyTavern 名（訊息層是作者的語彙；chrome 層只服務主題移植）
 *   data-lt  我方穩定鉤子（改版不動，class 名不做承諾）
 *
 * 這份表是機器讀的：contract spec 逐條掛載對應區塊、逐條查詢，缺一條就紅。
 * 加節點時把它寫進這裡，不要只寫進模板——否則下一個人重構時會靜默拿掉。
 */

/** 一個可獨立掛載的畫布區塊。spec 依這個名字決定掛哪個元件。 */
export type CanvasRegion =
  | 'header'
  | 'stage'
  | 'intro'
  | 'message'
  | 'prologue'
  | 'composer'
  | 'menu'
  /** 「＋」呼出的功能面板（住在 .chat-bottom 裡，跟輸入區同一個元件） */
  | 'panel'
  /** 彈層的殼（遮罩 + .u-popup__content） */
  | 'popup'
  /** 模型設定 */
  | 'model-panel'
  /** 一次性確認 */
  | 'confirm'
  /** 一疊選項（更換背景） */
  | 'modify'
  /** 歷史對話 */
  | 'conversations'
  /** 用戶人設 */
  | 'persona'
  /** 自訂指令（長期指令） */
  | 'directives'
  /** AI 筆記 */
  | 'notepad'
  /** 這則回覆的組成 */
  | 'context-breakdown'
  /** AI 記事本／永久記憶 */
  | 'memory'

export interface CanvasSelectorEntry {
  /** CSS 選擇器，必須能在該區塊掛載後查得到 */
  selector: string
  /** 屬於哪個區塊 */
  region: CanvasRegion
  /** 這條是誰的語彙 */
  origin: 'mmd' | 'st' | 'lt'
  /** 為什麼要有它（給改動的人看，spec 不讀） */
  why: string
}

/**
 * 作者已知會 `display:none` 掉的節點。
 *
 * 節點不存在 → 規則靜默失效，作者只看得到「引擎壞了」。所以這幾個即使我們沒有
 * 對應功能也要留一個空節點在 DOM 裡。
 */
export const ALWAYS_PRESENT_SELECTORS = [
  '.item.Ai.avatar-body',
  '.ai-assistant',
  '.header-badge',
  // 一條指令都沒有時作者仍然會對這句話寫外觀；節點被 v-if 拿掉的話那條規則
  // 命中零個，作者只看得到「引擎壞了」。收起來用 hidden，不要拿掉節點。
  '.empty-default-show',
  '.edit-scope',
] as const

export const CANVAS_SELECTOR_CONTRACT: CanvasSelectorEntry[] = [
  // ── 頂欄 ────────────────────────────────────────────────────────────
  { selector: '.topTabbar', region: 'header', origin: 'mmd', why: '卡片寫 .kg .topTabbar 換頂欄底色' },
  { selector: '#top-bar', region: 'header', origin: 'st', why: '酒館主題移植' },
  { selector: '[data-lt="header"]', region: 'header', origin: 'lt', why: '我方穩定鉤子' },
  { selector: '.header-box', region: 'header', origin: 'mmd', why: '頂欄內層，卡片用它定位' },
  { selector: '.header-scope', region: 'header', origin: 'mmd', why: '卡片寫 .kg .header-scope .header-box .icon-back' },
  { selector: '.icon-back', region: 'header', origin: 'mmd', why: '卡片替返回鍵上色（filter）' },
  { selector: '[data-lt="back"]', region: 'header', origin: 'lt', why: '我方穩定鉤子' },
  { selector: '.header-center', region: 'header', origin: 'mmd', why: '卡片寫 .header-center{min-width:90px}' },
  { selector: '.header-role-img', region: 'header', origin: 'mmd', why: '頂欄頭像；卡片改尺寸與圓角' },
  { selector: '.header-role-img uni-image', region: 'header', origin: 'mmd', why: '卡片寫 .header-role-img uni-image div' },
  { selector: '[data-lt="avatar"]', region: 'header', origin: 'lt', why: '我方穩定鉤子' },
  { selector: '.header-roleName', region: 'header', origin: 'mmd', why: '卡片改角色名字體與顏色' },
  { selector: '[data-lt="title"]', region: 'header', origin: 'lt', why: '我方穩定鉤子' },
  { selector: '.header-icon-meun', region: 'header', origin: 'mmd', why: '頂欄功能鍵列' },
  { selector: '.header-meun', region: 'header', origin: 'mmd', why: '卡片替功能鍵上色' },
  { selector: '.header-meun-rating', region: 'header', origin: 'mmd', why: '分級鍵，卡片用它找 .header-badge' },
  { selector: '.header-badge', region: 'header', origin: 'mmd', why: '作者常整顆隱藏；節點必須在' },
  { selector: '[data-lt="header-actions"]', region: 'header', origin: 'lt', why: '我方穩定鉤子' },

  // ── 舞台（背景／捲動／訊息列容器）──────────────────────────────────
  { selector: '.chat-scope-box', region: 'stage', origin: 'mmd', why: '卡片寫 background-image 換整頁背景' },
  { selector: '#bg1', region: 'stage', origin: 'st', why: '酒館背景層別名' },
  { selector: '[data-lt="page"]', region: 'stage', origin: 'lt', why: '我方穩定鉤子（背景層）' },
  { selector: '#scrollview', region: 'stage', origin: 'mmd', why: 'MMD 捲動容器' },
  { selector: '.scroll-view', region: 'stage', origin: 'mmd', why: '同上，class 形態' },
  { selector: '#chat', region: 'stage', origin: 'st', why: '酒館訊息柱；與 #msglistview 不同節點以免 id 撞名' },
  { selector: '#msglistview', region: 'stage', origin: 'mmd', why: 'MMD 訊息列容器' },
  { selector: '.chat-body', region: 'stage', origin: 'mmd', why: '同上，class 形態' },
  { selector: '[data-lt="chat"]', region: 'stage', origin: 'lt', why: '我方穩定鉤子' },
  { selector: '[data-lt="canvas"]', region: 'stage', origin: 'lt', why: '作者資產根' },

  // ── 角色介紹（第一則特殊訊息）──────────────────────────────────────
  { selector: '.item.Ai.avatar-body', region: 'intro', origin: 'mmd', why: '作者註解寫明「不要顯示就刪這行」' },
  { selector: '[data-lt="description"]', region: 'intro', origin: 'lt', why: '我方穩定鉤子' },

  // ── 訊息 ────────────────────────────────────────────────────────────
  { selector: '.item.Ai', region: 'message', origin: 'mmd', why: 'AI 訊息列' },
  { selector: '.mes', region: 'message', origin: 'st', why: '酒館訊息列；匯入器與主題的錨點' },
  { selector: '.mes[mesid]', region: 'message', origin: 'st', why: '酒館用 mesid 定位' },
  { selector: '.mes[is_user="false"]', region: 'message', origin: 'st', why: '酒館用屬性分辨誰說的，不是 class' },
  { selector: '.mes[ch_name]', region: 'message', origin: 'st', why: '酒館主題讀角色名' },
  { selector: '[data-lt="message"]', region: 'message', origin: 'lt', why: '我方穩定鉤子' },
  { selector: '.mesAvatarWrapper', region: 'message', origin: 'st', why: '酒館頭像外框' },
  { selector: '.avatar', region: 'message', origin: 'st', why: '訊息內頭像（與頂欄頭像是不同物件）' },
  { selector: '.mes_block', region: 'message', origin: 'st', why: '酒館訊息主體' },
  { selector: '.touch-scope', region: 'message', origin: 'mmd', why: 'MMD 訊息主體（長按落點）' },
  { selector: '.ch_name', region: 'message', origin: 'st', why: '酒館名字列' },
  { selector: '.name_text', region: 'message', origin: 'st', why: '酒館卡唯一碰得到的角色名節點' },
  { selector: '.content.left', region: 'message', origin: 'mmd', why: 'AI 氣泡；卡片直接改它的底色與邊框' },
  { selector: '.mes_text', region: 'message', origin: 'st', why: '酒館訊息正文，卡片 HTML 的唯一落點' },
  { selector: '[data-lt="bubble"]', region: 'message', origin: 'lt', why: '我方穩定鉤子' },
  { selector: '.select-box', region: 'message', origin: 'mmd', why: 'MMD 每則訊息的動作區，常駐 DOM' },
  { selector: '.mes_buttons', region: 'message', origin: 'st', why: '酒館常駐動作列（opacity .3 → hover 1）' },
  // 動作列住在 .mes_block 的文流裡、氣泡之後（owner 2026-09-04：右上角會被作者的面板蓋住）。
  { selector: '.mes_block > .select-box.mes_buttons', region: 'message', origin: 'lt', why: '動作列在訊息主體的文流裡，不再絕對定位在角落' },
  { selector: '[data-lt="message-actions"]', region: 'message', origin: 'lt', why: '我方穩定鉤子' },
  { selector: '.lt-msg-regen', region: 'message', origin: 'lt', why: '重新生成（只有最新一則 AI 有）' },
  { selector: '[data-lt="message-regenerate"]', region: 'message', origin: 'lt', why: '我方穩定鉤子' },
  { selector: '.lt-context-chip', region: 'message', origin: 'lt', why: '這一輪的上下文用量（只露百分比與等級；沒有資料就不畫）' },
  { selector: '[data-lt="context-usage"]', region: 'message', origin: 'lt', why: '我方穩定鉤子' },
  { selector: '.extraMesButtonsHint', region: 'message', origin: 'st', why: '三個點（在我們這裡是「更多」，呼出浮層）' },
  { selector: '.extraMesButtons', region: 'message', origin: 'st', why: '展開後的動作' },
  { selector: '.mes_copy', region: 'message', origin: 'st', why: '複製' },
  { selector: '.mes_edit', region: 'message', origin: 'st', why: '編輯' },
  { selector: '.swipe_left', region: 'message', origin: 'st', why: '開場白左切換' },
  { selector: '.swipe_right', region: 'message', origin: 'st', why: '開場白右切換' },
  { selector: '.swipes-counter', region: 'message', origin: 'st', why: '第 k／n' },
  { selector: '.mes_reasoning_details', region: 'message', origin: 'st', why: '思考區塊外框' },
  { selector: '.mes_reasoning', region: 'message', origin: 'st', why: '思考內容' },
  // 開場選項：MMD 實測是 .chat-body 裡訊息列之後的獨立區塊，不在任何一則訊息裡。
  { selector: '.prologue-scope', region: 'prologue', origin: 'mmd', why: 'MMD「你可以选择开场」區塊；卡片寫 .prologue-scope .prologue-content 改底色邊框' },
  { selector: '.prologue-title', region: 'prologue', origin: 'mmd', why: '標題「你可以選擇開場」' },
  { selector: '.prologue-content', region: 'prologue', origin: 'mmd', why: '一條玩家可挑的第一句話；點了填進輸入框，由玩家送出——不是換開場白' },
  { selector: '[data-lt="prologue"]', region: 'prologue', origin: 'lt', why: '我方穩定鉤子' },

  // ── 輸入區 ──────────────────────────────────────────────────────────
  { selector: '.chat-bottom', region: 'composer', origin: 'mmd', why: '卡片改底部整塊底色' },
  { selector: '.chat-bottom-wapper', region: 'composer', origin: 'mmd', why: 'MMD 拼字如此，照抄' },
  { selector: '.shortcut-bar-wrapper', region: 'composer', origin: 'mmd', why: '快捷欄外框' },
  { selector: '.shortcut-bar', region: 'composer', origin: 'mmd', why: '快捷欄' },
  { selector: '.shortcut-btn', region: 'composer', origin: 'mmd', why: '快捷鍵' },
  { selector: '.sb-icon', region: 'composer', origin: 'mmd', why: '快捷鍵圖示' },
  { selector: '.sb-text', region: 'composer', origin: 'mmd', why: '快捷鍵文字' },
  { selector: '.shortcut-button-scope .item', region: 'composer', origin: 'mmd', why: '卡片實際寫的是這組舊名，兩套都要在' },
  { selector: '[data-lt="function-bar"]', region: 'composer', origin: 'lt', why: '我方穩定鉤子' },
  { selector: '.send-msg', region: 'composer', origin: 'mmd', why: '卡片改輸入區底色；腳本用它找送出鍵' },
  { selector: '#send_form', region: 'composer', origin: 'st', why: '酒館輸入區外框' },
  { selector: '[data-lt="composer"]', region: 'composer', origin: 'lt', why: '我方穩定鉤子' },
  { selector: '.ai-assistant', region: 'composer', origin: 'mmd', why: '作者整顆隱藏；節點必須在' },
  { selector: '.beta-badge', region: 'composer', origin: 'mmd', why: '同上；幫答每次的點數' },
  { selector: '.ai-assistant .tooltip', region: 'composer', origin: 'mmd', why: '幫答提示「不知道怎么回答？让AI来帮你吧」；卡片改它的底色' },
  { selector: '.ai-assistant .tooltip-arrow', region: 'composer', origin: 'mmd', why: '提示框的小箭頭' },
  { selector: '.send-msg > .uni-textarea', region: 'composer', origin: 'mmd', why: '輸入區外層；狀態 class is-expanded／is-multiline 掛在它與 .chat-input-scope 兩處' },
  { selector: '.chat-input-scope.has-toolbar', region: 'composer', origin: 'mmd', why: '卡片寫 .chat-input-scope.has-toolbar 改折疊態版面' },
  { selector: '.chat-input-toolbar', region: 'composer', origin: 'mmd', why: '展開態的貼上／清空工具列' },
  { selector: '.chat-input-tool-btn', region: 'composer', origin: 'mmd', why: '工具列按鈕；卡片改底色邊框' },
  { selector: '.chat-input-collapsed-display', region: 'composer', origin: 'mmd', why: '折疊態的一行預覽，點了展開' },
  { selector: '.chat-input-bottom-row', region: 'composer', origin: 'mmd', why: '展開態底列（mind-type｜送出鍵）' },
  { selector: '.chat-input-scope', region: 'composer', origin: 'mmd', why: '卡片改輸入框外觀與 :focus-within' },
  { selector: '#chat-input-scope', region: 'composer', origin: 'mmd', why: '同上，id 形態' },
  { selector: '.chatMsgTextarea', region: 'composer', origin: 'mmd', why: "卡片腳本 querySelector('.chatMsgTextarea textarea')" },
  { selector: '.uni-textarea-wrapper', region: 'composer', origin: 'mmd', why: '卡片改內距與高度' },
  { selector: '.uni-textarea-placeholder.input-placeholder', region: 'composer', origin: 'mmd', why: 'MMD 的 placeholder 是節點不是偽元素' },
  { selector: 'textarea.uni-textarea-textarea', region: 'composer', origin: 'mmd', why: "卡片腳本 querySelector('.uni-textarea-textarea') 寫值再 dispatch input" },
  { selector: '#send_textarea', region: 'composer', origin: 'st', why: '酒館輸入框' },
  { selector: '.send-msg .btn-icon', region: 'composer', origin: 'mmd', why: "卡片腳本 querySelector('.send-msg .btn-icon') 後原生點擊送出" },
  { selector: '.chat-send-proxy', region: 'composer', origin: 'mmd', why: '送出鍵' },
  { selector: '#send_but', region: 'composer', origin: 'st', why: '酒館送出鍵' },
  { selector: '[data-lt="send"]', region: 'composer', origin: 'lt', why: '我方穩定鉤子' },
  { selector: '#mes_stop', region: 'composer', origin: 'st', why: '停止鍵；I-2 永遠可達' },
  { selector: '[data-lt="stop"]', region: 'composer', origin: 'lt', why: '我方穩定鉤子' },
  { selector: '.chat-input-collapsed-row', region: 'composer', origin: 'mmd', why: '輸入框下的收合列' },
  { selector: '.mind-type', region: 'composer', origin: 'mmd', why: '卡片改它的顏色；點它開模型設定' },
  { selector: '.mind-type-score', region: 'composer', origin: 'mmd', why: '這一輪要花的點數；卡片改字級與顏色' },
  { selector: '.icon-box', region: 'composer', origin: 'mmd', why: '卡片替圖示上色' },
  { selector: '.icon-battery', region: 'composer', origin: 'mmd', why: '點數旁的電量圖示，卡片常換掉它' },
  { selector: '.more-options-scope', region: 'composer', origin: 'mmd', why: '更多選項入口' },
  { selector: '.more-options-scope .btn-icon', region: 'composer', origin: 'mmd', why: '卡片改它的 hover 旋轉' },
  { selector: '#options_button', region: 'composer', origin: 'st', why: '酒館更多選項鍵' },

  // ── 訊息選單／編輯 ──────────────────────────────────────────────────
  { selector: '.msg-option-scope', region: 'menu', origin: 'mmd', why: '長按／三個點呼出的覆蓋層' },
  { selector: '[data-lt="message-menu"]', region: 'menu', origin: 'lt', why: '我方穩定鉤子' },
  { selector: '.msg-content-box', region: 'menu', origin: 'mmd', why: '選單裡的訊息預覽' },
  { selector: '.msg-options-box', region: 'menu', origin: 'mmd', why: '選單本體（貼點浮層時絕對定位在呼出點旁）' },
  { selector: '[data-lt="message-menu-box"]', region: 'menu', origin: 'lt', why: '我方穩定鉤子' },
  { selector: '.option-item', region: 'menu', origin: 'mmd', why: '單一動作' },
  { selector: '.option-item[data-lt-action]', region: 'menu', origin: 'lt', why: '每個動作帶自己的鍵，作者可以只藏其中一個' },
  { selector: '.option-item uni-image', region: 'menu', origin: 'mmd', why: '卡片改動作圖示尺寸' },
  { selector: '.option-separator', region: 'menu', origin: 'mmd', why: '分隔線' },
  { selector: '.msg-modify-scope', region: 'menu', origin: 'mmd', why: '訊息編輯覆蓋層' },
  { selector: '.modify-input-box', region: 'menu', origin: 'mmd', why: '編輯輸入框' },
  { selector: '.confirm-edit-scope', region: 'menu', origin: 'mmd', why: '編輯確認列' },
  { selector: '.confirm-edit-scope .cancel-btn', region: 'menu', origin: 'mmd', why: '取消' },
  { selector: '.confirm-edit-scope .ok-btn', region: 'menu', origin: 'mmd', why: '確定' },
  { selector: '.confirm-edit-scope .btn-gap', region: 'menu', origin: 'mmd', why: '兩鍵之間' },
  { selector: '.edit_textarea', region: 'menu', origin: 'st', why: '酒館編輯框' },

  // ── 「＋」功能面板 ──────────────────────────────────────────────────
  //
  // MMD 的位置是 .chat-bottom 裡、輸入區底下的一片格子，兩端同一份。
  // 作者的卡寫的是 `.chat .chat-bottom .more-scope .item .item-icon`——`.chat`
  // 在頁面根節點上，元件自己掛載時查不到，所以這裡登記到 .chat-bottom 為止。
  { selector: '.more-scope', region: 'panel', origin: 'mmd', why: '功能面板本體' },
  { selector: '.more-scope .item', region: 'panel', origin: 'mmd', why: '一格功能' },
  { selector: '.more-scope .item-icon', region: 'panel', origin: 'mmd', why: '卡片改格子圖示的尺寸與底色' },
  { selector: '.more-scope .item-title', region: 'panel', origin: 'mmd', why: '格子文字' },
  { selector: '.chat-bottom .more-scope .item .item-icon', region: 'panel', origin: 'mmd', why: '卡片寫的是帶 .chat 的完整路徑，面板必須真的住在 .chat-bottom 裡' },

  // ── 彈層的殼 ────────────────────────────────────────────────────────
  { selector: '.u-popup', region: 'popup', origin: 'mmd', why: 'uView 彈層外框' },
  { selector: '.u-mask', region: 'popup', origin: 'mmd', why: '遮罩；點它關閉' },
  { selector: '.u-popup__content', region: 'popup', origin: 'mmd', why: '卡片改彈層底色、圓角與內距' },
  { selector: '.u-popup__content__close.u-popup__content__close--top-right', region: 'popup', origin: 'mmd', why: '右上角關閉；作者常整顆隱藏' },

  // ── 模型設定 ────────────────────────────────────────────────────────
  { selector: '.model-setting-scope', region: 'model-panel', origin: 'mmd', why: '卡片替整片換底色與字色' },
  { selector: '.mp-top', region: 'model-panel', origin: 'mmd', why: '標題列' },
  { selector: '.mp-title', region: 'model-panel', origin: 'mmd', why: '標題' },
  { selector: '.mp-close', region: 'model-panel', origin: 'mmd', why: '關閉' },
  { selector: '.mp-info-bar', region: 'model-panel', origin: 'mmd', why: '現用模型那一列' },
  { selector: '.mp-model-name', region: 'model-panel', origin: 'mmd', why: '現用模型名' },
  { selector: '.mp-energy-pill', region: 'model-panel', origin: 'mmd', why: '一輪多少點的藥丸' },
  { selector: '.mp-ev', region: 'model-panel', origin: 'mmd', why: '點數數字' },
  { selector: '.mp-el', region: 'model-panel', origin: 'mmd', why: '點數單位' },
  { selector: '.mp-setting-body', region: 'model-panel', origin: 'mmd', why: '可捲動的設定區' },
  { selector: '.bottom .btn', region: 'model-panel', origin: 'mmd', why: '卡片寫 .model-setting-scope .bottom .btn 改完成鍵' },
  // 模型清單本身用的是主站那一份選單的節點名（`ms-*`）——那一份原封搬進來，
  // 不重寫。MMD 的模型彈層裡沒有模型清單（它那一片是「輸出 Token 上限」的設定卡），
  // 所以這裡沒有 MMD 名字可以對齊；作者能打到的是外層那副殼。
  // MMD 那一片模型彈層裡的設定卡（`.mp-card` / `.mp-tokens` / `.mp-switch-row`，
  // 它裝的是「輸出 Token 上限」）在我們這裡沒有對應的東西：上下文檔位與思考深度
  // 住在搬進來的那份選單裡，用它自己的節點名。沒有渲染的名字不進契約——
  // 這份表是「作者打得到的名字」，不是「我們想過的名字」。

  // ── 用戶人設 ────────────────────────────────────────────────────────
  { selector: '.role-setting', region: 'persona', origin: 'mmd', why: '卡片寫 .role-setting .card.textarea-wrapper .textarea-dark' },
  { selector: '.role-setting .header-scope', region: 'persona', origin: 'mmd', why: 'MMD 這一頁的標題列（取消／標題／保存）' },
  { selector: '.header-box', region: 'persona', origin: 'mmd', why: '標題列內層' },
  { selector: '.page-title', region: 'persona', origin: 'mmd', why: '標題' },
  { selector: '.complete-btn', region: 'persona', origin: 'mmd', why: '保存鍵' },
  { selector: '.card.input-wrapper', region: 'persona', origin: 'mmd', why: '卡片寫 .role-setting .input-wrapper .input-dark' },
  { selector: '.input-dark', region: 'persona', origin: 'mmd', why: '稱呼輸入框' },
  { selector: '.card.textarea-wrapper', region: 'persona', origin: 'mmd', why: '自我介紹那張卡' },
  { selector: '.textarea-dark', region: 'persona', origin: 'mmd', why: '自我介紹輸入框' },
  { selector: '.gender-box', region: 'persona', origin: 'mmd', why: '性別那一組' },
  { selector: '.radio-group', region: 'persona', origin: 'mmd', why: '三選一' },
  { selector: '.gender-item', region: 'persona', origin: 'mmd', why: '一個選項' },
  { selector: '.label', region: 'persona', origin: 'mmd', why: '欄位標題' },
  { selector: '.char-count', region: 'persona', origin: 'mmd', why: '字數' },
  { selector: '.sandbox-box', region: 'persona', origin: 'lt', why: '虛構框架強度那一格' },
  { selector: '.sandbox-item', region: 'persona', origin: 'lt', why: '一檔強度' },
  { selector: '.advanced-scope', region: 'persona', origin: 'lt', why: '進階（自訂破限詞）收在這裡' },
  { selector: '.advanced-scope .advanced-body', region: 'persona', origin: 'lt', why: '收起來時節點仍在' },

  // ── 自訂指令 ────────────────────────────────────────────────────────
  { selector: '.custom-instruction-scope', region: 'directives', origin: 'mmd', why: '卡片替整片換外觀' },
  { selector: '.list-scope', region: 'directives', origin: 'mmd', why: '清單那一段' },
  { selector: '.list-scope .header-scope', region: 'directives', origin: 'mmd', why: '標題列' },
  { selector: '.header-scope .close-btn', region: 'directives', origin: 'mmd', why: '關閉' },
  { selector: '.header-scope .title', region: 'directives', origin: 'mmd', why: '標題' },
  { selector: '.header-scope .btn-scope', region: 'directives', origin: 'mmd', why: '標題列右側的鍵' },
  { selector: '.btn-scope .add-btn', region: 'directives', origin: 'mmd', why: '新增' },
  { selector: '.sub-title', region: 'directives', origin: 'mmd', why: '「(3/10)」' },
  { selector: '.empty-default-show', region: 'directives', origin: 'mmd', why: '一條都沒有時的那句話；作者常改它' },
  { selector: '.content-scope', region: 'directives', origin: 'mmd', why: '清單容器' },
  { selector: '.content-scope .item', region: 'directives', origin: 'mmd', why: '一條指令' },
  { selector: '.item .left', region: 'directives', origin: 'mmd', why: '指令內容側' },
  { selector: '.item .right', region: 'directives', origin: 'mmd', why: '動作側' },
  { selector: '.item .gap', region: 'directives', origin: 'mmd', why: '列與列之間' },
  { selector: '.edit-scope', region: 'directives', origin: 'mmd', why: '新增／編輯的輸入區' },
  { selector: '.edit-scope .form-item', region: 'directives', origin: 'mmd', why: '一格表單' },
  { selector: '.custom-textarea-box', region: 'directives', origin: 'mmd', why: '卡片寫 .custom-textarea-box 改輸入框外觀' },

  // ── AI 筆記 ─────────────────────────────────────────────────────────
  // MMD 沒有這個功能，所以沒有作者會打的名字可以對齊——這一族是我們自己的。
  // 外面那層 `.u-popup__content` 仍然是 MMD 的殼，作者的圓角與底色照樣生效。
  { selector: '.notepad-scope', region: 'notepad', origin: 'lt', why: '我方的筆記面板；MMD 無對應功能' },
  { selector: '.np-textarea', region: 'notepad', origin: 'lt', why: '筆記輸入框' },
  { selector: '.np-actions', region: 'notepad', origin: 'lt', why: '底部動作列' },
  { selector: '.np-save-btn', region: 'notepad', origin: 'lt', why: '儲存' },
  { selector: '.np-copy', region: 'notepad', origin: 'lt', why: '從別段對話抄筆記；收起來時節點仍在' },
  { selector: '.np-discard', region: 'notepad', origin: 'lt', why: '關掉前問一次有沒存的字；收起來時節點仍在' },
  { selector: '.np-import', region: 'notepad', origin: 'lt', why: '貼分享碼匯入模板；模板區收著時跟著收' },
  { selector: '.agent-resume-card', region: 'message', origin: 'lt', why: 'Agent 被停下後的「進度留著／繼續」卡（節點名照 mobile）；只在中斷的那則出現' },
  { selector: '.np-preview', region: 'notepad', origin: 'lt', why: '匯入前先看內容；收起來時節點仍在' },
  { selector: '.np-share', region: 'notepad', origin: 'lt', why: '產生的分享碼；收起來時節點仍在' },

  // ── 這則回覆的組成 ────────────────────────────────────────────────
  // mobile 那份上下文用量彈窗搬過來的；MMD 沒有這個功能，名字是我們自己的。
  // 殼仍是 `.u-popup__content`，作者的底色與圓角照樣生效；裡面的字色全部 inherit。
  { selector: '.context-breakdown-scope', region: 'context-breakdown', origin: 'lt', why: '我方的組成面板；MMD 無對應功能' },
  { selector: '.cb-overview', region: 'context-breakdown', origin: 'lt', why: '圓環＋總計那一排' },
  { selector: '.cb-donut', region: 'context-breakdown', origin: 'lt', why: '圓環（inline SVG）' },
  { selector: '.cb-list', region: 'context-breakdown', origin: 'lt', why: '十一個桶的清單' },
  { selector: '.cb-row', region: 'context-breakdown', origin: 'lt', why: '一個桶' },
  { selector: '.cb-billing', region: 'context-breakdown', origin: 'lt', why: '本輪消耗與快取命中率' },
  { selector: '.cb-note', region: 'context-breakdown', origin: 'lt', why: '「本機估算」那句話' },

  // ── AI 記事本／永久記憶 ───────────────────────────────────────────
  // mobile memoryPage 搬過來的彈窗版；MMD 沒有這個功能，名字是我們自己的。
  // 殼仍是 `.u-popup__content`，作者的底色與圓角照樣生效；裡面的字色全部 inherit。
  { selector: '.memory-scope', region: 'memory', origin: 'lt', why: '我方的記憶面板；MMD 無對應功能' },
  { selector: '.mem-list', region: 'memory', origin: 'lt', why: '清單' },
  { selector: '.mem-card', region: 'memory', origin: 'lt', why: '一條記錄' },
  { selector: '.mem-source', region: 'memory', origin: 'lt', why: '來源標籤（角色記的／自動整理）' },
  { selector: '.mem-value', region: 'memory', origin: 'lt', why: '記錄內容；長的收行' },
  { selector: '.mem-delete', region: 'memory', origin: 'lt', why: '刪除鍵；作者可只藏這一顆' },

  { selector: '.conversation-list-scope', region: 'conversations', origin: 'mmd', why: '卡片替清單換底色' },
  { selector: '.cl-item', region: 'conversations', origin: 'mmd', why: '一列對話' },
  { selector: '.bottom .btn', region: 'conversations', origin: 'mmd', why: '卡片寫 .conversation-list-scope .bottom .btn 改關閉鍵' },
]

/** 依區塊取出該掛載哪些選擇器。 */
export function selectorsForRegion(region: CanvasRegion): CanvasSelectorEntry[] {
  return CANVAS_SELECTOR_CONTRACT.filter((entry) => entry.region === region)
}
