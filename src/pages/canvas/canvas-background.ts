/**
 * 舞台背景要顯示哪一張。
 *
 * ── 為什麼有兩級回退 ──
 * MMD 的聊天頁把背景層綁成
 * `url(roleInfo.backgroundUrl ? roleInfo.backgroundUrl : roleInfo.imageUrl)`：
 * 先用卡片的背景圖，沒有就用卡片的形象圖。兩級都是卡片自帶的——MMD 在這一層
 * 沒有「玩家自選背景」這回事，所以匯進來的卡在對方一定看得到背景。
 *
 * 我們原本只認玩家設過的那一張，沒設就是空白，於是同一張卡搬過來背景整個不見
 * （owner 2026-09-10）。補上這兩級就跟對方一致。
 *
 * ── 為什麼「不要背景」是獨立一個偏好鍵 ──
 * 玩家偏好讀回來時，「沒設過」與「設成空」都會被塌成空字串（見 mixins/UserDefine.js
 * 的 PLAY_PREFERENCE_DEFAULTS），兩者分不開。補上回退之後，若讓空字串同時代表兩件事，
 * 玩家就再也關不掉背景了。
 *
 * 不用哨兵字串塞進 backgroundUrl：那份偏好是跟主站共用的同一筆資料（同一個
 * player/preference 端點），主站的聊天頁會把 backgroundUrl 直接當網址畫出去，
 * 哨兵漏過去就是一個永遠 404 的背景。偏好是自由欄位、合併寫入，所以另開一個鍵，
 * 誰都不會誤讀。
 */

export interface StageBackgroundInput {
  /** 玩家偏好裡的背景網址：'' 代表沒設過 */
  playerChoice?: string | null
  /** 玩家主動關掉背景。獨立一個鍵，不塞進 backgroundUrl —— 見檔頭 */
  backgroundOff?: boolean | null
  /** 卡片自帶的背景圖 */
  roleBackground?: string | null
  /** 卡片的形象圖，MMD 的第二級回退 */
  roleAvatar?: string | null
  /** 卡片自帶的橫式背景圖（選填，2026-09-15）：橫向螢幕優先用它 */
  roleBackgroundLandscape?: string | null
}

const clean = (value: unknown): string => (typeof value === 'string' ? value.trim() : '')

export function resolveStageBackground(input: StageBackgroundInput): string {
  if (input && input.backgroundOff === true) return ''
  const choice = clean(input && input.playerChoice)
  if (choice) return choice
  return clean(input && input.roleBackground) || clean(input && input.roleAvatar) || ''
}

/**
 * 橫向螢幕用的那張。玩家自選背景只有一張，兩個方向共用；卡片沒有橫圖就回空，
 * 由舞台 CSS 退回直圖（`var(--lt-bg-landscape, var(--lt-bg-portrait))`）。
 * 這裡刻意不再退到形象圖：直圖那條已經退過了，橫圖再退一次只會把同一張圖拿來裁兩種樣子。
 */
export function resolveStageLandscapeBackground(input: StageBackgroundInput): string {
  if (input && input.backgroundOff === true) return ''
  const choice = clean(input && input.playerChoice)
  if (choice) return choice
  return clean(input && input.roleBackgroundLandscape)
}
