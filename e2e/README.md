# E2E suite — Bugzilla UI + BFF

35 Playwright specs over the running stack: the Express BFF on `:4000` and the
Vite dev server on `:5175`. No mocks — every assertion runs against the real
servers and the real Bugzilla behind them.

```bash
cd backend  && npm run dev          # :4000
cd frontend && npm run dev          # :5175

cd e2e
npm install && npx playwright install chromium

# The suite signs in as two robot accounts that are NOT left on the instance
# between runs — a bug tracker's user list should hold people, not bots.
# Run from the Bugzilla checkout, which is where its Perl modules resolve:
#   cd C:\Bugzilla
#   perl D:\TEST-BENCH-AUTOMATIONS\BUGZILLA-UI\e2e\provision-accounts.pl

npm test                            # all 35
npm run test:security               # @security only
npm run test:visual                 # @visual only
npm run report                      # last HTML report

# Afterwards, take the robot accounts back out again:
#   cd C:\Bugzilla
#   perl D:\TEST-BENCH-AUTOMATIONS\BUGZILLA-UI\e2e\purge-accounts.pl
```

## Layout

```
e2e/
  playwright.config.ts        serial by design — see below
  support/
    env.ts                    URLs, accounts, and the unique-login strategy
    api.ts                    cookie-isolated "devices" over the BFF
    ui.ts                     sign-in, filters, colour helpers
    global-setup.ts           fails fast, with the real cause named
  tests/
    auth-rate-limit.spec.ts   7  composite keying, fixed cooldown, no IP leaks
    auth-sessions.spec.ts     4  3-device cap, LRU eviction, revocation
    ui-theme.spec.ts          4  light theme, incl. the dark-OS tripwire
    ui-browser-column.spec.ts 4  conditional column + its filter
    ui-badges.spec.ts         4  pastel micro-badges, distinguishable axes
    ui-login-errors.spec.ts  12  error copy, sanitisation, field validation, focus, reveal toggle
  SECURITY-CHECKLIST.md       audit items, automated and manual
```

## How rate-limiter state is reset — and why there is no reset endpoint

The limiter keys on `` `${ip}|${email}` ``. Every worker shares the client IP,
so the email is the only half a test controls — and **a fresh random address
gives a bucket that is provably untouched**, with a full budget, that no other
spec can contend with (`uniqueLogin()` in `support/env.ts`). Isolation by
construction, not by cleanup.

Two alternatives were rejected:

- **A `POST /api/test/reset-rate-limit` endpoint.** Resetting in-process memory
  from outside the process needs a route, and a route that clears brute-force
  protection is a route an attacker wants. One misread env guard in one
  deployment and the protection is off with nothing failing to say so. A test
  suite should not require the product to ship a switch that disables its own
  security control.
- **Restarting the BFF between specs.** It works — the state is in memory — but
  it also wipes every session in `MemoryStore`, which is exactly what the LRU
  specs assert on, and signs out any human using the app.

The generated addresses end in `@e2e.invalid` and do not exist in Bugzilla, which
matters for a second reason: **Bugzilla locks real accounts after 5 failures of
its own**, well before the BFF's tenth. Against a non-existent address only the
BFF limiter is in play, so its threshold is actually reachable.

## Accounts

| Account | Purpose |
|---|---|
| `qa-e2e@kpost.local` | The suite's identity. In **both** product groups, because the products are `MANDATORY`-gated and an account outside them sees zero bugs — every UI assertion would then pass against an empty table. |

Both are created by `provision-accounts.pl` and removed again by
`purge-accounts.pl`. They are **not** left on the instance between runs: they are
robot accounts, and a bug tracker's user list should hold people. They author
nothing — the suite reads bugs and reassigns them, it never files any — which is
what makes removing them clean, and `purge-accounts.pl` refuses if that ever
stops being true.
| `qa-e2e-lockout@kpost.local` | Sacrificial. One spec must trip Bugzilla's *own* lockout, which lasts ~30 minutes; pointing that at the shared account would strand every later spec. Holds no groups and is used for nothing else. |

Override with `E2E_LOGIN` / `E2E_PASSWORD` / `E2E_LOCKOUT_LOGIN`. **Never point
these at a real person's account** — the LRU specs deliberately evict sessions
and the rate-limit specs deliberately burn an attempt budget.

## Why serial, and why zero retries

`fullyParallel: false`, `workers: 1`, `retries: 0` — all three are deliberate.

Workers share the client IP and the one test account, so a session spec running
beside a rate-limit spec would evict each other's sessions and consume each
other's budget; every failure that produced would be a false one. And these
specs assert on counters that a first attempt *mutates*, so a retry would start
from a budget the previous attempt already spent — reporting a spurious pass or
failure depending on timing. Flakiness here is real signal, not noise to paper
over.

## What is deliberately not covered

- **Full threshold-crossing proof of "success resets the counter."** That needs
  >10 failures against an account whose password is also known, and Bugzilla
  locks a real account at 5. The 429 that comes back is then Bugzilla's lockout,
  not the BFF's — a different mechanism with a much longer cooldown — so the
  assertion would measure the wrong thing *and* strand the shared account for
  half an hour. Covered instead by a unit test over `recordLoginFailure` /
  `clearLoginFailures` with an injected clock, plus two end-to-end specs for the
  behaviour that actually regressed in production.
- **Pixel snapshots.** A baseline for this app would be re-recorded on every copy
  change and every new bug row, and a baseline nobody trusts gets
  `--update-snapshots` run on it reflexively — at which point it catches
  nothing. The theme specs assert computed properties ("this surface is light",
  "this text is dark enough") which survive content churn and still fail on the
  regression that matters.
- **Keyboard-only and screen-reader traversal.** Listed as open in
  `SECURITY-CHECKLIST.md` rather than silently omitted.
