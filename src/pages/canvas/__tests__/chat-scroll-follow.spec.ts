import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

// desktop 的捲底：補償必須有中止條件；開新對話必須重置跟隨狀態。
//
// 由來（2026-08-12 使用者在 desktop 上回報兩件事，跟 mobile 一模一樣）：
//   1. 對話上下滑動時整個頁面在閃爍
//   2. 開新對話不會自動滑到底部
//
// 兩個都是既有問題（這一輪動的是 mobile，desktop 一行沒改），但病根同源。
//
// 閃爍：scrollToBottom 的 H5 分支排了一個 30ms 的補償，
//
//     setTimeout(() => { el.scrollTop = el.scrollHeight }, 30)
//
// 而它**沒有任何 gate**——不查 autoScrollEnabled、不查使用者是不是正在滾。
// 串流期間每個 chunk 都排一個，使用者一往上滑就被無條件拉回底部。
// mobile 那兩處補償至少還有中止條件，desktop 這處連 gate 都沒有。
//
// 開新對話：saveAndStartNew 清空 talkList、推一則新開場白，然後就結束了——
// 既沒捲底，也沒重置 autoScrollEnabled。使用者在舊對話裡往上滑過的話，
// 那個旗標還停在 false，接下來就算補上捲底也會被自己的 gate 擋掉。
//
// 這裡讀原始碼而不是跑瀏覽器：要驗的是「這段程式碼有沒有 gate / 有沒有重置」，
// 那在編譯期就決定了。真實捲動行為由手動驗證負責。
describe('desktop 捲底跟隨', () => {
  const src = readFileSync(
    resolve(__dirname, '../canvas.vue'),
    'utf8',
  )

  function fnBody(name: string): string {
    const m = new RegExp(`function ${name}\\s*\\([^)]*\\)[^{]*\\{`).exec(src)
    if (!m) throw new Error(`找不到 ${name}`)
    const open = src.indexOf('{', m.index + m[0].length - 1)
    let depth = 0
    let end = open
    for (let i = open; i < src.length; i++) {
      if (src[i] === '{') depth++
      else if (src[i] === '}') {
        depth--
        if (depth === 0) { end = i; break }
      }
    }
    // 只看程式碼——註解要留住「為什麼要有 gate」，掃註解會逼人把由來刪掉
    return src.slice(open, end + 1)
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/(^|[^:'"\\])\/\/[^\n]*/g, '$1')
  }

  it('scrollToBottom 的延遲補償有中止條件，不會把上滑中的使用者拉回底部', () => {
    const body = fnBody('scrollToBottom')
    const at = body.indexOf('setTimeout')
    expect(at).toBeGreaterThan(-1)
    // 補償跑的時候要重新確認「現在還該不該捲」——排程當下成立不代表補償跑的時候仍成立。
    // 補償有多段（見下一條），共用同一個 compensate，gate 因此寫在它裡面而不是
    // 每個 setTimeout 的行內；驗的仍是「排出去的每一段都會過 gate」。
    const scheduled = [...body.matchAll(/setTimeout\(\s*([A-Za-z_$][\w$]*)\s*,/g)].map(m => m[1])
    expect(scheduled.length).toBeGreaterThan(0)
    for (const fn of new Set(scheduled)) {
      const callee = new RegExp(`(const|let|var|function)\\s+${fn}\\s*=?[\\s\\S]{0,400}?autoScrollEnabled`)
      expect(body).toMatch(callee)
    }
  })

  it('saveAndStartNew 推完新開場白會捲到底', () => {
    const body = fnBody('saveAndStartNew')
    const afterPush = body.slice(body.indexOf('talkList).push'))
    expect(afterPush).toMatch(/scrollToBottom/)
  })

  it('saveAndStartNew 重置跟隨狀態，否則舊對話的上滑會擋掉新對話的捲底', () => {
    const body = fnBody('saveAndStartNew')
    expect(body).toMatch(/autoScrollEnabled\.value\s*=\s*true/)
  })

  // chatStart 有兩條分支：有歷史走 getHistoryMsg（page 1 已經會重置跟隨並強制捲底），
  // 沒歷史則自己推一則開場白。後者原本推完就結束，一行捲動都沒有——第一次打開一張
  // 角色卡就停在頂端，開場白只露出一角（2026-08-12 使用者回報）。開場白越長越明顯。
  it('chatStart 沒有歷史時推完開場白會捲到底並重置跟隨狀態', () => {
    const body = fnBody('chatStart')
    const afterPush = body.slice(body.indexOf('talkList).push'))
    expect(afterPush).toMatch(/scrollToBottom/)
    expect(afterPush).toMatch(/autoScrollEnabled\.value\s*=\s*true/)
  })

  // 開場白/歷史裡的 HTML 內容卡是非同步撐高的：捲底跑完時 scrollHeight 還是舊值，
  // 捲到的是「當下的底部」，內容長出來之後就不在底部了（實測開一張新角色卡，
  // 2.5 秒後 scrollHeight 才從 556 長到 1240）。
  //
  // 不准用「再多排幾個 setTimeout」解決：mobile 2026-08-09 就是這樣修的，撐了三天，
  // 08-12 又壞——XMLV3 主題卡一則訊息渲染上百個巢狀元件，任何猜出來的延遲都不夠。
  // 問題不在「多久才夠」，在**我們在猜一個不該猜的量**：內容什麼時候撐完只有版面
  // 知道。加長只是換一個猜測值，慢裝置照樣不夠，快裝置白跑 timer 還多一次強制
  // layout，使用者看到的是「到位之後又跳一次」。mobile 已改為事件驅動並把
  // 「不得有計時補償」釘成契約（tests/app-scroll-to-bottom-retry.spec.js），
  // desktop 用同一套，兩端別再分岔。
  describe('非同步撐高改由哨兵驅動，不猜延遲', () => {
    it('訊息列表尾端有哨兵元素', () => {
      // 訊息列容器住在舞台元件裡，哨兵是它的最後一個子節點。
      const stage = readFileSync(resolve(__dirname, '../components/canvas-stage.vue'), 'utf8')
      const listBody = stage.slice(stage.indexOf('class="chat-body"'))
      expect(listBody).toMatch(/id="chat-scroll-anchor"/)
    })

    it('用 IntersectionObserver 觀察哨兵，root 是捲動容器本身', () => {
      expect(src).toMatch(/IntersectionObserver/)
      expect(src).toMatch(/chat-scroll-anchor/)
      // desktop 捲的是 scroll-view 容器,不是整頁——root 必須是那個容器
      expect(src).toMatch(/message-list-area/)
    })

    it('哨兵只在內容撐高時跟隨，使用者上滑不被拉回底部', () => {
      const body = fnBody('setupScrollAnchorObserver')
      // 哨兵離開視窗有兩種原因：內容撐高（總高變大）與使用者上滑（只有 scrollTop 變）。
      // 沒有這個判準，使用者一往上滑就被拉回去，卡成抖動。
      expect(body).toMatch(/scrollTop/)
      expect(body).toMatch(/autoScrollEnabled/)
    })

    it('observer 有生命週期，頁面離開時斷開', () => {
      expect(src).toMatch(/\.disconnect\(\)/)
    })

    it('捲底不靠遞進的計時補償堆延遲', () => {
      const body = fnBody('scrollToBottom')
      const delays = [...body.matchAll(/setTimeout\([\s\S]*?,\s*(\d+)\s*\)/g)].map(m => Number(m[1]))
      // 單一「等本幀版面落定」的短補償可以留;成串遞進的猜測值不行
      expect(delays.filter(d => d > 100)).toHaveLength(0)
    })
  })
})
