import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

// 施工單：模型思考能力三檔聲明制（邊界 7）· chat.vue（desktop）
//
// 「顯示思考過程」是純顯示層開關（formData.showThinkingProcess，預設 true）。
// modelSelect.vue 是唯一能切換它的地方，且已保證「切到非 adaptive 模型時重置為
// true」（見 modelSelect-adaptive-thinking.spec.ts），所以 chat.vue 這端只要
// 純粹信任 formData.showThinkingProcess 當全域渲染閘門即可。
describe('chat.vue adaptive thinking display gate（邊界 7，desktop）', () => {
  const readSource = () => fs.readFileSync(
    path.resolve(__dirname, '../canvas.vue'),
    'utf8',
  )

  it('思考摺疊區 v-if 加上 formData.showThinkingProcess !== false 閘門（關閉時不渲染，僅顯示層）', () => {
    const source = readSource()

    // 閘門搬進 messageProps：關掉「顯示思考過程」時那一列根本不帶思考內容，
    // 所以摺疊區連畫都不畫（純顯示層，不動存檔）。
    expect(source).toMatch(/reasoning:[\s\S]{0,140}formData\.showThinkingProcess !== false/)
  })
})
