# Open API v1

The contract this client speaks. Frozen: paths and payload shapes do not change under
`/open/v1`. New server-side events must be ignorable by an existing client.

Base path: `${API_ORIGIN}/open/v1`

## Identity

Every HTTP request carries:

| Header | Value |
|---|---|
| `Authorization` | `Bearer <access token>` |
| `language` | one of `zh-Hant` `zh-Hans` `en` `ja` `ko` |
| `from` | `web` (optional) |

No cookies. No site key. No account identifier of any kind. Responses never contain the
internal account UUID; the public numeric id is what you get.

### Getting a token: authorization code + PKCE (S256)

**1. Register once per origin.**

```http
POST ${API_ORIGIN}/oauth/register
Content-Type: application/json

{
  "client_name": "LunaTalk Open Chat",
  "redirect_uris": ["<origin>/pages/oauth/callback"],
  "grant_types": ["authorization_code", "refresh_token"]
}
```

→ `201 { "client_id": "...", ... }`. Persist `client_id` locally, keyed by origin.

The redirect URI must not contain a fragment — the server rejects it. This client runs
in history routing mode for exactly that reason. `http://localhost` and loopback IPs are
accepted for local development; everything else must be `https`.

**2. Send the browser to the authorization endpoint.**

```
${API_ORIGIN}/oauth/authorize
  ?response_type=code
  &client_id=…
  &redirect_uri=…
  &scope=mcp:card-writer
  &resource=https://api.lunatalk.ai/open/v1
  &state=…
  &code_challenge=…            (base64url of SHA-256 of the verifier)
  &code_challenge_method=S256
```

The server redirects to the LunaTalk sign-in and consent page, and finally back to
`redirect_uri` with `?code=…&state=…`.

**3. Exchange the code.**

```http
POST ${API_ORIGIN}/oauth/token
Content-Type: application/x-www-form-urlencoded

grant_type=authorization_code&code=…&client_id=…&redirect_uri=…
&code_verifier=…&resource=https://api.lunatalk.ai/open/v1
```

→ `{ "access_token": "...", "token_type": "Bearer", "expires_in": 3600,
"refresh_token": "...", "resource": "https://api.lunatalk.ai/open/v1" }`

Refresh with `grant_type=refresh_token&refresh_token=…&client_id=…&resource=…`.

> `resource` is always the literal string `https://api.lunatalk.ai/open/v1`, whichever
> API origin you actually talk to. It names what the token is for, not where the request
> goes. A token bound to a different resource is rejected by v1.

On any `401` from v1: refresh once; if that fails, discard the tokens and start the
authorization flow again.

## Endpoints

Same request and response shapes as the corresponding main-site endpoints — only the
path and the identity differ.

### Conversation loop

| Method | Path | Purpose |
|---|---|---|
| POST | `/conversation/start` | open (or resume) a conversation for a card |
| POST | `/conversation/stop` | user stop for the running turn |
| POST | `/conversation/rewrite` | rewrite by content |
| POST | `/conversation/rewrite-by-id` | rewrite one message by id |
| GET | `/conversation/operations` | authoritative status of recent operations |
| GET | `/conversation/operations/:operationId` | one operation's status |
| GET | `/conversation/replay` | latest reply for a conversation |
| GET | `/conversation/messages` | message history (paged) |
| GET | `/conversation/list` | the player's conversations |
| POST | `/conversation/delete` | delete a conversation — `{ conversationId }` |
| POST | `/conversation/delete-message` | delete one message — `{ conversationId, chatId }` |
| POST | `/conversation/save-and-start-new` | archive and open a fresh conversation. `409 conversation_limit_reached` (`{ limit, count }`) when the card already has 20 saves — nothing is deleted for you |
| POST | `/conversation/backward` | rewind the story to an earlier message |
| GET | `/conversation/archives` | the player's saves **for one card** — `?roleId=` → `{ archives: [{ conversationId, title, isCurrent, messageCount, lastMessage, createTime, lastUpdateTime }], count, limit }`. Newest first; the current conversation is included |
| POST | `/conversation/title` | name a save — `{ conversationId, title }` (≤ 100 chars; empty string clears) |
| POST | `/conversation/switch` | make a save the current conversation — `{ conversationId }` → `{ conversationId, title?, messageCount }`. Nothing is deleted; reload messages afterwards |
| POST | `/conversation/fork` | branch from the latest message — `{ conversationId, title? }` → `{ conversationId, sourceConversationId, messageCount }`. The source stays as a save; the new conversation carries the same messages (summaries and memory start fresh). `409 conversation_limit_reached` at 20 saves |
| POST | `/conversation/ws-ticket` | one-time ticket for the stream |
| POST | `/conversation/suggest-reply` | AI drafts the player's next line — `{ conversationId, regenerate? }` → `{ reply, cost, cached }`. Put it in the input box; the player sends it. The draft for the current turn is kept: calling again without `regenerate` returns the same line with `cost: 0, cached: true`; `regenerate: true` writes a new one and charges again. The turn changes when a new message lands. Flat cost, charged only on success; `402 insufficient_credits` when the account cannot pay. Older clients that omit `regenerate` and ignore `cached` keep working |

### Reading what a card needs

| Method | Path | Purpose |
|---|---|---|
| GET | `/role/detail` | card detail — `?roleId=` |
| GET | `/role/author-asset/serve` | the author's page assets for a card |
| GET | `/player/preference` | per-player **look** settings (font, colours, wallpaper) — `?roleId=` (omit for account scope) |
| POST | `/player/preference/save` | merge-write — `{ roleId, prefs }` |
| GET | `/player/role-settings` | what the player set on this card — `?roleId=`: persona (`userName`, `userSex`, `userDefine`), chosen model/channel (`selectModel`), context tier (`context`), thinking depth, custom jailbreak. **The turn reads these**, not `player/preference` |
| POST | `/player/role-settings/save` | `{ roleId, ...fields }` — send only the fields you change; the rest keep their value. Persona text goes through moderation |
| GET | `/conversation/directives` | standing instructions for a conversation — `?conversationId=` → `{ list, maxCount, maxLength }` |
| POST | `/conversation/directive/add` \| `update` \| `delete` | `{ conversationId, text }` / `{ conversationId, sourceId, text }` / `{ conversationId, sourceId }` |
| GET | `/conversation/notepad` | the player's notepad for a conversation — `?conversationId=` → `{ content, maxLength }` |
| POST | `/conversation/notepad/save` | `{ conversationId, content }` |
| GET | `/notepad/templates` · `/notepad/template?templateId=` | the player's own notepad templates. The list is `{ list, maxCount, maxLength, maxTitle }` and carries no `content` — fetch one template to get its text |
| POST | `/notepad/template/save` · `/notepad/template/delete` | manage them — `{ templateId?, title, content }` / `{ templateId }`. The name field is `title` |
| POST | `/notepad/template/share` · `/notepad/template/share/revoke` | share a template as a code — `{ templateId }` → `{ code, ... }`; revoke turns the code off. A share code is the only way a template moves between players |
| GET | `/share/preview` | what a share code contains before importing — `?code=` → the template's title and text, read-only |
| POST | `/share/import` | copy a shared template into the player's own list — `{ code }` → the new `templateId`. Counts against the player's template limit |
| GET | `/conversation/prompt-diagnostics` | how the last completed reply's context was composed — `?conversationId=` `&breakdownVersion=2` → estimated token buckets (system, card, history, notepad, worldbook recall, memory, input), cache hit rate and this turn's cost. `supported: false` for models without accounting; `status: notReady` until one reply has completed |
| GET | `/conversation/memory/:conversationId/atoms` | the durable memory the AI keeps for a conversation, newest first — `{ atoms: [{ atomId, atomValue, importance, createTime }] }` |
| DELETE | `/conversation/memory/:conversationId/atoms/:atomId` | forget one memory. Cannot be undone; the AI may re-learn it from later turns |
| GET | `/models` | model catalog with pricing tiers — `?contextLevel=` `&roleId=`. Groups → families → variants; a variant is one **channel** of that model. `channelLabel` is the only channel name that may reach a player |
| GET | `/models/uptime-history` | recent availability of one channel — `?model=` `&hours=` |
| GET | `/player/agent-mode` | whether this card runs the deeper multi-step preparation, and whether the chosen model supports it — `?roleId=` `&model=` |
| POST | `/player/agent-mode` | `{ roleId, multiPassEnabled }` |
| POST | `/player/compact-preference` | how the story summary is written for this card — `{ roleId, sections, extraInstruction }` |
| GET | `/worldbook/detail` | worldbook detail |
| GET | `/worldbook/entry/list` | `?worldbookId=…&category?=…` → `{ worldbookId, entries: [{ entryId, name, content, keywords: ["…"], secondaryKeywords: ["…"], category, isEnabled, isConstant, priority, sortOrder, lastUpdateTime, activationCount }] }` — the same entry shape `/worldbook/:worldbookId/document` accepts; keyword fields are always arrays (empty, never null or a JSON string) |

Player preference is **merge**, not replace: keys you do not send are left alone. That is
what makes it safe for an older client to write next to a newer one.

Two lists on `/role/detail` look alike and are not:

| Field | What it is | What a client does with it |
|---|---|---|
| `welcomeAlternates: string[]` | alternate first messages **from the character** (tavern `alternate_greetings`) | let the player pick one before the first turn, then send `greetingIndex` (0 = `roleWelcome`, 1..n) to `/conversation/start` |
| `prologue: string[]` | suggested first lines **for the player** to say | show them as a "choose an opening" block; picking one fills the player's input box — the player sends it. Never pass it to `/conversation/start` |

Either list may be empty, and an older server omits both. Treat a missing field as an empty list.

Anything not on this list is not part of the contract. Moderation, payments, analytics
and account management are not part of v1 and are not planned for it.

Rewinding the story (backward) is reachable from the message menu — long-press a
message on a touch device, or open the "…" on a pointer device, then pick "rewind to
here". It asks once before dropping everything after that message. A third-party
deployment pointing at an older server can turn the call off with `BACKWARD_AVAILABLE`
in the canvas page; the entry then says it is unavailable instead of hanging.

### Authoring a card

A signed-in author can create and edit their own private cards through v1. Every route
runs the same service logic, ownership rules, validation and quotas as the official
card-writer tools; v1 is only the HTTP shape. Cards created here are **private**: the
author can play them by id, nobody else can reach them until they are published and pass
review. Text fields are plain text or Markdown as the card format defines; nothing is
rewritten on the way in.

| Method | Path | Purpose |
|---|---|---|
| POST | `/role` | create an empty private card — `{ roleName, language?, cardType?, contentRatingIntent?, idempotencyKey? }` → `{ roleId, roleVisibility, reviewStatus }` |
| PATCH | `/role/:roleId` | basic profile — `{ roleName?, roleDesc?, roleTag?, userName?, roleDetailDesc? }`; only sent fields change |
| POST | `/role/:roleId/document` | write card text as one document — `{ fields: { roleName?, roleDesc?, roleTag?, userName?, roleType?, roleAvatar?, roleBackground?, roleDetailDesc?, roleWelcome?, talkExample?, roleOutputContract?, jailbreak? } }`. Only the fields you send are written; an absent field is left alone, so an older client never blanks a newer field |
| PATCH | `/role/:roleId/welcome` | opening lines — `{ roleWelcome, alternates?, prologue? }`. `alternates` and `prologue` are full replacements: omit to keep, send `[]` to clear |
| POST | `/role/:roleId/visibility` | `{ visibility: "private" }` — the only value v1 accepts; going public is a publish |
| GET | `/role/validate` | `?roleId=` → the same report the card-writer shows before publishing |
| POST | `/role/:roleId/publish` | submit for review — `{ userConfirmed: true, confirmationSummary }` → `{ roleId, reviewStatus }` |
| POST | `/image/upload` | multipart `file` (+ optional `roleId`) for avatars and backgrounds; same size limit and quota as the site |
| GET | `/worldbook/mine` | the author's worldbooks |
| POST | `/worldbook` | `{ name, description?, iconUrl?, tags?, visibility?, language? }` → `{ worldbookId, name, visibility }` |
| POST | `/worldbook/:worldbookId/document` | metadata, entries and binding as one document — `{ metadata?: { name, description, tags }, entries?: [{ op: "create" \| "update" \| "delete", entryId?, name, content, keywords, category?, isConstant?, isEnabled? }], binding?: { roleId } }` → `{ createdEntryIds, updatedCount, deletedCount, bound }` |
| GET | `/worldbook/bindings` | `?roleId=` → worldbooks bound to a card |

Authoring is for building a card the author intends to keep. For "play this file now"
use trial cards below; they carry their own clean-up.

### Trial cards

A trial card is a throwaway private card the server builds from a file the player holds
locally — an imported tavern card, a worldbook, a set of display rules — so it can be
played with the full server pipeline (worldbook recall, memory, model catalog) without
the player managing anything afterwards. Trial cards **expire** and are removed, with
every conversation, worldbook and display rule they created.

The client names each trial with a **client key** it controls, typically the id of the
local draft. Re-sending the same key updates the same trial instead of creating a second
one; the server hashes every section and writes only what changed. That is what lets an
author edit a file and re-import it thirty times without leaving thirty cards behind.

| Method | Path | Purpose |
|---|---|---|
| PUT | `/trial-cards/:clientKey` | create or update a trial. Body below → trial summary |
| GET | `/trial-cards` | the caller's trials — `{ list: [summary], slots: { used, max }, ttlHours }` |
| GET | `/trial-cards/:clientKey` | one trial summary; `404 trial_not_found` after expiry |
| DELETE | `/trial-cards/:clientKey` | remove now — card, conversations, worldbook, display rules → `{ deleted, released }` |

`clientKey` is 1–64 characters from `A-Z a-z 0-9 _ -`.

**PUT body** — every section is optional; the body is the whole trial, so a section that
is absent is removed from the trial if it existed before:

```json
{
  "name": "Display name for the trial card",
  "card":        { "roleDesc": "…", "roleDetailDesc": "…", "roleAvatar": "https://…", "talkExample": [] },
  "welcome":     { "roleWelcome": "…", "alternates": ["…"], "prologue": ["…"] },
  "worldbook":   { "name": "…", "entries": [ { "name": "…", "content": "…", "keywords": ["…"], "secondaryKeywords": ["…"], "isConstant": false, "isEnabled": true } ] },
  "authorAsset": { "rules": [ { "id": "…", "name": "…", "find": "…", "replace": "…", "enabled": true } ], "mountTrigger": "…", "mountLayer": "under" },
  "evict": false
}
```

- `card` takes the same fields as `/role/:roleId/document`; `roleWelcome` inside it is
  ignored — openings live in `welcome`.
- `worldbook.entries` are the entries in full. The server keys each entry by a hash of
  its content and only creates the new ones and deletes the missing ones; two identical
  entries collapse into one. Disabled entries are not created. `secondaryKeywords` is the
  AND gate (SillyTavern's `selective` + `secondary_keys`): the entry fires only when a main
  keyword and one of these both appear; omit it or send `[]` for no gate.
- `authorAsset` is the display-rule set the canvas applies to AI output (tavern regex
  scripts already filtered to AI-output placement).

**Response**

```json
{
  "clientKey": "draft-8f1c",
  "roleId": "…",
  "created": true,
  "expiresAt": "2026-09-08T14:03:00Z",
  "slots": { "used": 2, "max": 5 },
  "sections": { "card": "sha256:…", "welcome": "sha256:…", "worldbook": "sha256:…", "authorAsset": "" },
  "changed": ["card", "worldbook"],
  "worldbook": { "worldbookId": "…", "entries": 120, "created": 3, "deleted": 1 }
}
```

Play it like any card: `roleId` goes to `/role/detail` and `/conversation/start`.

**Limits and errors**

| Limit | Value |
|---|---|
| trials per account | 5 |
| time to live | 72 hours from the last import or the last message in any of its conversations |
| worldbook entries | 1000 per trial, 3000 characters each |
| display rules | 128 KB replacement text per rule, 1 MB for the whole rule set |
| card text | the same per-language limits as authoring: opening 8000 characters (10000 for English cards), definition 10000 (50000), intro 500 (2500) |
| request body | 4 MB |

| Status | `error` | Meaning |
|---|---|---|
| 400 | `trial_invalid_key` · `trial_invalid_body` | key outside the allowed characters, or a body that is not the shape above; `message` says which |
| 409 | `trial_slots_full` | all slots are taken and this key is new. The body carries `oldest: { clientKey, roleId, lastActiveAt }`; send the same PUT with `"evict": true` to replace it |
| 413 | `trial_payload_too_large` | something is over a limit. `detail: { reason, section, name, index, max, actual, unit }` says exactly what: `reason` ∈ `body`, `name`, `entries`, `entryContent`, `ruleReplace`, `rulesTotal`, `welcome`, `roleDesc`, `roleDetailDesc`; `section` ∈ `body`, `card`, `welcome`, `worldbook`, `authorAsset`; `name`/`index` identify the entry or rule; `unit` ∈ `chars`, `bytes`, `count` |
| 400 | `trial_unsupported` | a value the server does not accept. `detail: { section, field, value, index, name, reason }` — for example `authorAsset.mountLayer` = `"sideways"`, or a rule with no find pattern |
| 404 | `trial_not_found` | no trial with that key for this account — it never existed, was deleted, or expired |
| 503 | `worldbook_unavailable` | the worldbook service is down; the card and rules were not written either |

Every error carries a `message`: one English sentence naming the offending part and the
limit, so a client can show it verbatim when it has no copy of its own.

Expiry is a server-side sweep, so a trial may survive a few minutes past `expiresAt`;
treat the timestamp as a floor.

**Keeping a trial.** A trial card is a real private card, so the authoring routes work
on it. The moment it is submitted for review (`/role/:roleId/publish`) or its visibility
changes, it stops being a trial: it is released from the registry, no longer counts
against the slots, is never expired, and `DELETE` on its key only releases it
(`{ deleted: false, released: true }`) rather than deleting the card. The same applies to
the trial's worldbook: if it has been bound to any other card, expiry and `DELETE` leave
the worldbook in place and only detach it from the trial card.

## Errors

```json
{ "error": "unauthorized|forbidden|not_found|internal",
  "message": "…",
  "retryable": true }
```

`401` means the identity is not usable — refresh, then re-authorize.

## Streaming

A browser cannot put `Authorization` on a WebSocket upgrade, and a token in the query
string ends up in access logs. So the stream authenticates in two steps.

**1. Buy a ticket** (ordinary HTTP, with the Bearer header):

```http
POST /open/v1/conversation/ws-ticket
```

→ `{ "ticket": "...", "expiresIn": 30 }`

The ticket is single-use and expires in 30 seconds. Fetch a fresh one for every
connection, including reconnects and resumes.

**2. Connect and hand it over.**

```
${WS_ORIGIN}/open/v1/conversation/ws?protocolVersion=2
```

Resume variants add either `resumeStreamId=…&lastEventId=…` (exact) or
`mode=tryResume&conversationId=…` (after a page reload).

The **first frame you send must be**:

```json
{ "type": "auth", "ticket": "<ticket>" }
```

The server replies with an SSE-formatted frame:

```
event: ready
data: {"accountBound":true}
```

and only then accepts chat frames. On failure it sends

```
event: error
data: {"code":"unauthorized","retryable":false}
```

and closes. Do not reconnect on that — the ticket was fine, the identity was not.

### Chat frames

Today's protocol version 2 frames, unchanged, with one rule: **never include an account
identifier**. The connection is already bound to an account by the ticket; a payload
field is ignored.

```
C→S   send · rewrite · continue · backward · stop
S→C   streamMeta · thinking · answer · messageMeta · operationStatus
      · done · error · resumeUnavailable · sessionExpired · …
```

Treat unknown `S→C` events as ignorable — that is how the contract stays frozen while
the server keeps moving.

## Language

Send the UI locale in the `language` header on every request. `Accept-Language` is not
consulted.

## Deployment notes (official hosting)

- The official build at `playground.lunatalk.ai` is a static deployment of this repo behind
  a small same-origin proxy.
- The proxy forwards same-origin `/api/*` to `https://api.lunatalk.ai/*` (forwarding
  `Authorization`). All XHR in this client therefore uses the relative `API_BASE`.
- The OAuth **authorize** step is a full-page navigation, not XHR. It must go to the
  absolute API origin (`API_ORIGIN`, derived from `VITE_WS_BASE` or overridden by
  `VITE_API_ORIGIN`): a proxied fetch would follow the server's 302 to the LunaTalk
  login page and return its HTML under `/api/oauth/authorize`, breaking the flow.
- Third-party hosts without a same-origin proxy: set `VITE_API_PROXY_PATH` to your
  proxy path, or point `VITE_API_ORIGIN` / `VITE_WS_BASE` at the API host directly.
