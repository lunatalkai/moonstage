<!-- Keep one topic per pull request. Link the issue it closes, if any. -->

## What changed

<!-- One or two sentences. What does the stage do differently after this? -->

## Why

<!-- The problem this solves, or the issue number. -->

Closes #

## How I verified it

- [ ] `npm test` passes
- [ ] `npm run i18n:check` passes (copy exists in all five locales)
- [ ] `npm run build:h5` passes
- [ ] Tried it in a browser on desktop width
- [ ] Tried it in a browser on phone width

Cards I tried it with (name or type is enough, e.g. "an MMD card with a HUD",
"a SillyTavern card with regex scripts"):

-

## Screenshots

<!-- Before / after if anything visible changed. Remove this section otherwise. -->

## Checklist

- [ ] I did not add sandboxing, sanitising, or stripping of author HTML/CSS/scripts
- [ ] I did not hard-code model or provider names
- [ ] The client still talks only to the public `/open/v1` API and OAuth
- [ ] If I touched the DOM that cards target, `canvas-dom-contract.ts` and its spec are updated
- [ ] Commits are signed off (`git commit -s`)
