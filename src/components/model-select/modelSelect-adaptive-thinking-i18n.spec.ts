import { describe, expect, it } from 'vitest'

// 施工單：模型思考能力三檔聲明制（邊界 7）· 五語文案鎖定（desktop）
describe('adaptive thinking i18n copy（邊界 7，五語，desktop）', () => {
  it('modelSelect.thinkingAdaptiveHint：「此模型會自行判斷是否需要思考」五語', async () => {
    const zhHant = (await import('@/locale/zh-Hant.json')).default
    const zhHans = (await import('@/locale/zh-Hans.json')).default
    const en = (await import('@/locale/en.json')).default
    const ja = (await import('@/locale/ja.json')).default
    const ko = (await import('@/locale/ko.json')).default

    expect(zhHant['modelSelect.thinkingAdaptiveHint']).toBe('此模型會自行判斷是否需要思考')
    expect(zhHans['modelSelect.thinkingAdaptiveHint']).toBe('此模型会自行判断是否需要思考')
    expect(en['modelSelect.thinkingAdaptiveHint']).toBe('This model decides on its own when it needs to think.')
    expect(ja['modelSelect.thinkingAdaptiveHint']).toBe('このモデルは、考える必要があるかどうかを自ら判断します。')
    expect(ko['modelSelect.thinkingAdaptiveHint']).toBe('이 모델은 생각이 필요한지 스스로 판단합니다.')
  })

  it('modelSelect.showThinkingProcess：「顯示思考過程」五語', async () => {
    const zhHant = (await import('@/locale/zh-Hant.json')).default
    const zhHans = (await import('@/locale/zh-Hans.json')).default
    const en = (await import('@/locale/en.json')).default
    const ja = (await import('@/locale/ja.json')).default
    const ko = (await import('@/locale/ko.json')).default

    expect(zhHant['modelSelect.showThinkingProcess']).toBe('顯示思考過程')
    expect(zhHans['modelSelect.showThinkingProcess']).toBe('显示思考过程')
    expect(en['modelSelect.showThinkingProcess']).toBe('Show thinking process')
    expect(ja['modelSelect.showThinkingProcess']).toBe('思考プロセスを表示')
    expect(ko['modelSelect.showThinkingProcess']).toBe('생각 과정 표시')
  })
})
