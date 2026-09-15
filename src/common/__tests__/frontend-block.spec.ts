/**
 * 前端區塊協議：圍欄裝著整份 HTML 文件 → 標起來 → 定稿後掛成各自的 iframe。
 * 判準與酒館助手一致，作者在那邊怎麼寫、在這邊就怎麼看。
 */
import { describe, it, expect } from 'vitest'
import MarkdownIt from 'markdown-it'
import { isFrontendDocument, tagFrontendBlocks, buildFrontendDocument, rewriteViewportUnits, mountFrontendBlocks, FRONTEND_BLOCK_CLASS } from '../frontend-block'

const md = new MarkdownIt({ html: true })
const DOC = '<!DOCTYPE html>\n<html lang="zh-CN">\n<head><style>body{display:flex}</style></head>\n<body><div class="letter">親愛的</div></body>\n</html>'

describe('判定', () => {
  it('整份文件的骨架任一段就算：html>、<head>、<body', () => {
    expect(isFrontendDocument(DOC)).toBe(true)
    expect(isFrontendDocument('<body class="x">')).toBe(true)
    expect(isFrontendDocument('<div class="panel">HP</div>')).toBe(false)
    expect(isFrontendDocument('const a = 1')).toBe(false)
  })
})

describe('標記', () => {
  it('markdown 畫出來的圍欄若裝著整份文件，<pre> 加上 class；一般程式碼區塊不動', () => {
    const html = md.render('```\n' + DOC + '\n```\n\n```js\nconst a = 1\n```')
    const out = tagFrontendBlocks(html)
    expect(out).toContain(`<pre class="${FRONTEND_BLOCK_CLASS}"><code>&lt;!DOCTYPE html&gt;`)
    expect(out).toContain('<pre><code class="language-js">const a = 1')
  })
  it('標了語言的也算；已經標過的不重複', () => {
    const html = md.render('```html\n' + DOC + '\n```')
    const out = tagFrontendBlocks(html)
    expect(out).toContain(`<pre class="${FRONTEND_BLOCK_CLASS}"><code class="language-html">`)
    expect(tagFrontendBlocks(out)).toBe(out)
  })
  it('沒收尾的圍欄 markdown 也畫成區塊，一樣標', () => {
    const out = tagFrontendBlocks(md.render('```\n' + DOC + '\n正文還在寫'))
    expect(out).toContain(`class="${FRONTEND_BLOCK_CLASS}"`)
  })
})

describe('文件', () => {
  it('作者內容放進 body；有重設樣式、頭像 class、常用函式庫與量高度的腳本', () => {
    const doc = buildFrontendDocument(DOC, { charAvatar: 'https://x/c.png', userAvatar: "https://x/u.png')" })
    expect(doc).toContain('<body>\n' + DOC)
    expect(doc).toContain("html,body{margin:0!important")
    expect(doc).toContain(".char_avatar,.char-avatar{background-image:url('https://x/c.png')}")
    // 頭像網址裡的引號與括號不能把 url() 撐破
    expect(doc).toContain(".user_avatar,.user-avatar{background-image:url('https://x/u.png')}")
    expect(doc).toContain('jquery.min.js')
    expect(doc).toContain('lodash.min.js')
    expect(doc).toContain('frameElement')
  })
  it('min-height 的 vh 改讀外層視口，其餘 vh 不動', () => {
    expect(rewriteViewportUnits('.a{min-height:100vh;height:50vh}')).toBe('.a{min-height:var(--lt-viewport-height, 100vh);height:50vh}')
    expect(rewriteViewportUnits('min-height: 80vh')).toBe('min-height: calc(var(--lt-viewport-height, 100vh) * 0.8)')
  })
})

describe('掛載', () => {
  it('標了的 <pre> 後面接一個 iframe，內容是解碼後的文件；同一個只掛一次', () => {
    const root = document.createElement('div')
    root.innerHTML = tagFrontendBlocks(md.render('```\n' + DOC + '\n```\n\n```js\nx\n```'))
    expect(mountFrontendBlocks(root, { doc: document })).toBe(1)
    const frame = root.querySelector('iframe') as HTMLIFrameElement
    expect(frame).not.toBeNull()
    expect(frame.className).toBe(`${FRONTEND_BLOCK_CLASS}__frame`)
    expect(frame.previousElementSibling?.getAttribute('data-lt-frontend')).toBe('mounted')
    expect(frame.srcdoc).toContain('<div class="letter">親愛的</div>')
    expect(mountFrontendBlocks(root, { doc: document })).toBe(0)
    expect(root.querySelectorAll('iframe').length).toBe(1)
  })
})
