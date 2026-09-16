import { describe, it, expect } from 'vitest'

import {
  applyDisplayRules,
  neutralizeRelativeMediaSources,
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

describe('替換內容裡的 $n：只有真的捕獲組才展開', () => {
  // 原生 String.replace 對不存在的組保留字面 $n；引擎之前把 replace 回呼的
  // offset／整段原文當成 $1／$2 塞進去，含 JS 原始碼的 MMD 規則整條被改壞。
  it('沒有捕獲組時 $1、$2 原樣保留', () => {
    const out = applyDisplayRules('【X】', [
      { id: 'r', find: '【X】', replace: 'a$1b|$2|c', enabled: true },
    ])
    expect(out.html).toBe('a$1b|$2|c')
  })

  it('一個捕獲組時 $1 展開、$2 保留', () => {
    const out = applyDisplayRules('【X】', [
      { id: 'r', find: '/【(X)】/', replace: 'a$1b|$2|c', enabled: true },
    ])
    expect(out.html).toBe('aXb|$2|c')
  })

  it('具名捕獲組（回呼多一個 groups 參數）一樣只展開真的組', () => {
    const out = applyDisplayRules('【X】', [
      { id: 'r', find: '/【(?<n>X)】/', replace: 'a$1b|$2|c', enabled: true },
    ])
    expect(out.html).toBe('aXb|$2|c')
  })

  // MMD 的狀態欄規則常有十幾個捕獲組（角色信息：名字｜性別｜年齡｜功法…當前形象），
  // 替換內容寫 $10～$14。原生 String.replace 對兩位數的 $nn：那個組存在就是它，
  // 不存在才是 $n 接一個數字。之前引擎只認一位數，$10 變成「$1 的內容＋0」——
  // 玩家看到法寶欄寫著「林渊0」（2026-09-16 回報）。
  it('兩位數的 $10～$14：那個組存在就展開它，不是 $1 接數字', () => {
    const find = '/【(a)(b)(c)(d)(e)(f)(g)(h)(i)(j)(k)(l)(m)(n)】/'
    const out = applyDisplayRules('【abcdefghijklmn】', [
      { id: 'r', find, replace: '$1|$9|$10|$11|$14', enabled: true },
    ])
    expect(out.html).toBe('a|i|j|k|n')
  })

  // 組存在但這次沒參與匹配（可選組）：原生給空字串，不是留著字面 $n。
  it('存在但沒匹配到的可選組展開成空字串', () => {
    const out = applyDisplayRules('【X】', [
      { id: 'r', find: '/【(X)(Y)?】/', replace: '$1|$2|', enabled: true },
    ])
    expect(out.html).toBe('X||')
  })

  it('兩位數的組不存在時退回一位數＋字面數字（跟原生一樣）', () => {
    const out = applyDisplayRules('【XY】', [
      { id: 'r', find: '/【(X)(Y)】/', replace: '$12|$21|$30', enabled: true },
    ])
    expect(out.html).toBe('X2|Y1|$30')
  })
})

describe('neutralizeRelativeMediaSources', () => {
  it('相對路徑的 src 改成 data:,，onerror 與其他屬性原樣保留', () => {
    const html = '<img class="owx-boot" src="__owx_boot__" onerror="boot(this)"><img src=\'x-sao-v153-scene\' onerror="go()"><img src=x onerror=go()>'
    expect(neutralizeRelativeMediaSources(html)).toBe(
      '<img class="owx-boot" src="data:," onerror="boot(this)"><img src=\'data:,\' onerror="go()"><img src="data:," onerror=go()>',
    )
  })

  it('以 / 開頭的也算相對站台路徑；有協定、//、data:、blob:、# 的不動', () => {
    const keep = [
      '<img src="https://img.example/a.png">',
      '<img src="http://img.example/a.png">',
      '<img src="//img.example/a.png">',
      '<img src="data:image/png;base64,AAAA">',
      '<video poster="blob:https://x/1" src="blob:https://x/2"></video>',
      '<img src="#anchor">',
      '<img src="">',
    ]
    for (const html of keep) expect(neutralizeRelativeMediaSources(html)).toBe(html)
    expect(neutralizeRelativeMediaSources('<img src="/play/x-sao">')).toBe('<img src="data:,">')
    expect(neutralizeRelativeMediaSources('<video poster="p.jpg"><source src="clip.mp4"></video>')).toBe('<video poster="data:,"><source src="data:,"></video>')
  })

  it('不是媒體標籤的 src 不動；沒有標籤的文字直接回傳', () => {
    expect(neutralizeRelativeMediaSources('<script src="engine.js"></script><a href="x">x</a>')).toBe('<script src="engine.js"></script><a href="x">x</a>')
    expect(neutralizeRelativeMediaSources('plain text')).toBe('plain text')
  })

  it('applyDisplayRules 的輸出已經處理過：規則產出的點火圖片不會再打站台', () => {
    const out = applyDisplayRules('<st>hi</st>', [{ id: 'r', find: '/<st>([\\s\\S]*?)<\\/st>/g', replace: '<div><img src="x-sao-v153-turn" onerror="fire()">$1</div>', enabled: true }])
    expect(out.html).toBe('<div><img src="data:," onerror="fire()">hi</div>')
  })
})
