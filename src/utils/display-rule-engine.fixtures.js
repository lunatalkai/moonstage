/**
 * 顯示層替換引擎的共用測試夾具。
 *
 * 這份檔案在 desktop 與 mobile **必須逐位元組相同**，由
 * 雙端等價檢查擋著。兩端的測試框架不同
 * （vitest / jest），但案例只有這一份——否則兩端會像 rich-text-renderer.js 那樣
 * 各自漂移，而漂移的那一天沒有任何測試會紅。
 *
 * 語法刻意與競品同形，讓作者的既有規則能直接搬過來。
 */

const R = (find, replace, extra) =>
  Object.assign({ id: 'r', name: '', find, replace, enabled: true }, extra || {})

/** 每個案例：輸入文字 + 規則集 → 期望輸出（或期望的回滾原因）。 */
const APPLY_CASES = [
  // ---- 匹配式形態 ----
  {
    name: 'slash 形態當正則',
    text: '血量: 84',
    rules: [R('/血量: (\\d+)/', '<b>$1</b>')],
    expect: '<b>84</b>',
  },
  {
    name: '裸字面量按字面比對，元字元不當正則',
    text: 'a.b axb',
    rules: [R('a.b', 'X')],
    expect: 'X axb',
  },
  {
    name: '首尾反引號自動剝掉',
    text: '血量: 84',
    rules: [R('`/血量: (\\d+)/`', '<b>$1</b>')],
    expect: '<b>84</b>',
  },
  {
    name: '缺 g 旗標自動補上，全文都換',
    text: 'x x x',
    rules: [R('/x/', 'y')],
    expect: 'y y y',
  },
  {
    name: '裸字面量也是全文替換',
    text: 'x x x',
    rules: [R('x', 'y')],
    expect: 'y y y',
  },
  {
    name: '不合法旗標不採用，但規則仍當正則跑',
    text: 'AB ab',
    rules: [R('/ab/iz', 'X')],
    expect: 'X X',
  },

  // ---- 替換內容 ----
  {
    name: '$1 取第一個捕獲組',
    text: '【地點】咖啡館【/地點】',
    rules: [R('/【地點】(.*?)【\\/地點】/', '<span>📍 $1</span>')],
    expect: '<span>📍 咖啡館</span>',
  },
  {
    name: '$欄位名 取鍵值表的值',
    text: '【狀態】hp::85;;mood::害羞【/狀態】',
    rules: [R('/【狀態】(.*?)【\\/狀態】/', '❤️$hp 😊$mood')],
    expect: '❤️85 😊害羞',
  },
  {
    name: '鍵值表缺 ;; 時不解析欄位名',
    text: '【狀態】hp::85【/狀態】',
    rules: [R('/【狀態】(.*?)【\\/狀態】/', '❤️$hp')],
    expect: '❤️$hp',
  },
  {
    name: '取不到的欄位名原樣保留，不變成 undefined',
    text: '【狀態】hp::85;;mood::害羞【/狀態】',
    rules: [R('/【狀態】(.*?)【\\/狀態】/', '$hp/$gold')],
    expect: '85/$gold',
  },
  {
    name: '替換留空＝隱藏',
    text: '前【系統】內部【/系統】後',
    rules: [R('/【系統】[\\s\\S]*?【\\/系統】/', '')],
    expect: '前後',
  },
  {
    name: '停用的規則不套用',
    text: 'x',
    rules: [R('/x/', 'y', { enabled: false })],
    expect: 'x',
  },
  {
    name: '規則按順序串接：後一條吃前一條的產物',
    text: 'A',
    rules: [R('/A/', 'B'), R('/B/', 'C')],
    expect: 'C',
  },

  // ---- 回滾 ----
  {
    name: '正則語法錯：整條丟棄，不降級成字面量',
    text: '(unclosed',
    rules: [R('/(/', 'X')],
    expect: '(unclosed',
    rollbacks: ['bad_regex'],
  },
  {
    name: '可匹配空字串：整條回滾，不是每個字元都插一次',
    text: 'abc',
    rules: [R('/x*/', 'Y')],
    expect: 'abc',
    rollbacks: ['empty_match'],
  },
  {
    name: '單條替換內容自身超預算：整條回滾',
    text: 'x',
    rules: [R('/x/', 'B'.repeat(262145))],
    expect: 'x',
    rollbacks: ['replacement_alone'],
  },
  {
    name: '命中次數 × 每次產出累計超預算：整條回滾',
    // 3000 次命中 × 每次 100 字 = 300000 > 262144（輸入短，預算取下限）
    text: 'z'.repeat(3000),
    rules: [R('/z/', 'Q'.repeat(100))],
    expect: 'z'.repeat(3000),
    rollbacks: ['volume'],
  },
  {
    name: '一條回滾不影響其他條',
    text: 'A z',
    rules: [R('/(/', 'X'), R('/A/', 'B')],
    expect: 'B z',
    rollbacks: ['bad_regex'],
  },
  {
    name: '空規則集是 no-op',
    text: '原文',
    rules: [],
    expect: '原文',
  },
]

/** {{random:...}} 的案例單獨列：需要注入決定性的挑選函式。 */
const RANDOM_CASES = [
  {
    name: '{{random}} 從選項中挑一個',
    text: 'x',
    rules: [R('/x/', '{{random:甲::乙::丙}}')],
    pick: (options) => options[1],
    expect: '乙',
  },
  {
    name: '{{random}} 丟棄空項並 trim',
    text: 'x',
    rules: [R('/x/', '{{random: 甲 :: :: 丙 }}')],
    pick: (options) => options.join('|'),
    expect: '甲|丙',
  },
  {
    name: '{{random}} 可與 $1 併用',
    text: '【場景】書房【/場景】',
    rules: [R('/【場景】(.*?)【\\/場景】/', '$1 · {{random:晴::雨}}')],
    pick: (options) => options[0],
    expect: '書房 · 晴',
  },
]

/** 可匹配空字串的匹配式——編輯器儲存前就該擋掉，不留到執行期。 */
const EMPTY_MATCH_PATTERNS = ['/x*/', '/(\\d*)/', '/[abc]?/', '/(?:x)?/', '/a|/']

/** 這些不會匹配空字串，不能誤殺。 */
const NON_EMPTY_MATCH_PATTERNS = ['/x+/', '/【狀態】(.*?)【\\/狀態】/', '/(?!)/', 'plain-literal']

/**
 * 可能跨行匹配的規則。
 *
 * 串流渲染快取把內容切在空行之後，只重算尾段。一條無法跨行的規則不可能跨越那個
 * 邊界，所以「切開各自套規則」與「整段套規則」結果相同，快取仍然成立。
 * 會跨行的規則沒有這個保證——碰到就得放棄快取，跟既有那幾條跨段 bail-out 同一類。
 */
const CROSS_LINE_FINDS = [
  '/【狀態】[\\s\\S]*?【\\/狀態】/',
  '/a[\\S\\s]b/',
  '/開始.*?結束/s',
  '/第一行\\n第二行/',
]

const SINGLE_LINE_FINDS = [
  '/【狀態】(.*?)【\\/狀態】/',
  '/血量: (\\d+)/',
  '/x+/gi',
  'plain-literal',
  '',
]

export {
  APPLY_CASES,
  RANDOM_CASES,
  EMPTY_MATCH_PATTERNS,
  NON_EMPTY_MATCH_PATTERNS,
  CROSS_LINE_FINDS,
  SINGLE_LINE_FINDS,
}
