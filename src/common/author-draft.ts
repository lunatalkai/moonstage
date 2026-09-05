/**
 * 作者草稿：在本機預覽一張卡的裝修（正則規則 + 掛載點 + 開場白），
 * 不上傳、不需要登入。
 *
 * 一份草稿就是「畫布套得上的作者資產」加上預覽要用的幾個欄位。
 * 這裡只定義形狀與匯入；儲存見 author-draft-store.ts。
 */
import type { TavernRule } from '@/pages/canvas/canvas-rule-engine'

export type DraftSource = 'mmd' | 'tavern'
export type DraftMountLayer = 'under' | 'over' | 'cover'

export interface AuthorDraft {
  id: string
  /** 顯示在頂欄與清單裡的名字 */
  name: string
  /** 從哪種格式來的；決定 CSS 要不要加作用域前綴（見 canvas-style-scope） */
  source: DraftSource
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
  isConstant: boolean
  isEnabled: boolean
}

export type DraftFormat =
  | 'mmd-regex-list'
  | 'mmd-export'
  | 'mmd-payload'
  | 'st-regex'
  | 'st-card'
  | 'moonstage-asset'

export class DraftImportError extends Error {
  constructor(public readonly reason: 'invalid-json' | 'unknown-format' | 'empty') {
    super(reason)
  }
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

function layerFromPageDepth(v: any): DraftMountLayer {
  const s = String(v ?? '').toLowerCase()
  if (s === 'under' || s === 'below' || s === '0') return 'under'
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

/**
 * 把使用者丟進來的檔案文字變成草稿。認得的格式見 DraftFormat；認不得就丟 DraftImportError。
 * 只讀不寫：id 與時間戳在這裡給定，儲存由呼叫端決定。
 */
export function importAuthorDraft(text: string, fallbackName = ''): AuthorDraft {
  let parsed: any
  try {
    parsed = JSON.parse(text)
  } catch (e) {
    throw new DraftImportError('invalid-json')
  }
  const now = Date.now()
  const base = {
    id: newDraftId(),
    source: 'mmd' as DraftSource,
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
      return { ...base, name: fallbackName, source: 'tavern', format: 'st-regex', rules }
    }
    throw new DraftImportError('unknown-format')
  }

  if (!parsed || typeof parsed !== 'object') throw new DraftImportError('unknown-format')

  // 單一酒館規則
  if (isStRegexScript(parsed)) {
    return { ...base, name: fallbackName || str(parsed.scriptName), source: 'tavern', format: 'st-regex', rules: compact([stRule(parsed, 0)]) }
  }

  // 酒館 V2 卡：規則在 data.extensions.regex_scripts
  if (parsed.spec === 'chara_card_v2' || parsed.spec === 'chara_card_v3') {
    const data = parsed.data || {}
    const scripts = data.extensions && Array.isArray(data.extensions.regex_scripts) ? data.extensions.regex_scripts : []
    return {
      ...base,
      name: fallbackName || str(data.name),
      source: 'tavern',
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
    return { ...base, name: fallbackName, source: 'tavern', format: 'st-regex', rules }
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
      source: asset.source === 'tavern' ? 'tavern' : 'mmd',
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
    const keywords = strList(e.keys)
    entries.push({
      name: str(e.comment).trim() || str(e.name).trim() || keywords[0] || `#${i + 1}`,
      content,
      keywords,
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

/** 短介紹：作者備註優先，沒有就取設定的第一段（最多 120 字）。 */
function shortIntro(card: DraftCard): string {
  const notes = card.creatorNotes.trim()
  if (notes) return notes.length > 300 ? notes.slice(0, 300) : notes
  const first = card.description.trim().split(/\n+/)[0] || ''
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
  if (!card) return null
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
  if (card.firstMes.trim() || card.alternateGreetings.length) {
    payload.welcome = { roleWelcome: card.firstMes, alternates: card.alternateGreetings, prologue: [] }
  }
  if (card.book && card.book.entries.length) {
    payload.worldbook = {
      name: card.book.name || name,
      entries: card.book.entries.map((e) => ({
        name: e.name,
        content: e.content,
        keywords: e.keywords,
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

/** 給畫布用的資產形狀：跟 authorAssetServe 回的一樣，所以套用路徑不用分岔。 */
export function draftToAuthorAsset(draft: AuthorDraft) {
  return {
    rules: draft.rules,
    version: draft.updatedAt,
    variants: null,
    mountTrigger: draft.mountTrigger,
    mountLayer: draft.mountLayer,
    pageMode: draft.immersive ? 'immersive' : 'normal',
    source: draft.source,
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
