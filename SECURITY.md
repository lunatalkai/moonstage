# Security

If you find a vulnerability in Moonstage, email **opensource@lunatalk.ai** rather than
opening a public issue. Include what you found, how to reproduce it, and what you think the
impact is. We will acknowledge within a few working days.

Two things are by design and are not vulnerabilities:

- Author-provided HTML, CSS, and scripts run unsandboxed inside the stage. That is how cards
  work; see `docs/trust-model.md`.
- The OAuth access token is kept in browser storage so the stage can call the API on your
  behalf. Its scope is described in `docs/trust-model.md`.

Problems in the LunaTalk service itself (the API behind the stage) should also go to the
address above; we will route them.
