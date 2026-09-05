/**
 * 把一個準備步驟轉成使用者看得懂的一句話。
 *
 * **純函式，不讀元件狀態。** 抽出來的理由：同一段文案有兩個來源——即時推送的
 * SSE 事件，以及重整之後從伺服器讀回的軌跡。原本這段邏輯是個讀 this.prepStepXxx
 * 的 computed，只有即時那條路用得到；伺服器那條路只好把物件原樣塞進去，畫面上
 * 就渲染成一段未解析的 JSON（2026-08-08 線上實測）。
 *
 * step 的欄位跟伺服器送的 prepStep 事件一致：
 *   { stage, resource, query|keywords, count, attempt, maxAttempts, retryInSeconds }
 *
 * t 是 i18n 的取字函式（Vue 2 傳 this.$t、Vue 3 傳 t）。文案永遠在前端挑，
 * 伺服器只給階段語意——所以使用者換語言之後回看，看到的是他現在的語言。
 *
 * 回空字串代表「這一步沒有話可說」，呼叫端自己決定要不要略過。
 */
export interface PrepStep {
  stage?: string
  resource?: string
  query?: string
  keywords?: string
  count?: number
  attempt?: number
  maxAttempts?: number
  retryInSeconds?: number
}

type Translate = (key: string, params?: Record<string, string>) => string

export function prepStepText(step: PrepStep | undefined, t: Translate): string {
  if (!step || typeof step !== 'object' || typeof t !== 'function') return ''
  const stage = step.stage || ''
  const resource = step.resource || ''
  const query = step.query || step.keywords || ''
  const count = typeof step.count === 'number' ? step.count : 0

  // 資源名：說得出它動的是哪一類東西，畫面就具體得多，而具體正是這條流水帳
  // 唯一的價值。
  const resName: string = ({
    setting: t('multiPass.prepResSetting'),
    note: t('multiPass.prepResNote'),
    shared: t('multiPass.prepResShared'),
    past: t('multiPass.prepResPast'),
    draft: t('multiPass.prepResDraft'),
    mod: t('multiPass.prepResMod'),
    requirement: t('multiPass.prepResRequirement'),
    status: t('multiPass.prepResStatus'),
    settled: t('multiPass.prepResSettled'),
  } as Record<string, string>)[resource] || ''

  if (stage === 'noting') {
    if (resource === 'shared') return t('multiPass.prepNotingShared')
    return resName ? t('multiPass.prepNotingIn', { r: resName }) : t('multiPass.prepNoting')
  }
  if (stage === 'drafting') return t('multiPass.prepDrafting')
  // 交給機率決定的三件事各說各的:併成一句就只能寫得含糊,而「擲骰決定結果」跟
  // 「封存一個暫時不揭曉的答案」對使用者的意義完全不同。三句都不帶結果值。
  if (stage === 'rolling') return t('multiPass.prepRolling')
  if (stage === 'sealing') return t('multiPass.prepSealing')
  if (stage === 'revealing') return t('multiPass.prepRevealing')
  if (stage === 'looking_up') {
    // {q}/{n} 是 i18n 自己的插值佔位符,必須走參數 API——不帶參數呼叫再 replace
    // 的話佔位符已經先被解析成空字串了(實測畫面出現「正在查「」的設定」)。
    if (query && resName) return t('multiPass.prepLookingUpIn', { r: resName, q: query })
    if (query) return t('multiPass.prepLookingUpNamed', { q: query })
    return t('multiPass.prepLookingUp')
  }
  if (stage === 'retrying') {
    return t('multiPass.prepRetrying', {
      s: String(step.retryInSeconds || 0),
      a: String(step.attempt || 0),
      m: String(step.maxAttempts || 0),
    })
  }
  if (stage === 'browsing') {
    return resName ? t('multiPass.prepBrowsingIn', { r: resName }) : t('multiPass.prepBrowsing')
  }
  if (stage === 'reading') {
    // 讀自己寫的草稿是「回頭審視」,不是「細看找到的資料」——同一個動詞套在兩件
    // 不同的事上,畫面就會出現「正在細看自己的草稿」這種不對勁的話。
    if (resource === 'draft') return t('multiPass.prepReviewingDraft')
    return resName ? t('multiPass.prepReadingIn', { r: resName }) : t('multiPass.prepReading')
  }
  if (stage === 'found') {
    // 零命中不是「找到 0 條」——那句話自相矛盾。查無結果本身是有效答案,
    // 但要用「沒有」講。
    if (!count) {
      return resName ? t('multiPass.prepFoundNoneIn', { r: resName }) : t('multiPass.prepFoundNone')
    }
    return resName
      ? t('multiPass.prepFoundIn', { r: resName, n: String(count) })
      : t('multiPass.prepFound', { n: String(count) })
  }
  if (stage === 'deciding') return t('multiPass.prepDeciding')
  return ''
}

/**
 * 把伺服器送回的一輪軌跡轉成顯示用的字串陣列。
 *
 * 沒有話可說的步驟會被略過——它們在流水帳上是空行，只會讓人以為畫面壞了。
 */
export function prepTrailFromServerSteps(steps: PrepStep[] | undefined, t: Translate): string[] {
  if (!Array.isArray(steps)) return []
  const out: string[] = []
  for (let i = 0; i < steps.length; i++) {
    var line = prepStepText(steps[i], t)
    if (line) out.push(line)
  }
  return out
}
