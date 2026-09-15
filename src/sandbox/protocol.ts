/**
 * 宿主 ⇄ 沙箱殼 的 postMessage 契約。整個專案只有這一份，兩端都 import 它。
 *
 * 殼跑在跨源 iframe 裡，自己不發任何請求；它看到的一切（卡的規則、訊息、主題、
 * 角色與玩家的名字）都由宿主用這裡定義的訊息餵進來，它想做的一切（送出、改寫、
 * 存檔）都用 `request` 請宿主代辦。所以這份檔案就是殼的全部外部依賴。
 *
 * 每則訊息包成 `{ ms: SANDBOX_PROTOCOL_VERSION, ...訊息 }`；`ms` 對不上一律丟掉。
 * 改契約＝改版本號＋兩端測試。
 */

export const SANDBOX_PROTOCOL_VERSION = 1

export type SandboxRole = 'user' | 'ai'
export type SandboxMessageState = 'pending' | 'streaming' | 'done'
export type SandboxTheme = 'dark' | 'light'
export type StageState = 'closed' | 'content' | 'full'

/** 一則訊息。`id` 由宿主決定（l1、l2…遞增）；`serverId` 只在 AI 訊息定稿後有值，玩家訊息永遠 null。 */
export interface SandboxMessage {
  id: string
  role: SandboxRole
  content: string
  serverId: string | null
  state?: SandboxMessageState
  /** 標準訊息元件的呈現資料（宿主算好的）。 */
  view?: MessageView
}

export interface SandboxRule {
  id?: string | number
  name?: string
  find: string
  replace: string
  enabled?: boolean
}

export interface SandboxCard {
  rules: SandboxRule[]
  /** 功能欄的原文；空字串＝整塊不存在。 */
  statusbar: string
  /** 宿主用一般卡的管線算好的狀態欄 HTML；有就直接掛，沒有殼才自己套規則。 */
  statusbarHtml?: string
}

export interface SandboxCapabilities {
  /** 宿主接了存檔（save.*）。沒接時 save.* 回 HOST_DENIED。 */
  saves: boolean
  /** 宿主接了改寫（message.edit）。 */
  edit: boolean
  /** 宿主接了送出（message.send）。預覽環境可以不接。 */
  send: boolean
}

export interface SandboxHelloConfig {
  theme: SandboxTheme
  locale: string
  role: { name: string; avatarUrl: string }
  user: { nickname: string; avatarUrl: string }
  card: SandboxCard
  /** 規則匹配式裡漢字的簡繁對照（伺服器算好的），沒有就 null。 */
  variants?: Record<string, string> | null
  capabilities: SandboxCapabilities
  /** 底部輸入區一開始是否顯示（卡可以關掉它）。 */
  composer: boolean
  /**
   * 頁首與輸入區由誰畫：'shell'（預設）殼自己畫；'host' 宿主畫（殼把自己的頁首與輸入區藏起來，
   * 只留訊息區、狀態欄與作者舞台）。宿主模式下作者操作輸入框、顯示隱藏輸入區、開舞台仍走既有訊息
   * （input／composer／stage）轉給宿主做；殼內那顆隱藏的輸入框仍是 sdk.input 的資料來源。
   */
  chrome?: 'shell' | 'host'
  /** 殼用標準元件畫頁首與輸入區時的初始資料（之後由 chrome 訊息更新）；沒給就用殼自己的陽春版。 */
  chromeState?: ChromeState
  /** 標準訊息元件的文案與三個點的標題（宿主語系）。 */
  labels?: MessageLabels
  menuLabel?: string
  /** 宿主畫布的樣式變數（--lt-canvas-*），殼套在根節點上，訊息區才跟宿主同一套顏色。 */
  themeVars?: Record<string, string>
  /** 預載的存檔；沒接存檔時省略。 */
  saves?: Record<string, unknown>
  /** 打開殼內除錯面板。 */
  debug?: boolean
  /** 整頁背景圖（可省略）。 */
  backgroundUrl?: string
  /** 視窗高度（--chat-viewport-height），之後由 viewport 訊息更新。 */
  viewportHeight?: number
}

/**
 * 訊息在標準訊息元件上的呈現資料（pages/canvas/components/canvas-message.vue 的 message 屬性）。
 * 宿主用它自己的渲染管線算好 html（跟一般卡同一份），連同名字、頭像、載入中、可重生成等狀態一起送來；
 * 殼不再自己渲染正文。沒帶 view 的訊息（獨立殼、測試）殼才用自己的管線畫。
 */
export interface MessageView {
  mesid?: number
  role?: 'ai' | 'user' | 'system'
  name?: string
  avatar?: string
  html?: string
  reasoning?: string
  finished?: boolean
  loading?: boolean
  loadingLabel?: string
  prepSteps?: string[] | null
  prepTrail?: string[] | null
  agentInterrupted?: boolean
  latest?: boolean
  latestAI?: boolean
  contextUsage?: { label: string; tip: string; level: string } | null
  swipes?: { index: number; total: number } | null
}

/** 標準訊息元件的文案（宿主的語系）。 */
export interface MessageLabels {
  copy: string
  edit: string
  regenerate: string
  reasoning: string
  prepTrail: string
  prev: string
  next: string
  interruptedNotice?: string
  interruptedNoticeSub?: string
  continueAction?: string
}

/**
 * 標準頁首與輸入區的呈現資料（canvas-header.vue／canvas-composer.vue 的屬性），由宿主算好送來、變了再送。
 * 殼用同一套元件畫頁首與輸入區，作者對標準結構寫的美化才套得上；按鍵事件用 ui 訊息交回宿主做。
 */
export interface ChromeState {
  header: {
    roleName: string; avatar: string; modelName: string; badge: string; showModel: boolean; backLabel: string; modelLabel: string
    /** 宿主沒有上一頁可回時 false：返回鍵不畫（見 host/stage-host.ts 的 nav.canBack）。省略視同 true。 */
    showBack?: boolean
  }
  composer: {
    placeholder: string
    sendState: string
    generating: boolean
    enterSends: boolean
    shortcuts: Array<{ key: string; label: string; disabled?: boolean }>
    moreOpen: boolean
    moreItems: Array<{ key: string; label: string; disabled?: boolean }>
    modelScore: string
    assistBusy: boolean
    assistCost: string | number
    labels: { stop: string; more: string; send: string; paste: string; clear: string; model: string; assist: string; perTurn: string }
  }
}

/**
 * 面板（人設、記憶、手帳、長期指令、對話存檔、背景、字型、上下文、確認框）與訊息三個點選單的呈現資料。
 * 殼用標準面板元件畫（作者的美化才套得上），面板上的按鍵用 panel.ui 交回宿主做。
 * 模型選擇不在這裡：它自己抓清單、牽到登入態，留在宿主那一層。
 */
export interface PanelsState {
  /** 開著哪一張面板；'' 沒開。 */
  sheet: string
  title: string
  closeLabel: string
  heading?: boolean
  /** 開著那張面板元件的屬性（宿主算好的）。 */
  props: Record<string, unknown>
  menu: {
    open: boolean
    editing: boolean
    draft: string
    message: { html?: string } | null
    actions: Array<{ key: string; label: string; disabled?: boolean }>
    labels: { cancel: string; confirm: string }
    anchor: MessageMenuAnchor | null
  }
}

/** 標準頁首與輸入區上的按鍵，交給宿主做。 */
export type ChromeUiEvent = 'send' | 'stop' | 'continue' | 'more' | 'assist' | 'more-pick' | 'model' | 'shortcut' | 'back'

/** 三個點選單從哪裡呼出（座標是 iframe 內的；宿主自己換算）。 */
export type MessageMenuAnchor =
  | { kind: 'point'; x: number; y: number }
  | { kind: 'anchor'; rect: { left: number; top: number; width: number; height: number } }

export interface SandboxError {
  code: string
  message?: string
}

/** 宿主 → 殼 */
export type HostToShell =
  | { type: 'hello'; config: SandboxHelloConfig }
  | { type: 'messages'; messages: SandboxMessage[] }
  | { type: 'message.new'; message: SandboxMessage }
  | { type: 'message.stream'; id: string; content: string; view?: MessageView }
  | { type: 'message.done'; id: string; content: string; serverId: string | null; view?: MessageView }
  | { type: 'message.remove'; id: string }
  | { type: 'generation'; busy: boolean }
  | { type: 'input'; value: string }
  | { type: 'reply'; reqId: number; ok: boolean; value?: unknown; error?: SandboxError }
  | { type: 'theme'; theme: SandboxTheme; vars?: Record<string, string> }
  /** 頁首與輸入區的呈現資料變了。 */
  | { type: 'chrome'; state: ChromeState }
  /** 面板與訊息選單的呈現資料變了。 */
  | { type: 'panels'; state: PanelsState }
  /** 訊息的呈現資料變了（可重生成、上下文用量…），正文沒變。 */
  | { type: 'message.view'; id: string; view: MessageView }
  | { type: 'viewport'; height: number }
  | { type: 'conversation.switch' }
  | { type: 'back' }
  | { type: 'dispose' }

export type RequestOp = 'message.send' | 'message.edit' | 'save.set' | 'save.remove'

/** 殼上的按鈕想請宿主開的面板／做的事。 */
export type ShellAction = 'back' | 'open-model' | 'open-persona' | 'open-archives' | 'stop' | 'regenerate' | 'more'

/** 殼 → 宿主 */
export type ShellToHost =
  | { type: 'ready-shell' }
  | { type: 'ready' }
  | { type: 'request'; reqId: number; op: RequestOp; args: unknown[] }
  | { type: 'input'; value: string }
  | { type: 'action'; name: ShellAction }
  | { type: 'stage'; state: StageState }
  /** 訊息上的互動要交給宿主做：三個點選單（anchor 是 iframe 內座標）、動作列的鍵、開場白左右切換。 */
  | { type: 'message.ui'; id: string; kind: 'menu'; anchor: MessageMenuAnchor | null }
  | { type: 'message.ui'; id: string; kind: 'action'; key: string }
  | { type: 'message.ui'; id: string; kind: 'swipe'; delta: number }
  /** 標準頁首與輸入區上的按鍵（送出、停止、更多、快捷列…）。 */
  | { type: 'ui'; event: ChromeUiEvent; key?: string }
  /**
   * 殼文件根節點（html／body）的 class 與 data-* 屬性：作者腳本會在上面記狀態（日夜開關之類），
   * 宿主那一層還留著的面板（模型設定）要套作者樣式時得知道這些。變了就送。
   */
  | { type: 'docstate'; html: { className: string; data: Record<string, string> }; body: { className: string; data: Record<string, string> } }
  /** 面板（panel＝sheet 名）、訊息選單（panel＝'menu'）、彈層外框（panel＝'popup'）上的事件與參數。 */
  | { type: 'panel.ui'; panel: string; event: string; args: unknown[] }
  | { type: 'composer'; visible: boolean }
  | { type: 'back-handled'; handled: boolean }
  | { type: 'debug'; level: 'log' | 'warn' | 'error'; args: unknown[] }

export type SandboxEnvelope<T> = T & { ms: typeof SANDBOX_PROTOCOL_VERSION }

export function envelope<T extends { type: string }>(message: T): SandboxEnvelope<T> {
  return { ms: SANDBOX_PROTOCOL_VERSION, ...message }
}

/** 收到的東西是不是這個版本的協議訊息。不是就當雜訊（第三方腳本也會 postMessage）。 */
export function isSandboxEnvelope(data: unknown): data is SandboxEnvelope<{ type: string }> {
  return !!data && typeof data === 'object'
    && (data as { ms?: unknown }).ms === SANDBOX_PROTOCOL_VERSION
    && typeof (data as { type?: unknown }).type === 'string'
}

/** 沙箱 origin 是 'null'（不透明 origin：iframe 沒給 allow-same-origin）時，postMessage 只能用 '*'。 */
export function targetOriginFor(origin: string): string {
  return origin === 'null' || !origin ? '*' : origin
}

/**
 * 正式站每張卡一個子網域：`c<roleId>.<站台網域>`。放在這裡是為了兩端算出來的一樣，
 * 但殼本身不用它——它只認第一個握手訊息的來源。
 */
export function sandboxOriginFor(siteOrigin: string, roleId: string | number): string {
  const url = new URL(siteOrigin)
  // 主機名由瀏覽器統一小寫；postMessage 的 event.origin 也是小寫，這裡不先小寫就永遠對不上。
  return `${url.protocol}//c${String(roleId).toLowerCase()}.${url.host}`
}
