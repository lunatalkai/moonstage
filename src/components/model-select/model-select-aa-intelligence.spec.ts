import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

// Dedicated spec file (not modelSelect.spec.ts) so these assertions actually run under
// the trusted vitest suite: modelSelect.spec.ts is currently registered in
// scripts/gates.json known_failures.vitest_suites (pre-existing, unrelated debt —
// see docs/test-debt-2026-07-07.md) and is excluded from `npm test` by vitest.config.ts.
describe('chat modelSelect AA intelligence chip (desktop, mirrors mobile feat/aa-intelligence-chip)', () => {
  const readSource = () => fs.readFileSync(
    path.join(__dirname, 'ModelSelectPanel.vue'),
    'utf8',
  )

  // v3 把三個舊案例（單變體 chip／attribution／多變體 chip）併成一條。
  //
  // 舊版分三條是因為 v2 有兩個分支（單變體 metrics-row 與多變體 tier-row），
  // 兩邊各寫一次智力 chip，於是漏過一次（P1 回歸）。v3 的列只有一種形狀，
  // 智力走 rowMetaFor 統一輸出，結構上不可能只有一個分支有——分支消失了，
  // 對應的回歸也就消失了。要守的意圖不變：有指數就要看得到，而且要附來源。
  it('surfaces the AA intelligence index on every row that has one, with attribution', () => {
    const source = readSource()

    // 指數來自 modelListV2 的 family/variant.aaIntelligenceIndex，不是 variant.status
    expect(source).toMatch(/getAaAgenticIndex\s*,\s*getAaIntelligenceIndex\s*,\s*getModelHealthMetrics\s*,\s*getUsageRank\s*\}\s*from\s*'@\/utils\/model-health-metrics'/)
    expect(source).toMatch(/const getIntelligenceIndex = \(family, variant\) => \{\s*\n\s*return getAaIntelligenceIndex\(family, variant\);\s*\n\s*\};/)

    // 單一輸出點：列的指標帶。單變體與多變體走同一條路，不再有兩個分支。
    expect(source).toMatch(/const rowMetaFor[\s\S]*?getIntelligenceIndex\(family, primary\)/)
    expect(source).toContain("t('modelSelect.metricIntelligence')")

    // 出處從三行「各自標註」合併成一行墊底（2026-08-27 版面改版）：原本 121 字的
    // 灰字區裡有 45 字在講出處，而「來源」兩個字重複了三次。出處是可信度需求，
    // 不是掃視需求——要有，但不該跟數據搶同一個字級。
    expect(source).toContain("t('modelSelect.metricsSource')")
    expect(source).not.toContain("t('modelSelect.aaIntelligenceSource')")
    expect(source).not.toMatch(/family\.expanded\s*&&\s*getIntelligenceIndex/)
  })

  it('provides five-language copy for the AA intelligence chip and its attribution caption', async () => {
    // Uses the '@/locale/...' Vite alias (absolute, resolved from vitest.config.ts) rather
    // than an __dirname-relative fs read: vitest's include glob also picks up this file through
    // the locale-symlink view directories (src/en/pages -> ../pages, src/ja/pages -> ../pages, …),
    // where __dirname-relative '../../locale' resolves to a nonexistent src/en/locale/*.json.
    const [zhHant, zhHans, en, ja, ko] = await Promise.all([
      import('@/locale/zh-Hant.json'),
      import('@/locale/zh-Hans.json'),
      import('@/locale/en.json'),
      import('@/locale/ja.json'),
      import('@/locale/ko.json'),
    ])

    // 智力拆成「綜合智力」與「Agent 表現」兩項之後，chip 文案跟著改名。刻意的
    // 測試語意變更：使用者要分得出「聰不聰明」跟「能不能自己跑完一串工作」。
    expect(zhHant.default['modelSelect.metricIntelligence']).toBe('綜合智力')
    expect(zhHant.default['modelSelect.aaIntelligenceSource']).toBe('智力分數來源：Artificial Analysis')

    expect(zhHans.default['modelSelect.metricIntelligence']).toBe('综合智力')
    expect(zhHans.default['modelSelect.aaIntelligenceSource']).toBe('智力分数来源：Artificial Analysis')

    expect(en.default['modelSelect.metricIntelligence']).toBe('Intelligence')
    expect(en.default['modelSelect.aaIntelligenceSource']).toBe('Intelligence score source: Artificial Analysis')

    expect(ja.default['modelSelect.metricIntelligence']).toBe('総合知能')
    expect(ja.default['modelSelect.aaIntelligenceSource']).toBe('知能スコアの出典：Artificial Analysis')

    expect(ko.default['modelSelect.metricIntelligence']).toBe('종합 지능')
    expect(ko.default['modelSelect.aaIntelligenceSource']).toBe('지능 점수 출처: Artificial Analysis')
  })

  // 展開層改成兩欄 KV 之後，不變式換了一組（owner 2026-08-27 拍板版面）：
  //
  // 舊：三行灰字「數據 · 來源」黏在一起，沒有資料的整行消失。
  // 新：固定列組的 KV，沒有資料的畫「—」；出處合併成一行墊底。
  //
  // 「固定列組」是刻意的——列會忽有忽無的話，同一個位置在不同卡片上是不同的東西，
  // 跨卡片比較就沒了，而那正是選 KV 而不是 chips 的理由。唯一會整列消失的是可用率，
  // 因為樣本不足時那個數字是誤導而不是缺漏。
  it('renders the metric block as a fixed KV row set, not conditional prose lines', () => {
    const source = readSource()

    expect(source).toMatch(/v-for="row in detailRowsFor\(detailFamily\)"/)
    // 沒有資料畫「—」，不是整列消失
    expect(source).toMatch(/row\.value \|\| '—'/)
    // 出處只剩一行
    expect(source).toContain("t('modelSelect.metricsSource')")
    expect(source).not.toMatch(/v-if="getAgenticIndex\(detailFamily[\s\S]{0,80}class="ms-kv"/)

    // 綜合智力不再重複：收合列的指標帶已經有了，展開只給新東西
    expect(source).not.toMatch(/ms-kv[\s\S]{0,120}modelSelect\.metricIntelligence/)
  })

  it('puts each lane metric under its own lane row, and says so when there is no usage data', () => {
    const source = readSource()

    // 指標掛在該條線路底下，而不是所有線路一份清單、所有指標另一份平行清單
    expect(source).toMatch(/class="ms-opt-meta">\{\{ laneMetaFor\(variant\) \}\}/)
    expect(source).toContain("t('modelSelect.laneNoUsageData')")
    // 首字與截斷率同源（都只由真實對話供給），要空是一起空
    expect(source).toContain("t('modelSelect.metricTruncation')")
  })

  it('keeps alert badges but folds the insufficient-sample one into the value it qualifies', () => {
    const source = readSource()

    expect(source).toMatch(/alertBadgesFor\(detailFamily\)/)
    // 「樣本不足」是在修飾數字可不可信，離那個數字越近越好——不當成獨立徽章
    expect(source).toMatch(/filter\(b => b\.key !== 'modelSelect\.signalInsufficientSample'\)/)
  })

  it('provides five-language copy for the split metrics', async () => {
    const locales = await Promise.all([
      import('@/locale/zh-Hant.json'),
      import('@/locale/zh-Hans.json'),
      import('@/locale/en.json'),
      import('@/locale/ja.json'),
      import('@/locale/ko.json'),
    ])
    const keys = [
      'modelSelect.metricsTitle',
      'modelSelect.metricAgentic',
      'modelSelect.metricPopularity',
      'modelSelect.usageRankValue',
      'modelSelect.usageRankDetail',
      'modelSelect.metricsSource',
      'modelSelect.metricTruncation',
      'modelSelect.laneNoUsageData',
      'modelSelect.metricUptime',
      'modelSelect.uptimeValue',
      'modelSelect.uptimeValueWith72h',
      'modelSelect.metricContext',
      'modelSelect.contextRangeValue',
    ]
    for (const locale of locales) {
      const dict = locale.default as Record<string, string>
      for (const key of keys) {
        expect(typeof dict[key]).toBe('string')
        expect(dict[key].length).toBeGreaterThan(0)
      }
      // 佔位符必須成套，缺一個的症狀是畫面上出現一段沒被取代的 {total}。
      expect(dict['modelSelect.usageRankValue']).toContain('{rank}')
      expect(dict['modelSelect.usageRankDetail']).toContain('{rank}')
      expect(dict['modelSelect.usageRankDetail']).toContain('{total}')
      expect(dict['modelSelect.usageRankDetail']).toContain('{share}')
    }
  })
})
