# Moonstage

Moonstage is the open chat stage for LunaTalk character cards: the page where a card is
played. It renders SillyTavern-style and MMD-style cards (regex display rules, author CSS
and scripts, HUD panels, multiple greetings, prologues) and talks only to the public
`/open/v1` API. It hosts no cards and runs no models.

Moonstage is the sibling of [Moonloom](https://github.com/lunatalkai/moonloom): Moonloom
helps authors weave cards, Moonstage is where they are played.

## What is in here

- `src/pages/canvas/` — the chat stage: message rendering, author display rules, panels,
  archives, notepad, model selection.
- `src/pages/login/`, `src/pages/oauth/` — OAuth sign-in against LunaTalk.
- `src/pages/play/` — entry route: open a card by id.
- `docs/open-api-v1.md` — the frozen API contract this client depends on.
- `docs/trust-model.md` — why author-provided HTML, CSS and scripts run as-is.

## Develop

```sh
npm install
npm run dev:h5        # http://localhost:8800, /api proxied to the public API
npm test
npm run build:h5
```

Personal overrides go in `.env.local` (see `.env.example`).

## Status

Early. Expect rough edges: the tree carries uni-app conventions and a five-language locale
set that is larger than the stage needs. Embedding into another site is done through an
iframe so that a card's global styles and scripts stay inside the stage; a small host-side
SDK for that is planned.

## License

Moonstage is released under the [Functional Source License, Version 1.1, ALv2 Future
License](./LICENSE.md) (FSL-1.1-ALv2). You may use, copy, modify, and self-host it for any
purpose except building a competing product. Each version becomes Apache 2.0 two years
after its release.

Two things the licence does not touch:

- **Your content is yours.** Character cards, worldbooks, themes, display rules, styles,
  and scripts that Moonstage renders are content, not derivative works of Moonstage. They
  carry no obligation under this licence.
- **Names and logos are not licensed.** "Moonstage" and "LunaTalk" and their marks stay
  with their owners; the licence covers the code only.

## Contributing

Issues and pull requests are welcome. Read [CONTRIBUTING.md](./CONTRIBUTING.md) first: it
explains which issue template to use (bug, card compatibility, feature), what a pull request
needs to carry, and what will not be merged. Security problems go to
[SECURITY.md](./SECURITY.md).
