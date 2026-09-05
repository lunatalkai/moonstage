/**
 * 顯示層替換引擎。
 *
 * 純函式，不碰 DOM、不碰網路、不 import 任何東西——所以 desktop（Vite/vitest）與
 * mobile（webpack/jest）可以用同一份檔案。
 *
 * 這份檔案在兩端**必須逐位元組相同**，由
 * 雙端等價檢查擋著。rich-text-renderer.js
 * 就是各寫一份的下場：兩端已經差了 189 行，而漂移的那天沒有任何測試會紅。
 *
 * 鐵律：本引擎只作用在「玩家看到的內容」。送給模型的原文不經過這裡，
 * 呼叫端也不得把它的產物寫回訊息。作者用規則「刪掉」一段字，只是玩家看不到，
 * 模型仍然讀得到原文。
 *
 * 語法刻意與競品同形，讓作者既有的規則能直接搬過來，不必重學一套。
 */

/**
 * 單條規則的輸出預算下限（256 KB）。長訊息按輸入長度 4 倍放大。
 *
 * 為什麼要有預算：一條匹配式寫太鬆（例如只寫一個冒號）配上一大塊替換內容，
 * 一則訊息裡命中幾十處，產物會瞬間膨脹到讓頁面卡死。超了就整條回滾——
 * 讓那一條規則不生效，而不是讓整頁掛掉。
 */
const DISPLAY_RULE_MIN_BUDGET = 262144

/** 合法旗標。沒有 d、沒有 v——與競品一致，避免作者的規則在兩邊行為不同。 */
const ALLOWED_FLAGS = 'gimsuy'

const ROLLBACK_BAD_REGEX = 'bad_regex'
const ROLLBACK_EMPTY_MATCH = 'empty_match'
const ROLLBACK_REPLACEMENT_ALONE = 'replacement_alone'
const ROLLBACK_VOLUME = 'volume'

const SLASH_FORM = /^\/([\s\S]+)\/([a-zA-Z]*)$/
const FIELD_TOKEN = /\$([a-zA-Z_一-龥][\w一-龥]*)/g
const RANDOM_TOKEN = /\{\{random:([^}]*)\}\}/g

function escapeLiteral(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * 把匹配式裡的漢字展開成「簡繁都吃」的字元類。
 *
 * 為什麼要有這一步：規則的匹配式是作者寫死的字面（多半簡體，卡片是從簡體平台
 * 搬過來的），但玩家看到的文字不一定同形——站台對 zh-Hant 使用者會把開場白
 * 繁體化，模型自己也常把簡體標記吐成繁體。字形一差，字面比對就永遠不命中，
 * 而症狀只是「畫面上留著一個沒被替換的標記」，作者查不出原因。
 *
 * 逐條加「繁→簡」的正規化規則補不完：每張匯入的卡、每個標記都要補一次。
 *
 * 展開而不是改文字，是因為替換與捕獲組都仍然作用在原文上——玩家看到的字形
 * 不會被我們換成另一形（$1 帶出來的還是他螢幕上那幾個字）。
 *
 * 對照表由伺服器算好傳下來（簡繁對照表在那邊），這裡只做字串層的展開：
 *   類外  开 → [开開]
 *   類內  [开合] → [开開合]   ← 巢狀字元類在 JS 是語法錯誤，必須併入原類
 * 只處理漢字。ASCII 與標點不能碰：`(` 被展開就不再是捕獲組。
 */
function expandVariantClasses(source, variants) {
  if (!variants) return source
  let out = ''
  let inClass = false
  for (let i = 0; i < source.length; i++) {
    const ch = source[i]
    if (ch === '\\') {
      // 跳脫序列整組原樣搬過去，否則 \n 的 n 會被當成獨立字元看待。
      out += ch + (source[i + 1] || '')
      i++
      continue
    }
    if (!inClass && ch === '[') {
      inClass = true
      out += ch
      continue
    }
    if (inClass && ch === ']') {
      inClass = false
      out += ch
      continue
    }
    const klass = Object.prototype.hasOwnProperty.call(variants, ch) ? variants[ch] : ''
    if (!klass || klass.length < 2) {
      out += ch
      continue
    }
    out += inClass ? klass : '[' + klass + ']'
  }
  return out
}

/**
 * 判斷匹配式的形態。
 *
 * 前置處理：先 trim，再剝掉首尾反引號（作者常包一層反引號方便輸入）。
 * `/pattern/flags` → 正則；其餘任何非空字串 → 字面量（元字元轉義）。
 */
function classifyPattern(raw, variants) {
  const trimmed = String(raw == null ? '' : raw).trim().replace(/^`|`$/g, '')
  if (!trimmed) return { kind: 'empty' }

  const matched = SLASH_FORM.exec(trimmed)
  if (!matched) {
    // 字面量先轉義再展開：轉義只動元字元，漢字原封不動，順序反過來會把
    // 我們插進去的 [ ] 也一併轉義掉。
    return { kind: 'literal', source: expandVariantClasses(escapeLiteral(trimmed), variants), flags: 'g' }
  }

  // 只採用合法旗標；缺 g 一律補上，所以規則總是全文替換。
  let flags = ''
  for (const flag of matched[2] || '') {
    if (ALLOWED_FLAGS.indexOf(flag) >= 0 && flags.indexOf(flag) < 0) flags += flag
  }
  if (flags.indexOf('g') < 0) flags += 'g'

  const expanded = expandVariantClasses(matched[1], variants)
  try {
    // eslint-disable-next-line no-new
    new RegExp(expanded, flags)
  } catch (e) {
    return { kind: 'bad-regex', message: String((e && e.message) || e) }
  }
  return { kind: 'regex', source: expanded, flags }
}

function compilePattern(classified) {
  return new RegExp(classified.source, classified.flags)
}

/**
 * 這條匹配式會不會匹配空字串。
 *
 * 會的話，替換會在每個字元位置都插一次，產物瞬間爆掉。編輯器要在儲存前用這個
 * 擋下來，不要留到執行期才回滾——作者看到的症狀會是「規則從來沒生效過，
 * 但頁面也沒報錯」，很難查。
 */
function matchesEmptyString(find) {
  const classified = classifyPattern(find)
  if (classified.kind !== 'regex') return false
  try {
    return compilePattern(classified).test('')
  } catch (e) {
    return false
  }
}

/** 第一個捕獲組形如 `hp::85;;mood::害羞` 時，解成鍵值表。 */
function parseFieldTable(capture) {
  if (typeof capture !== 'string') return null
  if (capture.indexOf('::') < 0 || capture.indexOf(';;') < 0) return null
  const table = {}
  capture.split(';;').forEach((entry) => {
    const at = entry.indexOf('::')
    if (at < 0) return
    const key = entry.slice(0, at).trim()
    if (key) table[key] = entry.slice(at + 2).trim()
  })
  return table
}

function expandRandom(text, pickRandom) {
  return text.replace(RANDOM_TOKEN, (whole, body) => {
    const options = String(body)
      .split('::')
      .map((option) => option.trim())
      .filter((option) => option !== '')
    if (!options.length) return ''
    return pickRandom(options)
  })
}

/**
 * 把一次命中的替換內容展開。
 *
 * 順序刻意是：先 $欄位名（資料來源固定是第一個捕獲組），再 $1..$9，最後
 * {{random}}。$欄位名 先做，否則 `$hp` 會被 `$1` 那一輪的解析吃掉一部分。
 */
function expandReplacement(replace, args, pickRandom) {
  const capture1 = args.length > 1 ? args[1] : undefined
  const table = parseFieldTable(capture1)

  let out = String(replace == null ? '' : replace)

  if (table) {
    out = out.replace(FIELD_TOKEN, (whole, key) =>
      Object.prototype.hasOwnProperty.call(table, key) ? table[key] : whole
    )
  }

  out = out.replace(/\$([1-9])/g, (whole, index) => {
    const value = args[Number(index)]
    return value === undefined ? whole : value
  })

  return expandRandom(out, pickRandom)
}

function defaultPickRandom(options) {
  return options[Math.floor(Math.random() * options.length)]
}

/**
 * 套用一組顯示層規則。
 *
 * @param {string} text  這一輪要顯示的文字
 * @param {Array}  rules 規則集，按順序套用；後一條吃前一條的產物
 * @param {Object} [options] pickRandom 可注入，讓測試有決定性；
 *   variants 是伺服器算好的簡繁對照表（見 expandVariantClasses）
 * @returns {{ html: string, rollbacks: Array<{ruleId: string, reason: string}> }}
 */
function applyDisplayRules(text, rules, options) {
  const source = typeof text === 'string' ? text : ''
  const list = Array.isArray(rules) ? rules : []
  const pickRandom = (options && options.pickRandom) || defaultPickRandom
  const variants = (options && options.variants) || null
  const rollbacks = []

  let current = source

  for (let i = 0; i < list.length; i++) {
    const rule = list[i] || {}
    if (rule.enabled === false) continue

    const ruleId = String(rule.id == null ? i : rule.id)
    const classified = classifyPattern(rule.find, variants)
    if (classified.kind === 'empty') continue
    if (classified.kind === 'bad-regex') {
      rollbacks.push({ ruleId: ruleId, reason: ROLLBACK_BAD_REGEX })
      continue
    }

    const budget = Math.max(DISPLAY_RULE_MIN_BUDGET, current.length * 4)
    const replace = String(rule.replace == null ? '' : rule.replace)
    // 替換內容自身就超預算：連跑都不用跑。
    if (replace.length > budget) {
      rollbacks.push({ ruleId: ruleId, reason: ROLLBACK_REPLACEMENT_ALONE })
      continue
    }

    let regex
    try {
      regex = compilePattern(classified)
    } catch (e) {
      rollbacks.push({ ruleId: ruleId, reason: ROLLBACK_BAD_REGEX })
      continue
    }

    // 能匹配空字串的規則會在每個位置都插一次，直接擋掉，不進替換迴圈。
    if (classified.kind === 'regex' && regex.test('')) {
      regex.lastIndex = 0
      rollbacks.push({ ruleId: ruleId, reason: ROLLBACK_EMPTY_MATCH })
      continue
    }
    regex.lastIndex = 0

    let produced = 0
    let overBudget = false
    const next = current.replace(regex, function () {
      if (overBudget) return ''
      const args = Array.prototype.slice.call(arguments)
      const expanded = expandReplacement(replace, args, pickRandom)
      produced += expanded.length
      if (produced > budget) {
        overBudget = true
        return ''
      }
      return expanded
    })

    if (overBudget || next.length > budget) {
      // 整條回滾：不做部分套用。半套的版面比沒有版面更難查。
      rollbacks.push({ ruleId: ruleId, reason: ROLLBACK_VOLUME })
      continue
    }
    current = next
  }

  return { html: current, rollbacks: rollbacks }
}

/**
 * 這組規則裡有沒有可能跨行匹配的。
 *
 * 串流渲染快取把內容切在空行之後，只重算尾段。一條無法跨行的規則不可能跨越那個
 * 邊界，所以「切開各自套規則」與「整段套規則」結果相同——快取才站得住。
 * 會跨行的規則沒有這個保證，呼叫端碰到就該放棄快取走完整解析，跟
 * rich-text-renderer 既有那幾條跨段 bail-out 是同一類處置。
 *
 * 判定刻意保守：寧可誤判成跨行（多付一次完整解析），也不要漏判（快取住一段
 * 永遠不會再重算的錯誤產物）。
 */
function hasCrossLineRule(rules) {
  const list = Array.isArray(rules) ? rules : []
  for (let i = 0; i < list.length; i++) {
    const rule = list[i] || {}
    if (rule.enabled === false) continue
    const classified = classifyPattern(rule.find)
    if (classified.kind === 'empty' || classified.kind === 'bad-regex') continue

    // 字面量含換行 → 本身就跨行。
    if (classified.kind === 'literal') {
      if (/[\r\n]/.test(classified.source)) return true
      continue
    }
    // dotAll 讓 . 吃得到換行。
    if (classified.flags.indexOf('s') >= 0) return true
    // 明寫換行，或用 [\s\S] / [\S\s] 這類「任意字元」字元類。
    if (/\\n|\\r/.test(classified.source)) return true
    if (/\[\s*\\s\\S\s*\]|\[\s*\\S\\s\s*\]/.test(classified.source)) return true
  }
  return false
}

export {
  applyDisplayRules,
  classifyPattern,
  matchesEmptyString,
  hasCrossLineRule,
  DISPLAY_RULE_MIN_BUDGET,
  ROLLBACK_BAD_REGEX,
  ROLLBACK_EMPTY_MATCH,
  ROLLBACK_REPLACEMENT_ALONE,
  ROLLBACK_VOLUME,
}
