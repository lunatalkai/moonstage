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
| GET | `/worldbook/entry/list` | worldbook entries |

Player preference is **merge**, not replace: keys you do not send are left alone. That is
what makes it safe for an older client to write next to a newer one.

Two lists on `/role/detail` look alike and are not:

| Field | What it is | What a client does with it |
|---|---|---|
| `welcomeAlternates: string[]` | alternate first messages **from the character** (tavern `alternate_greetings`) | let the player pick one before the first turn, then send `greetingIndex` (0 = `roleWelcome`, 1..n) to `/conversation/start` |
| `prologue: string[]` | suggested first lines **for the player** to say | show them as a "choose an opening" block; picking one fills the player's input box — the player sends it. Never pass it to `/conversation/start` |

Either list may be empty, and an older server omits both. Treat a missing field as an empty list.

Anything not on this list is not part of the contract. Card authoring, moderation,
payments, analytics and account management are never coming to v1.

Rewinding the story (backward) is reachable from the message menu — long-press a
message on a touch device, or open the "…" on a pointer device, then pick "rewind to
here". It asks once before dropping everything after that message. A third-party
deployment pointing at an older server can turn the call off with `BACKWARD_AVAILABLE`
in the canvas page; the entry then says it is unavailable instead of hanging.

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
