/**
 * 酒館規則的顯示側相容層。
 *
 * 顯示引擎（display-rule-engine.js）兩端逐位元組相同，不動它——動了就得同步
 * 另一個客戶端，而畫布只活在這裡。所以酒館特有的那幾個欄位在這一層處理，
 * 處理完再把「引擎看得懂的規則」交下去。
 *
 * 處理的是四件事：
 *   promptOnly   只改模型看到的字。我們的規則作用在渲染層，沒有那條車道 → 跳過並在主控台說明。
 *   {{user}} / {{char}}  替換內容裡的巨集，套用當下展開。
 *   $<name>      具名捕獲。JS 的 replace 支援 $<name>，但只在正則真的有那個具名組時；
 *                我們把它換成對應的位置編號，讓字面量規則與展開過的匹配式都吃得到。
 *   trimStrings  從捕獲內容裡刪掉指定字串。這件事只有在替換當下才做得到，
 *                所以帶 trimStrings 的規則在這一層自己跑一次替換。
 */

import {
  applyDisplayRules,
  classifyPattern,
  DISPLAY_RULE_MIN_BUDGET,
  ROLLBACK_BAD_REGEX,
  ROLLBACK_EMPTY_MATCH,
  ROLLBACK_VOLUME,
} from '@/utils/display-rule-engine.js'

export interface TavernRule {
  id?: string | number
  name?: string
  find?: string
  replace?: string
  enabled?: boolean
  /** 酒館：只在組提示詞時套用 */
  promptOnly?: boolean
  /** 酒館：從捕獲內容中刪除的字串 */
  trimStrings?: string[]
  [key: string]: any
}

export interface MacroContext {
  user?: string
  char?: string
}

const NAMED_GROUP = /\(\?<([A-Za-z_$][\w$]*)>/g

/** 展開 {{user}} / {{char}}（含首字大寫變體）。認不得的巨集原樣留著。 */
export function substituteMacros(text: string, macros: MacroContext): string {
  if (!text) return text
  const user = macros.user || ''
  const char = macros.char || ''
  return text
    .replace(/\{\{user\}\}/g, user)
    .replace(/\{\{User\}\}/g, user)
    .replace(/\{\{char\}\}/g, char)
    .replace(/\{\{Char\}\}/g, char)
}

/**
 * 把 `$<name>` 換成對應的位置編號。
 *
 * 具名組在匹配式裡的出現順序就是它的組編號，所以掃一遍匹配式就能建出對照表。
 * 找不到對應名字的保持原樣——那是作者寫錯了，靜默吞掉會讓他更難查。
 */
export function rewriteNamedGroups(find: string, replace: string): string {
  if (!replace || replace.indexOf('$<') < 0) return replace
  const order: Record<string, number> = {}
  let index = 0
  NAMED_GROUP.lastIndex = 0
  let m: RegExpExecArray | null
  while ((m = NAMED_GROUP.exec(String(find || ''))) !== null) {
    index += 1
    if (!(m[1] in order)) order[m[1]] = index
  }
  return replace.replace(/\$<([A-Za-z_$][\w$]*)>/g, (whole, name) =>
    name in order ? '$' + order[name] : whole,
  )
}

/** 這條規則在我們這裡跑不跑得起來。跑不了就說清楚，不要靜默丟掉。 */
function reportSkipped(rule: TavernRule) {
  const label = rule.name || rule.id || '(unnamed)'
  console.warn(
    `[canvas] 規則「${label}」只作用在送給模型的字（promptOnly），` +
      `這個畫布的規則只作用在玩家看到的內容，本次略過。`,
  )
}

/**
 * 帶 trimStrings 的規則自己跑一次替換。
 *
 * 為什麼不交給引擎：trimStrings 要在「取出捕獲內容之後、放進替換字串之前」動手，
 * 那是引擎內部的一步，從外面接不上。這裡只多做這一步，其餘（預算上限、
 * 空匹配防護、整條回滾）維持跟引擎相同的語意。
 */
function applyTrimRule(
  text: string,
  rule: TavernRule,
  rollbacks: Array<{ ruleId: string; reason: string }>,
): string {
  const ruleId = String(rule.id == null ? '' : rule.id)
  const classified: any = classifyPattern(rule.find)
  if (classified.kind === 'empty') return text
  if (classified.kind === 'bad-regex') {
    rollbacks.push({ ruleId, reason: ROLLBACK_BAD_REGEX })
    return text
  }

  let regex: RegExp
  try {
    regex = new RegExp(classified.source, classified.flags)
  } catch (e) {
    rollbacks.push({ ruleId, reason: ROLLBACK_BAD_REGEX })
    return text
  }
  if (classified.kind === 'regex' && regex.test('')) {
    rollbacks.push({ ruleId, reason: ROLLBACK_EMPTY_MATCH })
    return text
  }
  regex.lastIndex = 0

  const trims = (rule.trimStrings || []).filter((s) => typeof s === 'string' && s !== '')
  const budget = Math.max(DISPLAY_RULE_MIN_BUDGET, text.length * 4)
  const replace = String(rule.replace == null ? '' : rule.replace)
  let produced = 0
  let over = false

  const next = text.replace(regex, function () {
    if (over) return ''
    const args = Array.prototype.slice.call(arguments)
    const out = replace.replace(/\$([0-9])/g, (whole, n) => {
      const idx = Number(n)
      const raw = idx === 0 ? args[0] : args[idx]
      if (raw === undefined) return whole
      let value = String(raw)
      for (const trim of trims) value = value.split(trim).join('')
      return value
    })
    produced += out.length
    if (produced > budget) {
      over = true
      return ''
    }
    return out
  })

  if (over || next.length > budget) {
    rollbacks.push({ ruleId, reason: ROLLBACK_VOLUME })
    return text
  }
  return next
}

/**
 * 把酒館形態的規則正規化成引擎吃得下的形態。
 * 回傳兩堆：直接交給引擎的，以及要在這一層自己跑的（帶 trimStrings 的）。
 */
export function normalizeRules(rules: TavernRule[], macros: MacroContext) {
  const plain: TavernRule[] = []
  const trimmed: TavernRule[] = []
  for (const raw of Array.isArray(rules) ? rules : []) {
    const rule = raw || {}
    if (rule.enabled === false) continue
    if (rule.promptOnly === true) {
      reportSkipped(rule)
      continue
    }
    const replace = substituteMacros(
      rewriteNamedGroups(String(rule.find || ''), String(rule.replace == null ? '' : rule.replace)),
      macros,
    )
    const next = { ...rule, replace }
    if (Array.isArray(rule.trimStrings) && rule.trimStrings.length) trimmed.push(next)
    else plain.push(next)
  }
  return { plain, trimmed }
}

/**
 * 套用一組酒館／MMD 規則。
 *
 * 順序照原陣列：後一條吃前一條的產物，這是作者寫規則時的假設。
 */
export function applyTavernRules(
  text: string,
  rules: TavernRule[],
  options: { macros?: MacroContext; variants?: any; pickRandom?: (o: string[]) => string } = {},
) {
  const macros = options.macros || {}
  const rollbacks: Array<{ ruleId: string; reason: string }> = []
  let current = typeof text === 'string' ? text : ''

  for (const raw of Array.isArray(rules) ? rules : []) {
    const rule = raw || {}
    if (rule.enabled === false) continue
    if (rule.promptOnly === true) {
      reportSkipped(rule)
      continue
    }
    const replace = substituteMacros(
      rewriteNamedGroups(String(rule.find || ''), String(rule.replace == null ? '' : rule.replace)),
      macros,
    )
    const prepared = { ...rule, replace }
    if (Array.isArray(rule.trimStrings) && rule.trimStrings.length) {
      current = applyTrimRule(current, prepared, rollbacks)
      continue
    }
    const out = applyDisplayRules(current, [prepared], {
      variants: options.variants,
      pickRandom: options.pickRandom,
    })
    current = out.html
    for (const rb of out.rollbacks) rollbacks.push(rb)
  }

  return { html: current, rollbacks }
}
