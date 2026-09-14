/**
 * 沙箱殼在哪裡、用什麼 origin——由宿主（站台）決定，畫布只問這裡。
 *
 * 正式站每張卡一個子網域（`c<roleId>.<站台>`），殼頁由站台的 Worker 出，origin 是真實的；
 * 沒設定的環境（playground、本機開發）退回不透明 origin：同源載 `/sandbox/index.html`，
 * iframe 不給 allow-same-origin，origin 變成 'null'，跟站台隔離的效果一樣，只是存不了
 * localStorage、也不能用子網域的 CSP 標頭（殼頁自帶 meta CSP 兜底）。
 */
export interface SandboxHostOptions {
  /** 殼頁的網址。 */
  shellUrl(roleId: string): string
  /** 殼頁的 origin；宿主用它核每一則 postMessage 的來源。 */
  origin(roleId: string): string
  /**
   * 存檔（sdk.save.*）落地。沒給就不宣告 saves 能力，殼裡 save.* 回 HOST_DENIED。
   * key 已由殼驗過（[A-Za-z0-9_-]{1,64}），值可 JSON 序列化。
   */
  saves?: SandboxSavesStore
}

export interface SandboxSavesStore {
  load(roleId: string): Promise<Record<string, unknown>>
  set(roleId: string, key: string, value: unknown): Promise<void>
  remove(roleId: string, key: string): Promise<void>
}

export interface ResolvedSandbox {
  shellUrl: string
  origin: string
  /** iframe 的 sandbox 屬性。不透明模式不給 allow-same-origin。 */
  sandboxAttr: string
  saves: SandboxSavesStore | null
}

const OPAQUE_ATTR = 'allow-scripts allow-forms allow-modals allow-downloads'
const SAME_ORIGIN_ATTR = 'allow-scripts allow-same-origin allow-forms allow-modals allow-downloads'

let options: SandboxHostOptions | null = null

export function setSandboxHostOptions(next: SandboxHostOptions | null): void {
  options = next
}

export function resolveSandbox(roleId: string | number): ResolvedSandbox {
  const id = String(roleId)
  if (!options) {
    // 用目錄路徑而不是 index.html：靜態資源層多半把 /index.html 轉址到 /，iframe 跟著轉址雖然能載，多一跳。
    return { shellUrl: '/sandbox/', origin: 'null', sandboxAttr: OPAQUE_ATTR, saves: null }
  }
  const origin = options.origin(id)
  return {
    shellUrl: options.shellUrl(id),
    origin,
    sandboxAttr: origin === 'null' ? OPAQUE_ATTR : SAME_ORIGIN_ATTR,
    saves: options.saves || null,
  }
}
