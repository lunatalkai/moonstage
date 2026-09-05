/**
 * 顯示字形轉換只碰玩家看得到的字：卡片的協定（隱藏區塊、屬性、code、作者標 translate="no"
 * 的節點）一個字都不能動。2026-09-04 BA 卡的 schema 診斷就是伺服器整段轉換把「穿着=」
 * 轉成「穿著=」造成的。
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { convertVisibleHtml, convertPlainText, directionForLocale, createDisplayScriptConverter } from '../canvas-display-script'

// 真的轉換器（OpenCC＋主站原本的判斷）：混排、已是繁體、一簡對多繁的單字都不能誤轉。
describe('真轉換器沿用主站那套判斷', () => {
  it('簡體整段轉繁；已是繁體不動；單字多義不動；簡體看繁體卡反向', () => {
    const s2t = createDisplayScriptConverter('s2t')
    expect(s2t('她穿着校服，便签在桌上。')).toBe('她穿著校服，便籤在桌上。')
    expect(s2t('她穿著校服')).toBe('她穿著校服')
    expect(s2t('干')).toBe('干')
    expect(s2t('hello')).toBe('hello')
    // 守門是「明確簡體才轉」：整句都是簡繁同形字時看不出來源字形，不碰（已知取捨——
    // 反過來「不是明確繁體就轉」會把繁體短節點改字：台北→臺北、了解→瞭解、阿里→阿裡）。
    expect(s2t('他只有一只手')).toBe('他只有一只手')
    expect(s2t('台北')).toBe('台北')
    expect(s2t('了解')).toBe('了解')
    expect(s2t('阿里')).toBe('阿里')
    expect(s2t('周末')).toBe('周末')
    expect(s2t('皇后走到后面，头发发展得很快')).toBe('皇后走到後面，頭髮發展得很快')
    expect(s2t('一台电脑在台湾')).toBe('一臺電腦在臺灣')
    // 已含繁體專屬字的段落視為繁體，不再過詞庫（保護作者寫的繁體卡）。
    expect(s2t('小栗帽穿著制服站在後面')).toBe('小栗帽穿著制服站在後面')
    const t2s = createDisplayScriptConverter('t2s')
    expect(t2s('她穿著校服，便籤在桌上。')).toBe('她穿着校服，便签在桌上。')
    expect(createDisplayScriptConverter('none')('穿着')).toBe('穿着')
  })
})

// 假轉換器：只把「着」換成「著」、「签」換成「籤」，好斷言哪裡動了哪裡沒動。
const fake = (s: string) => s.replace(/着/g, '著').replace(/签/g, '籤')

// 接線位置是契約：轉換必須排在卡片正則與 markdown 之後、stash 還原之前；
// 歷史載入與摘要不得再在存入 talkList 前先轉（那會把協定轉壞）。
describe('接線位置', () => {
  it('renderMarkdown 在還原 \\x05 佔位符之前轉；載入歷史不再先轉原文', () => {
    const page = readFileSync(resolve(__dirname, '../canvas.vue'), 'utf8')
    const convertAt = page.indexOf('result = convertVisibleHtml(result, displayScript)')
    const restoreAt = page.indexOf('result = result.replace(/\\x05(\\d+)\\x06/g')
    expect(convertAt).toBeGreaterThan(-1)
    expect(restoreAt).toBeGreaterThan(convertAt)
    expect(page).not.toContain('_this.fui.tify(split.visibleContent)')
    expect(page).not.toContain('_this.fui.tify(rawContent)')
  })
})

describe('顯示字形轉換', () => {
  it('轉可見文字節點，不動屬性、class 與標籤', () => {
    const html = '<div class="穿着" data-k="便签" title="着">她穿着<b>校服</b>，便签在桌上。</div>'
    const out = convertVisibleHtml(html, fake)
    expect(out).toContain('她穿著<b>校服</b>，便籤在桌上。')
    expect(out).toContain('class="穿着"')
    expect(out).toContain('data-k="便签"')
    expect(out).toContain('title="着"')
  })

  it('隱藏機讀區塊的佔位符原樣保留（原文在最後一步才還原）', () => {
    const html = '<p>穿着\x0512\x06便签</p>'
    expect(convertVisibleHtml(html, fake)).toBe('<p>穿著\x0512\x06便籤</p>')
  })

  it('code／pre／script／style 不轉', () => {
    const html = '<p>穿着</p><code>穿着=校服</code><pre>便签=1</pre><script>var a="穿着"</script><style>.a::after{content:"着"}</style>'
    const out = convertVisibleHtml(html, fake)
    expect(out).toContain('<p>穿著</p>')
    expect(out).toContain('<code>穿着=校服</code>')
    expect(out).toContain('<pre>便签=1</pre>')
    expect(out).toContain('var a="穿着"')
    expect(out).toContain('content:"着"')
  })

  it('作者標 translate="no"／notranslate／data-lt-verbatim 的子樹不轉，外面照轉', () => {
    const html = '<div>穿着<span translate="no">穿着=校服<i>便签</i></span><em class="notranslate">便签</em><u data-lt-verbatim>着</u>着</div>'
    const out = convertVisibleHtml(html, fake)
    expect(out).toBe('<div>穿著<span translate="no">穿着=校服<i>便签</i></span><em class="notranslate">便签</em><u data-lt-verbatim="">着</u>著</div>')
  })

  it('沒有中文就原樣回（不重排 HTML）', () => {
    const html = '<div class=a>hello <b>world</b></div>'
    expect(convertVisibleHtml(html, fake)).toBe(html)
  })

  it('純文字出口', () => {
    expect(convertPlainText('穿着便签', fake)).toBe('穿著便籤')
    expect(convertPlainText('', fake)).toBe('')
  })

  it('方向依介面語言：正體轉繁、簡體轉簡、其他不動', () => {
    expect(directionForLocale('zh-Hant')).toBe('s2t')
    expect(directionForLocale('zh-Hans')).toBe('t2s')
    expect(directionForLocale('en')).toBe('none')
    expect(directionForLocale('ja')).toBe('none')
    expect(directionForLocale(undefined)).toBe('none')
  })
})
