import fs from 'node:fs'
import path from 'node:path'
import vm from 'node:vm'
import { describe, expect, it } from 'vitest'
import {
  isHeavyHtml,
  sanitizeHtml,
  getMarkdownIt,
  renderTaskLists,
  dedentHtmlBlockLines,
  findStableBoundary,
  getStreamCacheEntry,
  setStreamCacheEntry,
  unwrapSingleHtmlFence,
} from '../../../utils/rich-text-renderer.js'
// highlightText 現在直接呼叫這兩支（非標準標籤剝除與對白上色）；這些測試驗的是別的管線行為，
// 綁真實函式、來源給 tavern，等價於「沒有 MMD 預設」的路徑，跟改動前一樣。
import { stripUnknownTags, wrapDialogue } from '../canvas-platform-defaults'

// MMD 匯入卡常用 <span style="display:none"> 包一段
// 換行分隔的機讀資料（例：<zzhud-data>／<zzroles-data>），卡片自己的 script 之後讀
// 這個 span 的 textContent 去解析欄位。這段資料在酒館規則展開時就已經是最終字串
// （$1 捕獲組直接帶著原始換行），不需要也不應該被畫布自己的 markdown 排版動到。
//
// 根因（2026-09-04 owner 回報 一張 MMD 匯入卡 卡「漏渲染 HUD／狀態欄示例」追查得出）：
// AI 回覆通常敘事文字在前、HTML 卡在後，訊息不是以 `<` 開頭 → isHeavyHtml 判定
// 為非 heavy，走 markdown-it 分支；markdown-it 開 breaks:true（單 \n → <br>），
// 對整段字串一視同仁地套用，連 display:none 的機讀資料 span 內部也被轉了。
// <br> 元素的 textContent 貢獻是空字串，於是卡片腳本事後讀到的資料變成整段
// 欄位無分隔字元地黏在一起（例："[角色1]名字=X身份=Y..."，而不是三行分開）。
// 卡片自己的欄位解析器（要求「區段標記換行後才是欄位」）因此把整批資料判定失敗，
// 回傳空白 → 依賴這份資料渲染的面板（如「學生檔案終端」）整塊不出現。
//
// 這不是特定卡片的問題：任何 MMD／酒館規則卡只要用「display:none 隱藏 span +
// 換行分隔鍵值」這個通用手法回傳機讀資料，遇到訊息非 heavy-HTML 開頭就會中招。
// 修法在畫布渲染管線本身（highlightText），不改卡片。

const root = process.cwd()
const CHAT_VUE_PATH = path.join(root, 'src/pages/canvas/canvas.vue')

function extractHighlightTextSource(): string {
  const source = fs.readFileSync(CHAT_VUE_PATH, 'utf8')
  const anchor = 'const highlightText = (content, type, cacheKey) => {'
  const startIdx = source.indexOf(anchor)
  if (startIdx === -1) {
    throw new Error('highlightText 錨點找不到 — chat.vue heavy 分支結構已變，需同步更新本測試')
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
    throw new Error('highlightText 函式本體括號未配對 — 抽取失敗')
  }
  return source.slice(startIdx, i)
}

function buildHighlightText(): (content: string, type?: number, cacheKey?: string | null) => string {
  const fnSource = extractHighlightTextSource()
  const wrapped = `(function () {\n${fnSource}\nreturn highlightText;\n})()`
  const context = vm.createContext({
    isHeavyHtml,
    sanitizeHtml,
    getMarkdownIt,
    renderTaskLists,
    dedentHtmlBlockLines,
    findStableBoundary,
    getStreamCacheEntry,
    setStreamCacheEntry,
    unwrapSingleHtmlFence,
    stripUnknownTags, wrapDialogue,
    cardSource: { value: 'tavern' },
    // 顯示字形轉換在這些測試裡是恆等：它們驗的是管線結構，不是簡繁。
    convertVisibleHtml: (html: string) => html,
    displayScript: (text: string) => text,
    applyDisplayRules: (text: string) => ({ html: text, rollbacks: [] }),
    activeAuthorAsset: { value: { rules: [], version: 0, crossLine: false } },
    console,
  })
  const script = new vm.Script(wrapped, { filename: 'chat-vue-highlightText-hidden-data-extract.js' })
  return script.runInContext(context)
}

describe('畫布渲染管線：display:none 機讀資料 span 不得被 markdown 換行轉換污染', () => {
  it('敘事文字在前（非 heavy 路徑）時，隱藏資料 span 內的多行鍵值原樣保留，不被轉成 <br>', () => {
    const highlightText = buildHighlightText()
    const rawFields = '[角色1]\n名字=測試名字\n身份=測試身份'
    const content =
      '終端啟動。系統顯示一行提示，敘事文字在前。\n\n' +
      '<span class="zzroles-source" style="display: none"><span class="zzroles-data" style="display:none">' +
      rawFields +
      '</span><img src="x" style="display:none"></span>\n\n' +
      '後續敘事文字。'

    const html = highlightText(content, 0, null)

    const container = document.createElement('div')
    container.innerHTML = html
    const dataSpan = container.querySelector('.zzroles-data')

    expect(dataSpan).not.toBeNull()
    // 根因斷言：卡片腳本讀的是 textContent。若管線把 \n 轉成了 <br>，
    // <br> 對 textContent 的貢獻是空字串，這裡就會變成無分隔的黏合字串。
    expect(dataSpan!.textContent).toBe(rawFields)
    expect(dataSpan!.querySelectorAll('br').length).toBe(0)
  })

  it('訊息本身即以 HTML 開頭（heavy 路徑）時，隱藏資料 span 同樣不受換行轉換影響', () => {
    const highlightText = buildHighlightText()
    const rawFields = '[角色1]\n名字=測試名字\n身份=測試身份'
    const content =
      '<div class="card"><span class="zzroles-source" style="display: none">' +
      '<span class="zzroles-data" style="display:none">' +
      rawFields +
      '</span><img src="x" style="display:none"></span>敘事內容在後。</div>'

    const html = highlightText(content, 0, null)

    const container = document.createElement('div')
    container.innerHTML = html
    const dataSpan = container.querySelector('.zzroles-data')

    expect(dataSpan).not.toBeNull()
    expect(dataSpan!.textContent).toBe(rawFields)
    expect(dataSpan!.querySelectorAll('br').length).toBe(0)
  })

  it('display:none 的 <img> 是空元素（無 </img>）：不誤判成需要找配對結束標籤、不吞掉後續內容', () => {
    // 有些卡把觸發 img 直接裸放，不像 zzroles/zzhud 那樣包一層 <span style="display:none">。
    // <img> 是 void element，永遠沒有 </img>。若掃描器把它當一般 tag 找同名配對結束標籤，
    // 會一路找到字串結尾（找不到），把 img 之後「整則訊息剩下的內容」都當成隱藏資料 stash
    // 掉——那段內容此後就不會被 markdown/斜體裝飾處理到。
    const highlightText = buildHighlightText()
    const content =
      '敘事文字在前。\n\n' +
      '<img src="x" style="display:none">\n\n' +
      '**粗體後續**應該正常渲染。'

    const html = highlightText(content, 0, null)

    const container = document.createElement('div')
    container.innerHTML = html
    expect(container.querySelector('strong')).not.toBeNull()
    expect(html).toContain('粗體後續')
  })
})
