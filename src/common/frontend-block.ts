/**
 * 前端區塊協議：訊息裡的程式碼圍欄若裝著一整份 HTML 文件，就把它當成一個獨立的前端介面畫出來，
 * 而不是印成原始碼。
 *
 * 這是酒館生態的既定慣例（酒館助手的渲染器）：作者把狀態欄、信紙、面板整份 HTML 用 ``` 包起來，
 * 讀者端把每個這樣的區塊放進各自的 iframe 執行。iframe 有自己的 body，所以作者才能放心寫
 * `body{display:flex}`、`position:fixed`——那些只影響那個區塊自己的視窗。我們兩個聊天頁都照做，
 * 卡在兩邊才長得一樣。
 *
 * 三段，各自純粹：
 *   - isFrontendDocument：判定（跟酒館助手同一個判準：出現 `html>`、`<head>` 或 `<body`）。
 *   - tagFrontendBlocks：markdown 畫完之後，把命中的 <pre> 標上 class（字串處理，兩個聊天頁的管線都能用）。
 *   - mountFrontendBlocks：訊息定稿後，替標上的 <pre> 掛 iframe（DOM 處理，殼與舊頁各自在定稿點呼叫）。
 * 串流中不掛：內容每秒變幾十次，掛了又拆只會閃；定稿前那個區塊以佔位框呈現（樣式在 canvas.css／shell.css）。
 */

/** 酒館助手認「前端」的判準：程式碼區塊的文字裡有整份文件的骨架。 */
export function isFrontendDocument(text: string): boolean {
  const s = String(text == null ? '' : text)
  return s.indexOf('html>') >= 0 || s.indexOf('<head>') >= 0 || s.indexOf('<body') >= 0
}

export const FRONTEND_BLOCK_CLASS = 'lt-frontend'
const MOUNTED_ATTR = 'data-lt-frontend'

const PRE_CODE_RE = /<pre(\s[^>]*)?>(<code(?:\s[^>]*)?>)([\s\S]*?)<\/code><\/pre>/g

function decodeEntities(s: string): string {
  return s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&')
}

/** markdown 畫完的 HTML：命中的 <pre> 加上 class，內容不動。 */
export function tagFrontendBlocks(html: string): string {
  const text = String(html == null ? '' : html)
  if (text.indexOf('<pre') < 0) return text
  return text.replace(PRE_CODE_RE, (whole, attrs: string, codeOpen: string, body: string) => {
    if (!isFrontendDocument(decodeEntities(body))) return whole
    const a = attrs || ''
    if (/\bclass\s*=/.test(a)) {
      if (a.indexOf(FRONTEND_BLOCK_CLASS) >= 0) return whole
      return `<pre${a.replace(/\bclass\s*=\s*(["'])/, (m) => `${m}${FRONTEND_BLOCK_CLASS} `)}>${codeOpen}${body}</code></pre>`
    }
    return `<pre class="${FRONTEND_BLOCK_CLASS}"${a}>${codeOpen}${body}</code></pre>`
  })
}

export interface FrontendBlockOptions {
  /** 角色與玩家頭像：作者常用 .char_avatar／.user_avatar 這兩個 class 放頭像。 */
  charAvatar?: string
  userAvatar?: string
  doc?: Document
}

/** 各區塊 iframe 裡預先載好的東西：酒館作者習慣直接用 $、_ 與 Font Awesome。要加減就改這一份。 */
const FRONTEND_LIBS = [
  '<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@fortawesome/fontawesome-free/css/all.min.css">',
  '<script src="https://cdn.jsdelivr.net/npm/jquery/dist/jquery.min.js"></script>',
  '<script src="https://cdn.jsdelivr.net/npm/jquery-ui/dist/jquery-ui.min.js"></script>',
  '<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/jquery-ui/themes/base/theme.min.css">',
  '<script src="https://cdn.jsdelivr.net/npm/lodash/lodash.min.js"></script>',
  '<script src="https://cdn.jsdelivr.net/npm/vue/dist/vue.runtime.global.prod.min.js"></script>',
].join('\n')

/**
 * 區塊自己量高度回報給外面的 iframe 元素；同源（srcdoc 繼承外層的源）所以直接寫 frameElement。
 * 視口高度給作者當變數：iframe 裡的 100vh 是 iframe 自己的高，而 iframe 的高又是內容量出來的，
 * 作者寫 min-height:100vh 會互相追著長；下面 rewriteViewportUnits 把它換成這個變數。
 */
const FIT_SCRIPT = `<script>(function(){var fe=window.frameElement;if(!fe)return;var pw=window.parent;function vp(){try{document.documentElement.style.setProperty('--lt-viewport-height',pw.innerHeight+'px')}catch(e){}}function fit(){var b=document.body;var h=b?b.scrollHeight:0;if(h>0)fe.style.height=h+'px'}vp();try{pw.addEventListener('resize',vp)}catch(e){}window.addEventListener('DOMContentLoaded',function(){fit();if(window.ResizeObserver){new ResizeObserver(fit).observe(document.documentElement)}});window.addEventListener('load',fit);})();</script>`

/** 作者寫的 `min-height: NNvh` 改讀外層視口（見 FIT_SCRIPT）。只動 min-height，其餘 vh 是作者自己的事。 */
export function rewriteViewportUnits(code: string): string {
  return code.replace(/(min-height\s*:\s*)(\d+(?:\.\d+)?)vh\b/gi, (_m, prefix: string, n: string) => {
    const v = parseFloat(n)
    if (!isFinite(v)) return _m
    return `${prefix}${v === 100 ? 'var(--lt-viewport-height, 100vh)' : `calc(var(--lt-viewport-height, 100vh) * ${v / 100})`}`
  })
}

function cssUrl(u: string | undefined): string {
  return String(u || '').replace(/["'\\)]/g, '')
}

/** 一個區塊的完整文件：作者的內容原樣放進 body；作者自己的 <html>/<head>/<body> 標籤瀏覽器會併掉。 */
export function buildFrontendDocument(code: string, opts: FrontendBlockOptions = {}): string {
  const reset = `<style>*,*::before,*::after{box-sizing:border-box}html,body{margin:0!important;padding:0;overflow:hidden!important;max-width:100%!important}.user_avatar,.user-avatar{background-image:url('${cssUrl(opts.userAvatar)}')}.char_avatar,.char-avatar{background-image:url('${cssUrl(opts.charAvatar)}')}</style>`
  return `<!DOCTYPE html>\n<html>\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1.0">\n${reset}\n${FRONTEND_LIBS}\n${FIT_SCRIPT}\n</head>\n<body>\n${rewriteViewportUnits(String(code == null ? '' : code))}\n</body>\n</html>\n`
}

/** 替 root 底下還沒掛的前端區塊掛上 iframe；回傳掛了幾個。同一個 <pre> 只掛一次。 */
export function mountFrontendBlocks(root: ParentNode, opts: FrontendBlockOptions = {}): number {
  const doc = opts.doc || (root as Node).ownerDocument || document
  let count = 0
  for (const pre of Array.from(root.querySelectorAll(`pre.${FRONTEND_BLOCK_CLASS}:not([${MOUNTED_ATTR}])`))) {
    pre.setAttribute(MOUNTED_ATTR, 'mounted')
    const code = pre.querySelector('code')
    const text = (code || pre).textContent || ''
    const frame = doc.createElement('iframe')
    frame.className = `${FRONTEND_BLOCK_CLASS}__frame`
    frame.setAttribute('frameborder', '0')
    frame.setAttribute('title', 'frontend')
    frame.srcdoc = buildFrontendDocument(text, opts)
    pre.insertAdjacentElement('afterend', frame)
    count++
  }
  return count
}
