# 沙箱聊天頁（新版卡）技術設計

作者卡有兩種寫法。**舊頁**：作者的正則規則直接套在我們的聊天畫面上，作者翻 DOM、抄 class、
用 `<script>` 混寫，程式跑在跟畫布同一個 window。**新頁（沙箱）**：整個聊天區交給一個獨立的
殼，殼跑在跨源 iframe 裡，作者靠固定的 `data-chat` 節點、一組 `--chat-*` 變數與一個小 `sdk`
寫；宿主只留外圍（帳號、模型、存檔、人設等面板）。這份文件定義我們怎麼支援第二種，並且
**不動第一種的任何一行路徑**。

對應外部格式：MMD 的 `chatVersion: 1`（六鍵匯出 `chatVersion / pageDepth / statusbar /
beginning / personality / regex_scripts`）。相容目標是「作者拿同一份規則檔來，行為跟原站一致」，
但原站的實作 bug 不是相容目標（見 §6）。

## 1. 分層與邊界

```
伺服器            authorAsset.pageMode ∈ { classic, immersive, sandbox }
                  （作者宣告；空值＝classic；未知值 400）

Moonstage         src/sandbox/          殼：獨立 bundle，不 import 任何宿主模組
                  ├ protocol.ts         宿主 ⇄ 殼 的 postMessage 契約（唯一共用檔，版本號）
                  ├ sdk/                作者看到的 sdk：能力表、事件匯流排、錯誤碼
                  ├ render/             data-chat 骨架、訊息列表、輸入區、舞台、主題變數
                  ├ rules.ts            套規則（重用 utils/display-rule-engine.js）、抽 <style>/<script>
                  ├ sanitize.ts         兩道閘的淨化
                  ├ scope.ts            回呼內 document.querySelector 只看得到當前氣泡
                  ├ debug.ts            sdk.debug 面板
                  └ main.ts             殼進入點（vite.sandbox.config.ts → dist-sandbox/）
                  src/pages/canvas/canvas-sandbox-host.ts
                                        宿主橋：把 HudHost 的資料與動作翻成協議訊息、掛 iframe
                  src/pages/canvas/canvas.vue
                                        pageMode === 'sandbox' 時：藏原生列表與輸入區、掛橋

Hearthroom        匯入／匯出認 chatVersion；編輯器「聊天頁版本」選項
                  Worker：*.hearthroom.club/* 路由，c<roleId>.hearthroom.club 出殼頁（自帶 CSP）
                  存檔 save.* 落 D1（StageHost.saves 能力）
```

分離性是機制不是約定：

- 殼的 bundle 由 `scripts/check-sandbox-boundary.mjs` 掃描，出現 oauth／請求層／token／
  `/open/v1` 任何一樣就 build 失敗。殼**不發任何請求**，所有資料由宿主用 postMessage 餵。
- 宿主橋只接 `HudHost`（`canvas-hud-bridge.ts` 已有的純資料/動作介面），不長第三套宿主函式。
- 協議型別只在 `protocol.ts` 定義一次，兩端都 import 它；改契約 = 改版本號 + 兩端測試。
- 殼裡收到的第一則訊息釘死 `event.source === window.parent` 與其 origin；宿主端每則訊息都核
  `event.origin === 預期的沙箱 origin`。開發環境可用不透明 origin（`sandbox="allow-scripts"`
  不給 `allow-same-origin`，origin 為 `null`），正式站用子網域。

## 2. 協議（宿主 ⇄ 殼）

單一 `MessageChannel` 不用；直接 `postMessage` 物件 `{ ms: 1, type, ...payload }`。`ms` 是協議版本。

宿主 → 殼：

| type | 內容 | 時機 |
|---|---|---|
| `hello` | `config`：主題、語系、巨集（`{{user}}`／`{{char}}` 的值）、卡（`rules`、`statusbar`、`pageMode`）、能力旗標（`saves`、`edit`）、視窗高度 | 殼送 `ready-shell` 後一次 |
| `messages` | 全量訊息列表 `[{id, role, content, serverId}]` | 開場、切存檔、重載 |
| `message.new` | 一則新氣泡 `{id, role, content, serverId}` | 玩家送出、AI 開始回 |
| `message.stream` | `{id, content}` 累積內容 | 串流中 |
| `message.done` | `{id, content, serverId}` | 該則定稿 |
| `message.remove` | `{id}` | 刪除／重跑覆蓋 |
| `generation` | `{ busy: boolean }` | 生成開始／結束 |
| `input` | `{ value }` | 宿主改了輸入框（例如快捷語） |
| `reply` | `{ reqId, ok, value?, error? }` | 回應殼發出的請求（send／edit／saves） |
| `theme` | `{ theme: 'dark' \| 'light' }` | 使用者切主題 |
| `viewport` | `{ height }` | 視窗變動（鍵盤彈出） |
| `conversation.switch` | — | 切存檔：殼清氣泡、關舞台、清補發記錄，之後宿主再送 `messages` |
| `back` | — | 宿主的返回：舞台開著殼先關舞台並回 `back-handled: true`；否則回 false 由宿主導頁 |
| `dispose` | — | 離開頁面 |

殼 → 宿主：

| type | 內容 |
|---|---|
| `ready-shell` | 殼載好，要 `hello` |
| `ready` | 作者腳本已跑、`ready` 事件已發 |
| `request` | `{ reqId, op, args }`，op ∈ `message.send`／`message.edit`／`save.set`／`save.remove`（`save.get`／`keys` 讀殼內預載的副本，不經宿主） |
| `input` | `{ value }` 殼內輸入框變了（宿主鏡射，讓草稿跨頁保留） |
| `action` | `{ name }`：`back`／`more`／`open-model`／`open-persona`／`open-archives`／`stop`／`regenerate` |
| `stage` | `{ state: 'closed' \| 'content' \| 'full' }` 舞台狀態 |
| `composer` | `{ visible }` 作者開關了底部輸入區 |
| `back-handled` | `{ handled }` 回應宿主的 `back` |
| `debug` | `{ level, args }` 轉給宿主 console |

訊息 `id` 由宿主決定，形如 `l1`、`l2`…遞增；`serverId` 只在 AI 訊息定稿後有值，玩家訊息永遠 `null`。

## 3. `sdk` 契約（殼內作者看到的）

11 個鍵、30 個能力，全部**從第一版就存在**（作者腳本在頂層探測它們），每個能力有實作狀態：

| 能力 | 狀態 | 備註 |
|---|---|---|
| `input.get/set/add/insert/clear/focus/blur/getCursor/setCursor` | 實作 | 對殼內 `[data-chat="input"]` |
| `composer.show/hide/visible` | 實作 | `hide` 後 `visible()` 為 false；`data-composer` 屬性同步（比原站更一致） |
| `message.send(text)` | 實作 | 非手勢呼叫 → 殼內問「允許腳本發送訊息？」，拒絕回 `UNAUTHORIZED`；手勢直接送 |
| `message.edit(id, text)` | 分階段 | 宿主沒宣告 `edit` 能力時 `HOST_DENIED`；`id` 是氣泡上的 `data-msg-id`（＝載荷的 `serverId`） |
| `cache.get/set/remove` | 實作 | 殼內記憶體，換頁即失 |
| `save.get/set/remove/keys` | 分階段 | 宿主沒宣告 `saves` 能力時 `HOST_DENIED`；key 只許 `[A-Za-z0-9_-]{1,64}`，否則 `INVALID_ARGS`；最多 10 個 key、單值 64 KB |
| `stage.open(mode)/close/el/visible` | 實作 | `content`（蓋訊息區，z 2000）／`full`（整屏，z 3000）；`el()` 關著也回節點，開關只看 `visible()`；作者自己 `close()` 不發 `stage:close` |
| `role.get()` / `user.get()` | 實作 | 來自 `hello.config.role/user`，欄位封閉：`{name, avatarUrl}`／`{nickname, avatarUrl}` |
| `on(event, fn)` | 實作 | 見事件表 |
| `debug.log(...)` | 實作 | 殼內面板 + 轉宿主 console |
| `version` | `'1'` | |

錯誤碼：`UNAUTHORIZED`、`RATE_LIMITED`、`INVALID_ARGS`、`HOST_DENIED`、`NETWORK`、`NOT_SUPPORTED`、`BUSY`
（另有 `UNKNOWN_CAPABILITY` 備用）。非同步能力回 Promise；同步能力直接 throw `SdkError`——
`save.get/keys` 在存檔尚未載入時同步丟 `HOST_DENIED`（跟原站一致，作者會用 try）。
限頻（60 秒窗）：`save.set` 20、`message.send` 手勢 3／自動 3、`message.edit` 10 → `RATE_LIMITED`。

事件（12）：`ready`、`message:new`、`message:done`、`message:stream`、`message:mount`、`message:unmount`、
`input:change`、`conversation:switch`、`theme:change`、`back`、`stage:close`、`dispose`。

順序與補發規則（作者腳本依賴這些）：

- 作者腳本在 DOM 建好**之前**執行；`this === window`、非嚴格模式、`document.currentScript` 為 null。
- 冷啟動：對每則已存在的訊息 `message:new → message:mount → message:done`，最後 `ready`。
- `ready` 只發一次、**不補發**；`message:mount`／`message:done` 對晚訂閱者補發（所有已掛氣泡）。
- 載荷單一實參 `{id, role, content, serverId}`；`message:stream` 只有 `{id, role, content}`；
  `input:change` 是字串。
- 回呼內 `document.querySelector` 只看得到**當前氣泡**的內容；回呼外看不到任何氣泡內容（`scope.ts`）。
- 一則訊息只發一次 `message:done`，且帶定稿內容——原站會在串流前多發一次空內容的 `done`，
  那是它的 bug，作者已各自防禦；我們**不複製**，免得平台繼承它。

## 4. 渲染契約

節點：`style:author-css`、`div:root[data-theme][data-composer]`、`header:header`（`header-back`、
`header-title`、`header-actions`）、`main:messages > div:list > div:message-frame > article:message
[data-from][data-state][data-msg-id] > message-avatar / message-body`、`div:list-spacer`、
`div:author-stage[data-stage]`、`footer:composer`（`shortcut`、`instruction-bar`、`assistant`、
`textarea:input`、`model-chip`、`send`）。插槽：`header-extra`、`statusbar`、`left`、`right`、`toolbar`。

變數：29 個 `--chat-*` 定義在 `[data-theme="dark"]`／`[data-theme="light"]`；`--rpx: calc(100vw / 750)`；
`--chat-viewport-height` 由宿主 `viewport` 訊息維護。

z-index：平台節點一律 `auto`；舞台 content 2000、full 3000；平台彈層 8000+；作者安全帶 3500–7999。

規則：重用 `display-rule-engine.js`（同一份預算／回滾邏輯）；套完後把 `<style>` 收進 `author-css`、
`<script>` 收成一段在 DOM 前執行；正文過 Markdown（`*x*` → `<em>`，四空格不當程式碼塊）；
`{{user}}`／`{{char}}` 用宿主給的巨集；對白引號包 `<font color="#DC8333">`。

淨化（`sanitize.ts`）：第一道剝 `iframe`／`form`／`object`／`embed`／`base`／`meta`（子節點保留）、
`data-*`／`aria-*`／`role` 屬性、`svg` 內的事件屬性；第二道由殼的 CSP 兜底
（`connect-src 'self'`、`frame-src 'none'`、`form-action 'none'`、`base-uri 'none'`；
`script-src 'self' 'unsafe-inline' 'unsafe-eval' https:`）。一般元素上的 `onclick` 等**保留**——
作者的互動按鈕就是靠它們，這是功能不是漏洞（見 `trust-model.md`）。

## 5. 宿主側

- `canvas-sandbox-host.ts`：`createSandboxHost({ hud: HudHost, iframe, origin, roleId, hello, saves })`。
  每次 `sync()` 讀一次 `hud.read()` 做差分：新氣泡 `message.new`、內容長了 `message.stream`、
  定稿 `message.done`（一則只一次；已定稿的內容變了＝改寫，換一顆新氣泡）、消失 `message.remove`；
  `generation`／`input` 只在變化時送。殼的 `request` 對應 `hud.sendMessage`／`hud.openEdit`+`submitEdit`／
  `SandboxSavesStore`；`action` 對應既有面板開關；`back` 先問殼（舞台開著殼會關）再導頁。
  只認 `event.source === iframe.contentWindow` 且 origin 相符的訊息；握手逾時（10 秒）顯示提示。
  殼那一側每 500ms 重喊 `ready-shell` 直到 `hello` 到（最多 10 秒），宿主對重複的 `ready-shell` 只回一次 `hello`。
  冷啟動等歷史：握手或切會話後，宿主列表還是空的（歷史在載）或還是切換前那一份時不送全量、也不做差分，
  最多等 `coldStartTimeoutMs`（10 秒，同握手逾時）；歷史一到才送 `messages`，殼收到才發 `ready`——`ready` 最後且不補發的契約靠這個。
  宿主換 id（送出時的暫時 id → 伺服器正式 id）：同位置同角色、內容相同或尚未定稿，追蹤改掛新 id，不發 remove/new。
  `sync()` 每次都先讀 `hud.read()` 再看握手完成沒：宿主用響應式 effect 呼叫它，第一次空手而回 effect 就沒追蹤到任何狀態。
  子網域標籤一律小寫（瀏覽器與 `event.origin` 都是小寫）；宿主頁網址帶 `?sdkDebug=1` 時 `hello.config.debug`
  為真，殼開除錯面板。
- `canvas.vue`：`applyAuthorAsset` 看到 `pageMode === 'sandbox'` → 進沙箱模式：**只有訊息列表**換成 `<iframe>`；
  頁首與輸入區仍是宿主自己的那一套（模型、面板、點數、加號選單跟一般卡完全一樣，`hello.config.chrome = 'host'`，
  殼把自己的頁首與輸入區藏起來）。作者 `sdk.composer.hide/show` → 殼送 `composer` → 宿主藏／顯示自己的輸入區；
  `sdk.stage.open('full')` → 殼送 `stage` → 宿主藏頁首與輸入區、iframe 蓋滿整頁。殼的深淺跟宿主頁（`data-mode`／
  `data-theme`／畫布底色亮度），玩家切換時即時推送 `theme`。
  取捨（2026-09-14 站台管理者裁決）：三種做法——整頁跳到卡片自己的網址（殼要自己拿憑證，隔離反而破功，平台功能全要重做）、
  MMD 式整個聊天頁都在殼裡（平台輸入區得在殼裡再做一套並長期同步）、殼只管訊息區（現行）。選第三種：一套平台 UI、
  隔離相同、作者要的訊息區／狀態欄／舞台都在殼裡；代價是作者無法用樣式改造輸入區與頁首。
  **殼裡的訊息區就是標準播放器的訊息區**（2026-09-14 第二輪）：殼載入 `canvas-message.vue`／`canvas-stage.vue`
  與整份 `canvas.css`（同一個 `@layer lt-base`），每則訊息的 HTML 由宿主用一般卡的渲染管線算好（`hud.read()` 的
  `view`，含名字、頭像、可重生成、上下文用量、思考過程…）送進殼；三個點選單、動作列、開場白切換由殼發 `message.ui`
  交宿主執行（選單開在宿主那一層，座標加上 iframe 位移）。一般卡與沙箱卡的訊息區長得一模一樣，作者對標準結構
  （`.mes`、`.mes_text`…）寫的美化兩邊都套得上；MMD 契約的 `data-chat` 節點名掛在同一批節點上（元件的 `chat` 屬性）。
  宿主的 `--lt-canvas-*` 變數隨 hello 與 theme 推送進殼。正文裡的 `<script>` 照一般卡的信任模型在氣泡掛上後跑一次。
  舊頁路徑（規則引擎、author scope、HUD 橋）在沙箱模式下**不啟動**。
- 殼在哪裡由 `installMoonStage({ sandbox: { shellUrl(roleId), origin(roleId), saves? } })` 決定
  （`src/host/sandbox-host.ts`）；沒給就用不透明 origin 載同源的 `/sandbox/index.html`
  （iframe 不給 allow-same-origin，origin 為 'null'）。
- 試玩草稿（`author-draft.ts`）加 `chatPage: 'classic' | 'sandbox'`，匯入 `chatVersion: 1` 時設；
  `draftToAuthorAsset` 輸出 `pageMode: 'sandbox'`。不鎖「首次儲存後不可改」——作者改錯可以改回來。

## 6. 相容目標與明確不做

做到跟原站一致：事件順序、補發規則、載荷形狀、訊息作用域、`save` 的 key 規則與早期 `HOST_DENIED`、
非手勢 `message.send` 的授權提示、淨化清單、Markdown 行為、CSP 形狀。

明確不做：串流前的空內容 `message:done`（原站 bug）；原站的 `<abc_vars>` 狀態變數子系統（契約未公布，
等有公開契約再接）；訊息列表虛擬化（先全量渲染，長對話再做）。生成中的 `message.send` 回 `BUSY`——
照官方契約，不照原站實際的「先問授權」（作者的程式碼是對著契約寫的）。

## 7. 階段與進度

- [x] P0 伺服器：`pageMode` 接受 `sandbox`（正規化、往返測試、回包）。
- [x] P1 認得新版卡：Hearthroom 匯入／匯出 `chatVersion`、編輯器「聊天頁版本」；Moonstage 草稿
  `chatPage`；畫布看到 `sandbox` 先顯示「這張卡是新版沙箱寫的，播放器尚未支援」。
- [x] P2 殼（產物是傳統 `<script defer>` + 無 crossorigin 的 `<link>`：不透明源下 module script 走 CORS 會被資源層擋；
  `check-sandbox-boundary` 量產物守這條）：`protocol.ts`、`sdk/`、`render/`、`rules.ts`、`sanitize.ts`、`scope.ts`、
  `vite.sandbox.config.ts`、邊界檢查；測試以本文 §3–§4 為契約（`npm run build:sandbox` → dist-sandbox/）。
- [x] P3a 宿主橋：`canvas-sandbox-host.ts`、`canvas.vue` 沙箱模式、`installMoonStage({ sandbox })`。
- [x] P3b Hearthroom 子網域路由 + 殼頁 CSP（`src/sandbox.ts`；DNS 萬用記錄由站台管理者加）。
- [x] P4a `saves`（Hearthroom D1：`card_saves`，`/v1/me/cards/:roleId/saves`）、`message.edit`
  （`hud.openEdit` + `submitEdit`）、切存檔（`conversation.switch`）。
- [ ] P4b 視窗高度的即時推送（主題已做）；訊息列表虛擬化；
  作者 HTML 裡的 `<a href>`：殼沒有 allow-popups，點了會把 iframe 自己導走、對話就死了——殼要攔下錨點點擊，
  改送 `action: open-url` 讓宿主 `window.open`。
- [x] P5a 本機端到端（wrangler dev + 探針卡 + headless Chrome）：冷啟動 `greeting`/`h<id>` 各 new→mount→done、`ready` 最後；
  送出 user new → ai new(pending) → stream → done → generation false；淨化（data-*/aria/role/svg on*/iframe/form/中文尖括號）、
  save/cache/stage/input 能力、`?sdkDebug=1` 面板、CSP 擋外連，全部對上 §3–§4。抓到並修掉的：module script 在不透明源被 CORS 擋、
  傳統 script 未 defer、握手前 sync 沒追蹤到狀態、`ready` 早於歷史、暫時 id 換正式 id 被當成 remove+new、定稿訊息重複 mount。
- [x] P5b 正式站子網域驗證（2026-09-14）：DNS 萬用記錄（`* AAAA 100::` Proxied）已建；探針卡在 `c<roleId>.hearthroom.club`
  跑完同一套（allow-same-origin、localStorage 可用、存檔落正式 D1、送出串流定稿），探針卡與存檔已刪。
  站台管理者裁決沙箱網域先維持二級（`c<roleId>.hearthroom.club`）；改三級或獨立網域需付費憑證或另買網域，之後再議。

## 8. 測試

- `src/sandbox/__tests__/`：事件順序（冷啟動、送出、串流、晚訂閱）、`sdk` 能力表與錯誤碼、
  `save` key 規則、訊息作用域、淨化清單、規則抽 style/script、協議握手 origin 釘死。
- `src/pages/canvas/__tests__/canvas-sandbox-host.spec.ts`：HudBridge 事件 → 協議訊息、
  `request` → HudHost 動作、origin 不符的訊息被丟掉。
- Hearthroom：匯入 `chatVersion` → `pageMode`、匯出還原、Worker 子網域路由與 CSP 標頭、saves API。
