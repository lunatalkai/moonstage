/**
 * 酒館規則的顯示側相容層。
 *
 * 作者從酒館搬過來的規則裡有幾個我們原本讀不懂的欄位。讀不懂本身不是問題，
 * 問題是「靜默丟掉」——作者會看到規則沒生效、也沒有任何說明。
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { applyTavernRules, substituteMacros, rewriteNamedGroups } from '../canvas-rule-engine'

afterEach(() => { vi.restoreAllMocks() })

describe('替換內容裡的巨集', () => {
  it('{{user}} / {{char}} 在套用當下展開，大小寫兩種寫法都吃', () => {
    expect(substituteMacros('{{user}} 對 {{char}} 說', { user: '小明', char: '星' }))
      .toBe('小明 對 星 說')
    expect(substituteMacros('{{User}}／{{Char}}', { user: '小明', char: '星' }))
      .toBe('小明／星')
  })

  it('認不得的巨集原樣留著，不要吞掉', () => {
    expect(substituteMacros('{{persona}}', { user: 'a', char: 'b' })).toBe('{{persona}}')
  })

  it('走完整條路徑：規則的替換內容展開巨集', () => {
    const out = applyTavernRules('說：哈囉', [{ id: '1', find: '/說：([\\s\\S]*)/', replace: '{{char}} 對 {{user}} 說：$1' }], {
      macros: { user: '玩家', char: '角色' },
    })
    expect(out.html).toBe('角色 對 玩家 說：哈囉')
  })
})

describe('具名捕獲', () => {
  it('$<name> 換成對應的位置編號', () => {
    expect(rewriteNamedGroups('/(?<who>\\w+)-(?<what>\\w+)/', '$<what>:$<who>')).toBe('$2:$1')
  })

  it('找不到那個名字就原樣留著——那是作者寫錯了，吞掉他更難查', () => {
    expect(rewriteNamedGroups('/(\\w+)/', '$<nope>')).toBe('$<nope>')
  })

  it('走完整條路徑', () => {
    const out = applyTavernRules('hp:80', [{ id: '1', find: '/hp:(?<value>\\d+)/', replace: '生命 $<value>' }])
    expect(out.html).toBe('生命 80')
  })
})

describe('trimStrings', () => {
  it('從捕獲內容裡刪掉指定字串，替換文字本身不動', () => {
    const out = applyTavernRules('【 旁白：天亮了 】', [{
      id: '1',
      find: '/【([\\s\\S]*?)】/g',
      replace: '<i>$1</i>',
      trimStrings: ['旁白：', ' '],
    }])
    expect(out.html).toBe('<i>天亮了</i>')
  })

  it('沒宣告 trimStrings 的規則不受影響', () => {
    const out = applyTavernRules('【 旁白：天亮了 】', [{ id: '1', find: '/【([\\s\\S]*?)】/g', replace: '<i>$1</i>' }])
    expect(out.html).toBe('<i> 旁白：天亮了 </i>')
  })

  it('壞掉的匹配式整條回滾，不是半套', () => {
    const out = applyTavernRules('abc', [{ id: 'bad', find: '/([/', replace: 'x', trimStrings: ['y'] }])
    expect(out.html).toBe('abc')
    expect(out.rollbacks).toEqual([{ ruleId: 'bad', reason: 'bad_regex' }])
  })
})

describe('只作用在提示詞的規則', () => {
  it('跳過，並且說得出為什麼', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const out = applyTavernRules('原文', [
      { id: '1', name: '只改模型看到的字', find: '原文', replace: '改過', promptOnly: true },
    ])
    expect(out.html).toBe('原文')
    expect(warn).toHaveBeenCalledTimes(1)
    expect(String(warn.mock.calls[0][0])).toContain('只改模型看到的字')
  })

  it('停用的規則不跑，也不需要說明', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const out = applyTavernRules('原文', [{ id: '1', find: '原文', replace: '改過', enabled: false }])
    expect(out.html).toBe('原文')
    expect(warn).not.toHaveBeenCalled()
  })
})

describe('順序', () => {
  it('後一條吃前一條的產物——作者寫規則時就是這樣假設的', () => {
    const out = applyTavernRules('a', [
      { id: '1', find: 'a', replace: 'b' },
      { id: '2', find: 'b', replace: 'c' },
    ])
    expect(out.html).toBe('c')
  })
})
