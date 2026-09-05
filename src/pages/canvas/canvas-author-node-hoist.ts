/**
 * 把訊息氣泡裡帶 position:fixed 的作者節點，搬進畫布統一的作者容器並去重。
 *
 * ── 為什麼需要這個 ──
 * MMD 的「工具列／HUD 面板」這類卡片，作者慣用的手法是讓 AI 每一輪都在回覆裡
 * 重新吐一次觸發標記（跟狀態欄快照同一套邏輯：每輪刷新一次）。我方的顯示規則
 * 引擎逐則訊息展開，若標記展開出來的是一個帶 `position:fixed` 的面板，它就會
 * 留在「那一則訊息」的氣泡裡——氣泡本身常帶 `backdrop-filter`（卡片自己的玻璃
 * 效果），這會讓 fixed 面板被吸成氣泡的 containing block，貼著氣泡邊緣而不是
 * 視窗邊緣；而且每一則含觸發標記的訊息都會各自展開一份，畫面上疊出好幾份。
 *
 * MMD 的真實平台上這類面板是被搬到 body 級的單一容器（實測 DOM：面板節點是
 * `document.body` 的直接子節點，不是留在對話串裡），觸發幾次都只剩一份。
 * 這支函式在我們這邊補回同一件事：掃訊息串裡帶 id 又是 fixed 的節點，
 * 沒見過的 id 就搬進容器；容器裡已經有同 id 的，代表這是重複觸發，
 * 直接丟掉這一份——先出現的那份留著繼續用，因為它可能已經被使用者互動過
 * （展開/收合狀態、輸入框內容……），把它整個換掉反而會讓正在用的東西重置。
 *
 * 沒有 id 的節點不處理：沒有穩定身分就沒辦法判斷「這是不是同一個東西的第二份」，
 * 硬搬只會把普通內文也一起搬走。所有實測到的作者工具列／HUD 面板都有明確 id
 * （卡片自己也要用 id 定位才能操作它，這是它們原本就會做的事）。
 */

export interface HoistResult {
  /** 第一次見到、搬進容器的節點數 */
  hoisted: number
  /** 容器裡已有同 id、被丟棄的重複節點數 */
  removed: number
}

/** jsdom 對 `<style>` 規則算出來的 computed style 不可靠，所以取值方式由呼叫端注入。 */
export type ComputeStyle = (el: Element) => { position: string }

function cssEscapeId(id: string): string {
  if (typeof CSS !== 'undefined' && typeof CSS.escape === 'function') return CSS.escape(id)
  // 沒有 CSS.escape 的環境（少見）：只留字母數字與 - _，其餘跳脫。
  return id.replace(/[^a-zA-Z0-9_-]/g, (ch) => '\\' + ch)
}

/**
 * 掃 `scanRoot` 底下帶 id 且 `position: fixed` 的節點，搬進 `container`：
 * 容器裡還沒有同 id 的就搬過去；已經有的話，代表這是同一個面板第二次觸發，
 * 把 scanRoot 裡新出現的這份移除（容器裡先前那份保留原狀，不動它）。
 *
 * 冪等：對同一份已經搬完的 DOM 再呼叫一次不會有任何動作（`container.contains(el)` 短路）。
 */
export function hoistFixedAuthorNodes(
  scanRoot: Element | null | undefined,
  container: Element | null | undefined,
  computeStyle: ComputeStyle,
): HoistResult {
  const result: HoistResult = { hoisted: 0, removed: 0 }
  if (!scanRoot || !container) return result

  const candidates = Array.from(scanRoot.querySelectorAll('[id]'))

  for (const el of candidates) {
    const id = el.id
    if (!id) continue
    if (container.contains(el)) continue // 已經在容器裡（例如上一輪搬過），不重複處理

    let position: string
    try {
      position = computeStyle(el).position
    } catch (e) {
      continue // 量不到就跳過，不讓單一節點的例外擋掉其他節點
    }
    if (position !== 'fixed') continue

    // 每個候選節點都重新查一次容器——同一輪掃描裡，前一個候選節點若剛搬進容器，
    // 這裡會查到它，讓同一輪出現的第 2、3…份也正確判定成「重複」而不是各自誤判成
    // 「第一次見到」。這正是同一則訊息的規則展開重複觸發、或多則訊息各自帶同一個
    // 面板時，最終只留一份的關鍵。
    let existing: Element | null = null
    try {
      existing = container.querySelector('#' + cssEscapeId(id))
    } catch (e) {
      existing = null
    }

    if (existing && existing !== el) {
      el.remove()
      result.removed++
      continue
    }

    container.appendChild(el)
    result.hoisted++
  }

  return result
}
