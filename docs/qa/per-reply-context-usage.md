# Per-reply context usage

Use synthetic data only. Start with two completed assistant replies whose actual
input counts differ (100 and 200), and no token capacity in the model catalogue.

1. Both replies expose Context usage; user messages and greetings do not.
2. Open the first reply. The request includes its chatId, not the latest reply's.
   The panel shows input 100, cached input 20, cache hit 20%, and that turn's total.
3. Open the second reply. Input is 200 and cache hit is 10%; no first-turn values remain.
4. Reload. Both entries and their corresponding diagnostics remain accessible.
5. Select another reply before a delayed request finishes; the old response must
   not replace the selected reply's report.
6. Check a 390 px mobile viewport in Traditional Chinese and English. The panel
   scrolls, text remains readable, and it has no horizontal overflow.
7. A provider without a token capacity gets a details entry, not an invented
   percentage. Legacy providers with a token budget retain their percentage chip.
8. Missing historical usage does not appear as a measured zero. A provider that
   lacks component cost accounting displays only the settled total.

Validation on 2026-09-18: synthetic API fixture + real MoonStage component in Chrome;
first/second reply, reload, Traditional Chinese and English, 390 × 844 mobile.
The delayed response gate and history/terminal persistence are covered by tests.
No production conversation was sent or modified for this UI check.

## Completion without history reload

Regression: the completion handler referenced an undefined `input`, interrupting
turn cleanup. Status normalization also dropped usage during polling or wrapped
operation responses. Usage now survives normalization and is applied once before
the existing terminal cleanup.

Validation on 2026-09-18: the real MoonStage player sent a synthetic message over
a local WebSocket. After the completed operation event, the history endpoint was
deliberately kept pending. Without reloading the page, the latest reply showed its
usage button and opened diagnostics for `fixture-reply`: 200 input tokens, 20 cached
tokens, 10% cache hit. Desktop and 390 × 844 mobile rendering were checked. No
production chat or model was used. Four executable regression cases cover direct
stream, polled and wrapped completion, plus repeated normalization; they failed
before the fix and pass afterward.

This is a player-only projection fix: HTTP/MCP contracts and server metrics are
unchanged. Existing browser error reporting remains the diagnostic signal.
