import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

/*
  模型選單搬進畫布彈層之後的版面契約。

  原本那份是整頁版：側欄、浮在清單上的排序選單、雙欄詳情、自己的捲動容器、
  釘在底部的確認鍵。塞進 560px 寬、76vh 高、overflow hidden 的彈層之後，手機上
  看到的是：排序選單變成一片黑蓋住整片、卡片互相疊、整片不能捲、點開一個模型
  只看得到第一條線路。這裡守的是「彈層裡只有一個捲動容器、所有東西都在文流裡」。
*/
const root = process.cwd()
const panel = fs.readFileSync(path.join(root, 'src/components/model-select/ModelSelectPanel.vue'), 'utf8')
const css = fs.readFileSync(path.join(root, 'src/pages/canvas/canvas.css'), 'utf8')
const template = panel.slice(0, panel.indexOf('\n</template>'))

const rule = (selector: string): string => {
  const idx = css.indexOf(`\n  ${selector} {`)
  expect(idx, `canvas.css 缺 ${selector}`).toBeGreaterThan(-1)
  return css.slice(idx, css.indexOf('}', idx))
}

describe('模型選單在畫布彈層裡的版面', () => {
  it('元件自己不帶樣式：全部在 canvas.css 的 @layer 裡，作者的卡才蓋得過', () => {
    expect(panel).not.toContain('<style')
    expect(css).toContain('.ms-sheet {')
  })

  it('只有 .mp-setting-body 會捲：元件裡沒有固定高度、沒有第二個捲動容器', () => {
    // 舊版的三個捲動／釘住容器都不在了
    for (const gone of ['ms-detail-split', 'ms-detail-scroll', 'ms-detail-pinned', 'ms-listwrap', 'ms-side-list', 'ms-page']) {
      expect(template, gone).not.toContain(gone)
    }
    // 彈層版的 .ms-* 規則裡不允許縱向 overflow 與固定高度（rail 只橫向捲；modal 例外）
    const start = css.indexOf('.ms-sheet {')
    const end = css.indexOf('.ms-cost-mask {')
    const block = css.slice(start, end)
    expect(block).not.toMatch(/overflow-y:\s*(auto|scroll)/)
    expect(block).not.toMatch(/\n\s+height:\s*\d+vh/)
    expect(block).not.toMatch(/max-height:/)
    // 捲動容器的 flex 鏈是完整的：殼與 body 都 flex:1 + min-height:0
    expect(rule('.model-setting-scope')).toContain('flex: 1 1 auto')
    expect(rule('.model-setting-scope .mp-setting-body')).toContain('flex: 1 1 auto')
  })

  it('排序是一條 chip rail 加一句說明，不是浮在清單上的選單', () => {
    expect(template).not.toContain('ms-sort-menu')
    expect(template).not.toContain('sortSheetOpen')
    // 2026-09-05 起 chip 也帶舊頁面的節點名（model-filter-tab），作者對它寫的外觀才對得上。
    expect(template).toMatch(/v-for="opt in SORT_OPTIONS"[\s\S]{0,200}class="ms-chip model-filter-tab"/)
    expect(template).toContain("{{ t(sortDescKey) }}")
    expect(panel).toMatch(/const sortDescKey = computed/)
  })

  it('分類與排序的 rail 是 edge-to-edge：容器不留內距，內層給兩端 16px', () => {
    const rail = rule('.ms-rail')
    expect(rail).toContain('left: -16px')
    expect(rail).toContain('width: calc(100% + 32px)')
    expect(rail).not.toMatch(/padding/)
    expect(rule('.ms-rail-inner')).toContain('padding: 0 16px')
    // 捲動容器自己先寬到彈層邊，rail 才不會變成橫向捲動
    expect(rule('.model-setting-scope .mp-setting-body')).toContain('left: -16px')
  })

  it('這一段裡沒有 margin：uni-app 的 `* { margin: 0 }` 不在 layer 裡，會贏過 @layer 的 margin', () => {
    const block = css.slice(css.indexOf('.model-setting-scope .mp-setting-body {'), css.indexOf('.ms-cost-suggest {'))
    expect(block).not.toMatch(/\n\s+margin(-[a-z]+)?:/)
  })

  it('詳情長在被點開的那一列底下，跟列在同一張卡裡（同一次 v-for）', () => {
    const family = template.slice(template.indexOf('v-for="family in displayFamilies"'))
    expect(family).toMatch(/class="ms-family"[\s\S]*?class="ms-row model-item"[\s\S]*?<template v-if="detailFamily && detailFamily\.family === family\.family">/)
    // 列上的點擊是開／收，不是只開
    expect(template).toContain('@click="toggleDetail(family)"')
    expect(panel).toMatch(/const toggleDetail = \(family\)/)
  })

  it('選中的模型不在這個分類裡時什麼都不展開——不退到清單第一列', () => {
    const block = panel.slice(panel.indexOf('const detailFamily = computed'), panel.indexOf('const isFreeFamily'))
    expect(block).not.toContain('|| list[0]')
    expect(block).toContain('|| null')
  })

  it('確認鍵只有殼上那一顆：元件裡沒有自己的 CTA', () => {
    expect(template).not.toContain('ms-cta')
    expect(template).not.toMatch(/@click="sure"/)
  })

  it('三組設定都還在：上下文檔位、思考深度、Agent 模式', () => {
    expect(template).toContain("t('modelSelect.contextBudgetShort')")
    expect(template).toContain('contextBudgetLevelChange(item.value)')
    expect(template).toContain("t('modelSelect.thinkingDepth')")
    expect(template).toContain('thinkingDepthChange(option.value)')
    expect(template).toContain("t('modelSelect.deepPrepLabel')")
    expect(template).toContain('@change="onDeepPrepChange"')
    expect(template).toContain("t('modelSelect.deepPrepUnsupported')")
  })

  it('線路、可用率、評測、搜尋、空態都還在', () => {
    expect(template).toContain('openLaneDetail(detailFamily, variant)')
    expect(template).toContain('closeLaneDetail')
    expect(template).toContain('v-for="(b, i) in laneBuckets"')
    expect(template).toContain('toggleAllLanes(detailFamily)')
    expect(template).toContain('v-for="row in detailRowsFor(detailFamily)"')
    expect(template).toContain("t('modelSelect.searchPlaceholder')")
    expect(template).toContain("t('modelSelect.noModelsFound')")
  })

  it('高消費確認是蓋在彈層之上的 modal，用畫布的確認鍵樣式', () => {
    expect(template).toMatch(/class="ms-cost-mask"/)
    expect(template).toMatch(/class="ms-cost confirm-scope"/)
    expect(template).toContain('class="cancel-btn"')
    expect(template).toContain('class="ok-btn"')
    const mask = rule('.ms-cost-mask')
    expect(mask).toContain('position: fixed')
    expect(mask).toMatch(/z-index:\s*100/)
  })

  it('狀態燈與可用率方塊的 class 對得上輔助函式吐出來的字', () => {
    // variantStatusTone / familyStatusTone：danger / warning / unknown
    for (const tone of ['danger', 'warning', 'unknown']) expect(css).toContain(`.ms-dot-${tone}`)
    // laneDetailTone：red / yellow / green / unknown
    for (const tone of ['red', 'yellow', 'green']) expect(css).toContain(`.ms-dot-fill-${tone}`)
    // uptimeBucketTone：none / green / amber / red
    for (const tone of ['none', 'green', 'amber', 'red']) expect(css).toContain(`.ms-bucket-${tone}`)
  })

  it('不掛平台元件庫的 icon：畫布這條路由的卡片 CSS 沒有沙盒', () => {
    expect(panel).not.toContain('@ant-design/icons-vue')
  })
})

/*
  owner 2026-09-05：模型設定的選中態還是金色（卡片是紅色主題）；搜尋框沒圖示、殼裡多一個點，
  沒人知道那是搜尋框；確認鍵重新整理後只有第一次有效。
*/
describe('模型選單吃卡片美化', () => {
  const template = fs.readFileSync(path.resolve(__dirname, '../../../components/model-select/ModelSelectPanel.vue'), 'utf8')
  it('分類／排序 chip、上下文檔位、思考深度、模型列都帶舊頁面的節點名與選中態', () => {
    expect(template).toMatch(/class="ms-chip model-filter-tab"[\s\S]{0,120}'active': tabCurrent === tab\.tabIndex/)
    expect(template).toMatch(/class="ms-pill token"[\s\S]{0,140}'selected': item\.value === formData\.context/)
    expect(template).toMatch(/class="ms-pill mp-token-btn"[\s\S]{0,160}'selected': formData\.thinkingDepth === option\.value/)
    // 選中態掛在列上，不掛在整張家族卡：卡片對它是整塊填主色，掛在卡上會把展開的線路清單一起填掉。
    expect(template).toMatch(/class="ms-row model-item" :class="\{ 'model-item-active': isFamilySelected\(family\) \}"/)
    expect(template).not.toMatch(/class="ms-family model-item"/)
  })
  it('搜尋框是真的 input，有放大鏡，有字時有清除鍵', () => {
    expect(template).toMatch(/<span class="ms-search-icon"[\s\S]*?<svg/)
    expect(template).toMatch(/<CanvasInput\s+el-class="ms-search-input"/)
    expect(template).toMatch(/v-if="searchQuery" class="ms-search-clear"/)
    expect(template).not.toMatch(/<input[\s\S]{0,80}class="ms-search-input"/)
  })
  it('每次打開都把上一次的確認狀態歸零', () => {
    expect(template).toMatch(/watch\(\(\) => props\.open, \(open\) => \{\s*\n\s*if \(!open\) return;[\s\S]{0,400}isSure\.value = false;/)
  })
})
