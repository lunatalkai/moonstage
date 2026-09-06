/**
 * 作者草稿：在本機預覽一張卡的裝修（正則規則 + 掛載點 + 開場白），
 * 不上傳、不需要登入。
 *
 * 一份草稿就是「畫布套得上的作者資產」加上預覽要用的幾個欄位。
 * 這裡只定義形狀與匯入；儲存見 author-draft-store.ts。
 */
import type { TavernRule } from '@/pages/canvas/canvas-rule-engine'
import type { CardFormat } from './card-format'
export type DraftMountLayer = 'under' | 'over' | 'cover'

export interface AuthorDraft {
  id: string
  /** 顯示在頂欄與清單裡的名字 */
  name: string
  /** 卡片格式（MMD 或酒館的寫法）；決定 CSS 要不要加作用域前綴（見 canvas-style-scope） */
  cardFormat: CardFormat
  rules: TavernRule[]
  mountTrigger: string
  mountLayer: DraftMountLayer
  /** 沉浸模式：作者宣告的滿版乾淨畫布 */
  immersive: boolean
  /** 預覽時當作第一則 AI 訊息 */
  opening: string
  /** 匯入時辨認出的格式，給清單顯示 */
  format: DraftFormat
  /** 整張卡（酒館 V2/V3）：有這一段才能建成試玩卡到伺服器上玩 */
  card?: DraftCard
  createdAt: number
  updatedAt: number
}

/** 酒館卡裡除了規則以外、試玩會用到的部分。欄位名照伺服器試玩卡的段落走。 */
export interface DraftCard {
  description: string
  personality: string
  scenario: string
  mesExample: string
  creatorNotes: string
  firstMes: string
  alternateGreetings: string[]
  book: DraftBook | null
}

export interface DraftBook {
  name: string
  entries: DraftBookEntry[]
}

export interface DraftBookEntry {
  name: string
  content: string
  keywords: string[]
  /** AND 門（酒館 selective + secondary_keys）：主詞命中之外還要出現其中之一。 */
  secondaryKeywords: string[]
  isConstant: boolean
  isEnabled: boolean
}

export type DraftFormat =
  | 'mmd-regex-list'
  | 'mmd-export'
  | 'mmd-payload'
  | 'st-regex'
  | 'st-card'
  | 'st-worldbook'
  | 'text-definition'
  | 'moonstage-asset'

export class DraftImportError extends Error {
  constructor(public readonly reason: 'invalid-json' | 'unknown-format' | 'empty' | 'png-no-card') {
    super(reason)
  }
}

/** 使用者在入口頁選的匯入來源：決定收哪些檔、怎麼併、清單怎麼標。 */
export type ImportKind = 'tavern' | 'mmd'

/**
 * 酒館的 PNG 卡：卡片 JSON 以 base64 放在 PNG 的 tEXt 區塊，V2 關鍵字是 chara，
 * V3 多一個 ccv3（優先）。回傳 JSON 文字，交給 importAuthorDraft 走一般路徑。
 */
export function extractTavernCardFromPng(bytes: ArrayBuffer | Uint8Array): string {
  const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes)
  const sig = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]
  if (u8.length < 8 || sig.some((b, i) => u8[i] !== b)) throw new DraftImportError('unknown-format')
  const view = new DataView(u8.buffer, u8.byteOffset, u8.byteLength)
  let pos = 8
  let chara = ''
  let ccv3 = ''
  while (pos + 8 <= u8.length) {
    const len = view.getUint32(pos)
    const type = String.fromCharCode(u8[pos + 4], u8[pos + 5], u8[pos + 6], u8[pos + 7])
    const dataStart = pos + 8
    if (type === 'tEXt' && dataStart + len <= u8.length) {
      const data = u8.subarray(dataStart, dataStart + len)
      const nul = data.indexOf(0)
      if (nul > 0) {
        const keyword = latin1(data.subarray(0, nul))
        const value = latin1(data.subarray(nul + 1))
        if (keyword === 'ccv3') ccv3 = value
        else if (keyword === 'chara') chara = value
      }
    }
    if (type === 'IEND') break
    pos = dataStart + len + 4
  }
  const encoded = ccv3 || chara
  if (!encoded) throw new DraftImportError('png-no-card')
  try {
    return decodeBase64Utf8(encoded)
  } catch (e) {
    throw new DraftImportError('png-no-card')
  }
}

function latin1(bytes: Uint8Array): string {
  let out = ''
  for (let i = 0; i < bytes.length; i += 1) out += String.fromCharCode(bytes[i])
  return out
}

function decodeBase64Utf8(b64: string): string {
  const bin = typeof atob === 'function' ? atob(b64) : Buffer.from(b64, 'base64').toString('binary')
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i += 1) bytes[i] = bin.charCodeAt(i)
  return new TextDecoder('utf-8').decode(bytes)
}

export function isPngBytes(bytes: ArrayBuffer | Uint8Array): boolean {
  const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes)
  return u8.length >= 8 && u8[0] === 0x89 && u8[1] === 0x50 && u8[2] === 0x4e && u8[3] === 0x47
}

let counter = 0
export function newDraftId(): string {
  counter += 1
  const rand = Math.random().toString(36).slice(2, 8)
  return `d${Date.now().toString(36)}${counter.toString(36)}${rand}`
}

function str(v: any): string {
  return typeof v === 'string' ? v : ''
}

/** MMD 的 `/pattern/flags` 字串直接餵給引擎即可（引擎自己分辨字面量與正則）。 */
function mmdRule(item: any, index: number): TavernRule | null {
  const find = str(item.regex ?? item.find)
  const replace = str(item.content ?? item.replace)
  if (!find) return null
  return {
    id: item.id ?? index + 1,
    name: str(item.name) || `#${index + 1}`,
    find,
    replace,
    enabled: true,
  }
}

/**
 * 酒館的規則：placement 1 = 使用者輸入、2 = AI 輸出、3 = 斜線指令、5 = 世界書。
 * 只有作用在 AI 輸出的規則會在畫面上看得到；沒寫 placement 的當成全部。
 */
function stRule(item: any, index: number): TavernRule | null {
  const find = str(item.findRegex)
  if (!find) return null
  const placement = Array.isArray(item.placement) ? item.placement.map(Number) : null
  if (placement && placement.length && !placement.includes(2)) return null
  return {
    id: item.id ?? index + 1,
    name: str(item.scriptName) || `#${index + 1}`,
    find,
    replace: str(item.replaceString),
    enabled: item.disabled !== true,
    promptOnly: item.promptOnly === true,
    trimStrings: Array.isArray(item.trimStrings) ? item.trimStrings.filter((s: any) => typeof s === 'string') : undefined,
  }
}

function isStRegexScript(v: any): boolean {
  return !!v && typeof v === 'object' && typeof v.findRegex === 'string'
}

function isMmdRegexItem(v: any): boolean {
  return !!v && typeof v === 'object' && typeof v.regex === 'string' && ('content' in v || 'name' in v)
}

/**
 * MMD 的「功能欄」有一個勾選：「降低層級，勾選後層級位於輸入框下方」；不勾是頁面最高層。
 * 匯出檔裡對應的是 pageDepth：勾了是 1，沒勾是 2（owner 2026-09-06 拿兩張卡對照確認：
 * 作者勾了降低層級的那張是 1，HUD 蓋在最上面的那張是 2）。
 */
function layerFromPageDepth(v: any): DraftMountLayer {
  const s = String(v ?? '').toLowerCase()
  if (s === 'under' || s === 'below' || s === '0' || s === '1') return 'under'
  if (s === 'cover') return 'cover'
  return 'over'
}

function normalizeLayer(v: any): DraftMountLayer {
  const s = String(v ?? '').toLowerCase()
  return s === 'under' || s === 'cover' ? s : 'over'
}

function compact(rules: Array<TavernRule | null>): TavernRule[] {
  return rules.filter((r): r is TavernRule => !!r)
}

function baseDraft() {
  const now = Date.now()
  return {
    id: newDraftId(),
    cardFormat: 'mmd' as CardFormat,
    mountTrigger: '',
    mountLayer: 'over' as DraftMountLayer,
    immersive: false,
    opening: '',
    createdAt: now,
    updatedAt: now,
  }
}

export function emptyCard(): DraftCard {
  return { description: '', personality: '', scenario: '', mesExample: '', creatorNotes: '', firstMes: '', alternateGreetings: [], book: null }
}

/**
 * 酒館的世界書匯出檔：{ entries: { "0": {...}, "1": {...} } }（或陣列）。
 * MMD 匯出的版本把 key／keysecondary 存成 JSON 字串，酒館本尊是陣列——兩種都認。
 */
function isStWorldbook(v: any): boolean {
  if (!v || typeof v !== 'object' || !v.entries || typeof v.entries !== 'object') return false
  const list = Array.isArray(v.entries) ? v.entries : Object.values(v.entries)
  return list.length > 0 && list.every((e: any) => e && typeof e === 'object' && typeof e.content === 'string' && ('key' in e || 'keys' in e || 'comment' in e))
}

function keyList(v: any): string[] {
  if (Array.isArray(v)) return strList(v)
  if (typeof v === 'string' && v.trim()) {
    try {
      const parsed = JSON.parse(v)
      if (Array.isArray(parsed)) return strList(parsed)
    } catch (e) {
      return v.split(',').map((x) => x.trim()).filter(Boolean)
    }
  }
  return []
}

/**
 * 次要關鍵詞：世界書檔叫 keysecondary、卡裡的 book 叫 secondary_keys。酒館只在 selective 開著
 * 時才用它；明確寫 false 就不帶，沒寫（MMD 匯出沒有這個欄位）就照有的算。
 */
function secondaryKeyList(e: any): string[] {
  if (e.selective === false) return []
  return keyList(e.keysecondary ?? e.secondary_keys)
}

function stWorldbook(v: any, fallbackName: string): DraftBook {
  const list: any[] = Array.isArray(v.entries) ? v.entries : Object.values(v.entries)
  const entries: DraftBookEntry[] = []
  list.forEach((e: any, i: number) => {
    const content = str(e.content)
    if (!content.trim()) return
    const keywords = keyList(e.key ?? e.keys)
    entries.push({
      name: str(e.comment).trim() || str(e.name).trim() || keywords[0] || `#${i + 1}`,
      content,
      keywords,
      secondaryKeywords: secondaryKeyList(e),
      isConstant: e.constant === true,
      isEnabled: e.disable !== true && e.enabled !== false,
    })
  })
  return { name: str(v.name) || fallbackName, entries }
}

/**
 * 把使用者丟進來的檔案文字變成草稿。認得的格式見 DraftFormat；認不得就丟 DraftImportError。
 * 只讀不寫：id 與時間戳在這裡給定，儲存由呼叫端決定。
 */
export function importAuthorDraft(text: string, fallbackName = ''): AuthorDraft {
  let parsed: any
  try {
    parsed = JSON.parse(text)
  } catch (e) {
    // 不是 JSON 的純文字檔＝角色設定（MMD 的 V2 卡把設定單獨放一個 txt）。
    // 看起來想當 JSON 卻壞掉的（以 { 或 [ 開頭）還是報格式錯，別把壞檔當成設定吞掉。
    const trimmed = String(text || '').trim()
    if (!trimmed) throw new DraftImportError('empty')
    if (/^[\[{]/.test(trimmed)) throw new DraftImportError('invalid-json')
    return { ...baseDraft(), name: fallbackName, format: 'text-definition', rules: [], card: { ...emptyCard(), description: trimmed } }
  }
  const now = Date.now()
  const base = {
    id: newDraftId(),
    cardFormat: 'mmd' as CardFormat,
    mountTrigger: '',
    mountLayer: 'over' as DraftMountLayer,
    immersive: false,
    opening: '',
    createdAt: now,
    updatedAt: now,
  }

  // MMD 的 API 回包：{ code, data: [...] }
  const list = Array.isArray(parsed) ? parsed : (parsed && Array.isArray(parsed.data) ? parsed.data : null)
  if (list) {
    if (!list.length) throw new DraftImportError('empty')
    if (list.every(isMmdRegexItem)) {
      return { ...base, name: fallbackName, format: 'mmd-regex-list', rules: compact(list.map(mmdRule)) }
    }
    if (list.every(isStRegexScript)) {
      const rules = compact(list.map(stRule))
      return { ...base, name: fallbackName, cardFormat: 'tavern', format: 'st-regex', rules }
    }
    throw new DraftImportError('unknown-format')
  }

  if (!parsed || typeof parsed !== 'object') throw new DraftImportError('unknown-format')

  // 酒館／MMD 的世界書匯出檔（MMD 的 V2 卡把世界書單獨放一個檔）
  if (isStWorldbook(parsed)) {
    const book = stWorldbook(parsed, fallbackName)
    if (!book.entries.length) throw new DraftImportError('empty')
    return { ...base, name: fallbackName, cardFormat: 'tavern', format: 'st-worldbook', rules: [], card: { ...emptyCard(), book } }
  }

  // 單一酒館規則
  if (isStRegexScript(parsed)) {
    return { ...base, name: fallbackName || str(parsed.scriptName), cardFormat: 'tavern', format: 'st-regex', rules: compact([stRule(parsed, 0)]) }
  }

  // 酒館 V2 卡：規則在 data.extensions.regex_scripts
  if (parsed.spec === 'chara_card_v2' || parsed.spec === 'chara_card_v3') {
    const data = parsed.data || {}
    const scripts = data.extensions && Array.isArray(data.extensions.regex_scripts) ? data.extensions.regex_scripts : []
    return {
      ...base,
      name: fallbackName || str(data.name),
      cardFormat: 'tavern',
      format: 'st-card',
      rules: compact(scripts.map(stRule)),
      opening: str(data.first_mes),
      card: stCard(data),
    }
  }

  // MMD 的匯出檔（作者從原站「導出正則」拿到的那份）：頂層 regex_scripts 用酒館的欄位名，
  // 旁邊是 statusbar（掛載點）、beginning（開場白）、pageDepth（數字）。
  if (Array.isArray(parsed.regex_scripts) && ('statusbar' in parsed || 'beginning' in parsed || 'pageDepth' in parsed)) {
    return {
      ...base,
      name: fallbackName || str(parsed.roleName || parsed.name),
      format: 'mmd-export',
      rules: compact(parsed.regex_scripts.map(stRule)),
      mountTrigger: str(parsed.statusbar),
      mountLayer: layerFromPageDepth(parsed.pageDepth),
      opening: str(parsed.beginning),
    }
  }

  // 只有一包酒館規則、沒有卡的其他部分：當成酒館正則腳本集。
  if (Array.isArray(parsed.regex_scripts) && !parsed.spec) {
    const rules = compact(parsed.regex_scripts.map(stRule))
    if (!rules.length) throw new DraftImportError('empty')
    return { ...base, name: fallbackName, cardFormat: 'tavern', format: 'st-regex', rules }
  }

  // MMD 匯入酬載：rules + statusbar + pageDepth + welcome
  if (Array.isArray(parsed.rules) && ('statusbar' in parsed || 'welcome' in parsed || 'pageDepth' in parsed)) {
    return {
      ...base,
      name: fallbackName || str(parsed.roleName),
      format: 'mmd-payload',
      rules: compact(parsed.rules.map(mmdRule)),
      mountTrigger: str(parsed.statusbar),
      mountLayer: layerFromPageDepth(parsed.pageDepth),
      opening: str(parsed.welcome),
    }
  }

  // 我們自己的資產：rules + mountTrigger + mountLayer（伺服器回包或 role_get_author_asset）
  const asset = parsed.authorAsset && typeof parsed.authorAsset === 'object' ? parsed.authorAsset : parsed
  if (Array.isArray(asset.rules) && ('mountTrigger' in asset || 'mountLayer' in asset || 'pageMode' in asset)) {
    return {
      ...base,
      name: fallbackName || str(asset.name),
      cardFormat: (asset.cardFormat ?? asset.source) === 'tavern' ? 'tavern' : 'mmd',
      format: 'moonstage-asset',
      rules: compact(asset.rules.map((r: any, i: number) => mmdRule(r, i))),
      mountTrigger: str(asset.mountTrigger),
      mountLayer: normalizeLayer(asset.mountLayer),
      immersive: asset.pageMode === 'immersive',
      opening: str(asset.opening),
    }
  }

  throw new DraftImportError('unknown-format')
}

function strList(v: any): string[] {
  return Array.isArray(v) ? v.filter((x: any) => typeof x === 'string' && x.trim()) : []
}

/** 酒館的 character_book：keys 是觸發詞，comment 是條目名，constant 是常駐。 */
function stBook(book: any): DraftBook | null {
  if (!book || typeof book !== 'object' || !Array.isArray(book.entries)) return null
  const entries: DraftBookEntry[] = []
  book.entries.forEach((e: any, i: number) => {
    if (!e || typeof e !== 'object') return
    const content = str(e.content)
    if (!content.trim()) return
    // keys 照規格是陣列，但 MMD 匯出的東西會寫成 JSON 字串，一併認。
    const keywords = keyList(e.keys)
    entries.push({
      name: str(e.comment).trim() || str(e.name).trim() || keywords[0] || `#${i + 1}`,
      content,
      keywords,
      secondaryKeywords: secondaryKeyList(e),
      isConstant: e.constant === true,
      isEnabled: e.enabled !== false,
    })
  })
  return { name: str(book.name), entries }
}

function stCard(data: any): DraftCard {
  return {
    description: str(data.description),
    personality: str(data.personality),
    scenario: str(data.scenario),
    mesExample: str(data.mes_example),
    creatorNotes: str(data.creator_notes),
    firstMes: str(data.first_mes),
    alternateGreetings: strList(data.alternate_greetings),
    book: stBook(data.character_book),
  }
}

export interface TrialTalkExample {
  roleType: 'user' | 'assistant'
  content: string
}

/**
 * 酒館的對話範例：`<START>` 分段，每行 `{{user}}: …` 或 `{{char}}: …`。
 * 認不出說話者的行併進上一句；整段都認不出就整段當角色說的。
 */
export function parseMesExample(text: string): TrialTalkExample[] {
  const out: TrialTalkExample[] = []
  const blocks = String(text || '').split(/<START>/i)
  for (const block of blocks) {
    const lines = block.split(/\r?\n/)
    let current: TrialTalkExample | null = null
    for (const raw of lines) {
      const line = raw.trim()
      if (!line) continue
      const m = /^\{\{(user|char)\}\}\s*:\s*(.*)$/i.exec(line)
      if (m) {
        current = { roleType: m[1].toLowerCase() === 'user' ? 'user' : 'assistant', content: m[2] }
        out.push(current)
      } else if (current) {
        current.content += '\n' + line
      } else {
        current = { roleType: 'assistant', content: line }
        out.push(current)
      }
    }
  }
  return out.filter((e) => e.content.trim())
}

/**
 * 短介紹：作者備註優先，沒有就取設定裡第一行「像句子」的字（最多 120 字）。
 * MMD 的設定檔開頭多半是 `<世界觀>`、`【設定】`、`ntr小故事设定文本` 這種標籤或檔名，
 * 拿去當簡介會直接印在對話開頭的介紹卡上（owner 2026-09-06 截圖），所以跳過。
 */
function shortIntro(card: DraftCard): string {
  const notes = card.creatorNotes.trim()
  if (notes) return notes.length > 300 ? notes.slice(0, 300) : notes
  const lines = card.description.split(/\n+/).map((l) => l.trim()).filter(Boolean)
  const isLabel = (l: string) => /^[<\[【《（(]/.test(l) || /[>\]】》）)]$/.test(l) || (l.length <= 12 && !/[。！？!?，,]/.test(l))
  const first = lines.find((l) => !isLabel(l)) || ''
  return first.length > 120 ? first.slice(0, 120) + '…' : first
}

/** 完整設定：描述、性格、場景各自成段，欄位名保留給伺服器端的巨集替換。 */
function fullDefinition(card: DraftCard): string {
  const parts: string[] = []
  if (card.description.trim()) parts.push(card.description.trim())
  if (card.personality.trim()) parts.push('Personality:\n' + card.personality.trim())
  if (card.scenario.trim()) parts.push('Scenario:\n' + card.scenario.trim())
  return parts.join('\n\n')
}

/**
 * 試玩卡的請求體（PUT /open/v1/trial-cards/{key}）。整份就是這張卡的全貌：
 * 沒有的段不送，伺服器就把上次有的段清掉。沒有 card 的草稿（只有規則）回 null。
 */
export function draftToTrialPayload(draft: AuthorDraft): Record<string, any> | null {
  const card = draft.card
  if (!card || !draftCanTrial(draft)) return null
  const name = draftDisplayName(draft)
  const payload: Record<string, any> = {
    name,
    card: {
      roleDesc: shortIntro(card),
      roleDetailDesc: fullDefinition(card),
    },
  }
  const examples = parseMesExample(card.mesExample)
  if (examples.length) payload.card.talkExample = examples
  // 開場白：酒館卡在 first_mes；MMD 匯出檔在 beginning（草稿的 opening）。
  const firstMes = card.firstMes.trim() ? card.firstMes : draft.opening
  if (firstMes.trim() || card.alternateGreetings.length) {
    payload.welcome = { roleWelcome: firstMes, alternates: card.alternateGreetings, prologue: [] }
  }
  if (card.book && card.book.entries.length) {
    payload.worldbook = {
      name: card.book.name || name,
      entries: card.book.entries.map((e) => ({
        name: e.name,
        content: e.content,
        keywords: e.keywords,
        secondaryKeywords: e.secondaryKeywords,
        isConstant: e.isConstant,
        isEnabled: e.isEnabled,
      })),
    }
  }
  if (draft.rules.length) {
    payload.authorAsset = {
      rules: draft.rules.map((r) => ({
        id: String(r.id),
        name: String(r.name || ''),
        find: String(r.find || ''),
        replace: String(r.replace || ''),
        enabled: r.enabled !== false,
      })),
      mountTrigger: draft.mountTrigger,
      mountLayer: draft.mountLayer,
    }
  }
  return payload
}

/** 這份草稿是哪幾種東西：規則、世界書、設定。給清單標籤與合併規則用。 */
export function draftParts(draft: AuthorDraft) {
  return {
    rules: draft.rules.length > 0,
    book: !!(draft.card && draft.card.book && draft.card.book.entries.length),
    definition: !!(draft.card && (draft.card.description.trim() || draft.card.personality.trim() || draft.card.scenario.trim())),
  }
}

/** 能不能建成試玩卡：要有設定或世界書其中之一，只有規則與開場白的不算一張卡。 */
export function draftCanTrial(draft: AuthorDraft): boolean {
  const parts = draftParts(draft)
  return parts.definition || parts.book
}

/**
 * 匯入來源決定要不要併進已選的草稿：
 * - MMD：三個檔本來就是同一張卡，有選草稿就併進去（整張酒館卡除外）。
 * - 酒館：一個檔就是一張卡；只有單獨匯出的世界書或正則腳本才併進已選的卡。
 */
export function shouldMergeInto(kind: ImportKind, base: AuthorDraft | null, incoming: AuthorDraft): boolean {
  if (!base) return false
  if (incoming.format === 'st-card') return false
  if (kind === 'mmd') return true
  return incoming.format === 'st-worldbook' || incoming.format === 'st-regex'
}

/**
 * 把新匯入的檔案併進已有的草稿——MMD 的 V2 卡是三個檔（正則匯出、世界書、設定 txt），
 * 使用者會一個一個丟。整張酒館卡本身就是完整的，不併、另開一份。
 * 同類的部分整段覆蓋（作者改完世界書再丟一次就是要換掉），其餘不動。
 */
export function mergeAuthorDraft(base: AuthorDraft, incoming: AuthorDraft): AuthorDraft | null {
  if (incoming.format === 'st-card') return null
  // base 多半是畫面上的響應式代理（Proxy）；IndexedDB 的結構化複製不吃代理，
  // 先整份轉成純資料。草稿本來就只有 JSON 能表達的東西，來回一次不掉資訊。
  const plain: AuthorDraft = JSON.parse(JSON.stringify(base))
  const merged: AuthorDraft = { ...plain, updatedAt: Date.now() }
  const card = { ...(plain.card || emptyCard()) }
  if (incoming.format === 'st-worldbook') {
    card.book = incoming.card ? incoming.card.book : null
  } else if (incoming.format === 'text-definition') {
    card.description = incoming.card ? incoming.card.description : ''
  } else {
    merged.rules = incoming.rules
    merged.mountTrigger = incoming.mountTrigger
    merged.mountLayer = incoming.mountLayer
    merged.immersive = incoming.immersive
    merged.cardFormat = incoming.cardFormat
    merged.format = incoming.format
    if (incoming.opening) merged.opening = incoming.opening
  }
  merged.card = card
  if (!merged.name) merged.name = incoming.name
  return merged
}

/** 瀏覽器裡存的舊草稿欄位叫 source；讀出來時補成 cardFormat，寫回去就是新欄位。 */
export function upgradeStoredDraft(row: any): AuthorDraft {
  if (!row || typeof row !== 'object') return row
  if (row.cardFormat == null && row.source != null) {
    const { source, ...rest } = row
    return { ...rest, cardFormat: source === 'tavern' ? 'tavern' : 'mmd' }
  }
  return row
}

/** 給畫布用的資產形狀：跟 authorAssetServe 回的一樣，所以套用路徑不用分岔。 */
export function draftToAuthorAsset(draft: AuthorDraft) {
  return {
    rules: draft.rules,
    version: draft.updatedAt,
    variants: null,
    mountTrigger: draft.mountTrigger,
    mountLayer: draft.mountLayer,
    pageMode: draft.immersive ? 'immersive' : 'normal',
    cardFormat: draft.cardFormat,
  }
}

/** 草稿名字：檔名去掉副檔名；沒有檔名就拿第一條規則的名字。 */
export function draftDisplayName(draft: Pick<AuthorDraft, 'name' | 'rules'>): string {
  if (draft.name) return draft.name
  const first = draft.rules.find((r) => r.name)
  return first ? String(first.name) : ''
}

export function stripFileExtension(fileName: string): string {
  return String(fileName || '').replace(/\.[A-Za-z0-9]{1,5}$/, '')
}
