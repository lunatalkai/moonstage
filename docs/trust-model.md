# Trust model: AI-generated HTML cards

*English below · 正體中文在後半*

---

## English

### What this client does

When a character replies, the reply may contain HTML written by the AI. This client
renders that HTML **as-is**: `<script>`, `<style>` and inline event handlers are kept,
and the script runs.

**This is intentional. It is the feature, not a defect.**

The product is called *HTML Card Creator* (華麗版面). Authors design cards whose replies
are interactive: state panels, mini-games, animated scenes, inventory widgets. That is
only possible if the code the AI writes actually executes. A renderer that strips
`<script>`, applies a tag/attribute allowlist, or writes with `textContent` does not make
the feature safer — it deletes the feature.

### The trust boundary

The trusted source is **the model output, constrained by the card the player opened**.
A player opens a card by its ID; the card's author decides what the model is asked to
produce. Rendering that output — including its script — is what "playing the card" means.

Concretely, this client:

- does not strip `<script>` / `<style>` / inline handlers from assistant messages;
- interpolates author-controlled attributes into markup;
- executes author-supplied assets (the `data-lt` contract) inside the chat page.

### What this means for you

- **Only open cards from someone you trust.** A card ID is a capability. Treat one you
  received from a stranger the way you would treat any link from a stranger.
- **Run untrusted cards in a throwaway browser profile**, or on an origin that holds
  nothing else of yours. Everything a page can do, a card can do on that origin.
- **Your access token lives in this origin's `localStorage`.** A card's script runs on
  the same origin and can read it. If you are going to open cards you did not write,
  host this client on an origin you are willing to treat as disposable, and sign out
  when you are done.
- **That token carries the `mcp:card-writer` scope**, the same scope the card-writing
  tools use. A script that reads it can not only chat as you but also edit the cards you
  own. There is no narrower play-only scope yet; until there is, the advice above is the
  mitigation, not a formality.

### Reporting

Reports of the form "the renderer executes AI-authored script — this is XSS" are
**working as designed** and will be closed as such. So are "add a tag allowlist",
"sanitize before `innerHTML`", and "strip handlers".

Reports that are in scope:

- a way for **one card to reach another card's data**, or another user's data;
- a way for a card to reach state outside the chat page's own origin;
- anything that lets a card act with your identity **after** you sign out;
- ordinary bugs in the renderer that break legitimate cards.

---

## 正體中文

### 這個客戶端做了什麼

角色的回覆裡可能有 AI 寫的 HTML。這個客戶端會**原樣渲染**：`<script>`、`<style>`
與行內事件處理器都保留，而且腳本會執行。

**這是設計預期，是功能本身，不是缺陷。**

這條功能的產品名是**華麗版面**（HTML Card Creator）。作者設計的卡片，回覆本身就是可
互動的：狀態面板、小遊戲、有動畫的場景、道具欄。而那只有在 AI 寫出來的程式碼真的跑
起來時才成立。剝掉 `<script>`、套標籤與屬性白名單、改用 `textContent` 寫入，並不會讓
這條功能變安全——那是把這條功能刪掉。

### 信任邊界

被信任的來源是**模型的輸出，而它受玩家打開的那張卡約束**。玩家用卡片編號打開一張卡；
要模型產出什麼，由那張卡的作者決定。把那份輸出（含其中的腳本）渲染出來，就是「玩這
張卡」的意思。

具體來說，這個客戶端：

- 不從 AI 訊息裡剝掉 `<script>` / `<style>` / 行內處理器；
- 會把作者控制的屬性拼進標記；
- 會在聊天頁裡執行作者提供的資產（`data-lt` 契約）。

### 這對你的意義

- **只打開你信任的人給的卡。** 卡片編號就是一把鑰匙。陌生人給的卡，請比照陌生人給的
  連結來對待。
- **用一個可拋棄的瀏覽器設定檔**，或一個沒有放你其他東西的來源，來跑不信任的卡。網頁
  能做的事，卡片在那個來源上都能做。
- **你的存取權杖存在這個來源的 `localStorage` 裡。** 卡片的腳本跑在同一個來源上，讀
  得到它。如果你打算打開別人寫的卡，請把這個客戶端架在一個你願意當成拋棄式的來源上，
  玩完就登出。
- **這個權杖帶的是 `mcp:card-writer` 範圍**，跟寫卡工具用的是同一個。讀到它的腳本不只
  能用你的身分聊天，還能改你名下的卡。目前還沒有只給遊玩用的更窄範圍；在那之前，上面
  那條建議是真正的防線，不是形式。

### 回報

「渲染器會執行 AI 寫的腳本，這是 XSS」這類回報屬於**設計預期**，會依此結案。「加標籤
白名單」「寫進 `innerHTML` 前先消毒」「剝掉處理器」同理。

在範圍內的回報：

- 讓**一張卡讀到另一張卡的資料**，或讀到別的使用者的資料的路徑；
- 讓卡片碰到聊天頁所在來源之外的狀態的路徑；
- 讓卡片在你**登出之後**還能用你的身分行動的路徑；
- 渲染器本身的一般瑕疵——把正常的卡片畫壞了。
