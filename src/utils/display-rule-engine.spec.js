import { describe, it, expect } from 'vitest'

import {
  applyDisplayRules,
  matchesEmptyString,
  hasCrossLineRule,
  DISPLAY_RULE_MIN_BUDGET,
} from './display-rule-engine.js'
import {
  APPLY_CASES,
  RANDOM_CASES,
  EMPTY_MATCH_PATTERNS,
  NON_EMPTY_MATCH_PATTERNS,
  CROSS_LINE_FINDS,
  SINGLE_LINE_FINDS,
} from './display-rule-engine.fixtures.js'

describe('display rule engine', () => {
  APPLY_CASES.forEach((tc) => {
    it(tc.name, () => {
      const out = applyDisplayRules(tc.text, tc.rules)
      expect(out.html).toBe(tc.expect)
      expect(out.rollbacks.map((r) => r.reason)).toEqual(tc.rollbacks || [])
    })
  })

  RANDOM_CASES.forEach((tc) => {
    it(tc.name, () => {
      const out = applyDisplayRules(tc.text, tc.rules, { pickRandom: tc.pick })
      expect(out.html).toBe(tc.expect)
    })
  })

  it('預算下限是 256 KB', () => {
    expect(DISPLAY_RULE_MIN_BUDGET).toBe(262144)
  })

  describe('空字串匹配偵測（供編輯器儲存前擋下）', () => {
    EMPTY_MATCH_PATTERNS.forEach((pattern) => {
      it(`${pattern} 會匹配空字串`, () => {
        expect(matchesEmptyString(pattern)).toBe(true)
      })
    })
    NON_EMPTY_MATCH_PATTERNS.forEach((pattern) => {
      it(`${pattern} 不會匹配空字串`, () => {
        expect(matchesEmptyString(pattern)).toBe(false)
      })
    })
  })

  // 串流快取把內容切在空行之後。無法跨行的規則不可能跨越那個邊界，
  // 「切開各自套」與「整段套」結果相同，快取才站得住。
  describe('跨行規則偵測（決定要不要放棄串流快取）', () => {
    CROSS_LINE_FINDS.forEach((find) => {
      it(`${find} 判定為可能跨行`, () => {
        expect(hasCrossLineRule([{ id: 'r', find, replace: 'x', enabled: true }])).toBe(true)
      })
    })
    SINGLE_LINE_FINDS.forEach((find) => {
      it(`${JSON.stringify(find)} 判定為不跨行`, () => {
        expect(hasCrossLineRule([{ id: 'r', find, replace: 'x', enabled: true }])).toBe(false)
      })
    })
    it('停用的跨行規則不算數', () => {
      expect(hasCrossLineRule([
        { id: 'r', find: '/a[\\s\\S]b/', replace: 'x', enabled: false },
      ])).toBe(false)
    })
    it('沒有規則時為 false', () => {
      expect(hasCrossLineRule([])).toBe(false)
      expect(hasCrossLineRule(null)).toBe(false)
    })
  })

  // 引擎是渲染管線的東西，永遠不能碰到送給模型的原文。
  it('不修改輸入字串', () => {
    const text = '【狀態】hp::85;;mood::害羞【/狀態】'
    const copy = String(text)
    applyDisplayRules(text, [
      { id: 'r', find: '/【狀態】(.*?)【\\/狀態】/', replace: '<b>$hp</b>', enabled: true },
    ])
    expect(text).toBe(copy)
  })

  it('沒有規則時原樣回傳', () => {
    expect(applyDisplayRules('原文', []).html).toBe('原文')
    expect(applyDisplayRules('原文', null).html).toBe('原文')
  })
})

// 規則的匹配式是作者寫死的字面（多半簡體，卡片是從簡體平台搬來的），但玩家看到的
// 文字不一定同形：站台對 zh-Hant 使用者會把開場白繁體化，模型自己也常把簡體標記
// 吐成繁體。字形一差，字面比對就永遠不命中——症狀是畫面上留著一個沒被替換的
// <开局面板>，而作者查不出原因。
//
// 逐條加「繁→簡」的正規化規則補不完，所以改在編譯匹配式前把漢字展開成字元類。
// 對照表由伺服器算（簡繁對照在那邊），這裡只做展開。
describe('簡繁變體：匹配式展開', () => {
  const variants = { 开: '开開', 狀: '狀状', 总: '总總' }

  it('規則寫簡體，文字是繁體時仍然命中', () => {
    const out = applyDisplayRules('前<開局面板>後', [
      { id: 'r', find: '<开局面板>', replace: '<b>面板</b>', enabled: true },
    ], { variants })
    expect(out.html).toBe('前<b>面板</b>後')
    expect(out.rollbacks).toEqual([])
  })

  it('規則寫繁體，文字是簡體時也命中', () => {
    const out = applyDisplayRules('《总1》', [
      { id: 'r', find: '/《總([1-9])》/', replace: '第$1章', enabled: true },
    ], { variants: { 總: '總总' } })
    expect(out.html).toBe('第1章')
  })

  it('捕獲組取自原文，玩家看到的字不會被換成另一形', () => {
    const out = applyDisplayRules('【狀態】血量85【/狀態】', [
      { id: 'r', find: '/【状態】(.*?)【\\/状態】/', replace: '<i>$1</i>', enabled: true },
    ], { variants: { 状: '状狀' } })
    expect(out.html).toBe('<i>血量85</i>')
  })

  it('字元類裡的漢字併入原類，不會產生巢狀類', () => {
    const out = applyDisplayRules('開始', [
      { id: 'r', find: '/[开合]始/', replace: 'X', enabled: true },
      { id: 'r2', find: '/^X$/', replace: 'OK', enabled: true },
    ], { variants })
    expect(out.html).toBe('OK')
  })

  it('跳脫序列不被當成漢字展開', () => {
    const out = applyDisplayRules('a\nb', [
      { id: 'r', find: '/a\\nb/', replace: 'ok', enabled: true },
    ], { variants })
    expect(out.html).toBe('ok')
  })

  it('沒有對照表時行為與過去完全相同', () => {
    const out = applyDisplayRules('前<開局面板>後', [
      { id: 'r', find: '<开局面板>', replace: 'X', enabled: true },
    ])
    expect(out.html).toBe('前<開局面板>後')
  })
})
