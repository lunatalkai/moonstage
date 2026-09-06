/**
 * MMD 平台自己對 AI 訊息做的兩件事，卡片規則之外的「預設」（owner 2026-09-06：
 * 「我懷疑這個是它有預設的注入」——對，在它 chat-sandbox 的 removeAiPrompt／removeSpan，
 * 用它頁面上的實例跑過樣本確認）。順序照原站：先清提示詞標籤 → 卡片正則 → 剝掉不認得的標籤。
 *
 * 1. removePromptTags：整段連內容一起拿掉的標籤（thinking／think／Q／REALIEZ／WF／tucao／
 *    review／thought／mission_statement）、HTML 註解、[new-user-speak]、「<结束无效提示>」
 *    這種殘留；先把 &lt;thinking&gt; 這類被轉義的寫法還原再清。
 * 2. stripUnknownTags：只留白名單裡的標籤，其餘（含 <思维链>、<status> 這類中文或自訂
 *    標籤）拿掉標籤本身、內文照留。所以原站上「思維鏈」那段文字一樣看得到，只是沒有
 *    字面的 <思维链>。svg 整段保護（內部 <path>/<g> 不在白名單），style／script 本體也保護
 *    （原站沒保護，但腳本裡的 `a<b` 之類被咬掉只會壞不會好）。
 *
 * 另外 wrapDialogue：MMD 把引號裡的對白包成 <font color="#DC8333">，作者的美化靠這個
 * 上色。只能對純文字節點做——先前排在括號斜體之後，把 <span style="…"> 的屬性值當
 * 對白包了，畫面上就冒出 `"color: #C4B4A3;…">` 這種字（owner 2026-09-06 截圖）。
 */

const PROMPT_TAG_NAMES = ['thinking', 'think', 'Q', 'REALIEZ', 'WF', 'tucao', 'review', 'thought', 'mission_statement']

const ESCAPED_PROMPT_TAG_RE = new RegExp('&lt;(\\/?\\s*(?:' + PROMPT_TAG_NAMES.join('|') + ')[^<]*?)&gt;', 'gi')

const PROMPT_BLOCK_RES: RegExp[] = [
  /\[new-user-speak\][\s\S]*?\[\/new-user-speak\]/gi,
  /<mission_statement>[\s\S]*?<\/mission_statement>/gi,
  /<\s*thinking[\s\S]*?>[\s\S]*?<\s*\/\s*thinking\s*>/gi,
  /<\s*think[\s\S]*?>[\s\S]*?<\s*\/\s*think\s*>/gi,
  /<Q>[\s\S]*?<\/Q>/gi,
  /<REALIEZ>[\s\S]*?<\/REALIEZ>/gi,
  /<WF>[\s\S]*?<\/WF>/gi,
  /<tucao>[\s\S]*?<\/tucao>/gi,
  /<review>[\s\S]*?<\/review>/gi,
  /<thought>[\s\S]*?<\/thought>/gi,
]

const PROMPT_LITERALS = [
  '*Warning: Claude Opus is significantly more expensive than Claude Sonnet. We recommend using Sonnet for most tasks.*',
  '<结束无效提示>',
  '</结束无效提示>',
  '<Format：|>',
  '<Format: |>',
  '<Format:|>',
]

export function removePromptTags(content: string): string {
  if (!content) return content
  let out = content
  for (const lit of PROMPT_LITERALS) out = out.split(lit).join('')
  out = out.replace(ESCAPED_PROMPT_TAG_RE, '<$1>')
  out = out.replace(/<!--[\s\S]*?-->/g, '')
  for (const re of PROMPT_BLOCK_RES) out = out.replace(re, '')
  return out
}

/** 原站 removeSpan 的白名單，一字不差。 */
export const MMD_ALLOWED_TAGS = new Set([
  'p', 'b', 'a', 'div', 'span', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'ul', 'li', 'ol', 'strong', 'em', 'br',
  'img', 'pre', 'font', 'style', 'script', 'i', 'button', 'table', 'th', 'tr', 'td', 'input', 'textarea',
  'label', 'select', 'option', 'video',
  'user', 'summary', 'details',
])

const PROTECTED_BLOCK_RE = /<svg[\s\S]*?<\/svg>|<style(?:\s[^>]*)?>[\s\S]*?<\/style>|<script(?:\s[^>]*)?>[\s\S]*?<\/script>/gi

export function stripUnknownTags(html: string): string {
  if (!html) return html
  const stash: string[] = []
  let out = html.replace(PROTECTED_BLOCK_RE, (m) => {
    stash.push(m)
    return '\x07' + (stash.length - 1) + '\x08'
  })
  out = out.replace(/<\/?([一-龥a-zA-Z0-9_]+)(\s+[^>]*)?>/g, (m, name) => (MMD_ALLOWED_TAGS.has(name) ? m : ''))
  out = out.replace(/<\/?(html|head|body)(\s+[^>]*)?>/gi, '')
  out = out.replace(/\x07(\d+)\x08/g, (_m, idx) => stash[Number(idx)])
  return out
}

export const MMD_DIALOGUE_COLOR = '#DC8333'

/**
 * 只能餵純文字節點的內容：屬性裡的引號會被當成對白。
 * 半形引號到這裡已經被 markdown 轉成 &quot;（原站的對白多半就是半形引號），所以三種都認：
 * 半形、全形彎引號、&quot;。內文用 tempered 寫法擋住 &quot;，免得兩句對白被連成一句。
 */
export function wrapDialogue(text: string): string {
  if (!text) return text
  return text.replace(
    /((?:"|“|&quot;)(?:(?!&quot;)[^"“”\n<>]){1,400}(?:"|”|&quot;))/g,
    '<font color="' + MMD_DIALOGUE_COLOR + '">$1</font>',
  )
}
