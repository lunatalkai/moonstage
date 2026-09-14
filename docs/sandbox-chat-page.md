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
- `canvas.vue`：`applyAuthorAsset` 看到 `pageMode === 'sandbox'` → 進沙箱模式：訊息列表與輸入區
  `v-show=false`，掛 `<iframe>`；既有面板（模型、人設、存檔、確認框）維持為宿主層彈層。
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
- [ ] P1 認得新版卡：Hearthroom 匯入／匯出 `chatVersion`、編輯器「聊天頁版本」；Moonstage 草稿
  `chatPage`；畫布看到 `sandbox` 先顯示「這張卡是新版沙箱寫的，播放器尚未支援」。
- [x] P2 殼：`protocol.ts`、`sdk/`、`render/`、`rules.ts`、`sanitize.ts`、`scope.ts`、
  `vite.sandbox.config.ts`、邊界檢查；測試以本文 §3–§4 為契約（`npm run build:sandbox` → dist-sandbox/）。
- [x] P3a 宿主橋：`canvas-sandbox-host.ts`、`canvas.vue` 沙箱模式、`installMoonStage({ sandbox })`。
- [ ] P3b Hearthroom 子網域路由 + 殼頁 CSP。
- [ ] P4 能力補齊：`saves`（D1）、`message.edit`、主題／視窗事件、切存檔。
- [ ] P5 真機驗證：拿一張真的新版卡在正式站跑，逐事件對照 §3；收尾刪探針卡。

## 8. 測試

- `src/sandbox/__tests__/`：事件順序（冷啟動、送出、串流、晚訂閱）、`sdk` 能力表與錯誤碼、
  `save` key 規則、訊息作用域、淨化清單、規則抽 style/script、協議握手 origin 釘死。
- `src/pages/canvas/__tests__/canvas-sandbox-host.spec.ts`：HudBridge 事件 → 協議訊息、
  `request` → HudHost 動作、origin 不符的訊息被丟掉。
- Hearthroom：匯入 `chatVersion` → `pageMode`、匯出還原、Worker 子網域路由與 CSP 標頭、saves API。
