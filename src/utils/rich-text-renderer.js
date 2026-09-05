/**
 * 共用富文字渲染器 (Markdown + HTML)
 *
 * 核心策略：偵測 + 分支
 * - 重 HTML 內容（含 block-level tag 如 div/section/table/ul 等）→ 純 sanitize，不跑 MD
 *   (保護角色卡片這類作者手刻的 HTML 不被 MD parser 誤處理)
 * - 其他內容（純文字 / Markdown / 含 inline HTML 如 br/span）→ markdown-it 渲染 → sanitize
 *
 * 換行規則（markdown-it breaks: true）：
 * - 單個 \n → <br>
 * - 雙個 \n\n → 新段落 <p>
 *
 * Mobile 與 Desktop 共用同一份邏輯（兩邊 copy 同名檔案），保證輸出一致。
 */

import MarkdownIt from 'markdown-it';

let _md = null;
function getMarkdownIt() {
  if (_md) return _md;
  _md = new MarkdownIt({
    html: true,        // 允許作者 inline HTML（之後 sanitize 再擋危險 tag）
    breaks: true,      // 單 \n → <br>
    linkify: true,     // 自動 linkify URL
    typographer: false // 關閉 -- → — 等自動替換，避免驚喜
  });
  return _md;
}

// 偵測重 HTML：包含 block-level / 文件結構 / 媒體 / LunaTalk 自訂元件的 tag
// 這類內容應走純 HTML 路徑，避免 MD parser 誤處理
const HEAVY_HTML_TAGS = /<\s*(div|section|article|header|footer|nav|main|aside|h[1-6]|p|ul|ol|li|dl|dt|dd|table|thead|tbody|tr|td|th|form|fieldset|figure|hr|body|html|pre|blockquote|code|details|summary|audio|video|canvas|iframe)(\s|>|\/)/i;

// LunaTalk 自訂 Web Components（hc-btn / hc-collapse / hc-form / hc-radio 等）
// 這類元件靠作者 HTML 組合邏輯，絕對不能被 MD 誤處理
const CUSTOM_HC_TAGS = /<\s*hc-[a-z]/i;

// 行首縮排 + block-level HTML 開/閉 tag — 用於 dedentHtmlBlockLines pre-pass
// AI 輸出常 pretty-print HTML（tag 前留 4+ 空格），CommonMark 卻把 ≥4 空格的行當 indented code block，
// 造成第二段 <p> 之後被 escape 成 <pre><code>&lt;p&gt;...</code></pre>
const HTML_BLOCK_LEADING_WS = /^[ \t]+(<\/?\s*(div|section|article|header|footer|nav|main|aside|h[1-6]|p|ul|ol|li|dl|dt|dd|table|thead|tbody|tr|td|th|form|fieldset|figure|hr|body|html|pre|blockquote|details|summary|audio|video|canvas|iframe|hc-[a-z][\w-]*)\b)/i;

/**
 * 把「行首是 block-level HTML tag」這種行的縮排砍掉，再交給 markdown-it。
 *
 * 為什麼：CommonMark 規定 HTML block 開頭 tag 必須在 column 0–3，>=4 空格的行會被
 * 當成 indented code block（內容 escape 成 `<pre><code>&lt;p&gt;...</code></pre>`）。
 * AI 角色卡 / 旁白後接的 HTML 段落常被 pretty-print 出 4+ 空格縮排，剛好踩到這條規則。
 *
 * 安全：fenced code block (``` 或 ~~~) 內部不動，避免 code sample 裡示範 HTML 被誤 dedent。
 * 行首是 list marker / blockquote / heading 的不動（它們不會匹配 HTML_BLOCK_LEADING_WS）。
 */
function dedentHtmlBlockLines(content) {
  if (!content) return content;
  // 沒含可能誤判的「縮排 + < block tag」直接快速返回，避免每筆訊息都付 split/join 成本
  if (content.indexOf('<') === -1) return content;
  const lines = content.split('\n');
  let inFence = null; // null | '```' | '~~~'
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.replace(/^[ \t]+/, '');
    if (inFence) {
      if (trimmed.startsWith(inFence)) inFence = null;
      continue;
    }
    if (trimmed.startsWith('```')) { inFence = '```'; continue; }
    if (trimmed.startsWith('~~~')) { inFence = '~~~'; continue; }
    const m = HTML_BLOCK_LEADING_WS.exec(line);
    if (m) lines[i] = m[1] + line.substring(m[0].length);
  }
  return lines.join('\n');
}

// 部分模型習慣把整張 HTML 卡包在 ```html 圍欄裡輸出。
// 整段 trim 後若剛好是「單一個 code fence」（``` 或 ~~~，lang 可為 html/xml/空），
// 且圍欄內文字以 < 開頭並命中既有 HEAVY_HTML_TAGS / CUSTOM_HC_TAGS → 解包，回傳圍欄內文字。
//
// 嚴格限定「整條訊息 = 單一圍欄，前後無其他有意義文字」（^...$ 錨定整段 trim 後內容）：
//   - 散文中夾示範 fence（前後還有其他文字）→ 不解包，維持既有「MD 路徑 tag 被 escape」保護
//     （這是三個月前為了解決 nested fence 誤判為 heavy 引入的 heuristic，不能退回）
//   - 圍欄 lang 非 html/xml（如 ```js）→ 不解包，維持 MD 路徑（示範代碼原樣顯示給用戶看）
//
// 已知取捨：用戶真心想看 HTML 原始碼的極少數場景（整段訊息剛好只有一個 html/xml 圍欄）
// 會被當作角色卡渲染——角色扮演產品渲染優先於原始碼可見性，此為 director 裁決。
const SINGLE_FENCE_RE = /^(`{3,}|~{3,})[ \t]*([a-zA-Z0-9_-]*)[ \t]*\r?\n([\s\S]*?)\r?\n[ \t]*\1[ \t]*$/;
const FENCE_HTML_LANGS = { '': true, html: true, xml: true };

function unwrapSingleHtmlFence(content) {
  if (!content) return content;
  const trimmed = content.trim();
  const first = trimmed.charAt(0);
  if (first !== '`' && first !== '~') return content;
  const m = SINGLE_FENCE_RE.exec(trimmed);
  if (!m) return content;
  const lang = (m[2] || '').toLowerCase();
  if (!FENCE_HTML_LANGS[lang]) return content;
  const inner = m[3];
  const innerTrimmed = inner.replace(/^[\s\n]+/, '');
  if (!innerTrimmed.startsWith('<')) return content;
  const head = innerTrimmed.substring(0, 200);
  if (!(HEAVY_HTML_TAGS.test(head) || CUSTOM_HC_TAGS.test(head))) return content;
  return inner;
}

function isHeavyHtml(content) {
  if (!content) return false;
  // Heuristic：content 必須以 HTML tag 開頭才算 heavy（允許前置少量 whitespace）。
  //   - 作者手寫卡片：典型 `<div ...>` / `<hc-xxx ...>` 開頭 → heavy ✓
  //   - AI 輸出 markdown 含 code block（裡面有 `<hc-xxx>` 文字示範）：中文/文字開頭 → MD 路徑 ✓
  //   - 罕見 case：作者在 HTML 前加說明文字 → 走 MD 路徑（tag 會被 escape）。
  //     作者只要把 HTML 放第一行即可。
  //   - 整段訊息剛好是單一個 html/xml 圍欄包住 HTML 卡 → unwrapSingleHtmlFence 先解包再判斷。
  const unwrapped = unwrapSingleHtmlFence(content);
  const trimmed = unwrapped.replace(/^[\s\n]+/, '');
  if (!trimmed.startsWith('<')) return false;
  const head = trimmed.substring(0, 200);
  if (HEAVY_HTML_TAGS.test(head)) return true;
  if (CUSTOM_HC_TAGS.test(head)) return true;
  return false;
}

/**
 * Task list 後處理：markdown-it 預設不支援 GFM task list，
 * 這個函數把 `<li>[ ] xxx</li>` / `<li>[x] xxx</li>` 轉為 checkbox。
 */
function renderTaskLists(html) {
  if (!html) return html;
  return html
    .replace(/<li>\[\s\]\s*/g, '<li class="task-list-item"><input type="checkbox" disabled> ')
    .replace(/<li>\[x\]\s*/gi, '<li class="task-list-item"><input type="checkbox" disabled checked> ');
}

/**
 * 連結白名單：只允許跳轉至 lunatalk.pro / lunatalk.ai 及其子網域。
 * 非白名單連結 → 保留文字但移除 href，加 title 提示已阻擋。
 * 內部錨點 (#xxx) / 相對路徑 (/xxx) 一律允許。
 * 只處理 <a href>，圖片/影片/iframe 的 src 完全不碰。
 */
const LINK_ALLOW_HOST = /^(https?:)?\/\/([a-z0-9-]+\.)*(lunatalk\.pro|lunatalk\.ai)(\/|$|\?|#|:)/i;

function sanitizeLinks(html) {
  if (!html) return html;
  return html.replace(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi, function (match, attrs, inner) {
    const hrefM = attrs.match(/href\s*=\s*["']?([^"'\s>]+)/i);
    if (!hrefM) return match;
    const href = hrefM[1];
    if (href.indexOf('#') === 0) return match;
    if (href.indexOf('/') === 0 && href.indexOf('//') !== 0) return match;
    if (LINK_ALLOW_HOST.test(href)) return match;
    const safe = href.replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    return `<span class="link-blocked" title="外部連結已阻擋：${safe}">${inner}</span>`;
  });
}

/**
 * 剝除可能影響全頁結構的 tag（跟 chat.vue 舊版 highlightText 完全一致）
 *
 * 重要設計決策：**不剝** <script> / <style> / inline event handler (onclick 等)。
 *   - AI 生成的互動卡片依賴這些做互動（chat.vue 後處理會把 <script> 撈去
 *     document.head 執行、<style> 注入 CSS）
 *   - 信任模型：AI 輸出被 prompt 約束，已視為可信來源
 *   - 只剝會把頁面弄壞的 document-level tag
 *
 * 另外：非白名單連結的 href 會被拆除（sanitizeLinks），避免 AI/作者輸出跳轉到外部站。
 */
function sanitizeHtml(html) {
  if (!html) return '';
  const out = html
    .replace(/<!DOCTYPE[^>]*>/gi, '')
    .replace(/<html[^>]*>/gi, '')
    .replace(/<\/html>/gi, '')
    // 完整 head 區塊（連內容一起）
    .replace(/<head[^>]*>[\s\S]*?<\/head>/gi, '')
    // 殘缺 head tag（流式生成可能只有開始或結束）
    .replace(/<head[^>]*>/gi, '')
    .replace(/<\/head>/gi, '')
    // body 退化為 div，避免影響頁面結構
    .replace(/<body[^>]*>/gi, '<div>')
    .replace(/<\/body>/gi, '</div>')
    // meta（charset/viewport 等影響全頁）
    .replace(/<meta[^>]*>/gi, '')
    // title（會搶瀏覽器 tab 標題）
    .replace(/<title[^>]*>[\s\S]*?<\/title>/gi, '')
    .replace(/<title[^>]*>/gi, '')
    .replace(/<\/title>/gi, '');
  return sanitizeLinks(out);
}

/**
 * 主要渲染 API。
 *
 * @param {string} content 原始內容
 * @returns {string} HTML 字串（適合 v-html）
 *
 * 使用範例：
 *   <view v-html="renderRichText(role.roleWelcome)" class="rich-text"></view>
 *
 * 配套 CSS 建議（讓段落間距合理）：
 *   .rich-text p { margin: 0 0 0.75em 0; }
 *   .rich-text p:last-child { margin-bottom: 0; }
 *   .rich-text img { max-width: 100%; height: auto; }
 */
function renderRichText(content) {
  if (!content) return '';
  // 重 HTML：不跑 MD，純 sanitize（若整段是圍欄包住的 HTML 卡，先解包再 sanitize）
  // 工單 #65：此 heavy-branch 邏輯（unwrap → isHeavyHtml → sanitize）與
  // chat.vue 的 highlightText heavy 分支存在重複實作，改動須同步（#24 當時
  // 只改了這裡，chat.vue 的 highlightText 漏同步，回歸見 #65）。
  if (isHeavyHtml(content)) {
    return sanitizeHtml(unwrapSingleHtmlFence(content));
  }
  // 輕量 / 純文字 / MD：跑 MD 後再 sanitize
  const md = getMarkdownIt();
  let rendered;
  try {
    rendered = md.render(dedentHtmlBlockLines(content));
  } catch (e) {
    // MD parse 失敗 fallback：原樣 sanitize
    rendered = content;
  }
  // trim 末尾空白：MD render 預設會加 \n，配 pre-wrap 會顯示成空行
  return sanitizeHtml(renderTaskLists(rendered)).trim();
}

/**
 * ============================================================
 * Memoized renderRichText · 解寫卡 Agent 對話流式重渲染重複解析
 * ============================================================
 * renderRichText 本身無快取：每次呼叫都重新跑 markdown-it / sanitize。
 * 寫卡 Agent 對話頁在流式時每個 SSE delta 都觸發整列 re-render，每條歷史
 * agent 訊息都會重新 renderRichText 同一段不變的內容 → 大量無謂重解析。
 *
 * renderRichTextCached 按「內容字串」memoize 已渲染的 HTML，配上限 LRU
 * (最近使用排到尾端，超量丟最舊的)，避免長對話無限增長。內容不變 → O(1)
 * 取快取，內容變(尾端正在生成那條)才真正解析。純函式語義不變(輸入相同
 * 輸出相同)，與 renderRichText 完全等價，只是省掉重複解析。
 */
const RICH_CACHE_LIMIT = 200;
const _richCache = new Map();

function renderRichTextCached(content) {
  const key = content || '';
  if (!key) return '';
  const hit = _richCache.get(key);
  if (hit !== undefined) {
    // LRU：命中後移到尾端(最近使用)
    _richCache.delete(key);
    _richCache.set(key, hit);
    return hit;
  }
  const html = renderRichText(key);
  _richCache.set(key, html);
  if (_richCache.size > RICH_CACHE_LIMIT) {
    // 丟最舊(Map 迭代序 = 插入序，第一個即最久未用)
    const oldest = _richCache.keys().next().value;
    _richCache.delete(oldest);
  }
  return html;
}

function clearRichCache() {
  _richCache.clear();
}

export {
  renderRichText,
  renderRichTextCached,
  clearRichCache,
  isHeavyHtml,
  unwrapSingleHtmlFence,
  sanitizeHtml,
  sanitizeLinks,
  renderTaskLists,
  getMarkdownIt,
  dedentHtmlBlockLines,
  findStableBoundary,
  getStreamCacheEntry,
  setStreamCacheEntry,
  clearStreamCache
};

/**
 * ============================================================
 * Streaming render cache · 解 chat bubble streaming O(N²) 卡頓
 * ============================================================
 * (mobile/src/utils/rich-text-renderer.js mirror · 細節見 mobile 註解)
 */

const _streamCache = Object.create(null);

function findStableBoundary(content, hasCrossLineRules) {
  if (!content || content.length < 200) return 0;
  // 顯示層替換規則若可能跨行，切段後「前綴各自套規則」與「整段套規則」結果會不同，
  // 而前綴一旦進快取就不再重算——等於把錯誤產物永久留住。跟下面那幾條跨段語意的
  // bail-out 同一類處置：放棄快取，走完整解析。
  if (hasCrossLineRules) return 0;
  // Markdown 跨段語意 / shield-pass 跨段失效 → 一律放棄 cache 走 full parse:
  //   a. Reference-style link defs `[ref]: url`
  //   b. <script>/<style>/<code>/<pre> raw-text 元素
  //   c. inline event handler (onclick 等) — attribute value 內 < > shield 跨段會錯位
  if (/(^|\n)\[[^\]\n]+\]:\s/.test(content)) return 0;
  if (/<\/?(script|style|pre|code)\b/i.test(content)) return 0;
  if (/\bon(click|change|input|load|submit|focus|blur|mouseenter|mouseleave)\s*=/i.test(content)) return 0;
  if (/<\s*\/?(div|section|article|header|footer|nav|main|aside|h[1-6]|table|thead|tbody|tr|td|th|form|fieldset|figure|hr|body|html|details|summary|audio|video|canvas|iframe|blockquote|address|dl|dt|dd)\b/i.test(content)) return 0;
  if (content.indexOf('<!--') !== -1) return 0;
  if (content.indexOf('```') !== -1) return 0;
  let safe = content;
  const fenceCount = (safe.match(/```/g) || []).length;
  if (fenceCount % 2 !== 0) {
    const lastFence = safe.lastIndexOf('```');
    safe = lastFence > 0 ? safe.substring(0, lastFence) : '';
    if (!safe) return 0;
  }
  const lastLt = safe.lastIndexOf('<');
  const lastGt = safe.lastIndexOf('>');
  if (lastLt > lastGt) {
    safe = safe.substring(0, lastLt);
  }
  const isBlockStart = function (line) {
    return /^([-*+]\s|\d+\.\s|>\s|#{1,6}\s|\|)/.test(line);
  };
  let cursor = safe.length;
  while (cursor > 0) {
    const pos = safe.lastIndexOf('\n\n', cursor - 1);
    if (pos < 0) return 0;
    const prevLineStart = safe.lastIndexOf('\n', pos - 1) + 1;
    const prevLine = safe.substring(prevLineStart, pos).trim();
    const afterStart = pos + 2;
    const afterLineEndRel = safe.indexOf('\n', afterStart);
    const afterLineEnd = afterLineEndRel < 0 ? safe.length : afterLineEndRel;
    const afterLine = safe.substring(afterStart, afterLineEnd).trim();
    if (isBlockStart(prevLine) || isBlockStart(afterLine)) {
      cursor = pos;
      continue;
    }
    return pos + 2;
  }
  return 0;
}

function getStreamCacheEntry(key) {
  return _streamCache[key];
}

function setStreamCacheEntry(key, boundary, html) {
  _streamCache[key] = { boundary: boundary, html: html };
}

function clearStreamCache(key) {
  if (key == null) {
    for (const k in _streamCache) delete _streamCache[k];
  } else {
    delete _streamCache[key];
  }
}

export default renderRichText;
