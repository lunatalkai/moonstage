/**
 * 「這則回覆的組成」——把伺服器回的 breakdownVersion=2 報告整理成彈窗要畫的形狀。
 *
 * 這份是 mobile 聊天頁那份（utils/prompt-breakdown.js，11 桶版）的搬運：桶的順序、
 * 顏色、MOD 明細的加總驗證、圓環的幾何都照搬，兩端看到的是同一件事。搬過來時
 * 拿掉了兩樣畫布用不到的：本機估算的退路（畫布沒有整份提示詞可以估，讀不到
 * 就老實說讀不到），以及焦點管理（CanvasPopup 的殼統一處理 ESC 與關閉）。
 *
 * ── 脫敏 ──
 * 伺服器的報告帶著 model／roleId／turnIndex 這些內部欄位；正規化只挑玩家該看的
 * 拿出來（估算 token、字元、百分比、快取命中率、本輪點數、MOD 明細），其餘
 * 一律不進結果，畫面上想露也露不出來。conversationId 留著做「換了對話就作廢」的閘。
 */

export type PromptBreakdownKey =
  | 'system'
  | 'roleCard'
  | 'mod'
  | 'notepad'
  | 'directive'
  | 'userProfile'
  | 'summary'
  | 'history'
  | 'worldbook'
  | 'memory'
  | 'currentInput'

export interface PromptUsageValue {
  charCount: number
  estimatedTokens: number
}

export interface PromptUsagePositions {
  mainPrompt: PromptUsageValue
  prefixRules: PromptUsageValue
  suffixRules: PromptUsageValue
}

export interface PromptModUsageDetail {
  modId: string
  enabledVersion: string
  name: string
  nameEn: string
  nameJa: string
  nameKo: string
  charCount: number
  estimatedTokens: number
  percent: number
  positions: PromptUsagePositions
  runtimeSupport: PromptUsageValue
  sharedOverhead: PromptUsageValue
}

export interface PromptBreakdownItem {
  key: PromptBreakdownKey
  labelKey: string
  color: string
  available: boolean
  sourceCount: number
  charCount: number
  estimatedTokens: number
  percent: number
  detailsAvailable: boolean
  detailsUnavailableReason: string
  totalDetailCount: number
  details: PromptModUsageDetail[]
  positions: PromptUsagePositions
  runtimeSupport: PromptUsageValue
  sharedOverhead: PromptUsageValue
}

export interface PromptBreakdownBilling {
  available: boolean
  totalPoints: number
  inputPoints: number
  cacheReadPoints: number
  outputPoints: number
  cacheHitRate: number | null
}

export interface PromptBreakdownCache {
  available: boolean
  hitRate: number | null
  inputTokens: number
  readTokens: number
  writeTokens: number
}

export interface PromptBreakdownReport {
  schemaVersion?: number
  supported: boolean
  /** ok／notReady／unsupportedModel */
  status: string
  conversationId: string
  items: PromptBreakdownItem[]
  total: PromptUsageValue
  cache: PromptBreakdownCache
  billing: PromptBreakdownBilling
}

export interface PromptDonutSegment {
  key: PromptBreakdownKey
  labelKey: string
  color: string
  percent: number
  path: string
  transform: string
  isActive: boolean
}

export const BREAKDOWN_META: Array<Pick<PromptBreakdownItem, 'key' | 'labelKey' | 'color'>> = [
  { key: 'system', labelKey: 'promptBreakdown.system', color: '#60A5FA' },
  { key: 'roleCard', labelKey: 'promptBreakdown.roleCard', color: '#F5C542' },
  { key: 'mod', labelKey: 'promptBreakdown.mod', color: '#465CFF' },
  { key: 'notepad', labelKey: 'promptBreakdown.notepad', color: '#84CC16' },
  { key: 'directive', labelKey: 'promptBreakdown.directive', color: '#DB2777' },
  { key: 'userProfile', labelKey: 'promptBreakdown.userProfile', color: '#34D399' },
  { key: 'summary', labelKey: 'promptBreakdown.summary', color: '#A78BFA' },
  { key: 'history', labelKey: 'promptBreakdown.history', color: '#FB7185' },
  { key: 'worldbook', labelKey: 'promptBreakdown.worldbook', color: '#22D3EE' },
  { key: 'memory', labelKey: 'promptBreakdown.memory', color: '#F97316' },
  { key: 'currentInput', labelKey: 'promptBreakdown.currentInput', color: '#C084FC' },
]

// ── 請求閘 ────────────────────────────────────────────────────────────
//
// 同一段對話的請求進行中不再發第二次；換了對話就把舊的作廢，晚到的回覆不會
// 蓋到新對話的畫面上。

export interface PromptDiagnosticsRequestToken {
  generation: number
  conversationId: string
}

export function createPromptDiagnosticsRequestGate() {
  let generation = 0
  let activeConversationId = ''

  const isCurrent = (token: PromptDiagnosticsRequestToken | null | undefined) => !!token &&
    token.generation === generation &&
    token.conversationId === activeConversationId

  return {
    begin(conversationId: unknown): PromptDiagnosticsRequestToken | null {
      const normalized = String(conversationId || '').trim()
      if (!normalized || activeConversationId === normalized) return null
      generation += 1
      activeConversationId = normalized
      return { generation, conversationId: normalized }
    },
    invalidate() {
      generation += 1
      activeConversationId = ''
    },
    isCurrent,
    finish(token: PromptDiagnosticsRequestToken | null | undefined): boolean {
      if (!isCurrent(token)) return false
      activeConversationId = ''
      return true
    },
  }
}

// ── 正規化 ────────────────────────────────────────────────────────────

function cleanText(value: unknown): string {
  if (value == null) return ''
  if (typeof value === 'string') return value.trim()
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  return ''
}

function compactNumber(value: unknown): number {
  const n = Number(value)
  return Number.isFinite(n) && n > 0 ? n : 0
}

function nonNegativeNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null
}

const MOD_DETAILS_UNAVAILABLE_REASONS = new Set([
  '',
  'legacy_snapshot',
  'projection_error',
  'runtime_missing',
  'invalid_detail',
  'reconcile_error',
  'size_guard',
])

function emptyUsageValue(): PromptUsageValue {
  return { charCount: 0, estimatedTokens: 0 }
}

function emptyUsagePositions(): PromptUsagePositions {
  return { mainPrompt: emptyUsageValue(), prefixRules: emptyUsageValue(), suffixRules: emptyUsageValue() }
}

function normalizeUsageValue(value: any): PromptUsageValue | null {
  if (!value || typeof value !== 'object') return null
  const charCount = nonNegativeNumber(value.charCount)
  const estimatedTokens = nonNegativeNumber(value.estimatedTokens)
  if (charCount == null || estimatedTokens == null) return null
  return { charCount, estimatedTokens }
}

function normalizeUsagePositions(value: any): PromptUsagePositions | null {
  if (!value || typeof value !== 'object') return null
  const mainPrompt = normalizeUsageValue(value.mainPrompt)
  const prefixRules = normalizeUsageValue(value.prefixRules)
  const suffixRules = normalizeUsageValue(value.suffixRules)
  if (!mainPrompt || !prefixRules || !suffixRules) return null
  return { mainPrompt, prefixRules, suffixRules }
}

function sumUsageValues(values: PromptUsageValue[]): PromptUsageValue {
  return values.reduce((sum, value) => ({
    charCount: sum.charCount + value.charCount,
    estimatedTokens: sum.estimatedTokens + value.estimatedTokens,
  }), emptyUsageValue())
}

function sameUsageValue(left: PromptUsageValue, right: PromptUsageValue): boolean {
  return left.charCount === right.charCount && left.estimatedTokens === right.estimatedTokens
}

function normalizeModDetail(value: any): PromptModUsageDetail | null {
  if (!value || typeof value !== 'object') return null
  const modId = cleanText(value.modId)
  const enabledVersion = cleanText(value.enabledVersion)
  const charCount = nonNegativeNumber(value.charCount)
  const estimatedTokens = nonNegativeNumber(value.estimatedTokens)
  const percent = nonNegativeNumber(value.percent)
  const positions = normalizeUsagePositions(value.positions)
  const runtimeSupport = normalizeUsageValue(value.runtimeSupport)
  const sharedOverhead = normalizeUsageValue(value.sharedOverhead)
  if (!modId || !enabledVersion || charCount == null || estimatedTokens == null || percent == null || percent > 100 ||
    !positions || !runtimeSupport || !sharedOverhead) {
    return null
  }
  const attributed = sumUsageValues([
    positions.mainPrompt, positions.prefixRules, positions.suffixRules, runtimeSupport, sharedOverhead,
  ])
  if (attributed.charCount !== charCount || attributed.estimatedTokens !== estimatedTokens) return null
  return {
    modId,
    enabledVersion,
    name: cleanText(value.name),
    nameEn: cleanText(value.nameEn),
    nameJa: cleanText(value.nameJa),
    nameKo: cleanText(value.nameKo),
    charCount,
    estimatedTokens,
    percent,
    positions,
    runtimeSupport,
    sharedOverhead,
  }
}

function normalizeModDetailsUnavailableReason(value: unknown): string {
  const reason = cleanText(value)
  return MOD_DETAILS_UNAVAILABLE_REASONS.has(reason) ? reason : ''
}

function emptyModFields() {
  return {
    detailsAvailable: false,
    detailsUnavailableReason: '',
    totalDetailCount: 0,
    details: [] as PromptModUsageDetail[],
    positions: emptyUsagePositions(),
    runtimeSupport: emptyUsageValue(),
    sharedOverhead: emptyUsageValue(),
  }
}

/**
 * MOD 那一桶多帶一份明細。明細只有在每一個數字都對得上總數時才放出來——
 * 加總對不上代表伺服器那邊投影有問題，畫出來玩家只會拿它跟總數比然後覺得壞了。
 */
function normalizeModItem(source: any, supported: boolean, isV2: boolean): PromptBreakdownItem {
  const meta = BREAKDOWN_META.find((item) => item.key === 'mod')!
  if (!isV2 || !source || typeof source !== 'object') {
    return { ...meta, available: false, sourceCount: 0, charCount: 0, estimatedTokens: 0, percent: 0, ...emptyModFields() }
  }
  const charCount = nonNegativeNumber(source.charCount)
  const estimatedTokens = nonNegativeNumber(source.estimatedTokens)
  const sourceCount = nonNegativeNumber(source.sourceCount)
  const totalDetailCount = nonNegativeNumber(source.totalDetailCount)
  const positions = normalizeUsagePositions(source.positions)
  const runtimeSupport = normalizeUsageValue(source.runtimeSupport)
  const sharedOverhead = normalizeUsageValue(source.sharedOverhead)
  const item: PromptBreakdownItem = {
    ...meta,
    available: supported && source.available !== false,
    sourceCount: sourceCount == null ? 0 : sourceCount,
    charCount: charCount == null ? 0 : charCount,
    estimatedTokens: supported && estimatedTokens != null ? estimatedTokens : 0,
    percent: supported ? compactNumber(source.percent) : 0,
    ...emptyModFields(),
    totalDetailCount: totalDetailCount == null ? 0 : totalDetailCount,
    positions: positions || emptyUsagePositions(),
    runtimeSupport: runtimeSupport || emptyUsageValue(),
    sharedOverhead: sharedOverhead || emptyUsageValue(),
  }
  if (!supported || !item.available || source.detailsAvailable !== true) {
    item.detailsUnavailableReason = normalizeModDetailsUnavailableReason(source.detailsUnavailableReason)
    return item
  }
  const rawDetails: unknown[] = Array.isArray(source.details) ? source.details : []
  const details = rawDetails.map(normalizeModDetail)
  const valid = details.every(Boolean) as boolean
  const checked = details as PromptModUsageDetail[]
  const detailsAreValid = Array.isArray(source.details) && details.length === source.details.length && valid &&
    sourceCount != null && totalDetailCount != null &&
    sourceCount === checked.length && totalDetailCount === checked.length &&
    charCount != null && estimatedTokens != null && positions && runtimeSupport && sharedOverhead &&
    sumUsageValues(checked).charCount === charCount &&
    sumUsageValues(checked).estimatedTokens === estimatedTokens &&
    sameUsageValue(sumUsageValues(checked.map((d) => d.positions.mainPrompt)), positions.mainPrompt) &&
    sameUsageValue(sumUsageValues(checked.map((d) => d.positions.prefixRules)), positions.prefixRules) &&
    sameUsageValue(sumUsageValues(checked.map((d) => d.positions.suffixRules)), positions.suffixRules) &&
    sameUsageValue(sumUsageValues(checked.map((d) => d.runtimeSupport)), runtimeSupport) &&
    sameUsageValue(sumUsageValues(checked.map((d) => d.sharedOverhead)), sharedOverhead) &&
    (estimatedTokens === 0
      ? checked.every((d) => d.percent === 0)
      : checked.reduce((sum, d) => sum + d.percent, 0) === 100)
  if (!detailsAreValid) {
    item.sourceCount = 0
    item.detailsUnavailableReason = 'invalid_detail'
    return item
  }
  item.detailsAvailable = true
  item.details = checked
  return item
}

export function promptBreakdownModDisplayName(
  detail: Pick<PromptModUsageDetail, 'modId' | 'name' | 'nameEn' | 'nameJa' | 'nameKo'>,
  locale: unknown,
): string {
  const language = cleanText(locale).toLowerCase()
  if (language.startsWith('en') && detail.nameEn) return detail.nameEn
  if (language.startsWith('ja') && detail.nameJa) return detail.nameJa
  if (language.startsWith('ko') && detail.nameKo) return detail.nameKo
  return detail.name || detail.modId
}

function normalizeServerCache(cache: any): PromptBreakdownCache {
  if (!cache || typeof cache !== 'object') {
    return { available: false, hitRate: null, inputTokens: 0, readTokens: 0, writeTokens: 0 }
  }
  const inputTokens = compactNumber(cache.inputTokens)
  const readTokens = compactNumber(cache.readTokens)
  const writeTokens = compactNumber(cache.writeTokens)
  const available = cache.available === true || inputTokens > 0 || readTokens > 0 || writeTokens > 0
  const hitRateValue = Number(cache.hitRate)
  return {
    available,
    hitRate: available && Number.isFinite(hitRateValue) ? hitRateValue : null,
    inputTokens,
    readTokens,
    writeTokens,
  }
}

function emptyBilling(): PromptBreakdownBilling {
  return { available: false, totalPoints: 0, inputPoints: 0, cacheReadPoints: 0, outputPoints: 0, cacheHitRate: null }
}

function normalizeServerBilling(billing: any): PromptBreakdownBilling {
  if (!billing || typeof billing !== 'object') return emptyBilling()
  const totalPoints = compactNumber(billing.totalPoints)
  const inputPoints = compactNumber(billing.inputPoints)
  const cacheReadPoints = compactNumber(billing.cacheReadPoints)
  const outputPoints = compactNumber(billing.outputPoints)
  const hitRateValue = Number(billing.cacheHitRate)
  const available = billing.available === true || totalPoints > 0 || inputPoints > 0 || cacheReadPoints > 0 || outputPoints > 0
  return {
    available,
    totalPoints: available ? totalPoints : 0,
    inputPoints: available ? inputPoints : 0,
    cacheReadPoints: available ? cacheReadPoints : 0,
    outputPoints: available ? outputPoints : 0,
    cacheHitRate: available && Number.isFinite(hitRateValue) ? hitRateValue : null,
  }
}

/** 伺服器沒給百分比時自己分：最大餘數法，加總剛好 100。 */
function applyPercents(items: PromptBreakdownItem[]): PromptBreakdownItem[] {
  const totalTokens = items.reduce((sum, item) => sum + item.estimatedTokens, 0)
  if (totalTokens <= 0) return items.map((item) => ({ ...item, percent: 0 }))
  const withFractions = items.map((item, index) => {
    const raw = item.estimatedTokens / totalTokens * 100
    const base = Math.floor(raw)
    return { index, base, fraction: raw - base }
  })
  let remaining = 100 - withFractions.reduce((sum, item) => sum + item.base, 0)
  withFractions
    .slice()
    .sort((a, b) => b.fraction - a.fraction || a.index - b.index)
    .forEach((item) => {
      if (remaining > 0) {
        item.base += 1
        remaining -= 1
      }
    })
  const percentByIndex = new Map(withFractions.map((item) => [item.index, item.base]))
  return items.map((item, index) => ({ ...item, percent: percentByIndex.get(index) || 0 }))
}

export function normalizeServerReport(report: any): PromptBreakdownReport | null {
  if (!report || typeof report !== 'object' || !Array.isArray(report.items)) return null
  const supported = report.supported !== false
  const status = cleanText(report.status) || (supported ? 'ok' : 'unsupportedModel')
  const isV2 = report.schemaVersion === 2
  const sourceByKey = new Map<string, any>(report.items.map((item: any) => [cleanText(item && item.key), item || {}]))
  const items: PromptBreakdownItem[] = BREAKDOWN_META.map((meta) => {
    if (meta.key === 'mod') return normalizeModItem(sourceByKey.get('mod'), supported, isV2)
    const source = sourceByKey.get(meta.key) || {}
    return {
      ...meta,
      available: supported && source.available !== false,
      sourceCount: compactNumber(source.sourceCount),
      charCount: compactNumber(source.charCount),
      estimatedTokens: supported ? compactNumber(source.estimatedTokens) : 0,
      percent: supported ? compactNumber(source.percent) : 0,
      ...emptyModFields(),
    }
  })
  const total: PromptUsageValue = {
    charCount: compactNumber(report.total && report.total.charCount),
    estimatedTokens: supported ? compactNumber(report.total && report.total.estimatedTokens) : 0,
  }
  if (supported && total.estimatedTokens <= 0) {
    total.estimatedTokens = items.reduce((sum, item) => sum + item.estimatedTokens, 0)
    total.charCount = items.reduce((sum, item) => sum + item.charCount, 0)
  }
  const normalizedItems = supported && items.reduce((sum, item) => sum + item.percent, 0) === 0
    ? applyPercents(items)
    : items
  return {
    schemaVersion: isV2 ? 2 : undefined,
    supported,
    status,
    conversationId: cleanText(report.conversationId),
    items: normalizedItems,
    total,
    cache: normalizeServerCache(report.cache),
    billing: normalizeServerBilling(report.billing),
  }
}

// ── 選中的桶 ──────────────────────────────────────────────────────────

/** 可以點的桶：有 token；或是 MOD 那桶雖然 0 token 但有明細可看。 */
export function promptBreakdownItemSelectable(item: PromptBreakdownItem | null | undefined): boolean {
  return !!(item && item.available !== false && (
    Number(item.estimatedTokens) > 0 ||
    (item.key === 'mod' && item.detailsAvailable && Array.isArray(item.details) && item.details.length > 0)
  ))
}

function emptySystemItem(): PromptBreakdownItem {
  return {
    ...BREAKDOWN_META[0],
    available: false,
    sourceCount: 0,
    charCount: 0,
    estimatedTokens: 0,
    percent: 0,
    ...emptyModFields(),
  }
}

/** 選中的桶：玩家點過的那個；沒點過或點的不可選就退到第一個可選的；連可選的都沒有就給第一列。 */
export function resolvePromptBreakdownActiveItem(items: PromptBreakdownItem[] | null | undefined, activeKey: string): PromptBreakdownItem {
  const list = Array.isArray(items) ? items : []
  const active = list.find((item) => item && item.key === activeKey && promptBreakdownItemSelectable(item))
  if (active) return active
  return list.find((item) => promptBreakdownItemSelectable(item)) || list[0] || emptySystemItem()
}

// ── 圓環 ──────────────────────────────────────────────────────────────

function donutNumber(value: number): number {
  return Number.parseFloat(Number(value).toFixed(3))
}

function donutPoint(cx: number, cy: number, radius: number, angle: number) {
  const radians = (angle - 90) * Math.PI / 180
  return {
    x: donutNumber(cx + radius * Math.cos(radians)),
    y: donutNumber(cy + radius * Math.sin(radians)),
  }
}

function donutSegmentPath(startAngle: number, endAngle: number, outerRadius = 47, innerRadius = 29): string {
  const cx = 50
  const cy = 50
  const sweep = Math.max(0.01, endAngle - startAngle)
  const safeEndAngle = startAngle + Math.min(359.99, sweep)
  const outerStart = donutPoint(cx, cy, outerRadius, startAngle)
  const outerEnd = donutPoint(cx, cy, outerRadius, safeEndAngle)
  const innerEnd = donutPoint(cx, cy, innerRadius, safeEndAngle)
  const innerStart = donutPoint(cx, cy, innerRadius, startAngle)
  const largeArc = safeEndAngle - startAngle > 180 ? 1 : 0
  return [
    `M ${outerStart.x} ${outerStart.y}`,
    `A ${outerRadius} ${outerRadius} 0 ${largeArc} 1 ${outerEnd.x} ${outerEnd.y}`,
    `L ${innerEnd.x} ${innerEnd.y}`,
    `A ${innerRadius} ${innerRadius} 0 ${largeArc} 0 ${innerStart.x} ${innerStart.y}`,
    'Z',
  ].join(' ')
}

export function buildPromptDonutSegments(items: PromptBreakdownItem[] = [], selectedKey = ''): PromptDonutSegment[] {
  const visible = (Array.isArray(items) ? items : []).filter((item) =>
    item && item.available !== false && Number(item.estimatedTokens) > 0)
  if (!visible.length) return []
  const totalTokens = visible.reduce((sum, item) => sum + (Number(item.estimatedTokens) || 0), 0)
  if (totalTokens <= 0) return []
  const activeKey = selectedKey || visible[0].key
  let cursor = 0
  return visible.map((item, index) => {
    const share = (Number(item.estimatedTokens) || 0) / totalTokens
    const startAngle = cursor
    const endAngle = index === visible.length - 1 ? 360 : cursor + share * 360
    cursor = endAngle
    const midAngle = (startAngle + endAngle) / 2
    const isActive = item.key === activeKey
    const radians = (midAngle - 90) * Math.PI / 180
    const dx = donutNumber(Math.cos(radians) * 4.5)
    const dy = donutNumber(Math.sin(radians) * 4.5)
    return {
      key: item.key,
      labelKey: item.labelKey,
      color: item.color,
      percent: item.percent || Math.round(share * 100),
      path: donutSegmentPath(startAngle, endAngle),
      transform: isActive ? `translate(${dx} ${dy}) translate(50 50) scale(1.045) translate(-50 -50)` : '',
      isActive,
    }
  })
}

export function formatPromptNumber(value: unknown): string {
  return (Number(value) || 0).toLocaleString('en-US')
}
