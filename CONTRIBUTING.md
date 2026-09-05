# Contributing to Moonstage

Thanks for helping. Moonstage is the stage where LunaTalk character cards are played, and
most of what makes it better comes from people who play and author cards. This page tells
you how to report a problem, ask for something, and send a change.

## Reporting a problem

Open an issue and pick the template that fits:

- **Bug report** — something in the stage itself misbehaves (layout, sending, sign-in,
  panels, archives).
- **Card compatibility** — a card that renders correctly on its original platform
  (SillyTavern, MMD) looks or behaves differently here. This is the most useful kind of
  report we get; the template asks for the minimum we need to reproduce it.
- **Feature request** — something the stage should be able to do.

Before opening one, search existing issues; add to an existing thread rather than opening a
duplicate. Please keep private material out of issues: no account tokens, no sign-in
codes, no screenshots that show other people's conversations. If a card is private, share
a reduced copy that reproduces the problem rather than the whole card.

Security problems go through [SECURITY.md](./SECURITY.md), not the issue tracker.

## Sending a change

1. **Talk first for anything larger than a fix.** Open an issue describing what you want to
   change and why. It saves you from building something that cannot be merged (for example
   anything that requires a private API, or that breaks a card that works today).
2. **Fork, branch, change.** Keep one topic per pull request.
3. **Keep cards working.** Author CSS and scripts run unsandboxed on purpose (see
   `docs/trust-model.md`). Do not "fix" that. If your change touches the DOM the cards target,
   update `src/pages/canvas/canvas-dom-contract.ts` and its spec.
4. **Run the checks locally** before pushing:

   ```sh
   npm test
   npm run i18n:check
   npm run build:h5
   ```

   User-visible copy needs all five locales (`src/locale/*.json`); the i18n check fails on a
   missing key.
5. **Fill in the pull request template.** It asks what changed, why, how you verified it,
   and which cards you tried it with. A short description is fine; an empty one will be sent
   back.
6. **Sign your commits** with `git commit -s` (the Developer Certificate of Origin). A
   contributor licence agreement is being finalised and will be required before merge; until
   it is in place, maintainers may ask you to confirm the terms in the pull request thread.

Continuous integration runs the same checks. A pull request needs a green build and one
maintainer review to merge. Reviews happen in batches, so expect a few days.

## What we will not merge

- Changes that make Moonstage depend on private or undocumented endpoints. The client speaks
  only the public `/open/v1` API and OAuth; see `docs/open-api-v1.md`.
- Sandboxing, sanitising, or stripping author HTML, CSS, or scripts.
- Hard-coded model names or provider lists. Models come from the catalogue the server
  serves.
- Anything that embeds credentials, personal data, or production content.

## Style

Follow what is already in the file you are editing. Comments explain why, not what. Keep
new dependencies to a minimum and note their licences in `THIRD-PARTY-NOTICES.md`.

## Licence

By contributing you agree that your contribution is licensed under the same terms as the
project, the [Functional Source License, Version 1.1, ALv2 Future License](./LICENSE.md).
