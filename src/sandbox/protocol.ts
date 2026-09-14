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
  /** 預載的存檔；沒接存檔時省略。 */
  saves?: Record<string, unknown>
  /** 打開殼內除錯面板。 */
  debug?: boolean
  /** 整頁背景圖（可省略）。 */
  backgroundUrl?: string
  /** 視窗高度（--chat-viewport-height），之後由 viewport 訊息更新。 */
  viewportHeight?: number
}

export interface SandboxError {
  code: string
  message?: string
}

/** 宿主 → 殼 */
export type HostToShell =
  | { type: 'hello'; config: SandboxHelloConfig }
  | { type: 'messages'; messages: SandboxMessage[] }
  | { type: 'message.new'; message: SandboxMessage }
  | { type: 'message.stream'; id: string; content: string }
  | { type: 'message.done'; id: string; content: string; serverId: string | null }
  | { type: 'message.remove'; id: string }
  | { type: 'generation'; busy: boolean }
  | { type: 'input'; value: string }
  | { type: 'reply'; reqId: number; ok: boolean; value?: unknown; error?: SandboxError }
  | { type: 'theme'; theme: SandboxTheme }
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
  return `${url.protocol}//c${String(roleId)}.${url.host}`
}
