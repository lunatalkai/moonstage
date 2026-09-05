// @vitest-environment jsdom
import fs from 'node:fs'
import path from 'node:path'
import { describe, it, expect, beforeEach } from 'vitest'
import { createAuthorAssetRuntime } from '@/utils/author-asset-mount.js'
import { applyTavernRules } from '../canvas-rule-engine'
import { scopeCardHtml } from '../canvas-style-scope'

const CHAT_VUE_PATH = path.join(process.cwd(), 'src/pages/canvas/canvas.vue')

/**
 * 用跟既有測試（chat-heavy-html-fence-unwrap.spec.ts 等）同一套「錨點 + 括號配平」
 * 慣例，從原始碼抓出一個具名函式或 callback 的完整本體（含大括號）。
 */
function extractBraceMatchedBody(anchor: string): string {
  const source = fs.readFileSync(CHAT_VUE_PATH, 'utf8')
  const startIdx = source.indexOf(anchor)
  if (startIdx === -1) {
    throw new Error(`錨點「${anchor}」找不到 — canvas.vue 結構已變，需同步更新本測試`)
  }
  const braceStart = source.indexOf('{', startIdx + anchor.length - 1)
  let depth = 0
  let i = braceStart
  for (; i < source.length; i++) {
    if (source[i] === '{') depth++
    else if (source[i] === '}') {
      depth--
      if (depth === 0) { i++; break }
    }
  }
  if (depth !== 0) {
    throw new Error(`錨點「${anchor}」本體括號未配對 — 抽取失敗`)
  }
  return source.slice(startIdx, i)
}

// Owner 的疑慮：聊了 50–60 輪後重新整理，歷史是分頁載入的，開場那則訊息可能
// 還沒被載進來；如果作者的常駐部署只綁在開場訊息上，重整後就會憑空消失。
//
// 框架的答案：常駐部署走 mountTrigger，跟訊息歷史完全脫鉤——canvas.vue 的
// loadAuthorAsset() 在進頁時就把 mountTrigger 丟給規則引擎展開、掛進作者層，
// 這一步不讀、也不等 talkList（訊息陣列）。歷史陣列是空是滿，這段常駐內容
// 都會出現，因為它從來就不是「訊息串的一部分」。
//
// 這裡把 loadAuthorAsset() 掛載那一段的真實序列（applyTavernRules →
// scopeCardHtml → runtime.mount，見 canvas.vue 1881-1887 行）原封不動地組起來，
// 用「歷史陣列長度 0、#chat 完全沒有子節點」模擬重整後歷史還沒載入的瞬間，
// 斷言展開後的常駐內容仍然正確出現在作者層，而且不在 #chat 裡面
// （不依賴、不讀取、不巢狀在訊息容器內）。
describe('作者資產：mountTrigger 常駐部署跟訊息歷史脫鉤', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
  })

  it('歷史為空（模擬分頁載入尚未回來）時，常駐內容仍正確展開並掛進作者層，且不在 #chat 內', () => {
    // #chat 先建好、刻意保持零子節點——代表「重整後、分頁歷史還沒載入」那一刻。
    const chat = document.createElement('div')
    chat.id = 'chat'
    document.body.appendChild(chat)

    // 模擬 authorAssetServe 回應：帶一條把 mountTrigger 換成常駐面板的規則。
    const serveResponse = {
      statusCode: 200,
      data: {
        mountLayer: 'over' as const,
        mountTrigger: '<<PERSISTENT_BOOT>>',
        source: 'mmd',
        rules: [
          {
            id: 1,
            find: '/<<PERSISTENT_BOOT>>/g',
            replace: '<div class="persistent-panel">常駐面板：不依賴訊息歷史</div>',
          },
        ],
      },
    }

    // 模擬歷史陣列：分頁載入尚未回來，長度為 0。下面的掛載序列全程不讀它，
    // 這正是要鎖住的契約——mountTrigger 的展開跟這個陣列毫無關係。
    const talkList: unknown[] = []

    const runtime = createAuthorAssetRuntime({
      doc: document,
      layerZIndex: { under: 12, over: 30, cover: 1000 },
    })

    // 與 canvas.vue loadAuthorAsset() 內完全相同的序列：
    // applyTavernRules(mountTrigger, rules) → scopeCardHtml → runtime.mount()
    const expanded = applyTavernRules(
      serveResponse.data.mountTrigger,
      serveResponse.data.rules,
      {},
    ).html
    const mounted = scopeCardHtml(expanded, serveResponse.data.source as 'mmd')
    const container = runtime.mount({ mountLayer: serveResponse.data.mountLayer, html: mounted })

    // 歷史真的是空的——這是本測試要模擬的前提，不是巧合。
    expect(talkList.length).toBe(0)

    // 常駐內容正確展開、掛進作者層。
    expect(container.innerHTML).toContain('常駐面板：不依賴訊息歷史')

    // 不在 #chat 裡面：既不是 #chat 的子孫，#chat 本身也維持零子節點——
    // 掛載這一步完全沒有碰過訊息容器。
    expect(chat.contains(container)).toBe(false)
    expect(chat.children.length).toBe(0)
    expect(document.body.contains(container)).toBe(true)
  })

  // 上一個測試只證明「掛載那段序列本身不需要歷史」——如果有人把
  // loadAuthorAsset() 的呼叫點改成放進歷史載入完成的 callback 裡（例如塞進
  // getRole() 的回呼、或加一條 `if (talkList.length)` 才呼叫），上面那個測試
  // 仍然會綠燈，因為它繞過真正的呼叫路徑直接組裝三個函式。這裡改成直接盯
  // canvas.vue 原始碼，鎖住「呼叫點在哪裡、函式本體有沒有碰歷史」這兩件事本身。
  it('loadAuthorAsset() 呼叫點與函式本體本身不依賴訊息歷史（原始碼層級鎖定）', () => {
    // 1) 函式本體完全不提訊息歷史陣列——它不該讀、也不該等 talkList 才動作。
    const fnBody = extractBraceMatchedBody('async function loadAuthorAsset(targetRoleId) {')
    expect(fnBody).not.toMatch(/talkList/)

    // 2) 呼叫點在 onLoad 這個進頁生命週期鉤子裡，且在任何看起來像「載入角色/歷史」
    //    的呼叫（getRole）之前執行——不是被塞進歷史載入完成後的回呼裡才觸發。
    const onLoadBody = extractBraceMatchedBody('onLoad((options) => {')
    const callIdx = onLoadBody.indexOf('loadAuthorAsset(')
    const getRoleIdx = onLoadBody.indexOf('getRole(')
    expect(callIdx).toBeGreaterThan(-1)
    expect(getRoleIdx).toBeGreaterThan(-1)
    expect(callIdx).toBeLessThan(getRoleIdx)
  })
})
