/**
 * 模型清單的兩層：先挑模型，再挑線路。
 *
 * 為什麼不是一層：同一顆模型今天掛著二十幾條線路，全部平鋪的話玩家要捲過整份
 * 名冊才看得到下一顆模型，而他多數時候只想確認「我在用哪一顆」。所以掃視層只放
 * 模型，線路收進被點開的那一顆底下。
 *
 * 線路清單伺服器已經由便宜排到貴，所以收起來的永遠是比較貴的那幾條——標籤要把
 * 這件事寫出來，只放一個箭頭的話玩家不知道展開會拿到什麼，也就不會去按。
 *
 * 線路的內部代號帶著真實供應商的名字，畫面上一律只出現 `channelLabel`。
 */

import { flattenVariants } from './canvas-model-catalog'
import type { FlatVariant, ModelGroupLike, ModelVariantLike } from './canvas-model-catalog'

/**
 * 收合線在第六條。
 *
 * 六條而不是四條：清單本身由便宜排到貴，六條才看得出一段有意義的價格階梯；
 * 四條會在還沒拉開差距前就截斷。
 */
export const LANE_COLLAPSE_LIMIT = 6

export interface ModelFamilyView {
  /** 家族名，也是畫面上那顆模型的名字 */
  family: string
  /** 來自哪個群組（同一顆模型會同時掛在「精選」與品牌群組底下，去重後留第一次出現的） */
  group: string
  description: string
  isMember: boolean
  badges: string[]
  /** 由便宜到貴（伺服器已排好） */
  variants: FlatVariant[]
}

/** 線路的識別代號（`lane:ripple` → `ripple`）。不是給玩家看的字。 */
function laneCodeOf(variant: ModelVariantLike & { channel?: string }): string {
  const channel = String((variant as any)?.channel || '')
  return channel.startsWith('lane:') ? channel.slice(5) : ''
}

/**
 * 攤平成「一顆模型一列」。
 *
 * 去重要在這裡做：目錄把同一顆模型同時放進「精選」與它的品牌群組，不去重的話
 * 清單上會出現兩列一模一樣的名字，玩家分不出點的是哪一個。留第一次出現的那一份
 * ——「精選」排在最前面，那也是伺服器想讓人先看到的次序。
 */
export function buildFamilyList(groups?: ModelGroupLike[] | null): ModelFamilyView[] {
  if (!Array.isArray(groups)) return []
  const order: string[] = []
  const byName = new Map<string, ModelFamilyView>()
  for (const group of groups) {
    const families = Array.isArray(group?.families) ? group.families : []
    for (const family of families) {
      const name = String(family?.family || '')
      if (!name) continue
      if (byName.has(name)) continue
      const variants = flattenVariants([{ ...group, families: [family] }])
      if (!variants.length) continue
      order.push(name)
      byName.set(name, {
        family: name,
        group: String(group?.group || ''),
        description: String((family as any)?.description || ''),
        isMember: Boolean((family as any)?.isMember),
        badges: Array.isArray((family as any)?.badges) ? (family as any).badges.slice() : [],
        variants,
      })
    }
  }
  return order.map((name) => byName.get(name)!)
}

/** 這一顆模型底下有沒有玩家現在用的那一條。 */
export function isFamilySelected(family: ModelFamilyView | null | undefined, selectedValue: string): boolean {
  if (!family || !selectedValue) return false
  return family.variants.some((v) => v.value === selectedValue)
}

/**
 * 這一顆模型的代表線路：玩家選過的那條，沒有就是最便宜的那條。
 *
 * 代表線路要跟畫面顯示的是同一條，否則會「照 A 線路排序、顯示 B 線路的數字」。
 */
export function primaryVariant(
  family: ModelFamilyView | null | undefined,
  selectedValue = '',
): FlatVariant | null {
  if (!family || !family.variants.length) return null
  const selected = family.variants.find((v) => v.value === selectedValue)
  return selected || family.variants[0]
}

/**
 * 真正要畫出來的那幾條。
 *
 * 我們自己配的線路全留——它們是刻意挑過的，數量也不會自己長。會爆的是照上游名冊
 * 自動長出來的那一批（`laneAutoListed`），只留最便宜的幾條。
 *
 * **玩家現在用的那條永遠在裡面**，就算它排在收合線之後：他打開面板第一件事是確認
 * 自己在用哪一條，看不到它等於這一頁沒有回答他最想問的問題。
 */
export function visibleLanes(
  variants: FlatVariant[] | null | undefined,
  selectedValue = '',
  expanded = false,
): FlatVariant[] {
  const all = Array.isArray(variants) ? variants : []
  if (expanded) return all.slice()
  const ours = all.filter((v) => !(v as any).laneAutoListed)
  const listed = all.filter((v) => (v as any).laneAutoListed)
  if (listed.length <= LANE_COLLAPSE_LIMIT) return all.slice()
  const head = listed.slice(0, LANE_COLLAPSE_LIMIT)
  const selected = listed.find((v) => v.value === selectedValue)
  if (selected && !head.some((v) => v.value === selected.value)) head.push(selected)
  return ours.concat(head)
}

/**
 * 收合時還沒露出來幾條；展開時回「按收合會藏起來幾條」，讓按鈕留在原地。
 * 按鈕消失會讓剛展開的人找不到回去的路。
 */
export function hiddenLaneCount(
  variants: FlatVariant[] | null | undefined,
  selectedValue = '',
  expanded = false,
): number {
  const all = Array.isArray(variants) ? variants : []
  const listed = all.filter((v) => (v as any).laneAutoListed)
  if (listed.length <= LANE_COLLAPSE_LIMIT) return 0
  if (expanded) return listed.length - LANE_COLLAPSE_LIMIT
  const shown = visibleLanes(all, selectedValue, false).filter((v) => (v as any).laneAutoListed)
  return listed.length - shown.length
}

/**
 * 頂欄與輸入區顯示的名字：模型名 ＋ 線路名。
 *
 * 這個欄位是「顯示名」——一度被直接寫成線路的內部代號，玩家在頂欄看到的就是
 * `deepseek-v4-flash-ripple` 那串字。
 */
export function composeModelDisplayName(
  variant?: ModelVariantLike | null,
  familyName = '',
): string {
  if (!variant) return ''
  const base = String(variant.name || familyName || '').trim()
  const lane = String(variant.channelLabel || '').trim()
  if (!base) return lane || String(variant.value || '')
  return lane ? `${base} · ${lane}` : base
}

/**
 * 已經存起來的模型代號 → 目錄裡的家族與線路。
 *
 * 線路展開之後基礎代號不再單獨出現在目錄裡，但已經存下來的偏好不會跟著改：
 * 線路上線前挑過模型的人，手上是 `relay-claude-sonnet-4-5` 這種沒有線路尾巴的
 * 代號。照字面查不到的話，清單裡沒有一條標成「現在用的」、輸入區也沒有點數，
 * 看起來就是壞了。
 *
 * 比對是閉合的，不是子字串猜測：尾巴要正好等於這條線路自己宣告的代號
 * （`channel` 的 `lane:` 後半）。目錄沒宣告代號時才退回「尾巴是單一段」的判斷，
 * 避免把型號名的一節（`…-4` 對 `…-4-5`）誤當成線路。
 *
 * **只換算給畫面看。** 存起來的值與送出去的值都不動——玩家沒動手就改掉他的設定，
 * 他完全不會知道發生過什麼；而伺服器自己認得基礎代號。
 */
export interface ResolvedStoredModel {
  variant: FlatVariant | null
  family: ModelFamilyView | null
  /** 目錄裡有沒有這個代號本人。false＝這是基礎代號，畫面上顯示的是家族的代表線路 */
  exact: boolean
}

export function resolveStoredModel(
  groups: ModelGroupLike[] | null | undefined,
  stored: string,
): ResolvedStoredModel {
  const empty: ResolvedStoredModel = { variant: null, family: null, exact: false }
  if (!stored) return empty
  const families = buildFamilyList(groups)
  for (const family of families) {
    const hit = family.variants.find((v) => v.value === stored)
    if (hit) return { variant: hit, family, exact: true }
  }
  for (const family of families) {
    const laneOfBase = family.variants.find((v) => {
      const code = laneCodeOf(v)
      if (code) return v.value === `${stored}-${code}`
      if (!v.value.startsWith(`${stored}-`)) return false
      return !v.value.slice(stored.length + 1).includes('-')
    })
    if (laneOfBase) return { variant: primaryVariant(family, ''), family, exact: false }
  }
  return empty
}
