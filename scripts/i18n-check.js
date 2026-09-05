#!/usr/bin/env node
/**
 * i18n 覆蓋度校驗（desktop / vue-i18n）
 *
 * 純 Node 腳本，無新依賴。讀取 desktop/src/locale 下的語言 JSON，
 * 以「5 語言 key 並集（union）」為參照，對每個語言檢查：
 *   - missing：並集裡有、該語言沒有的 key（含基準語言自身的盲區）
 *   - empty：value 為空字串的 key（白名單內的允許空值不計）
 *   - duplicate：同一扁平 key 在同一檔案出現 > 1 次（vue-i18n 取最後出現值，前面的悄悄被覆蓋）
 *   - valueEqKey：value 全等於 key path（疑似沒翻譯）
 *   - suspectUntranslated：非英文目標語言中 value 與英文（en.json）完全相同（疑似假翻譯，僅警告）
 *
 * 並集邏輯：任一語言出現的 key，所有語言都必須有，否則報 missing。
 * 這根治了「單一基準語言自身缺 key 檢測不到」的盲區。
 *
 * 重複偵測：JSON.parse 會悄悄把重複 key 收斂成最後一份，盲區無法用解析後物件偵測，
 * 故另以「原始文字串流解析」統計每個扁平 key 的出現次數，> 1 即報 duplicate。
 *
 * 退出碼：有 missing 或 empty（白名單外）或 duplicate → exit 1；只有 suspect → exit 0 但印警告。
 *
 * 使用：node scripts/i18n-check.js
 */

const fs = require('fs');
const path = require('path');

const LOCALE_DIR = path.resolve(__dirname, '..', 'src', 'locale');
const SRC_DIR = path.resolve(__dirname, '..', 'src');

// 代碼引用檢測：忽略的檔案（已廢棄 / 未路由，其 $t/t 引用不計入缺失；
// .spec 測試檔內的 t("a.b") 是測試 fixture，非真實引用）
const CODE_REF_IGNORE = [/main1\.vue$/, /chat1\.vue$/, /\.spec\.(ts|js)$/];

// 語言 key → 實際檔名（desktop 不帶前綴）
const LOCALE_FILES = {
  en: 'en.json',
  'zh-Hans': 'zh-Hans.json',
  'zh-Hant': 'zh-Hant.json',
  ja: 'ja.json',
  ko: 'ko.json',
};

// 基準語言：zh-Hant 覆蓋最全（並集模式下僅用於 suspect 比對基準與報表標示）
const BASE_LOCALE = 'zh-Hant';
// 假翻譯比對所用的英文參照
const ENGLISH_LOCALE = 'en';
// 與英文做「假翻譯」比對的非英文目標語言（不含英文自己）
const NON_ENGLISH = ['zh-Hans', 'zh-Hant', 'ja', 'ko'];

/**
 * 允許為空的 key 白名單：{ localeKey: Set<flatKey> }。
 * 這些 key 在對應語言「刻意留空」，不計為 empty 失敗。
 * desktop 目前沒有刻意留空的 key；保留機制以便日後需要時加入，
 * 並與 mobile 端的校驗能力對齊。
 */
const EMPTY_ALLOWLIST = {
  // 例：en: new Set(['some.prefixUnit']),
};

function isEmptyAllowed(localeKey, key) {
  const set = EMPTY_ALLOWLIST[localeKey];
  return !!set && set.has(key);
}

/**
 * 把巢狀物件扁平化成 { 'a.b.c': value }。
 * 陣列以索引展開（a.0.b）。只收集葉節點。
 */
function flatten(obj, prefix = '', out = {}) {
  if (obj === null || typeof obj !== 'object') {
    out[prefix] = obj;
    return out;
  }
  const keys = Array.isArray(obj) ? obj.map((_, i) => String(i)) : Object.keys(obj);
  for (const k of keys) {
    const next = prefix ? `${prefix}.${k}` : k;
    const v = obj[k];
    if (v !== null && typeof v === 'object') {
      flatten(v, next, out);
    } else {
      out[next] = v;
    }
  }
  return out;
}

/**
 * 解析 JSONC：locale 檔含整行 `//` 區段註解（如 `// 繁體中文`）。
 * 只移除「整行註解」（首個非空白字元為 //），不碰字串值內的 //。
 */
function parseJsonc(raw) {
  const stripped = raw
    .split('\n')
    .filter((line) => !/^\s*\/\//.test(line))
    .join('\n');
  return JSON.parse(stripped);
}

function loadLocale(localeKey) {
  const file = LOCALE_FILES[localeKey];
  const full = path.join(LOCALE_DIR, file);
  const raw = fs.readFileSync(full, 'utf8');
  return flatten(parseJsonc(raw));
}

/**
 * 串流解析 JSON 文字，統計每個扁平 key 的出現次數（含重複）。
 * JSON.parse 會把同一物件內的重複 key 收斂成最後一份，因此無法用解析後的物件
 * 偵測重複；這裡用最小手寫 parser 走過整份文字，記錄每個 member key 的出現次數。
 *
 * 先剝除整行 `//` 註解（與 parseJsonc 一致），再解析（保留字串值內的 //）。
 * @returns {Array<{ key: string, count: number }>} 出現 > 1 次的扁平 key（升序）
 */
function findDuplicateKeys(raw) {
  const text = raw
    .split('\n')
    .filter((line) => !/^\s*\/\//.test(line))
    .join('\n');

  const counts = Object.create(null);
  let i = 0;

  const fail = (msg) => {
    throw new Error(`findDuplicateKeys parse error: ${msg} at offset ${i}`);
  };
  const ws = () => {
    while (i < text.length && /\s/.test(text[i])) i++;
  };
  const parseString = () => {
    // 假設目前位於開頭的 "
    i++;
    let s = '';
    while (i < text.length) {
      const c = text[i++];
      if (c === '"') return s;
      if (c === '\\') {
        const n = text[i++];
        if (n === 'u') {
          s += String.fromCharCode(parseInt(text.substr(i, 4), 16));
          i += 4;
        } else {
          s += { n: '\n', t: '\t', r: '\r', b: '\b', f: '\f' }[n] || n;
        }
      } else {
        s += c;
      }
    }
    fail('unterminated string');
  };
  const parseNumber = () => {
    const m = /^-?\d+(\.\d+)?([eE][+-]?\d+)?/.exec(text.slice(i));
    if (!m) fail('invalid number');
    i += m[0].length;
  };
  const parseValue = (prefix) => {
    ws();
    const c = text[i];
    if (c === '{') return parseObject(prefix);
    if (c === '[') return parseArray(prefix);
    if (c === '"') return parseString();
    if (c === '-' || /[0-9]/.test(c)) return parseNumber();
    if (text.startsWith('true', i)) return (i += 4);
    if (text.startsWith('false', i)) return (i += 5);
    if (text.startsWith('null', i)) return (i += 4);
    fail(`unexpected character "${c}"`);
  };
  const parseArray = (prefix) => {
    i++; // [
    ws();
    if (text[i] === ']') return i++;
    let idx = 0;
    for (;;) {
      parseValue(`${prefix}.${idx}`);
      idx++;
      ws();
      if (text[i] === ',') { i++; continue; }
      if (text[i] === ']') { i++; break; }
      fail('expected "," or "]"');
    }
  };
  const parseObject = (prefix) => {
    i++; // {
    ws();
    if (text[i] === '}') return i++;
    for (;;) {
      ws();
      if (text[i] !== '"') fail('expected object key');
      const key = parseString();
      const flat = prefix ? `${prefix}.${key}` : key;
      counts[flat] = (counts[flat] || 0) + 1;
      ws();
      if (text[i] !== ':') fail('expected ":"');
      i++;
      parseValue(flat);
      ws();
      if (text[i] === ',') { i++; continue; }
      if (text[i] === '}') { i++; break; }
      fail('expected "," or "}"');
    }
  };

  ws();
  parseValue('');

  return Object.keys(counts)
    .filter((k) => counts[k] > 1)
    .sort()
    .map((k) => ({ key: k, count: counts[k] }));
}

function loadDuplicates(localeKey) {
  const file = LOCALE_FILES[localeKey];
  const full = path.join(LOCALE_DIR, file);
  const raw = fs.readFileSync(full, 'utf8');
  return findDuplicateKeys(raw);
}

/**
 * 遞迴收集 src 下所有 .vue / .js / .ts 檔（供代碼引用掃描）。
 * 跳過：unpackage / node_modules / locale 目錄，以及 symlink 目錄
 *（src/<lang>/ 是指向 ../pages 的語言路由副本，跟進會重複）。
 */
function walkSrc(dir, acc) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch (e) {
    return acc;
  }
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isSymbolicLink()) continue; // 跳過語言路由副本 symlink 目錄
    if (e.isDirectory()) {
      if (e.name === 'unpackage' || e.name === 'node_modules' || e.name === 'locale') continue;
      walkSrc(full, acc);
    } else if (/\.(vue|js|ts)$/.test(e.name)) {
      acc.push(full);
    }
  }
  return acc;
}

/**
 * 掃描 src 下所有 .vue/.js/.ts 的 $t()/t()/tt() 靜態字面量 key 引用，
 * 找出「代碼引用了、但 locale 並集裡不存在」的 key。
 * 這些會在執行期渲染中文 fallback 或裸 key — 是「只比對 locale 檔之間」抓不到的盲區，
 * 也是本輪 story/creator 150 個 sc.* / community 等問題的統一根因。
 *
 * desktop 用 vue-i18n（setup 內 `const { t } = useI18n()`），故 t( 裸用很常見；
 * 為避免誤配一般 t( 變數/函式，要求 key 含至少一個 "."（namespace.key 形式）。
 *
 * 過濾掉：
 *   - 動態前綴：以 . 或 _ 結尾（屬 t(prefix + variable) 的靜態前綴段）
 *   - CODE_REF_IGNORE 列出的廢棄檔
 *
 * @returns {Array<{ key: string, file: string }>}
 */
function findMissingCodeRefs(unionKeySet) {
  const files = walkSrc(SRC_DIR, []);
  const re = /(?:\$t|\btt|\bt)\(\s*["']([a-zA-Z][a-zA-Z0-9_.]*\.[a-zA-Z0-9_.]+)["']/g;
  const used = new Map();
  for (const f of files) {
    if (CODE_REF_IGNORE.some((rx) => rx.test(f))) continue;
    const content = fs.readFileSync(f, 'utf8');
    let m;
    while ((m = re.exec(content))) {
      const k = m[1];
      if (k.endsWith('.') || k.endsWith('_')) continue; // 動態前綴，非真 key
      if (!used.has(k)) used.set(k, path.relative(SRC_DIR, f));
    }
  }
  const missing = [];
  for (const [k, file] of used) {
    if (!unionKeySet.has(k)) missing.push({ key: k, file });
  }
  return missing.sort((a, b) => a.key.localeCompare(b.key));
}

/* ================================================================
 * 英語本土化檢查（English-Localization-Playbook §7 P0-5）
 *   (a) en 值內 CJK 字符（hard fail，白名單機制排除正當場景）
 *   (b) en 值 "Please enter…" 翻譯腔（hard fail）
 *   (c) 單複數硬編碼可疑模式（warning only）
 *   (d) .vue template 內用戶可見硬編碼 CJK（hard fail，存量基線只減不增）
 * ================================================================ */

// CJK 偵測範圍：漢字（含擴展A/相容區）、平假名、片假名、諺文
const CJK_RE = /[㐀-䶿一-鿿豈-﫿぀-ヿ가-힣]/;

// en 值裡允許出現的 CJK 標點/符號（正當排版用途，不算未翻譯）：
// ・(U+30FB katakana middle dot) 作為條列 bullet 是常見排版慣例（chat.summaryDeleteContent）
const EN_CJK_ALLOWED_CHARS_RE = /[・]/g;

// en 值 CJK key 白名單：刻意保留 CJK 的正當場景（品牌名 / 語言自稱等）。
// 加入時必須附理由註解，否則 review 退回。
const EN_CJK_KEY_ALLOWLIST = new Set([
  // 例：'mine.language_zhHant'（語言切換選單以該語言自稱）
]);

// 單複數硬編碼偵測：
//   1) "1 cards" 型 — 數字 1 直接接複數名詞
//   2) "{n} credit(s)" 型 — 插值後接計數名詞且整句無 vue-i18n 複數管道 `|`
const PLURAL_AFTER_ONE_RE =
  /(^|[^0-9.,}])\b1\s+(credits|cards|points|messages|chats|days|turns|chapters|times|tokens|coins|characters|roles|entries|items|votes|referrals|voices|replies)\b/;
const INTERP_COUNT_NOUN_RE =
  /\{[a-zA-Z_][a-zA-Z0-9_]*\}\s*(credits?|cards?|points?|messages?|chats?|days?|turns?|chapters?|times?|tokens?|coins?|characters?|roles?|entr(?:y|ies)|items?|votes?|referrals?|voices?|repl(?:y|ies))\b/i;

/**
 * 檢查 en locale 扁平物件的英文文案問題。
 * @param {Record<string,string>} enFlat 扁平化的 en locale
 * @param {{ cjkKeyAllowlist?: Set<string> }} [opts]
 * @returns {{ cjk: Array, pleaseEnter: Array, pluralSuspect: Array }}
 */
function checkEnglishCopy(enFlat, opts = {}) {
  const cjkKeyAllowlist = opts.cjkKeyAllowlist || EN_CJK_KEY_ALLOWLIST;
  const cjk = [];
  const pleaseEnter = [];
  const pluralSuspect = [];
  for (const key of Object.keys(enFlat).sort()) {
    const v = enFlat[key];
    if (typeof v !== 'string') continue;
    const cleaned = v.replace(EN_CJK_ALLOWED_CHARS_RE, '');
    if (CJK_RE.test(cleaned) && !cjkKeyAllowlist.has(key)) cjk.push({ key, value: v });
    if (/please enter/i.test(v)) pleaseEnter.push({ key, value: v });
    if (!v.includes('|') && (PLURAL_AFTER_ONE_RE.test(v) || INTERP_COUNT_NOUN_RE.test(v))) {
      pluralSuspect.push({ key, value: v });
    }
  }
  return { cjk, pleaseEnter, pluralSuspect };
}

/* ================================================================
 * 日語/韓語本土化整改新增檢查
 * 來源：本地文件 §8
 * 本區塊與 mobile/scripts/i18n-check.js 鏡像，改一端必須同步另一端。
 *
 * 背景（為什麼需要這四道）：2026-07-20 日語測評發現 ja locale key 覆蓋率
 * 100%、無空值、無裸 key、無重複 key——現有 gate 全綠，但日語版對日本用戶
 * 實際不可用。根因是日語從中文原文逐字直譯，不是從已本土化打磨的英文版。
 * 既有 gate 只驗「key 在不在、值空不空」，測不出四類實際缺陷：
 *   (1) 值根本是英文（desktop sc.* 命名空間 73/250 未翻譯）
 *   (2) 佔位符跨語言不一致（ja/ko/zh 顯示裸 "{n}"，en 正常所以中英測試測不出）
 *   (3) 同一概念多譯法（簽到卡片內「クレジット」與「ポイント」同屏並存）
 *   (4) 中文直譯詞（広場 / 世界書 / 人審 / 劇情 / 最早）
 *
 * ratchet 設計：存量債務以「顯式 key 清單」登記（比計數基線更強——既防新增，
 * 又把債務點名列出來便於清償）。修好一條就從清單刪一條，只減不增。
 * ================================================================ */

// 各語言的「本語言文字」偵測：值裡完全沒有這些字符 = 沒有被翻譯過。
// ja 用「假名或漢字」而非只看假名——純漢字詞（設定/削除/確認/性別）是正當日語，
// 只看假名會產生大量誤報（測評時實測 931 條假陽性）。
const SCRIPT_RE = {
  ja: /[぀-ゟ゠-ヿ㐀-䶿一-鿿豈-﫿]/,
  ko: /[가-힣ᄀ-ᇿㄱ-ㆎ㐀-䶿一-鿿]/,
};
const LATIN_RE = /[A-Za-z]/;

// 品牌名 / 技術符號 / 通用縮寫：這些在任何語言下保持原樣都是正當的。
// 比對時大小寫不敏感，且會先剝除佔位符與標點。
const SCRIPT_RESIDUE_ALLOWED_VALUES = new Set([
  'lunatalk', 'moonstage', 'sillytavern', 'mmd', 'vip', 'html', 'tokens', 'token', 'pt', 'ai', 'ok', 'max', 'min',
  'r18', 'nsfw', 'sfw', 'id', 'url', 'app', 'h5', 'api', 'css', 'json', 'mcp',
  'png', 'jpg', 'gif', 'webp', 'mp3', 'wav', 'flac', 'mb', 'kb', 'gb',
  'claude', 'gpt', 'gemini', 'flux', 'deepseek', 'sora', 'midjourney',
  'instant', 'high', 'low', 'ultra', 'basebot', 'pro', 'plus', 'lite',
]);

/**
 * (1) 英文殘留：ja/ko 值完全沒有該語言文字、卻含拉丁字母 → 未翻譯。
 *
 * 只在「完全沒有本語言文字」時報，不在「缺假名」時報——後者會把正當的
 * 純漢字日語詞全部誤殺。
 *
 * @param {Record<string,string>} flat 該語言的扁平 locale
 * @param {'ja'|'ko'} localeKey
 * @param {{ allowlistKeys?: Set<string> }} [opts]
 * @returns {Array<{ key: string, value: string }>}
 */
function checkScriptResidue(flat, localeKey, opts = {}) {
  const scriptRe = SCRIPT_RE[localeKey];
  if (!scriptRe) return [];
  const allowlistKeys = opts.allowlistKeys || new Set();
  const out = [];
  for (const key of Object.keys(flat).sort()) {
    if (allowlistKeys.has(key)) continue;
    const v = flat[key];
    if (typeof v !== 'string') continue;
    const s = v.trim();
    if (!s) continue;
    if (scriptRe.test(s)) continue;          // 有本語言文字 → 已翻譯
    if (!LATIN_RE.test(s)) continue;         // 純數字/符號/佔位符 → 不算未翻譯
    // 剝除佔位符與非字母數字後，若剩下的是品牌/技術符號則放行
    const stripped = s
      .replace(/\{[^}]*\}/g, ' ')
      .replace(/\$\{[^}]*\}/g, ' ')
      .replace(/%[sd]/g, ' ')
      .replace(/[^A-Za-z0-9]/g, ' ')
      .trim()
      .toLowerCase();
    if (!stripped) continue;
    const words = stripped.split(/\s+/);
    if (words.every((w) => SCRIPT_RESIDUE_ALLOWED_VALUES.has(w) || /^\d+$/.test(w))) continue;
    out.push({ key, value: v });
  }
  return out;
}

// 佔位符形式：{n} / ${n} / %s / %d
const PLACEHOLDER_RE = /(\$\{[^}]*\}|\{[^}]*\}|%[sd])/g;

/**
 * (2) 佔位符跨語言一致性。
 *
 * 抓的實際 bug（mobile/src/pages/story/player.vue:94）：
 *   premise.chapterCount + ' ' + tt('sp.chapters', '章節')
 * 數字在代碼裡拼在外面，而 ja 值是 "{n} チャプター"、tt() 不做插值，
 * 於是日語用戶看到 "5 {n} チャプター"。en 值沒有 {n} 所以英文版正常——
 * 這正是用中文/英文測試永遠測不出來的那類缺陷。
 *
 * @param {Record<string,string>} baseFlat 基準語言扁平 locale
 * @param {Record<string,string>} flat 被檢語言扁平 locale
 * @param {{ allowlistKeys?: Set<string> }} [opts]
 * @returns {Array<{ key: string, extra: string[], missing: string[], base: string, value: string }>}
 */
function checkPlaceholderParity(baseFlat, flat, opts = {}) {
  const allowlistKeys = opts.allowlistKeys || new Set();
  const out = [];
  for (const key of Object.keys(flat).sort()) {
    if (allowlistKeys.has(key)) continue;
    const v = flat[key];
    const b = baseFlat[key];
    if (typeof v !== 'string' || typeof b !== 'string') continue;
    const vSet = new Set((v.match(PLACEHOLDER_RE) || []));
    const bSet = new Set((b.match(PLACEHOLDER_RE) || []));
    const extra = [...vSet].filter((x) => !bSet.has(x)).sort();
    const missing = [...bSet].filter((x) => !vSet.has(x)).sort();
    if (extra.length || missing.length) {
      out.push({ key, extra, missing, base: b, value: v });
    }
  }
  return out;
}

/**
 * (3) 術語 glossary：受控詞表，同一概念出現非規範譯法即報告。
 *
 * 目前為報告級（不 hard fail）——存量 200+ 組需要先累積基線並經母語者確認
 * 規範譯法，貿然 hard fail 會癱瘓開發。累積數據後升 deny。
 *
 * @param {Record<string,string>} flat
 * @param {{ glossary?: Array, allowlistKeys?: Set<string> }} [opts]
 * @returns {Array<{ key: string, concept: string, found: string, canonical: string, value: string }>}
 */
function checkGlossary(flat, opts = {}) {
  const glossary = opts.glossary || JA_GLOSSARY;
  const allowlistKeys = opts.allowlistKeys || new Set();
  const out = [];
  for (const key of Object.keys(flat).sort()) {
    if (allowlistKeys.has(key)) continue;
    const v = flat[key];
    if (typeof v !== 'string' || !v.trim()) continue;
    for (const entry of glossary) {
      for (const variant of entry.variants) {
        if (v.includes(variant)) {
          out.push({ key, concept: entry.concept, found: variant, canonical: entry.canonical, value: v });
          break;
        }
      }
    }
  }
  return out;
}

/**
 * 日語受控術語表。canonical = 規範譯法，variants = 應被取代的譯法。
 * 來源：Japanese-Localization-Review-20260720 §4。
 * 新增條目必須附 reason，否則 review 退回。
 */
const JA_GLOSSARY = [
  { concept: 'Credits', canonical: 'ポイント', variants: ['クレジット'],
    reason: '簽到卡片內「チャットクレジット」與「期間限定ポイント」同屏並存，用戶以為是兩種貨幣' },
  { concept: 'Check-in', canonical: 'チェックイン', variants: ['サインイン'],
    reason: '日語「サインイン」＝登入，整段簽到文案變成「每天登入」' },
  { concept: 'Report(違規申告)', canonical: '通報', variants: ['報告理由', '報告内容'],
    reason: '日本 App 違規申告標準詞是「通報」；「報告」＝工作匯報，功能傳達不到' },
  { concept: 'Worldbook', canonical: 'ワールドブック', variants: ['世界書'],
    reason: '同一功能在 worldbook.* 全用「ワールドブック」，只有少數 key 用中文「世界書」' },
  { concept: 'Rewind', canonical: '巻き戻し', variants: ['ロールバック', '記憶遡及'],
    reason: '「ロールバック」是開發術語；同一功能三種譯法' },
  // ⚠️ 刻意不含 Tap（クリック→タップ）：desktop 是 PC Web 應用
  // （見 desktop/CLAUDE.md「PC 端 Web 應用 / 目標平台: H5 (Web) - PC 端優化」），
  // 用戶用滑鼠操作，「クリック」是正確用法。該規則的 reason 本身就寫著
  // 「手機端說 click 不合適」——是 mobile 專屬規則，2026-07-20 從 desktop 詞表
  // 移除（此前為鏡像 mobile 誤抄，會把 27 處正確文案改錯）。
];

/**
 * (4) 中文殘留：ja 值裡的已知中文直譯詞。
 *
 * 詞表只收「已核實確為中文直譯且日語不成立/語義有偏差」的詞，
 * 不收正當的日語漢字詞。新增條目必須附 reason。
 *
 * @param {Record<string,string>} flat ja 扁平 locale
 * @param {{ terms?: Array, allowlistKeys?: Set<string> }} [opts]
 * @returns {Array<{ key: string, term: string, reason: string, value: string }>}
 */
function checkChineseResidue(flat, opts = {}) {
  const terms = opts.terms || JA_CHINESE_RESIDUE_TERMS;
  const allowlistKeys = opts.allowlistKeys || new Set();
  const out = [];
  for (const key of Object.keys(flat).sort()) {
    if (allowlistKeys.has(key)) continue;
    const v = flat[key];
    if (typeof v !== 'string' || !v.trim()) continue;
    for (const t of terms) {
      if (v.includes(t.term)) {
        out.push({ key, term: t.term, reason: t.reason, value: v });
        break;
      }
    }
  }
  return out;
}

/**
 * 已核實的中文直譯詞表（Japanese-Localization-Review-20260720 §2.3 / §4）。
 * 每條都附「為什麼這在日語不成立」，避免後人誤刪或誤加正當日語詞。
 */
const JA_CHINESE_RESIDUE_TERMS = [
  { term: '最早', reason: '日語「最早（もはや）」＝已經，語義與中文「最早」相反，讀成「已經過期了」' },
  { term: '広場', reason: '中文「廣場」直譯；日本 App 不用此詞指 Discover，且與 tab 名「発見」不一致' },
  { term: 'プラザ', reason: 'Discover 的第四種譯法，本 App 未定義此語' },
  { term: '世界書', reason: '中文「世界书」；同功能其他 key 用「ワールドブック」' },
  { term: '劇情', reason: '中文詞，日語不存在；應為「ストーリー」' },
  { term: '人審', reason: '中文「人工審核」略語，日語讀不通' },
  { term: '人手審査', reason: '中文「人工審核」直譯造語；日語應為「目視確認」' },
  { term: '初字', reason: '中文「首字」當字；日語無此詞，應為「最初の応答」' },
  { term: '建カード', reason: '中文「建卡」殘骸；日語不存在此詞' },
  { term: '会話多', reason: '中文「对话多」直譯；日語排序項非文，應為「会話が多い順」' },
  { term: '季節カード', reason: '中文「季卡」＝季度；日語讀作春夏秋冬卡，付費商品名誤譯' },
  { term: '粘着', reason: '中文「黏性」直譯；日語「粘着」指網路上糾纏不休的人，強負面詞' },
  { term: '紹介官', reason: '中文「推荐官」直譯；日語不存在此詞' },
  { term: '超凡', reason: '中文詞，日語讀不通' },
  { term: '返信長度', reason: '中文「長度」；日語應為「返信の長さ」' },
  { term: '男性向け', reason: '中文「男神」誤譯——原意是男性角色，「男性向け」＝面向男性用戶，篩選語義相反' },
  { term: '女性向け', reason: '中文「女神」誤譯——原意是女性角色，語義同上相反' },
];

// 基線 key 清單 · 2026-07-20 測評當下的存量債務。
// 多數是評級標籤（G/PG/PG12）、平台名（Discord/LINE/Telegram）、型號名等
// 「本來就不該翻」的項目，但仍逐條登記而非放進通用 allowlist——
// 通用 allowlist 會連未來新增的同形違規一起放行，逐條登記不會。
// 基線 key 清單 · 2026-07-20 測評當下的存量債務（desktop）。
// ⚠️ sc.* 命名空間（劇情創作向導）73/250 值是英文原文，是本次測評的 P0 發現：
//    日語用戶走完整個故事創作流程看到的是 Title / Required / Bind Worldbook。
//    這些是**待清償的真實缺陷**，不是「本來就不該翻」的豁免。
// 清償一條就從清單刪一條——刪掉後 gate 自動守住，不會漂回來。
// 禁止為了讓 gate 綠而往清單裡加新 key；新增違規就是要當場修。
const SCRIPT_RESIDUE_BASELINE_JA_KEYS = [
  // 以下兩個不是未翻譯，是外來語縮寫與產品專有名詞，日/韓文正確寫法就是原字母：
  //   SF  = サイエンス・フィクション／사이언스 픽션 的通用縮寫，兩地都直接寫 SF
  //   MOD = 產品功能名，全語系一律不譯（zh-Hant 亦同）
  // 啟發式無法區分「該譯沒譯」與「本來就不譯」，故登記於此而非改寫成不自然的譯文。
  'mod.marketplaceV2.tag.science_fiction',
  'promptBreakdown.mod',
  'campaign.prize1',
  'campaign.prize2',
  'campaign.prize3',
  'campaign.prize5Name',
  'campaign.prize6Name',
  'campaign.prize7Name',
  'campaign.prize8Name',
  'galgame.editor.roles.npc',
  'galgame.editor.sidebar.cgs',
  'galgame.gallery.endingTypes.bad',
  'galgame.gallery.endingTypes.good',
  'galgame.gallery.endingTypes.hidden',
  'galgame.gallery.endingTypes.normal',
  'galgame.gallery.endingTypes.true',
  'galgame.gallery.tabCG',
  'galgame.rating.PG12',
  'galgame.rating.PG15',
  'galgame.ratingBadge.G',
  'galgame.ratingBadge.PG',
  'galgame.ratingBadge.PG12',
  'galgame.ratingBadge.PG15',
  'galgame.tags.bl',
  'galgame.tags.fps',
  'galgame.tags.sci-fi',
  'login.emailPlaceholder',
  'sc.genreScifi',
  'sc.presetHP',
  'square.sectionTab.live',
  'square.v2.subTabs.hot.24h',
  'square.v2.subTabs.hot.72h',
  'square.v2.zone.r18Chip',
  'workbench.createModeBadgeBeta',
  'workbench.createModeWritecardName',
];
const SCRIPT_RESIDUE_BASELINE_KO_KEYS = [
  // 以下兩個不是未翻譯，是外來語縮寫與產品專有名詞，日/韓文正確寫法就是原字母：
  //   SF  = サイエンス・フィクション／사이언스 픽션 的通用縮寫，兩地都直接寫 SF
  //   MOD = 產品功能名，全語系一律不譯（zh-Hant 亦同）
  // 啟發式無法區分「該譯沒譯」與「本來就不譯」，故登記於此而非改寫成不自然的譯文。
  'mod.marketplaceV2.tag.science_fiction',
  'promptBreakdown.mod',
  'campaign.prize1',
  'campaign.prize2',
  'campaign.prize3',
  'galgame.editor.roles.npc',
  'galgame.editor.sidebar.cgs',
  'galgame.gallery.endingTypes.bad',
  'galgame.gallery.endingTypes.good',
  'galgame.gallery.endingTypes.hidden',
  'galgame.gallery.endingTypes.normal',
  'galgame.gallery.endingTypes.true',
  'galgame.gallery.tabCG',
  'galgame.ratingBadge.G',
  'galgame.ratingBadge.PG',
  'galgame.ratingBadge.PG12',
  'galgame.ratingBadge.PG15',
  'galgame.tags.bl',
  'galgame.tags.fps',
  'galgame.tags.sci-fi',
  'login.emailPlaceholder',
  'sc.genreScifi',
  'sc.presetHP',
  'square.sectionTab.live',
  'square.v2.zone.r18Chip',
  'workbench.createModeWritecardName',
];

// ⚠️ 這 3 個 key 是**真實 user-visible bug**，不是「本來就不該翻」的豁免。
// mobile/src/pages/story/player.vue:94/514 與 pages/mine/checkin.vue 的調用點
// 把數字拼在外面，locale 值裡的 {n} 不會被插值 → 用戶看到 "5 {n} チャプター"。
// en 值沒有 {n} 所以英文版正常，這正是中英測試測不出的那類缺陷。
// 修復需同時改調用點與 locale，屬業務修復（另開工單），故先登記為債務。
// desktop 以 zh-Hant 為基準；en 的 checkin.task_chat_5 沒有 {n}（英文寫死 "5 messages"）。
// 與 mobile 同源的 sp.chapters / sp.memoryCount 裸佔位符 bug 在 desktop 不存在。
// desktop 以 zh-Hant 為基準。en 的 checkin.task_chat_5 沒有 {n}（英文寫死 "5 messages"），
// 與 mobile 同源；mobile 的 sp.chapters / sp.memoryCount 裸佔位符 bug 在 desktop 不存在。
const PLACEHOLDER_BASELINE_EN_KEYS = ['checkin.task_chat_5'];
const PLACEHOLDER_BASELINE_KEYS = [];
const PLACEHOLDER_BASELINE_ZH_HANS_KEYS = PLACEHOLDER_BASELINE_KEYS;
const PLACEHOLDER_BASELINE_ZH_HANT_KEYS = PLACEHOLDER_BASELINE_KEYS;
const PLACEHOLDER_BASELINE_JA_KEYS = PLACEHOLDER_BASELINE_KEYS;
const PLACEHOLDER_BASELINE_KO_KEYS = PLACEHOLDER_BASELINE_KEYS;

// 中文直譯詞存量債務。全部是待清償的真實缺陷（非豁免）。
// 中文直譯詞存量債務。全部是待清償的真實缺陷（非豁免）。
const CHINESE_RESIDUE_BASELINE_KEYS = [
  'chat.template_square',
  'chat.unpublish_role_confirm',
  'create.public',
  'galgame.player.loading.funPoolA',
  'mine.checkRole.statusPending',
  'mine.checkRole.subtitle',
  'modelSelect.firstTokenLatency',
  'promptBreakdown.worldbook',
  'roleAudio.voiceSquare',
  'roleDetail.aiReviewActionHuman',
  'roleDetail.aiReviewHumanReason',
  'roleSetting.reviewGuidelines.review.item2',
  'sc.visPublicOption',
  'square.v2.rail.author.longchat.label',
  'voiceSquare.title',
  'voiceUpload.publicDesc',
  'worldbook.bind.goSquare',
  'worldbook.squareTitle',
];

/* ---------------- 存量債務基線（ratchet：只減不增） ----------------
 * 這些是 2026-07-20 測評當下已存在的違規。gate 放行它們但不放行新增。
 * 清償一條就從清單刪一條——刪掉後 gate 自動守住，不會漂回來。
 * 禁止為了讓 gate 綠而往清單裡加新 key；新增違規就是要當場修。
 * ------------------------------------------------------------------ */
const SCRIPT_RESIDUE_BASELINE = {
  ja: new Set(SCRIPT_RESIDUE_BASELINE_JA_KEYS),
  ko: new Set(SCRIPT_RESIDUE_BASELINE_KO_KEYS),
};
const PLACEHOLDER_PARITY_BASELINE = {
  // desktop 基準是 zh-Hant，故 en 也在比對範圍（mobile 基準是 en，無此項）
  en: new Set(PLACEHOLDER_BASELINE_EN_KEYS),
  'zh-Hans': new Set(PLACEHOLDER_BASELINE_ZH_HANS_KEYS),
  'zh-Hant': new Set(PLACEHOLDER_BASELINE_ZH_HANT_KEYS),
  ja: new Set(PLACEHOLDER_BASELINE_JA_KEYS),
  ko: new Set(PLACEHOLDER_BASELINE_KO_KEYS),
};
const CHINESE_RESIDUE_BASELINE = new Set(CHINESE_RESIDUE_BASELINE_KEYS);

/**
 * 抽出 .vue 原始碼 template 區塊內、非註釋且含 CJK 的行。
 * 註釋以空白替換（保留行號），script/style 區塊不掃（log、註解不屬用戶可見）。
 * @returns {Array<{ line: number, text: string }>}
 */
function extractTemplateCjkLines(source) {
  const start = source.indexOf('<template');
  const end = source.lastIndexOf('</template>');
  if (start === -1 || end === -1 || end <= start) return [];
  const tpl = source
    .slice(start, end)
    .replace(/<!--[\s\S]*?-->/g, (m) => m.replace(/[^\n]/g, ' '));
  const hits = [];
  tpl.split('\n').forEach((line, idx) => {
    const cleaned = line.replace(EN_CJK_ALLOWED_CHARS_RE, '');
    if (CJK_RE.test(cleaned)) hits.push({ line: idx + 1, text: line.trim().slice(0, 100) });
  });
  return hits;
}

/**
 * 用戶可見的 uni API 字段名。
 * 只掃這些字段的 CJK 字面量——不是掃整個 <script>。
 *
 * 理由（2026-07-20 韓語本土化測評 §2.5）：
 * 全掃 <script> 會把 1133 行合法中文 console.log（desktop 595 / mobile 538）
 * 全部誤報。根 CLAUDE.md 的 Log Language Policy 明確允許 log 用正體中文，
 * 那批不是違規。掃全域 = gate 必被加白名單繞過 = 等於沒有 gate。
 */
const SCRIPT_USER_FACING_FIELDS = [
  'title',
  'content',
  'confirmText',
  'cancelText',
];

/**
 * `field: '含CJK的字面量'` —— 冒號後必須「直接」是引號才算展示文案。
 *
 * 這條收緊是為了排除表達式賦值，例如
 *   content: item.chatMessage.replace("<已解除苛刻的道德限制>", "")
 * 其中的 CJK 是字串處理的匹配模式，不是要展示給用戶的文案。
 * （真實假陽性來源：components/custom/pinned-drawer.vue:144）
 */
function buildFieldLiteralRe(fields) {
  return new RegExp(
    `\\b(${fields.join('|')})\\s*:\\s*(['"])((?:(?!\\2)[^\\\\]|\\\\.)*?[㐀-䶿一-鿿豈-﫿぀-ヿ가-힣](?:(?!\\2)[^\\\\]|\\\\.)*?)\\2`
  );
}

/**
 * i18n 兜底模式：`$t(...)  || '中文'` / `tt('key', '中文')`。
 * 這類 CJK 只在 i18n 解析失敗時才出現，且經實測（mobile 235 個 tt() key
 * ko 全部存在）永不觸發，不算硬編碼違規。
 */
const I18N_FALLBACK_RE = /\$?\bt{1,2}\s*\(/;

/**
 * 抽出 .vue 原始碼 <script> 區塊內、用戶可見 API 字段的 CJK 硬編碼行。
 *
 * 與 extractTemplateCjkLines 互補：那個掃 <template>（用戶可見標記），
 * 這個掃 <script> 裡真正會彈給用戶看的 uni.showToast / showModal 等。
 * 兩者都不掃 console.log 與註釋。
 *
 * @returns {Array<{ line: number, text: string }>}
 */
function extractScriptUserFacingCjkLines(source) {
  const hits = [];
  const fieldLiteralRe = buildFieldLiteralRe(SCRIPT_USER_FACING_FIELDS);
  const scriptBlockRe = /<script[^>]*>([\s\S]*?)<\/script>/g;

  let m;
  while ((m = scriptBlockRe.exec(source)) !== null) {
    // 用區塊起點在原始碼中的偏移換算真實行號
    const lineOffset = source.slice(0, m.index).split('\n').length - 1;
    const body = m[1]
      // 註釋替換為等長空白，保留行號
      .replace(/\/\*[\s\S]*?\*\//g, (c) => c.replace(/[^\n]/g, ' '))
      .replace(/\/\/[^\n]*/g, (c) => c.replace(/[^\n]/g, ' '));

    body.split('\n').forEach((line, idx) => {
      if (I18N_FALLBACK_RE.test(line)) return;
      if (!fieldLiteralRe.test(line)) return;
      hits.push({ line: lineOffset + idx + 1, text: line.trim().slice(0, 100) });
    });
  }
  return hits;
}

// template CJK 掃描跳過（相對 src 的 path，正斜線）：
//   - firstui / firstui-i18n / uni_modules：第三方組件庫，其中文 default 由 props 覆蓋
//   - src 根層語言路由殼（en|ja|ko|zh-Hans|zh-Hant).vue：各語言入口殼層
//   - *bak*.vue 與 CODE_REF_IGNORE：廢棄 / 未路由檔
const TEMPLATE_CJK_SKIP = [
  /^components\/firstui(-i18n)?\//,
  /(^|\/)uni_modules\//,
  /^(en|ja|ko|zh-Hans|zh-Hant)\.vue$/,
  /bak\.vue$/i,
  /main1\.vue$/,
  /chat1\.vue$/,
];

/**
 * template CJK 存量基線（整改前已存在的債務清單，相對 src path → 允許行數）。
 * 鐵律：只許減、不許增。新檔案 / 新增 CJK 行一律 fail。
 * 清債後請把對應條目刪除或調低。
 * 快照日期：2026-06-12（英語本土化整改 · Playbook §7 P0-5）
 */
const TEMPLATE_CJK_BASELINE = {
  'components/checkin-remind/index.vue': 1,
  'components/custom/rw-roleDetail.vue': 1,
  'components/share/ShareDialog.vue': 1,
  'components/square-ranking-v2/campaign-card-v2.vue': 2,
  'components/square-ranking-v2/explore-slot.vue': 3,
  'components/square-ranking-v2/fresh-section.vue': 2,
  'pages/campaign/share-role-select.vue': 1,
  'pages/chat/chat.vue': 4,
  'pages/chat/chatDreamTask.vue': 1,
  'pages/chat/chatSetting.vue': 1,
  'pages/create/imageCropper.vue': 2,
  'pages/create/main.vue': 1,
  'pages/mine/main.vue': 3,
  'pages/mine/preferences.vue': 3,
  // 'pages/story/creator.vue': 72 —— 2026-07-09 清債:七步向導改造時 sc.* 全數補進 locale,
  // template 不再有硬編碼 CJK(含拆出的 wizard-steps/Step*.vue)。基線移除,回歸硬 gate。
  'pages/theme-editor/CodeMode.vue': 1,
  'pages/theme-editor/ModeTabs.vue': 2,
  'pages/theme-editor/SampleSwitcher.vue': 1,
  'pages/voice/square-v2-test.vue': 2,
  'windows/left-window.vue': 1,
  'windows/top-window.vue': 10,
};

/**
 * 掃描 src 下所有 .vue 的 template 硬編碼 CJK，回傳超出基線的違規檔。
 * @returns {Array<{ file: string, count: number, allowed: number, sample: string }>}
 */
function findTemplateCjk() {
  const files = walkSrc(SRC_DIR, []).filter((f) => f.endsWith('.vue'));
  const offenders = [];
  for (const f of files) {
    const rel = path.relative(SRC_DIR, f).split(path.sep).join('/');
    if (TEMPLATE_CJK_SKIP.some((rx) => rx.test(rel))) continue;
    const hits = extractTemplateCjkLines(fs.readFileSync(f, 'utf8'));
    if (!hits.length) continue;
    const allowed = TEMPLATE_CJK_BASELINE[rel] || 0;
    if (hits.length > allowed) {
      offenders.push({ file: rel, count: hits.length, allowed, sample: hits[0].text });
    }
  }
  return offenders.sort((a, b) => a.file.localeCompare(b.file));
}

/**
 * <script> 內用戶可見 API 的 CJK 硬編碼存量基線（相對 src path → 允許行數）。
 *
 * 鐵律：只許減、不許增。新檔案 / 新增硬編碼一律 fail。
 * 快照日期：2026-07-20（日韓本土化整改 · JA-KO-Remediation-Plan §D1）
 *
 * 這批的特徵是「從未進過 i18n」——不是譯錯，是壓根沒有 key。
 * 對 ja/ko 用戶全部可見（VN 編輯器 / 相冊權限流）。
 */
const SCRIPT_USER_FACING_CJK_BASELINE = {
  // 2026-07-20 全數清償（JA-KO Plan §C-P0）：原 58 行硬編碼 toast/modal 已全部
  // 處理——chatDreamDetail.vue 9 行隨死代碼移除，screenplay-editor.vue 49 行
  // i18n 化（49 處收斂成 27 條唯一文案：新增 22 個 key × 5 語言 + 複用 5 個）。
  // 空基線＝零容忍，新增任何 <script> 用戶可見 CJK 硬編碼一律 fail。
};

/**
 * 掃描 <script> 內用戶可見 API 的 CJK 硬編碼，回超出基線的檔案。
 * 與 findTemplateCjk 同構（同一套 SKIP 規則與棘輪語義）。
 */
function findScriptUserFacingCjk() {
  const files = walkSrc(SRC_DIR, []).filter((f) => f.endsWith('.vue'));
  const offenders = [];
  for (const f of files) {
    const rel = path.relative(SRC_DIR, f).split(path.sep).join('/');
    if (TEMPLATE_CJK_SKIP.some((rx) => rx.test(rel))) continue;
    const hits = extractScriptUserFacingCjkLines(fs.readFileSync(f, 'utf8'));
    if (!hits.length) continue;
    const allowed = SCRIPT_USER_FACING_CJK_BASELINE[rel] || 0;
    if (hits.length > allowed) {
      offenders.push({ file: rel, count: hits.length, allowed, sample: hits[0].text });
    }
  }
  return offenders.sort((a, b) => a.file.localeCompare(b.file));
}

/**
 * 棘輪防腐：基線只許減不許增。
 *
 * 沒有這道，基線會被當成「加一筆就能繞過」的白名單——那等於沒有 gate
 * （治理原則：機關不靠自覺）。
 * 回傳「基線登記數 > 實際命中數」的條目，提示應調低或刪除。
 */
function findStaleScriptCjkBaseline() {
  const stale = [];
  for (const [rel, allowed] of Object.entries(SCRIPT_USER_FACING_CJK_BASELINE)) {
    const abs = path.join(SRC_DIR, rel);
    if (!fs.existsSync(abs)) {
      stale.push({ file: rel, allowed, actual: 0, reason: '檔案已不存在' });
      continue;
    }
    const actual = extractScriptUserFacingCjkLines(fs.readFileSync(abs, 'utf8')).length;
    if (actual < allowed) {
      stale.push({ file: rel, allowed, actual, reason: '債務已部分清償，請調低基線' });
    }
  }
  return stale;
}


/**
 * 棘輪防腐（scriptResidue）：豁免名單只許減不許增。
 *
 * 2026-07-20 實證：sc.* 補譯 69 條後，ja/ko 各有 71 條豁免已失效卻靜靜躺著——
 * 白名單沒有失效檢測就會腐爛成「加一筆即可繞過」的擺設
 * （治理原則：機關不靠自覺）。
 * 回傳「已翻譯卻仍掛在豁免名單」的條目，提示應移除。
 */
function findStaleScriptResidueBaseline(flats) {
  const stale = [];
  for (const localeKey of Object.keys(SCRIPT_RE)) {
    const flat = flats[localeKey];
    if (!flat) continue;
    const baseline = SCRIPT_RESIDUE_BASELINE[localeKey] || new Set();
    for (const key of baseline) {
      const v = flat[key];
      if (typeof v !== 'string' || !v.trim()) continue;
      // 已含該語言文字 = 債務已清償，豁免應移除
      if (SCRIPT_RE[localeKey].test(v.trim())) {
        stale.push({ locale: localeKey, key, value: v.trim().slice(0, 60) });
      }
    }
  }
  return stale;
}


/**
 * glossary 誤報豁免（2026-07-20，JA-KO Plan 第 4 批；與 mobile 鏡像）。
 *
 * mine.payment_creditcard 的「クレジットカード」是**信用卡**，不是 App 內積分。
 * 盲目替換會變成「ポイントカード」（積分卡）——明確錯誤。
 *
 * desktop 無 login.* サインイン 誤報（那批只在 mobile）。
 */
const GLOSSARY_ALLOWLIST_KEYS = new Set([
  'mine.payment_creditcard',
]);

/**
 * 核心校驗邏輯，回傳結構化結果（供測試與 CLI 共用）。
 */
function analyze() {
  // 載入全部語言，計算 key 並集（union）作為參照。
  const flats = {};
  for (const localeKey of Object.keys(LOCALE_FILES)) {
    flats[localeKey] = loadLocale(localeKey);
  }
  const baseFlat = flats[BASE_LOCALE];
  const englishFlat = flats[ENGLISH_LOCALE];

  const unionKeySet = new Set();
  for (const localeKey of Object.keys(LOCALE_FILES)) {
    for (const k of Object.keys(flats[localeKey])) unionKeySet.add(k);
  }
  const unionKeys = Array.from(unionKeySet).sort();
  const missingCodeRefs = findMissingCodeRefs(unionKeySet);
  const englishCopy = checkEnglishCopy(flats[ENGLISH_LOCALE]);
  const templateCjk = findTemplateCjk();
  const scriptUserFacingCjk = findScriptUserFacingCjk();
  const staleScriptCjkBaseline = findStaleScriptCjkBaseline();

  const staleScriptResidueBaseline = findStaleScriptResidueBaseline(flats);

  // 日語/韓語本土化四道新檢查（存量債務走顯式 key 清單基線，只減不增）
  const scriptResidue = [];
  for (const localeKey of Object.keys(SCRIPT_RE)) {
    if (!flats[localeKey]) continue;
    const hits = checkScriptResidue(flats[localeKey], localeKey, {
      allowlistKeys: SCRIPT_RESIDUE_BASELINE[localeKey] || new Set(),
    });
    for (const h of hits) scriptResidue.push({ locale: localeKey, ...h });
  }

  const placeholderParity = [];
  for (const localeKey of Object.keys(LOCALE_FILES)) {
    if (localeKey === BASE_LOCALE || !flats[localeKey]) continue;
    const hits = checkPlaceholderParity(baseFlat, flats[localeKey], {
      allowlistKeys: PLACEHOLDER_PARITY_BASELINE[localeKey] || new Set(),
    });
    for (const h of hits) placeholderParity.push({ locale: localeKey, ...h });
  }

  const glossary = flats.ja
    ? checkGlossary(flats.ja, { glossary: JA_GLOSSARY, allowlistKeys: GLOSSARY_ALLOWLIST_KEYS })
    : [];

  const chineseResidue = flats.ja
    ? checkChineseResidue(flats.ja, { allowlistKeys: CHINESE_RESIDUE_BASELINE })
    : [];

  const result = {
    base: BASE_LOCALE,
    baseKeyCount: Object.keys(baseFlat).length,
    unionKeyCount: unionKeys.length,
    locales: {},
    missingCodeRefs,
    englishCopy,
    templateCjk,
    scriptUserFacingCjk,
    staleScriptCjkBaseline,
    staleScriptResidueBaseline,
    scriptResidue,
    placeholderParity,
    glossary,
    chineseResidue,
    totals: {
      missing: 0, empty: 0, duplicate: 0, valueEqKey: 0, suspect: 0,
      missingCodeRef: missingCodeRefs.length,
      enCjk: englishCopy.cjk.length,
      enPleaseEnter: englishCopy.pleaseEnter.length,
      enPluralSuspect: englishCopy.pluralSuspect.length,
      templateCjk: templateCjk.length,
      scriptUserFacingCjk: scriptUserFacingCjk.length,
      staleScriptCjkBaseline: staleScriptCjkBaseline.length,
      staleScriptResidueBaseline: staleScriptResidueBaseline.length,
      scriptResidue: scriptResidue.length,
      placeholderParity: placeholderParity.length,
      glossary: glossary.length,
      chineseResidue: chineseResidue.length,
    },
  };

  // 並集模式：每個語言（含基準語言自身）都要對齊並集。
  for (const localeKey of Object.keys(LOCALE_FILES)) {
    const flat = flats[localeKey];
    const duplicate = loadDuplicates(localeKey);

    const missing = [];
    const empty = [];
    const valueEqKey = [];
    const suspectUntranslated = [];

    for (const key of unionKeys) {
      const has = Object.prototype.hasOwnProperty.call(flat, key);
      if (!has) {
        missing.push(key);
        continue;
      }
      const v = flat[key];
      if (typeof v === 'string' && v.trim() === '') {
        if (!isEmptyAllowed(localeKey, key)) empty.push(key);
        continue;
      }
      if (typeof v === 'string' && v === key) {
        valueEqKey.push(key);
      }
      // 假翻譯啟發式：非英文語言但 value 與英文 en.json 完全相同
      if (NON_ENGLISH.includes(localeKey) && typeof v === 'string') {
        const enV = englishFlat[key];
        if (typeof enV === 'string' && v === enV && isSuspectSame(v)) {
          suspectUntranslated.push({ key, value: v });
        }
      }
    }

    result.locales[localeKey] = { missing, empty, duplicate, valueEqKey, suspectUntranslated };
    result.totals.missing += missing.length;
    result.totals.empty += empty.length;
    result.totals.duplicate += duplicate.length;
    result.totals.valueEqKey += valueEqKey.length;
    result.totals.suspect += suspectUntranslated.length;
  }

  return result;
}

/**
 * 判斷「與英文相同」是否值得當作假翻譯警告。
 * 至少含一個英文字母、長度 >= 2，排除純數字 / 純符號 / 過短噪音。
 * 保留像 'Alipay' 這種應被翻譯卻沒翻的常見詞。
 */
function isSuspectSame(v) {
  const s = v.trim();
  if (s.length < 2) return false;
  if (!/[A-Za-z]/.test(s)) return false;
  return true;
}

function fmtList(keys) {
  return keys.map((k) => `      - ${k}`).join('\n');
}

function report() {
  const r = analyze();
  const lines = [];
  lines.push('================ i18n check · desktop ================');
  lines.push(`reference: union of all locales  (union keys: ${r.unionKeyCount}, base ${r.base} keys: ${r.baseKeyCount})`);
  lines.push('');

  for (const localeKey of Object.keys(r.locales)) {
    const d = r.locales[localeKey];
    lines.push(`---- ${localeKey} ----`);
    lines.push(`  missing: ${d.missing.length}  empty: ${d.empty.length}  duplicate: ${d.duplicate.length}  valueEqKey: ${d.valueEqKey.length}  suspect: ${d.suspectUntranslated.length}`);
    if (d.missing.length) {
      lines.push(`  [missing] (${d.missing.length})`);
      lines.push(fmtList(d.missing));
    }
    if (d.empty.length) {
      lines.push(`  [empty] (${d.empty.length})`);
      lines.push(fmtList(d.empty));
    }
    if (d.duplicate.length) {
      lines.push(`  [duplicate] (${d.duplicate.length})`);
      lines.push(d.duplicate.map((x) => `      - ${x.key}  (×${x.count})`).join('\n'));
    }
    if (d.valueEqKey.length) {
      lines.push(`  [valueEqKey] (${d.valueEqKey.length})`);
      lines.push(fmtList(d.valueEqKey));
    }
    if (d.suspectUntranslated.length) {
      lines.push(`  [suspectUntranslated · warning only] (${d.suspectUntranslated.length})`);
      lines.push(d.suspectUntranslated.map((x) => `      - ${x.key}  =  "${x.value}"`).join('\n'));
    }
    lines.push('');
  }

  if (r.missingCodeRefs.length) {
    lines.push(`---- [missingCodeRef] 代碼引用但 locale 不存在的 key（會渲染 fallback / 裸 key）(${r.missingCodeRefs.length}) ----`);
    lines.push(r.missingCodeRefs.map((x) => `      - ${x.key}   (${x.file})`).join('\n'));
    lines.push('');
  }

  if (r.englishCopy.cjk.length) {
    lines.push(`---- [enCjk] en 值內混入 CJK 字符（Playbook §2.1/§6.8）(${r.englishCopy.cjk.length}) ----`);
    lines.push(r.englishCopy.cjk.map((x) => `      - ${x.key}  =  "${x.value.slice(0, 80)}"`).join('\n'));
    lines.push('');
  }
  if (r.englishCopy.pleaseEnter.length) {
    lines.push(`---- [enPleaseEnter] "Please enter…" 翻譯腔（Playbook §2.13）(${r.englishCopy.pleaseEnter.length}) ----`);
    lines.push(r.englishCopy.pleaseEnter.map((x) => `      - ${x.key}  =  "${x.value.slice(0, 80)}"`).join('\n'));
    lines.push('');
  }
  if (r.englishCopy.pluralSuspect.length) {
    lines.push(`---- [enPluralSuspect · warning only] 單複數硬編碼可疑（Playbook §6.4）(${r.englishCopy.pluralSuspect.length}) ----`);
    lines.push(r.englishCopy.pluralSuspect.map((x) => `      - ${x.key}  =  "${x.value.slice(0, 80)}"`).join('\n'));
    lines.push('');
  }
  if (r.staleScriptResidueBaseline.length) {
    lines.push(`---- [staleScriptResidueBaseline] scriptResidue 豁免已清償，請移除（只減不增）(${r.staleScriptResidueBaseline.length}) ----`);
    lines.push(r.staleScriptResidueBaseline.map((x) => `      - [${x.locale}] ${x.key}  =  "${x.value}"`).join('\n'));
  }
  if (r.scriptUserFacingCjk.length) {
    lines.push(`---- [scriptUserFacingCjk] .vue <script> 用戶可見 API 硬編碼 CJK 超出基線（JA-KO Plan §D1）(${r.scriptUserFacingCjk.length}) ----`);
    lines.push(r.scriptUserFacingCjk.map((x) => `      - ${x.file}  (${x.count} 行, 基線 ${x.allowed})  e.g. ${x.sample}`).join('\n'));
  }
  if (r.staleScriptCjkBaseline.length) {
    lines.push(`---- [staleScriptCjkBaseline] 棘輪：債務已清償，請調低/刪除基線（只減不增）(${r.staleScriptCjkBaseline.length}) ----`);
    lines.push(r.staleScriptCjkBaseline.map((x) => `      - ${x.file}  基線 ${x.allowed} → 實際 ${x.actual}  (${x.reason})`).join('\n'));
  }
  if (r.templateCjk.length) {
    lines.push(`---- [templateCjk] .vue template 用戶可見硬編碼 CJK 超出基線（Playbook §2.1）(${r.templateCjk.length}) ----`);
    lines.push(r.templateCjk.map((x) => `      - ${x.file}  (${x.count} 行, 基線 ${x.allowed})  e.g. ${x.sample}`).join('\n'));
    lines.push('');
  }

  if (r.scriptResidue.length) {
    lines.push(`---- [scriptResidue] ja/ko 值完全沒有該語言文字＝未翻譯（日語測評 §2.1）(${r.scriptResidue.length}) ----`);
    lines.push(r.scriptResidue.map((x) => `      - [${x.locale}] ${x.key}  =  "${x.value.slice(0, 80)}"`).join('\n'));
    lines.push('');
  }
  if (r.placeholderParity.length) {
    lines.push(`---- [placeholderParity] 佔位符與基準語言不一致（會渲染裸 {n}）（日語測評 §2.2）(${r.placeholderParity.length}) ----`);
    lines.push(r.placeholderParity.map((x) => {
      const d = [x.extra.length ? `多出 ${x.extra.join(',')}` : '', x.missing.length ? `缺少 ${x.missing.join(',')}` : '']
        .filter(Boolean).join(' / ');
      return `      - [${x.locale}] ${x.key}  ${d}\n          base: "${x.base.slice(0, 60)}"\n          ${x.locale}: "${x.value.slice(0, 60)}"`;
    }).join('\n'));
    lines.push('');
  }
  if (r.chineseResidue.length) {
    lines.push(`---- [chineseResidue] ja 值含已知中文直譯詞（日語測評 §2.3）(${r.chineseResidue.length}) ----`);
    lines.push(r.chineseResidue.map((x) => `      - ${x.key}  「${x.term}」  ${x.reason}\n          = "${x.value.slice(0, 70)}"`).join('\n'));
    lines.push('');
  }
  if (r.glossary.length) {
    lines.push(`---- [glossary] ja 術語未用規範譯法（日語測評 §4）(${r.glossary.length}) ----`);
    lines.push(r.glossary.map((x) => `      - ${x.key}  [${x.concept}] 用了「${x.found}」，規範為「${x.canonical}」`).join('\n'));
    lines.push('');
  }

  lines.push('---- summary ----');
  lines.push(`  TOTAL missing: ${r.totals.missing}`);
  lines.push(`  TOTAL empty: ${r.totals.empty}`);
  lines.push(`  TOTAL duplicate: ${r.totals.duplicate}`);
  lines.push(`  TOTAL missingCodeRef: ${r.totals.missingCodeRef}`);
  lines.push(`  TOTAL valueEqKey: ${r.totals.valueEqKey}`);
  lines.push(`  TOTAL enCjk: ${r.totals.enCjk}`);
  lines.push(`  TOTAL enPleaseEnter: ${r.totals.enPleaseEnter}`);
  lines.push(`  TOTAL templateCjk: ${r.totals.templateCjk}`);
  lines.push(`  TOTAL scriptUserFacingCjk: ${r.totals.scriptUserFacingCjk}`);
  lines.push(`  TOTAL staleScriptResidueBaseline: ${r.totals.staleScriptResidueBaseline}`);
  lines.push(`  TOTAL staleScriptCjkBaseline: ${r.totals.staleScriptCjkBaseline}`);
  lines.push(`  TOTAL scriptResidue: ${r.totals.scriptResidue}`);
  lines.push(`  TOTAL placeholderParity: ${r.totals.placeholderParity}`);
  lines.push(`  TOTAL chineseResidue: ${r.totals.chineseResidue}`);
  lines.push(`  TOTAL glossary: ${r.totals.glossary}`);
  lines.push(`  TOTAL enPluralSuspect (warning only): ${r.totals.enPluralSuspect}`);
  lines.push(`  TOTAL suspect (warning only): ${r.totals.suspect}`);
  lines.push('=====================================================');

  const text = lines.join('\n');
  const hardFail =
    r.totals.missing > 0 || r.totals.empty > 0 || r.totals.duplicate > 0 || r.totals.missingCodeRef > 0 ||
    r.totals.enCjk > 0 || r.totals.enPleaseEnter > 0 || r.totals.templateCjk > 0 ||
    r.totals.scriptUserFacingCjk > 0 || r.totals.staleScriptCjkBaseline > 0 ||
    r.totals.staleScriptResidueBaseline > 0 || r.totals.glossary > 0 ||
    // 日語/韓語本土化：三道 hard gate。glossary 目前是報告級（見 checkGlossary 註解）
    r.totals.scriptResidue > 0 || r.totals.placeholderParity > 0 || r.totals.chineseResidue > 0;
  return { text, hardFail, result: r };
}

// CLI 入口
if (require.main === module) {
  const { text, hardFail, result } = report();
  console.log(text);
  if (hardFail) {
    console.error(`\n[i18n-check] FAILED: missing=${result.totals.missing}, empty=${result.totals.empty}, duplicate=${result.totals.duplicate}, missingCodeRef=${result.totals.missingCodeRef}, enCjk=${result.totals.enCjk}, enPleaseEnter=${result.totals.enPleaseEnter}, templateCjk=${result.totals.templateCjk}, scriptUserFacingCjk=${result.totals.scriptUserFacingCjk}, staleScriptCjkBaseline=${result.totals.staleScriptCjkBaseline}, scriptResidue=${result.totals.scriptResidue}, placeholderParity=${result.totals.placeholderParity}, chineseResidue=${result.totals.chineseResidue}`);
    process.exit(1);
  }
  if (result.totals.glossary > 0) {
    console.warn(`\n[i18n-check] WARNING: ${result.totals.glossary} ja glossary deviation(s) (not failing build)`);
  }
  if (result.totals.suspect > 0) {
    console.warn(`\n[i18n-check] WARNING: ${result.totals.suspect} suspected untranslated key(s) (not failing build)`);
  }
  if (result.totals.enPluralSuspect > 0) {
    console.warn(`\n[i18n-check] WARNING: ${result.totals.enPluralSuspect} suspected plural hardcoding(s) in en locale (not failing build)`);
  }
  console.log('\n[i18n-check] OK');
  process.exit(0);
}

module.exports = {
  flatten,
  parseJsonc,
  loadLocale,
  findDuplicateKeys,
  loadDuplicates,
  walkSrc,
  findMissingCodeRefs,
  checkEnglishCopy,
  extractTemplateCjkLines,
  extractScriptUserFacingCjkLines,
  findScriptUserFacingCjk,
  findStaleScriptCjkBaseline,
  findStaleScriptResidueBaseline,
  SCRIPT_USER_FACING_CJK_BASELINE,
  findTemplateCjk,
  analyze,
  report,
  LOCALE_FILES,
  BASE_LOCALE,
  EMPTY_ALLOWLIST,
  EN_CJK_KEY_ALLOWLIST,
  TEMPLATE_CJK_BASELINE,
  // 日語/韓語本土化四道檢查（與 mobile 鏡像）
  checkScriptResidue,
  checkPlaceholderParity,
  checkGlossary,
  checkChineseResidue,
  JA_GLOSSARY,
  GLOSSARY_ALLOWLIST_KEYS,
  JA_CHINESE_RESIDUE_TERMS,
  SCRIPT_RESIDUE_BASELINE,
  PLACEHOLDER_PARITY_BASELINE,
  CHINESE_RESIDUE_BASELINE,
};
