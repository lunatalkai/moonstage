/**
 * i18n 覆蓋度校驗 · CI 卡口（desktop）
 *
 * 斷言：以「5 語言 key 並集（union）」為參照，每個語言（含基準語言自身）
 * missing=0 且 empty=0。並集模式根治了「單一基準語言自身缺 key 檢測不到」的盲區。
 *
 * 註：vitest config globals=false，需顯式 import；
 * 腳本在 scripts/ 之外，故用相對路徑 require（純 Node CommonJS 模組）。
 */
import { describe, it, expect } from 'vitest'
// eslint-disable-next-line @typescript-eslint/no-var-requires
const {
  analyze,
  checkEnglishCopy,
  extractTemplateCjkLines,
  extractScriptUserFacingCjkLines,
  checkScriptResidue,
  checkPlaceholderParity,
  checkGlossary,
  checkChineseResidue,
  JA_GLOSSARY,
  GLOSSARY_ALLOWLIST_KEYS,
} = require('../../scripts/i18n-check.js')

describe('i18n coverage · desktop', () => {
  const result = analyze()

  it('每個語言相對 key 並集都不應有 missing key', () => {
    const offenders = Object.entries(result.locales)
      .filter(([, d]: [string, any]) => d.missing.length > 0)
      .map(([loc, d]: [string, any]) => `${loc}: ${d.missing.length}`)
    expect(offenders).toEqual([])
    expect(result.totals.missing).toBe(0)
  })

  it('每個語言都不應有 empty value（白名單內允許空值不計）', () => {
    const offenders = Object.entries(result.locales)
      .filter(([, d]: [string, any]) => d.empty.length > 0)
      .map(([loc, d]: [string, any]) => `${loc}: ${d.empty.length}`)
    expect(offenders).toEqual([])
    expect(result.totals.empty).toBe(0)
  })

  // 硬 gate（批次 1 · C-1）：missingCodeRef 此前只在報告模式 CLI 出現，
  // 唯一硬 gate 的 vitest spec 不斷言它 → 代碼引用了 locale 不存在的 key
  // （渲染 fallback / 裸 key）仍會裸奔上線。此處補上斷言使其成為機關。
  it('代碼引用的 key 必須都存在於 locale（missingCodeRef = 0）', () => {
    const offenders = result.missingCodeRefs.map((x: any) => `${x.key} (${x.file})`)
    expect(offenders).toEqual([])
    expect(result.totals.missingCodeRef).toBe(0)
  })

  it('每個語言都不應有 duplicate key（同一扁平 key 在檔內出現 > 1 次）', () => {
    const offenders = Object.entries(result.locales)
      .filter(([, d]: [string, any]) => d.duplicate.length > 0)
      .map(([loc, d]: [string, any]) => `${loc}: ${d.duplicate.map((x: any) => x.key).join(',')}`)
    expect(offenders).toEqual([])
    expect(result.totals.duplicate).toBe(0)
  })
})

// 英語本土化整改新增檢查（Playbook §7 P0-5）：
// (a) en 值內 CJK、(b) Please enter 翻譯腔、(c) 單複數硬編碼（警告級）、(d) template 硬編碼 CJK
describe('english copy checks · desktop（Playbook P0-5）', () => {
  it('checkEnglishCopy 應抓出 en 值裡的 CJK 字符', () => {
    const r = checkEnglishCopy({ 'a.b': 'Visible in 廣場', 'a.c': 'OK' }, { cjkKeyAllowlist: new Set() })
    expect(r.cjk.map((x: any) => x.key)).toEqual(['a.b'])
  })

  it('CJK 檢查：白名單 key 與正當標點（・bullet）不報', () => {
    const r = checkEnglishCopy(
      { 'a.b': 'item one\n・item two', 'a.c': '繁體中文' },
      { cjkKeyAllowlist: new Set(['a.c']) }
    )
    expect(r.cjk).toEqual([])
  })

  it('應抓出 "Please enter…" 翻譯腔', () => {
    const r = checkEnglishCopy(
      { 'a.b': 'Please enter the character name', 'a.c': 'Enter your nickname' },
      { cjkKeyAllowlist: new Set() }
    )
    expect(r.pleaseEnter.map((x: any) => x.key)).toEqual(['a.b'])
  })

  it('單複數硬編碼為警告級：抓 "1 cards" 與無複數處理的 "{n} credits"', () => {
    const r = checkEnglishCopy(
      {
        'a.bad1': 'You have 1 cards',
        'a.bad2': '{n} credits per day',
        'a.ok1': 'no card | 1 card | {n} cards',
        'a.ok2': 'key plot points',
      },
      { cjkKeyAllowlist: new Set() }
    )
    expect(r.pluralSuspect.map((x: any) => x.key).sort()).toEqual(['a.bad1', 'a.bad2'])
  })

  it('extractTemplateCjkLines 只抓 template 區塊內、非註釋的 CJK 行', () => {
    const src = [
      '<template>',
      '  <view>新角色</view>',
      '  <!-- 註釋中文不算 -->',
      '  <view>{{ t("a.b") }}</view>',
      '</template>',
      '<script>',
      "console.log('腳本區中文不算')",
      '</script>',
    ].join('\n')
    const hits = extractTemplateCjkLines(src)
    expect(hits.length).toBe(1)
    expect(hits[0].text).toContain('新角色')
  })

  it('en locale 不應有 CJK / Please enter；template CJK 不得超出存量基線', () => {
    const result = analyze()
    expect(result.englishCopy.cjk).toEqual([])
    expect(result.englishCopy.pleaseEnter).toEqual([])
    expect(result.templateCjk).toEqual([])
    expect(result.totals.enCjk).toBe(0)
    expect(result.totals.enPleaseEnter).toBe(0)
    expect(result.totals.templateCjk).toBe(0)
  })
})

/* ================================================================
 * 日語/韓語本土化整改新增檢查（Japanese-Localization-Review-20260720 §8）
 * 與 mobile/scripts/i18n-check.js 的四道機關鏡像。
 * desktop 特有：sc.* 命名空間 73/250 值是英文原文，走 scriptResidue 抓。
 * ================================================================ */
describe('japanese/korean localization checks · desktop', () => {
  describe('checkScriptResidue（英文殘留）', () => {
    it('ja 值完全沒有假名/漢字且含拉丁字母 → 判為未翻譯', () => {
      const r = checkScriptResidue(
        { 'sc.title': 'Title', 'sc.ok': 'タイトル' },
        'ja',
        { allowlistKeys: new Set() }
      )
      expect(r.map((x: any) => x.key)).toEqual(['sc.title'])
    })

    it('純漢字的正當日語（設定/削除/確認/縮小）不得誤報', () => {
      const r = checkScriptResidue(
        { 'a.a': '設定', 'a.b': '削除', 'a.c': '確認', 'a.d': '縮小' },
        'ja',
        { allowlistKeys: new Set() }
      )
      expect(r).toEqual([])
    })

    it('ko 值沒有諺文且含拉丁字母 → 判為未翻譯', () => {
      const r = checkScriptResidue(
        { 'a.en': 'Stat System', 'a.ko': '스탯 시스템' },
        'ko',
        { allowlistKeys: new Set() }
      )
      expect(r.map((x: any) => x.key)).toEqual(['a.en'])
    })

    it('品牌名/技術符號不得誤報', () => {
      const r = checkScriptResidue(
        { 'a.a': 'LunaTalk', 'a.b': 'VIP', 'a.c': 'HTML', 'a.d': 'Tokens' },
        'ja',
        { allowlistKeys: new Set() }
      )
      expect(r).toEqual([])
    })

    it('存量債務 key 由 allowlist 放行（ratchet：只減不增）', () => {
      const r = checkScriptResidue({ 'sc.title': 'Title' }, 'ja', {
        allowlistKeys: new Set(['sc.title']),
      })
      expect(r).toEqual([])
    })
  })

  describe('checkPlaceholderParity（佔位符不一致）', () => {
    it('某語言值含基準語言沒有的佔位符 → 抓出', () => {
      const r = checkPlaceholderParity(
        { 'a.b': 'chapters' },
        { 'a.b': '{n} チャプター' },
        { allowlistKeys: new Set() }
      )
      expect(r.map((x: any) => x.key)).toEqual(['a.b'])
      expect(r[0].extra).toEqual(['{n}'])
    })

    it('基準語言有而該語言缺佔位符 → 也要抓出', () => {
      const r = checkPlaceholderParity(
        { 'a.b': '設定文字較多（{count} 字）' },
        { 'a.b': '設定が長すぎます' },
        { allowlistKeys: new Set() }
      )
      expect(r[0].missing).toEqual(['{count}'])
    })

    it('佔位符一致（順序不同）不報', () => {
      const r = checkPlaceholderParity(
        { 'a.b': '{a} と {b}' },
        { 'a.b': '{b} や {a}' },
        { allowlistKeys: new Set() }
      )
      expect(r).toEqual([])
    })
  })

  describe('checkGlossary（受控術語表）', () => {
    const glossary = [
      { concept: 'Credits', canonical: 'ポイント', variants: ['クレジット'], reason: 'test' },
    ]

    it('值裡出現非規範譯法 → 抓出並指出建議譯法', () => {
      const r = checkGlossary(
        { 'trial.feature_credits': '60クレジット以内は完全無料', 'mine.points': 'ポイント' },
        { glossary, allowlistKeys: new Set() }
      )
      expect(r.map((x: any) => x.key)).toEqual(['trial.feature_credits'])
      expect(r[0].canonical).toBe('ポイント')
    })

    it('只用規範譯法不報', () => {
      const r = checkGlossary({ 'a.b': 'ポイント' }, { glossary, allowlistKeys: new Set() })
      expect(r).toEqual([])
    })
  })

  describe('checkChineseResidue（中文直譯詞）', () => {
    it('抓出 desktop 實際存在的中文直譯詞（広場 / 世界書 / 劇情 / 人審）', () => {
      const r = checkChineseResidue(
        {
          'create.public': '公開：広場で表示',
          'promptBreakdown.worldbook': '世界書リコール',
          'galgame.x': '劇情マスター',
          'roleDetail.aiReviewActionHuman': '人審へ',
          'a.ok': 'ワールドブックを表示',
        },
        { allowlistKeys: new Set() }
      )
      expect(r.map((x: any) => x.key).sort()).toEqual([
        'create.public',
        'galgame.x',
        'promptBreakdown.worldbook',
        'roleDetail.aiReviewActionHuman',
      ])
    })

    it('「プラザ」（Discover 的第四種譯法）要抓', () => {
      const r = checkChineseResidue(
        { 'chat.unpublish_role_confirm': '非公開にするとプラザから削除されます。' },
        { allowlistKeys: new Set() }
      )
      expect(r.map((x: any) => x.key)).toEqual(['chat.unpublish_role_confirm'])
    })

    it('正常日語不得誤報', () => {
      const r = checkChineseResidue(
        { 'a.a': 'キャラクターを削除しますか？', 'a.b': '設定を保存しました' },
        { allowlistKeys: new Set() }
      )
      expect(r).toEqual([])
    })
  })

  describe('extractScriptUserFacingCjkLines · <script> 內用戶可見 API 的 CJK 硬編碼', () => {
    it('抓 uni.showToast 的 title 硬編碼', () => {
      const src = `<template><view/></template>
<script>
export default { methods: { a() {
  uni.showToast({ title: '建立專案失敗', icon: 'none' })
} } }
</script>`
      const hits = extractScriptUserFacingCjkLines(src)
      expect(hits.map((h: any) => h.text.trim())).toContain(
        "uni.showToast({ title: '建立專案失敗', icon: 'none' })"
      )
    })

    it('抓 uni.showModal 的 title / content / confirmText / cancelText', () => {
      const src = `<template><view/></template>
<script>
uni.showModal({
  title: '確認刪除',
  content: '刪除後無法復原',
  confirmText: '確定',
  cancelText: '取消'
})
</script>`
      const hits = extractScriptUserFacingCjkLines(src)
      expect(hits).toHaveLength(4)
    })

    it('不得誤報 console.log 的中文（CLAUDE.md 明確允許 log 用正體中文）', () => {
      const src = `<template><view/></template>
<script>
console.log('使用者登入成功')
console.error('提交審核失敗', err)
console.warn('輪詢審核狀態失敗')
</script>`
      expect(extractScriptUserFacingCjkLines(src)).toEqual([])
    })

    it('不得誤報 $t() / tt() 的中文兜底（i18n 會正常解析，非違規）', () => {
      const src = `<template><view/></template>
<script>
uni.showModal({
  confirmText: this.$t('common.confirm') || '確定',
  cancelText: this.$t('common.cancel') || '取消',
  content: tt('sc.tip', '請輸入故事標題')
})
</script>`
      expect(extractScriptUserFacingCjkLines(src)).toEqual([])
    })

    it('不得誤報註釋與 template 區塊', () => {
      const src = `<template><view>模板中文歸 templateCjk 管</view></template>
<script>
// 這是註釋：確認刪除
/* 區塊註釋：建立專案失敗 */
const x = 1
</script>`
      expect(extractScriptUserFacingCjkLines(src)).toEqual([])
    })

    it('不得誤報表達式賦值裡的 CJK（字串處理的匹配模式，非展示文案）', () => {
      // 真實假陽性來源：components/custom/pinned-drawer.vue:144
      const src = `<template><view/></template>
<script>
const o = {
  content: item.chatMessage.replace("<已解除苛刻的道德限制>", ""),
  title: buildTitle('前綴'),
}
</script>`
      expect(extractScriptUserFacingCjkLines(src)).toEqual([])
    })


    it('不得誤報埋點 payload 的 CJK（分析事件參數非用戶可見文案）', () => {
      // 真實假陽性來源：mobile/src/pages/canvas/canvas.vue:7412,7574
      const src = `<template><view/></template>
<script>
ga4Events.reportCustomEventWithStandardParams('chat_error_insufficient_points', {
  role_id: this.roleId,
  error_message: '積分不足，請先充值！',
  event_category: 'chat_error'
})
</script>`
      expect(extractScriptUserFacingCjkLines(src)).toEqual([])
    })

    it('無 script 區塊時回空陣列，不拋錯', () => {
      expect(extractScriptUserFacingCjkLines('<template><view/></template>')).toEqual([])
    })

    it('回傳的行號要對得上原始碼', () => {
      const src = `<template><view/></template>
<script>
const a = 1
uni.showToast({ title: '失敗了' })
</script>`
      const hits = extractScriptUserFacingCjkLines(src)
      expect(hits).toHaveLength(1)
      expect(hits[0].line).toBe(4)
    })
  })

  describe('gate 接線', () => {
    const result = analyze()

    it('scriptResidue 豁免名單不得殘留已清償條目（棘輪只減不增）', () => {
      // 2026-07-20 實證：sc.* 補譯 69 條後，ja/ko 各有 71 條豁免已失效卻靜靜躺著。
      // 沒有這道斷言，白名單會腐爛成「加一筆就能繞過」的擺設。
      expect(result.staleScriptResidueBaseline).toEqual([])
      expect(result.totals.staleScriptResidueBaseline).toBe(0)
    })

    // 2026-07-20（JA-KO Plan 第 4 批）：glossary 存量清零後升為 hard gate。
    it('glossary 已清零且升為 hard gate', () => {
      expect(result.glossary).toEqual([])
      expect(result.totals.glossary).toBe(0)
    })

    it('desktop 詞表刻意不含 Tap 規則（PC Web 用滑鼠，クリック 才是正確用法）', () => {
      // 該規則的 reason 本身寫著「手機端說 click 不合適」，是 mobile 專屬。
      // 誤抄到 desktop 會把 27 處正確文案改錯。
      expect(JA_GLOSSARY.map((g: any) => g.concept)).not.toContain('Tap')
    })

    it('glossary 誤報 key 必須在豁免名單內（クレジットカード＝信用卡非積分）', () => {
      expect(GLOSSARY_ALLOWLIST_KEYS.has('mine.payment_creditcard')).toBe(true)
    })

    it('script 硬編碼掃描與棘輪都要進 analyze() 的 totals', () => {
      expect(result.totals).toHaveProperty('scriptUserFacingCjk')
      expect(result.totals).toHaveProperty('staleScriptCjkBaseline')
    })

    it('script 硬編碼存量已登記基線，當前工作區不得有新增違規', () => {
      expect(result.scriptUserFacingCjk).toEqual([])
      expect(result.totals.scriptUserFacingCjk).toBe(0)
    })

    it('棘輪：基線不得高於實際命中（債務清償後必須調低基線）', () => {
      expect(result.staleScriptCjkBaseline).toEqual([])
      expect(result.totals.staleScriptCjkBaseline).toBe(0)
    })

    it('四類新檢查都要進 analyze() 的 totals', () => {
      expect(result.totals).toHaveProperty('scriptResidue')
      expect(result.totals).toHaveProperty('placeholderParity')
      expect(result.totals).toHaveProperty('glossary')
      expect(result.totals).toHaveProperty('chineseResidue')
    })

    it('存量債務已全數登記基線，當前工作區不得有新增違規', () => {
      expect(result.scriptResidue).toEqual([])
      expect(result.placeholderParity).toEqual([])
      expect(result.chineseResidue).toEqual([])
      expect(result.totals.scriptResidue).toBe(0)
      expect(result.totals.placeholderParity).toBe(0)
      expect(result.totals.chineseResidue).toBe(0)
    })
  })
})
