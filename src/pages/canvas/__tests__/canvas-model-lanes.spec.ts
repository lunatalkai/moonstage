/**
 * 模型清單的兩層與線路收合。
 *
 * 用的是正式站真的回過的那一份目錄切片（`fixtures/model-catalog-live.json`）——
 * 收合、去重、基礎代號換算三件事都只在真實形狀下才會出事：假資料裡沒有二十四條
 * 線路的家族，也沒有同時掛在兩個群組底下的模型。
 */
import { describe, it, expect } from 'vitest'
import live from './fixtures/model-catalog-live.json'
import {
  LANE_COLLAPSE_LIMIT,
  buildFamilyList,
  isFamilySelected,
  primaryVariant,
  visibleLanes,
  hiddenLaneCount,
  composeModelDisplayName,
  resolveStoredModel,
} from '../canvas-model-lanes'

const CLAUDE_BASE = 'relay-claude-sonnet-4-5'
const CLAUDE_RIPPLE = 'relay-claude-sonnet-4-5-ripple'
const CLAUDE_STABLE1 = 'official-claude-sonnet-4-5'

function familyNamed(name: string) {
  return buildFamilyList(live as any).find((f) => f.family === name)!
}

describe('模型清單攤成一顆一列', () => {
  it('同一顆模型同時掛在兩個群組底下時只出現一次，留最前面那一份', () => {
    const list = buildFamilyList(live as any)
    const names = list.map((f) => f.family)
    expect(names.filter((n) => n === 'DeepSeek V4 Flash').length).toBe(1)
    expect(list[0].family).toBe('DeepSeek V4 Flash')
    expect(list[0].group).toBe('Global Top')
  })

  it('每一顆模型帶著它自己的線路，次序照伺服器給的（便宜到貴）', () => {
    const claude = familyNamed('Claude Sonnet 4.5')
    expect(claude.variants.map((v) => v.value)).toEqual([
      CLAUDE_RIPPLE, 'relay-claude-sonnet-4-5-drizzle', CLAUDE_STABLE1, 'relay2-claude-sonnet-4-5',
    ])
    expect(claude.variants[0].costScore).toBeLessThanOrEqual(claude.variants[3].costScore!)
  })

  it('空目錄不炸', () => {
    expect(buildFamilyList(null)).toEqual([])
    expect(buildFamilyList([{ group: 'g' } as any])).toEqual([])
  })

  it('代表線路是玩家選的那條，沒選過就是最便宜的那條', () => {
    const claude = familyNamed('Claude Sonnet 4.5')
    expect(primaryVariant(claude, '')!.value).toBe(CLAUDE_RIPPLE)
    expect(primaryVariant(claude, CLAUDE_STABLE1)!.value).toBe(CLAUDE_STABLE1)
    expect(primaryVariant(null, '')).toBe(null)
  })

  it('標得出哪一顆模型是現在用的', () => {
    const claude = familyNamed('Claude Sonnet 4.5')
    expect(isFamilySelected(claude, CLAUDE_RIPPLE)).toBe(true)
    expect(isFamilySelected(claude, 'deepseek-v4-flash-ripple')).toBe(false)
    expect(isFamilySelected(claude, '')).toBe(false)
  })
})

describe('線路收合', () => {
  const deepseek = () => familyNamed('DeepSeek V4 Flash')

  it('線路少的家族全部露出來，也沒有展開鍵', () => {
    const claude = familyNamed('Claude Sonnet 4.5')
    expect(visibleLanes(claude.variants, CLAUDE_RIPPLE, false).length).toBe(4)
    expect(hiddenLaneCount(claude.variants, CLAUDE_RIPPLE, false)).toBe(0)
  })

  it('我們自己配的線路全留，照名冊長出來的那批只留最便宜的六條', () => {
    const family = deepseek()
    const shown = visibleLanes(family.variants, 'deepseek-v4-flash-ripple', false)
    const ours = shown.filter((v) => !(v as any).laneAutoListed)
    const listed = shown.filter((v) => (v as any).laneAutoListed)
    expect(ours.map((v) => v.value)).toEqual(['deepseek-v4-flash-ripple', 'deepseek-v4-flash-mist'])
    expect(listed.length).toBe(LANE_COLLAPSE_LIMIT)
    expect(shown.length).toBe(2 + LANE_COLLAPSE_LIMIT)
  })

  it('收起來的是比較貴的那幾條——清單本身由便宜排到貴', () => {
    const family = deepseek()
    const shown = visibleLanes(family.variants, '', false)
    const hidden = family.variants.filter((v) => !shown.some((s) => s.value === v.value))
    expect(hidden.length).toBeGreaterThan(0)
    const maxShown = Math.max(...shown.map((v) => v.costScore || 0))
    expect(Math.min(...hidden.map((v) => v.costScore || 0))).toBeGreaterThanOrEqual(maxShown)
  })

  it('玩家現在用的那條就算排在收合線之後也一定看得到', () => {
    const family = deepseek()
    const last = family.variants[family.variants.length - 1]
    const shown = visibleLanes(family.variants, last.value, false)
    expect(shown.some((v) => v.value === last.value)).toBe(true)
  })

  it('展開就全部給', () => {
    const family = deepseek()
    expect(visibleLanes(family.variants, '', true).length).toBe(family.variants.length)
  })

  it('展開鍵在展開之後還在——它是回去的唯一路', () => {
    const family = deepseek()
    const collapsed = hiddenLaneCount(family.variants, '', false)
    const expanded = hiddenLaneCount(family.variants, '', true)
    expect(collapsed).toBeGreaterThan(0)
    expect(expanded).toBeGreaterThan(0)
  })

  it('沒有線路也不炸', () => {
    expect(visibleLanes(null, '', false)).toEqual([])
    expect(hiddenLaneCount(undefined, '', false)).toBe(0)
  })
})

describe('顯示名', () => {
  it('模型名加線路名', () => {
    const claude = familyNamed('Claude Sonnet 4.5')
    expect(composeModelDisplayName(claude.variants[0], claude.family)).toBe('Claude Sonnet 4.5 · Ripple')
  })

  it('沒有線路名就只寫模型名', () => {
    expect(composeModelDisplayName({ value: 'x', name: 'Free Model 1' } as any, 'Free Model 1'))
      .toBe('Free Model 1')
  })

  it('內部代號不當顯示名用——除非連模型名都沒有', () => {
    expect(composeModelDisplayName({ value: 'x' } as any, '家族名')).toBe('家族名')
    expect(composeModelDisplayName({ value: 'x' } as any, '')).toBe('x')
    expect(composeModelDisplayName(null)).toBe('')
  })
})

describe('已存的模型代號換算', () => {
  it('目錄裡有這個代號就直接用它', () => {
    const hit = resolveStoredModel(live as any, CLAUDE_RIPPLE)
    expect(hit.exact).toBe(true)
    expect(hit.variant!.value).toBe(CLAUDE_RIPPLE)
    expect(hit.family!.family).toBe('Claude Sonnet 4.5')
  })

  it('線路上線前存下的基礎代號換算得到家族與它的代表線路', () => {
    const hit = resolveStoredModel(live as any, CLAUDE_BASE)
    expect(hit.exact).toBe(false)
    expect(hit.family!.family).toBe('Claude Sonnet 4.5')
    expect(hit.variant!.value).toBe(CLAUDE_RIPPLE)
  })

  it('基礎代號只認整條線路的尾巴，不做子字串猜測', () => {
    // 'relay-claude-sonnet-4' 不是任何一條線路的基礎形態
    expect(resolveStoredModel(live as any, 'relay-claude-sonnet-4').family).toBe(null)
  })

  it('換算不到就是查無此模型，不亂挑一顆頂上', () => {
    expect(resolveStoredModel(live as any, '不存在的模型')).toEqual({ variant: null, family: null, exact: false })
    expect(resolveStoredModel(live as any, '')).toEqual({ variant: null, family: null, exact: false })
    expect(resolveStoredModel(null, CLAUDE_BASE)).toEqual({ variant: null, family: null, exact: false })
  })
})
