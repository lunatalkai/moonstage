import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

// 施工單：模型思考能力三檔聲明制（邊界 7）· modelSelect.vue（desktop）
//
// 邊界 7。
//   adaptive 模型：
//     a. 思考檔位選擇器不顯示「關閉」選項；檔位說明處顯示
//        「此模型會自行判斷是否需要思考」（五語）。
//     b. 新增「顯示思考過程」顯示層開關（adaptive 專屬顯示；預設=顯示（摺疊態））；
//        關閉時聊天中不渲染思考區塊（僅顯示層，不影響生成與計費）。
describe('chat modelSelect adaptive thinking control（邊界 7，desktop）', () => {
  const readSource = () => fs.readFileSync(
    path.join(__dirname, 'ModelSelectPanel.vue'),
    'utf8',
  )

  it('thinkingDepthOptions 改用共用的 getVisibleThinkingDepthOptions（過濾 off / none 清空）', () => {
    const source = readSource()

    expect(source).toMatch(/getVisibleThinkingDepthOptions/)
    expect(source).toMatch(/thinkingDepthOptions = computed\(\(\) => \{[\s\S]*getVisibleThinkingDepthOptions\(selectItem\.value\)/)
  })

  it('新增 isAdaptiveThinkingModel computed，來源是共用的 getThinkingControl', () => {
    const source = readSource()

    expect(source).toMatch(/isAdaptiveThinkingModel = computed\(\(\) => getThinkingControl\(selectItem\.value\) === ['"]adaptive['"]\)/)
  })

  it('adaptive 模型的檔位說明顯示「此模型會自行判斷是否需要思考」i18n key', () => {
    const source = readSource()

    expect(source).toMatch(/v-if="isAdaptiveThinkingModel"[\s\S]{0,300}modelSelect\.thinkingAdaptiveHint/)
  })

  it('新增「顯示思考過程」顯示層開關：adaptive 專屬顯示、綁定 formData.showThinkingProcess', () => {
    const source = readSource()

    expect(source).toMatch(/v-if="isAdaptiveThinkingModel"[\s\S]{0,500}modelSelect\.showThinkingProcess/)
    expect(source).toMatch(/v-model:checked="formData\.showThinkingProcess"/)
  })

  it('切換顯示思考過程時立即持久化到本地偏好（setShowThinkingProcess）', () => {
    const source = readSource()

    expect(source).toMatch(/from ['"]@\/utils\/thinking-display-pref['"]/)
    expect(source).toMatch(/onShowThinkingProcessChange[\s\S]{0,200}setShowThinkingProcess\(formData\.roleId,\s*formData\.showThinkingProcess\)/)
  })

  it('切到非 adaptive 模型時重置 showThinkingProcess = true（避免殘留 false 誤傷其他模型的思考渲染）', () => {
    const source = readSource()

    expect(source).toMatch(/normalizeShowThinkingProcessForSelectedModel/)
    expect(source).toMatch(/normalizeContextForSelectedModel = \([\s\S]*?\) => \{[\s\S]*normalizeShowThinkingProcessForSelectedModel\(\)/)
  })
})
