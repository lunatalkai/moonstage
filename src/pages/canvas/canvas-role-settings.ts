/**
 * 這張卡的遊玩設定：稱呼、性別、自我介紹、模型／線路、上下文檔位、思考深度。
 *
 * 為什麼另開一支而不是繼續用玩家偏好：**送出那一輪讀的是這一份**。玩家偏好是
 * 外觀（桌布、字體），寫進去不會影響生成；把模型跟上下文寫到那裡，畫面上看起來
 * 存好了，實際上這一輪還是照舊值跑——那是最難查的一種「設定沒生效」。
 *
 * 寫入是「只送動到的欄位」。伺服器那一端每個欄位都是指標：沒送＝不動。整包送出
 * 會把玩家剛在別處存好的值蓋回這一頁手上的舊快照（VIP 永久記憶被連坐關掉就是
 * 這樣來的）。所以這裡永遠先跟快照比對，比對不出差異就一個請求都不發。
 *
 * 空字串是有意義的值，不是「沒填」：玩家把自我介紹整段刪掉時要真的送一個空字串
 * 過去。所以差異比對不能拿 falsy 當「沒動」。
 */

/** 伺服器認得、而這一頁真的會動到的欄位。 */
export const ROLE_SETTING_KEYS = [
  'userName',
  'userSex',
  'userDefine',
  'selectModel',
  'context',
  'thinkingDepth',
  'sandboxLevel',
  'jailbreak',
] as const

export type RoleSettingKey = (typeof ROLE_SETTING_KEYS)[number]

export interface RoleSettings {
  userName: string
  userSex: string
  userDefine: string
  selectModel: string
  context: number
  thinkingDepth: string
  /** 虛構框架的強度：light / standard / immersive / deep。'' ＝跟著平台預設 */
  sandboxLevel: string
  /** 玩家自訂的內容範圍框架。'' ＝用這張卡（或平台）的預設 */
  jailbreak: string
}

/**
 * 讀不到伺服器值時畫面上該是什麼。
 *
 * `userSex` 預設空字串而不是 'man'：伺服器對「沒設過」回的就是空字串，塞一個
 * 預設值進去會讓畫面上有一顆看起來是玩家選的、其實他沒選過的選項——他一按存檔
 * 就把那個猜測寫死了。
 */
export const ROLE_SETTINGS_DEFAULTS: RoleSettings = {
  userName: '',
  userSex: '',
  userDefine: '',
  selectModel: '',
  context: 1,
  thinkingDepth: '',
  sandboxLevel: '',
  jailbreak: '',
}

/** 主站與畫布共用的性別代號。'women' 是既有存量值，不要寫成 'woman'。 */
export const USER_SEX_VALUES = ['man', 'women', 'other'] as const

/** 虛構框架由弱到強。順序就是畫面上的順序——它是一條強度軸，不是一組並列選項。 */
export const SANDBOX_LEVELS = ['light', 'standard', 'immersive', 'deep'] as const

function asText(value: unknown): string {
  if (value === undefined || value === null) return ''
  return String(value)
}

function asContext(value: unknown): number {
  const n = Number(value)
  // 伺服器對舊資料會回 0；檔位是從 1 起算的，0 沒有對應的選項可以標亮。
  if (!Number.isFinite(n) || n <= 0) return ROLE_SETTINGS_DEFAULTS.context
  return n
}

/** 伺服器回的是整個設定物件（不是包在 prefs 裡）。只挑這一頁用得到的欄位。 */
export function readRoleSettings(raw: any): RoleSettings {
  const src = raw && typeof raw === 'object' ? raw : {}
  return {
    userName: asText(src.userName),
    userSex: asText(src.userSex),
    userDefine: asText(src.userDefine),
    selectModel: asText(src.selectModel),
    context: asContext(src.context),
    thinkingDepth: asText(src.thinkingDepth),
    sandboxLevel: asText(src.sandboxLevel),
    jailbreak: asText(src.jailbreak),
  }
}

/**
 * 只回真的變了的欄位。沒有差異回 null——呼叫端據此決定連請求都不要發。
 *
 * 只比 ROLE_SETTING_KEYS：伺服器回的物件還帶著十幾個這一頁不碰的欄位
 * （語音、範例對話、壓縮指令…），把它們一起送回去等於替玩家重寫了一遍。
 */
export function diffRoleSettings(
  snapshot: Partial<RoleSettings> | null | undefined,
  next: Partial<RoleSettings> | null | undefined,
): Partial<RoleSettings> | null {
  const before = snapshot || {}
  const after = next || {}
  const changed: Record<string, unknown> = {}
  let any = false
  for (const key of ROLE_SETTING_KEYS) {
    if (!(key in after)) continue
    const nextValue = (after as any)[key]
    if (nextValue === undefined) continue
    const prevValue = (before as any)[key]
    if (key === 'context') {
      if (Number(prevValue) === Number(nextValue)) continue
      changed[key] = Number(nextValue)
      any = true
      continue
    }
    if (asText(prevValue) === asText(nextValue)) continue
    changed[key] = asText(nextValue)
    any = true
  }
  return any ? (changed as Partial<RoleSettings>) : null
}

/** 送出去的形狀：`{ roleId, ...只有動到的 }`。沒有動到就回 null。 */
export function buildRoleSettingsSavePayload(
  roleId: string,
  snapshot: Partial<RoleSettings> | null | undefined,
  next: Partial<RoleSettings> | null | undefined,
): (Partial<RoleSettings> & { roleId: string }) | null {
  if (!roleId) return null
  const changed = diffRoleSettings(snapshot, next)
  if (!changed) return null
  return { roleId, ...changed }
}
