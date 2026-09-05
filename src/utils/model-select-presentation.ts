// 選單呈現層的純計算：計價字串、狀態燈、免費模型分組、排序、monogram 色相。
//
// 為什麼獨立成一層：modelSelect.vue 兩端各兩千多行，把「哪個數字該顯示成什麼」
// 埋在模板裡的話，兩端必然漂移——而計價一旦漂移，使用者就會看到一個數字、被扣
// 另一個。這是這一頁最不該發生的不一致。mobile 有一份同語意的 .js，兩份都改。
//
// 設計依據：docs/design/model-select-v3.md §3.4（計價／圖示）與 §3.55（排序）。

import { getModelLatencySignal, getModelPerformanceChips, getModelSignalBadges } from './model-health-metrics'

export const FREE_MODEL_BASE = 'BaseBot'

// 色盤取自 lunatalk-ui-primitives §5.1。不是任意 hash 值——任意 hue 會撞上
// 60-90° 那段髒黃綠，在暗底上發灰。
export const MONOGRAM_HUES = [350, 20, 45, 150, 190, 220, 260, 300]

// 「熱門」需要一個站內用量欄位，server 端還沒有；沒有資料時由呼叫端退回 default
// （見 §3.55 降級規則），所以它仍然列在這裡，不是等資料到了才加。
export const SORT_MODES = [
  'default', 'popular', 'price', 'latency', 'throughput', 'intelligence', 'stability',
] as const

export type SortMode = typeof SORT_MODES[number]

export interface PriceDisplay {
  amountText: string
  from: boolean
  dynamic: boolean
  original: number | null
}

type Variant = Record<string, any>
type Family = Record<string, any>

export function isFreeModelValue(value: any): boolean {
  const v = String(value || '').trim().toLowerCase()
  return v === FREE_MODEL_BASE.toLowerCase() || v.startsWith(FREE_MODEL_BASE.toLowerCase() + '-')
}

function finite(n: any): number | null {
  // null/undefined 要先擋掉：`Number(null) === 0`，而 0 對「失敗率」這種指標是
  // **有意義的真值**（近期沒出過錯）。不擋的話，完全沒有遙測的模型會被當成
  // 失敗率 0，然後排到「最穩定」的第一名。
  if (n === null || n === undefined || n === '') return null
  const v = Number(n)
  return Number.isFinite(v) ? v : null
}

// 一個 variant 實際的「下限價」。浮動的用估算下限，固定的用固定價。
function variantFloorPrice(variant: Variant | null | undefined): number | null {
  if (!variant) return null
  if (variant.billingType === 'dynamic') {
    const est = finite(variant.estMinScore)
    if (est !== null) return est
  }
  return finite(variant.costScore)
}

/**
 * 列上那個數字。永遠回答「至少多少」，兩個修飾符各自獨立：
 *   from    還有更貴的線路
 *   dynamic 浮動計費，數字是估算
 *
 * 刻意回結構而不是拼好的字串：en 的「起」是前綴（from 25 credits），語序跟中文
 * 相反，所以文案必須是一個完整的 i18n key，不能由這裡拼。
 */
export function familyPriceDisplay(family: Family | null | undefined): PriceDisplay | null {
  if (!family || !Array.isArray(family.variants) || family.variants.length === 0) return null

  const prices = family.variants.map(variantFloorPrice).filter((p): p is number => p !== null)
  if (prices.length === 0) return null

  const floor = Math.min(...prices)
  const dynamic = family.variants.some((v: Variant) => v && v.billingType === 'dynamic')
  // 「起」看的是線路之間有沒有價差，跟浮動與否無關——兩者可以同時成立。
  const from = prices.some(p => p !== floor)

  let original: number | null = null
  if (family.discountUntilTs > 0) {
    const cheapest = family.variants
      .filter((v: Variant) => variantFloorPrice(v) === floor)
      .map((v: Variant) => finite(v && v.originalCostScore))
      .filter((v): v is number => v !== null && v > 0)
    if (cheapest.length) original = cheapest[0]
  }

  return { amountText: (dynamic ? '~' : '') + String(floor), from, dynamic, original }
}

/**
 * 狀態燈。**正常不給任何點。**
 *
 * 一頁 50 列全綠燈等於沒有燈（owner 在 Figma 上的批註就是這件事）。只有例外態
 * 才亮，跟卡片徽章色階（primitives §5.2）同一條原則。
 */
export function familyStatusTone(family: Family | null | undefined): string | null {
  if (!family) return null
  const best = String(family.bestStatus || '').toLowerCase()
  if (best === 'red') return 'danger'
  if (best === 'yellow') return 'warning'

  // 資料不足跟「正常」是兩件事：前者我們不知道，後者我們知道它好。
  //
  // 但「沒有 status 物件」不等於資料不足——那只代表這一輪沒帶遙測回來，
  // 而伺服器已經在 bestStatus 給了判斷。只有伺服器**明講**信心不足才點燈，
  // 否則每個剛接入、遙測還沒補上的模型都會無端掛一顆灰點。
  const variants: Variant[] = Array.isArray(family.variants) ? family.variants : []
  const withStatus = variants.filter(v => v && v.status)
  if (withStatus.length) {
    const anyConfident = withStatus.some(v => {
      const c = String(v.status.confidence || '')
      return c !== 'none' && c !== 'low'
    })
    if (!anyConfident) return 'unknown'
  }
  return null
}

/**
 * 免費模型收成一列。
 *
 * 號碼制本身沒有動：值仍是 BaseBot-1／BaseBot-2，只是從掃視層移到決定層。
 * 合併在語意上也成立——免費額度是每帳號共用的，不是每個號碼各一份，
 * 它們本來就是「同一個東西的兩種承接」。
 */
export function mergeFreeModelFamilies(families: Family[], displayName = '免費模型'): Family[] {
  if (!Array.isArray(families)) return families
  const freeIndexes: number[] = []
  families.forEach((f, i) => {
    const variants: Variant[] = (f && f.variants) || []
    if (variants.length && variants.every(v => isFreeModelValue(v && v.value))) freeIndexes.push(i)
  })
  if (freeIndexes.length === 0) return families

  const first = freeIndexes[0]
  const merged: Family = {
    ...families[first],
    family: displayName,
    isFreeModelGroup: true,
    variants: freeIndexes.reduce<Variant[]>((acc, i) => acc.concat(families[i].variants || []), []),
  }

  const out: Family[] = []
  families.forEach((f, i) => {
    if (i === first) out.push(merged)
    else if (!freeIndexes.includes(i)) out.push(f)
  })
  return out
}

// 指標取值。兩條規則：
//
// 1. **排序取的值 === 畫面顯示的值。** 延遲、吐字速度、穩定度都走 model-health-metrics
//    的同一組函式——那是畫面用來決定「顯示什麼、顯不顯示」的地方。自己另外讀
//    `status.avgLatencyMs` 的後果實測過：畫面顯示首字 1.0s 的模型排在第 23 位，而畫面上
//    根本沒有首字的排在最前面。使用者從畫面上無從理解那個排序，因為排序依據他看不到。
// 2. **沒有觀測資料一律回 null**，不要挑一個哨兵數字。缺資料原本用 Infinity 當哨兵，
//    `Infinity - 500` 還是 `Infinity`，tie-break 的有限性守衛判它不是有效比較 → 退回原始
//    索引，於是缺資料的項目跟每一個項目都「同分」，留在原本的位置。哨兵值在無限大這個
//    邊界上會跟 tie-break 打架。

function familyIntelligence(f: Family): number | null {
  const v = finite(f && f.aaIntelligenceIndex)
  // 伺服器對 0 是 omitempty，所以 0 等於沒有資料。
  return v === null || v <= 0 ? null : v
}

function familyFloorPrice(f: Family): number | null {
  const d = familyPriceDisplay(f)
  if (!d) return null
  return finite(d.amountText.replace('~', ''))
}

function familyPopularity(f: Family): number | null {
  const v = finite(f && f.usageShare)
  return v === null || v <= 0 ? null : v
}

/** 預設的代表線路：第一個帶 status 的 variant。呼叫端應改傳畫面實際顯示的那一條。 */
function defaultPrimaryVariant(f: Family): Variant | null {
  const variants: Variant[] = (f && f.variants) || []
  for (const v of variants) if (v && v.status) return v
  return variants[0] || null
}

function latencyOf(status: any): number | null {
  const signal = getModelLatencySignal(status)
  // source === 'none' 就是畫面不顯示首字的那個狀態，對排序而言等於沒有資料。
  return signal.source === 'none' || !(signal.latencyMs > 0) ? null : signal.latencyMs
}

function throughputOf(status: any): number | null {
  const chip = getModelPerformanceChips(status).find(c => c.key === 'tokensPerSecond')
  if (!chip) return null
  return finite(status?.performance?.tokensPerSecond?.current)
}

function stabilityOf(status: any): number | null {
  if (!status) return null
  // 畫面標「樣本不足」時失敗率不可信，排序也不該信——用同一個判斷，它就不會漂開。
  const insufficient = getModelSignalBadges(status)
    .some(b => b.key === 'modelSelect.signalInsufficientSample')
  if (insufficient) return null
  // 失敗率 0 是真資料（近期沒出過錯），必須排最前面——不能用 falsy 判斷。
  return finite(status.failureRate)
}

interface SortMetric {
  get: (f: Family, primary: Variant | null) => number | null
  /** asc = 越小越好 */
  dir: 'asc' | 'desc'
}

const SORT_METRICS: Record<string, SortMetric> = {
  price: { get: f => familyFloorPrice(f), dir: 'asc' },
  intelligence: { get: f => familyIntelligence(f), dir: 'desc' },
  popular: { get: f => familyPopularity(f), dir: 'desc' },
  latency: { get: (_f, p) => latencyOf(p && p.status), dir: 'asc' },
  throughput: { get: (_f, p) => throughputOf(p && p.status), dir: 'desc' },
  stability: { get: (_f, p) => stabilityOf(p && p.status), dir: 'asc' },
}

export interface SortContext {
  /**
   * 這個家族在畫面上代表的那一條線路。畫面用的是「使用者選中的，否則第一條可選的」，
   * 而那依賴組件狀態，所以由呼叫端傳進來——排序與顯示必須看同一條線路，否則會出現
   * 「照 A 線路排序、顯示 B 線路數字」的錯位。
   */
  primaryVariantOf?: (f: Family) => Variant | null
}

/**
 * 排序。三條規則，順序不能顛倒：
 *
 * 1. **取值等於畫面顯示的值**（見上面的註解）。
 * 2. **沒有觀測資料的一律沉底**，不論這個排序是「越小越好」還是「越大越好」。
 *    「首字最快」的第一名應該是真的量到很快的那個，不是我們沒量過的那個——後者對
 *    使用者是誤導，而且它看起來跟正確結果一模一樣。
 * 3. **同分回到預設次序。** 沒有這條，「智力高」這種大量同分的排序每次進頁順序都在跳，
 *    使用者會以為列表是隨機的。用原始索引當 tie-break，而不是依賴 sort 的穩定性——
 *    穩定性只保證同一次呼叫內，不保證跨呼叫的輸入順序一致。
 *
 * 沉底的那一群彼此也照原始次序，理由同第 3 條。
 */
/**
 * 新品在**預設瀏覽序**裡置頂。
 *
 * 新品剛上架時全球用量榜上還沒有它，`usageShare` 是 null，於是照「沒有觀測資料一律
 * 沉底」被排到最後面——我們剛接進來的模型在預設排序下反而最不容易被看到，跟「新品」
 * 徽章想達到的效果正好相反。
 *
 * **只作用在熱門（預設）**。使用者明確挑了價格／首字／智力時，他要的就是那個排序，
 * 新品沒有理由插隊。
 */
export function isNewFamily(f: any): boolean {
  return Array.isArray(f && f.badges) && f.badges.indexOf('new') !== -1
}

export function sortFamilies(families: Family[], mode: string, ctx: SortContext = {}): Family[] {
  if (!Array.isArray(families)) return families
  const metric = SORT_METRICS[mode]
  const primaryOf = ctx.primaryVariantOf || defaultPrimaryVariant
  const pinNew = mode === 'popular'
  const indexed = families.map((f, i) => ({
    f, i, v: metric ? metric.get(f, primaryOf(f)) : null, n: pinNew && isNewFamily(f),
  }))
  if (!metric) return indexed.map(x => x.f)
  indexed.sort((x, y) => {
    if (x.n !== y.n) return x.n ? -1 : 1
    const xMissing = x.v === null
    const yMissing = y.v === null
    if (xMissing !== yMissing) return xMissing ? 1 : -1
    if (!xMissing) {
      const r = metric.dir === 'asc'
        ? (x.v as number) - (y.v as number)
        : (y.v as number) - (x.v as number)
      if (r !== 0) return r
    }
    return x.i - y.i
  })
  return indexed.map(x => x.f)
}

/**
 * 分類切換的參數正規化。
 *
 * 同一個切換函式有兩種呼叫形狀：既有的 tabs 元件送 `{ index }`，v3 的側欄直接送
 * 數字。不正規化的話，數字進去會讓 `e.index` 變成 `undefined`，
 * `modelTabs[undefined]` 得到空陣列，畫面只顯示「暫無模型」——**症狀與根因不在
 * 同一層**，看起來像資料沒回來，其實是參數形狀不對。
 *
 * 認不出來的一律回 -1（＝全部），寧可多顯示也不要顯示成空的：空列表會讓人以為
 * 那個分類真的沒有模型。
 */
export function normalizeTabIndex(e: any): number {
  const raw = typeof e === 'number' ? e : (e && typeof e === 'object' ? e.index : undefined)
  const n = Number(raw)
  return Number.isInteger(n) ? n : -1
}

/** 無品牌素材時的退路色相（primitives §5.1 確定性色相 monogram）。 */
export function monogramHue(name: any): number {
  const s = String(name || '')
  let acc = 0
  for (let i = 0; i < s.length; i++) acc = (acc + (s.codePointAt(i) || 0)) % 100000
  return MONOGRAM_HUES[acc % MONOGRAM_HUES.length]
}

/**
 * 清單的識別鍵。**去重與 v-for 的 :key 必須用同一個函式**——這是「鍵一定唯一」
 * 這件事成立的唯一理由；分成兩套規則的話，某天它們會漂開，而漂開的症狀不是
 * 顯示錯誤，是整頁的 patch 壞掉。
 *
 * 缺 family 名時退回第一個 variant 的值：兩筆都沒有名字的話，用空字串當鍵會讓
 * 它們互相衝突，等於自己製造出要防的那個問題。
 */
export function familyKey(family: Family | null | undefined): string {
  const name = String((family && family.family) || '').trim()
  if (name) return name
  const variants: Variant[] = (family && family.variants) || []
  const first = variants.find(v => v && v.value)
  return first ? 'v:' + String(first.value) : ''
}

/**
 * 同一個顯示名稱在一份清單裡只留一列。
 *
 * 由來（2026-08-27 beta 實測）：「全部」把每個分類的 families 攤平，而同一個模型
 * 同時掛在「精選」與它的品牌分類底下——43 列裡有 10 個名字各出現兩次。使用者直接
 * 看得到重複列，而 v-for 拿到的是重複鍵。
 *
 * 重複鍵在順序不變時是潛伏的（Vue 照位置 patch，看起來正常）；一旦排序讓清單重排，
 * keyed patch 會拿到 undefined 的 vnode 並整組壞掉——選項點了不會變、浮層關不掉。
 * 所以這不是「順手清一下重複」，是排序功能能不能存在的前提。
 *
 * 保留第一次出現的位置：分類順序把「精選」排在品牌分類之前，第一筆就是策展過的那筆。
 */
export function dedupeFamilies(families: Family[]): Family[] {
  if (!Array.isArray(families)) return families
  const seen = new Set<string>()
  const out: Family[] = []
  for (const f of families) {
    const key = familyKey(f)
    if (key && seen.has(key)) continue
    if (key) seen.add(key)
    out.push(f)
  }
  return out
}

/**
 * 線路列的點燈。**「不知道」與「有問題」是兩種視覺。**
 *
 * 舊寫法只分 green / red，其餘一律 amber。server 把「沒有新鮮證據」的模型從 green
 * 改成 unknown 之後，那一大批會集體掛黃點——而黃點在我們的語彙裡是「偏慢／有狀況」，
 * 使用者會讀成「這條線路怪怪的」，真相卻是「我們沒有資料」。用錯的燈比不點燈更糟：
 * 不點燈只是少講一件事，點錯燈是講錯一件事。
 *
 * 認不得的狀態值一律落到 unknown，不落到 warning——server 之後還會加狀態值，
 * 預設要往「少講」的方向倒。
 */
/**
 * 把「目前使用」那一列釘到最上面。
 *
 * 比對用的是**選中的線路 value**，不是家族名——免費那一列在畫面上已經被
 * mergeFreeModelFamilies 改名成顯示名（「免費模型」），拿目錄裡的原始名
 * （BaseBot）去比永遠不相等，於是免費檔位使用者的「目前使用」永遠釘不到，
 * 而排序又把沒有全球用量的沉底，它就落在整份清單的最底部。
 *
 * 目標由呼叫端傳進來，**這裡不去問「現在選了誰」**：釘住的目標若取當下選中，
 * 使用者點一條線路就改變了當下選中，於是他自己的動作把他正在看的那一列搬走。
 * 呼叫端要傳的是**進頁時**的選擇。
 */
export function pinFamilyToTop(families: any[], selectedModelValue: string | null | undefined): any[] {
  const list = Array.isArray(families) ? families : []
  if (!selectedModelValue) return list
  const idx = list.findIndex(f =>
    Array.isArray(f && f.variants) && f.variants.some((v: any) => v && v.value === selectedModelValue))
  if (idx <= 0) return list
  return [list[idx]].concat(list.slice(0, idx)).concat(list.slice(idx + 1))
}

export function variantStatusTone(status: any): string | null {
  if (!status) return null
  const s = String(status.status || '').toLowerCase()
  if (s === 'red') return 'danger'
  if (s === 'yellow') return 'warning'
  if (s === 'green') return null
  return 'unknown'
}

// ── 展開層的指標 ────────────────────────────────────────────────────────────
//
// 版面決定內容：線路列第二行只放得下**兩個**指標（手機 390px 實測，三個就截斷），
// KV 區四到五列是上限。所以這一層的工作是**決定哪些值得佔位**，不是把有的都塞出去。
//
// 門檻都是具名常數：它們是會被校準的東西，寫死在條件式裡的話下次調整得先讀懂整段邏輯。

/** 逐小時狀態方塊的分檔。**必須等於 server 判燈號的那一組**，否則會出現
 *  「圖上一格綠、燈卻是紅」這種沒人認帳的畫面。 */
export const UPTIME_GREEN_AT_LEAST = 95
export const UPTIME_RED_BELOW = 75
/** 一格的樣本下限。1-2 筆算出來的百分比是雜訊：一筆失敗就是 0%，會畫出一格刺眼的
 *  紅，而它什麼也沒證明。server 側同樣用 5 筆。 */
export const UPTIME_BUCKET_MIN_SAMPLES = 5

/**
 * 一小時一格的顏色。
 *
 * **server 已經算好了**：每一格帶 state（normal/degraded/error/no_data），而且它那邊的
 * 註解明講不要讓前端拿 percent 自己分檔——兩邊各存一份門檻會慢慢分岔，分岔之後沒有
 * 任何測試看得見（列上的燈跟點進去的方塊圖會對同一段時間給出不同顏色）。
 *
 * 所以優先讀 state；讀不到才用 percent 分檔，那條路只是為了相容還沒帶 state 的舊回應，
 * 不是第二套真理。門檻與樣本下限維持與 server 同值。
 */
export function uptimeBucketTone(bucket: any): 'none' | 'green' | 'amber' | 'red' {
  if (!bucket) return 'none'
  const state = typeof bucket.state === 'string' ? bucket.state : ''
  if (state) {
    if (state === 'normal') return 'green'
    if (state === 'degraded') return 'amber'
    if (state === 'error') return 'red'
    return 'none'
  }
  const total = finite(bucket.total) || 0
  if (total < UPTIME_BUCKET_MIN_SAMPLES) return 'none'
  const pct = finite(bucket.percent)
  if (pct === null) return 'none'
  if (pct >= UPTIME_GREEN_AT_LEAST) return 'green'
  if (pct >= UPTIME_RED_BELOW) return 'amber'
  return 'red'
}

/** 樣本不足時整列不出現，不寫一個「100%（3 筆）」去誤導。 */
export const UPTIME_MIN_SAMPLES_24H = 20
/** 只在「剛從故障恢復」時追加 72h：24h 明顯比 72h 好。反向落差由燈號負責，不重複講。 */
export const UPTIME_72H_DELTA_POINTS = 1.0

export interface LaneMetrics {
  /** 沒有真實對話撐起來的數字。首字與完整回覆率同源，要空一起空。 */
  noUsageData: boolean
  latencyMs: number | null
  /** 只有落差夠大才有值——落差小的時候這個數字沒有資訊量。 */
  completionRate: number | null
  outputRate: number | null
  /**
   * 沒有速度資料時的退路：近期可用率。
   *
   * 有速度資料時一律是 null——那一列只放得下兩個指標，可用率不跟首字搶位置。
   */
  uptimePercent: number | null
}

function metricCurrent(perf: any, key: string): number | null {
  const v = finite(perf && perf[key] && perf[key].current)
  return v === null || v <= 0 ? null : v
}

/**
 * 線路列第二行要顯示什麼。
 *
 * `probeOnly` 是 server 明講「這個結論只有探針支撐、沒有真實對話」。探針是幾十 token
 * 的非串流請求，拿它算速度會讓閒置模型看起來比實際快得多，所以那種情況下速度類指標
 * 一個都不給。
 *
 * 但「不給速度」不等於「這一列空著」。空著的代價是使用者把它讀成「這條線路從來沒人
 * 用過」而永遠不點——於是它永遠拿不到速度資料，而那正是它需要的東西。正式站 95 條
 * 線路裡有 57 條卡在這個迴圈裡。
 *
 * 可用率是探針就能撐起來的，而且跨線路可比。所以沒有速度資料時退回可用率——
 * 那是一個**真的、探針量得到的**數字，不是拿探針的往返時間去冒充首字延遲。
 */
export function laneMetrics(status: any): LaneMetrics {
  const empty: LaneMetrics = {
    noUsageData: true, latencyMs: null, completionRate: null, outputRate: null, uptimePercent: null,
  }
  const fallbackUptime = (): LaneMetrics => {
    const up = (status && status.uptime) || null
    const pct = finite(up && up.percent24h)
    const samples = finite(up && up.samples24h) || 0
    // 樣本不足就照舊承認沒資料——一個「100%（3 筆）」比一句「沒資料」更糟。
    if (pct === null || samples < UPTIME_MIN_SAMPLES_24H) return empty
    return { noUsageData: false, latencyMs: null, completionRate: null, outputRate: null, uptimePercent: pct }
  }
  if (!status || status.probeOnly === true) return fallbackUptime()

  const perf = status.performance || null
  const latencyMs = metricCurrent(perf, 'firstTokenLatencyMs')
  const completionRate = metricCurrent(perf, 'completionRate')
  if (latencyMs === null && completionRate === null) return fallbackUptime()


  // 原值回傳,不設門檻:列上永遠顯示出字率,所以沒有「值不值得佔位」這回事了。
  const outputRate = metricCurrent(perf, 'outputRate')

  return { noUsageData: false, latencyMs, completionRate, outputRate, uptimePercent: null }
}

export interface DetailMetrics {
  agentic: number | null
  usage: { rank: number; total: number; share: number } | null
  uptime: { percent24h: number; percent72h: number | null } | null
  contextRange: { min: string; max: string } | null
}

/**
 * 展開層 KV 區的值。**列組是固定的**——沒有資料的列回 null 讓呼叫端畫「—」，
 * 而不是整列消失：列會忽有忽無的話，同一個位置在不同卡片上是不同的東西，
 * 跨卡片比較就沒了，而那正是選兩欄 KV 的理由。
 *
 * 唯一會整列消失的是可用率，因為樣本不足時那個數字是誤導而不是缺漏。
 */
export function detailMetrics(family: Family | null | undefined, primary: Variant | null): DetailMetrics {
  const f = family || {}
  const agentic = (() => {
    const v = finite(f.aaAgenticIndex)
    return v === null || v <= 0 ? null : v
  })()

  const rank = finite(f.usageRank)
  const usage = rank !== null && rank > 0
    // 小數一位跟 getUsageRank 同一條規則：取整數會把 0.4% 變成 0%，
    // 不取則會把 0.32893907412701234 原封不動送上畫面（實測踩過）。
    ? {
      rank: Math.round(rank),
      total: Math.round(finite(f.usageTotal) || 0),
      share: Math.round((finite(f.usageShare) || 0) * 10) / 10,
    }
    : null

  const up = (primary && primary.status && primary.status.uptime) || null
  let uptime: DetailMetrics['uptime'] = null
  if (up) {
    const p24 = finite(up.percent24h)
    const s24 = finite(up.samples24h) || 0
    if (p24 !== null && s24 >= UPTIME_MIN_SAMPLES_24H) {
      const p72 = finite(up.percent72h)
      // 只有「24h 明顯比 72h 好」才追加——那句話的意思是「這條線路最近才剛恢復」。
      const worthShowing72h = p72 !== null && p72 <= p24 - UPTIME_72H_DELTA_POINTS
      uptime = { percent24h: p24, percent72h: worthShowing72h ? p72 : null }
    }
  }

  const opts: any[] = Array.isArray(f.contextBudgetOptions) ? f.contextBudgetOptions : []
  const contextRange = opts.length
    ? { min: String(opts[0].text || ''), max: String(opts[opts.length - 1].text || '') }
    : null

  return { agentic, usage, uptime, contextRange }
}
