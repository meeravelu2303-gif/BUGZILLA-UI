# Security & Quality Audit Checklist — Bugzilla UI + BFF

Companion to the automated suite in `e2e/`. Items marked **[auto]** are covered
by a spec and will fail the build; items marked **[manual]** need a person,
either because they cannot be asserted from outside the process or because the
answer is a judgement call.

The point of separating them is honesty: a checklist that implies automation it
does not have is worse than one that says plainly which risks are still carried
by review.

---

## 1. Authentication & brute-force resistance

| | Check | Status |
|---|---|---|
| **[auto]** | 10 failures per (IP + account) then `429` | `auth-rate-limit.spec.ts` |
| **[auto]** | `429` body carries `retryAfterSeconds`, `limit`, `remaining`, `scope` | ✔ |
| **[auto]** | `Retry-After` header present and > 0 | ✔ |
| **[auto]** | Locking account A does not lock account B on the same IP | ✔ |
| **[auto]** | Attempts during cooldown do not extend `lockedUntil` | ✔ (sampled countdown) |
| **[auto]** | Successful sign-ins never consume the failure budget | ✔ (12 consecutive) |
| **[auto]** | Bugzilla's own lockout is surfaced as `429`, not a raw `400` | ✔ |
| **[manual]** | `trust proxy` is configured if the BFF ever sits behind a reverse proxy | ⚠ **open** |
| **[manual]** | Limiter state is shared (Redis) before running more than one instance | ⚠ **open** |
| **[manual]** | Bugzilla's `max_login_failures` / `loginfailure_interval` reviewed | 5 / 30 min |

> **Carried risk — single instance only.** The limiter and the session registry
> are in-process `Map`s. Behind two instances each keeps its own counts and the
> effective budget doubles; a restart releases every cooldown early. Acceptable
> only while the BFF runs as one process, which is how it ships today.

> **Carried risk — `req.ip` behind a proxy.** Without Express `trust proxy`,
> every request appears to come from the proxy and the IP half of the composite
> key stops discriminating. The account half still does, which is why the key is
> composite — but the protection is weaker than it looks.

---

## 2. Session management

| | Check | Status |
|---|---|---|
| **[auto]** | 3 concurrent sessions per account, all usable | `auth-sessions.spec.ts` |
| **[auto]** | A 4th sign-in is **granted**, never refused | ✔ |
| **[auto]** | Eviction removes the least-recently-**used**, not the oldest-created | ✔ |
| **[auto]** | Surviving devices keep their sessions | ✔ |
| **[auto]** | An evicted session is refused by **data** routes, not just `/me` | ✔ |
| **[auto]** | Signing out one device leaves the others signed in | ✔ |
| **[manual]** | Session cookie is `httpOnly`, `sameSite=lax`, `secure` in production | `COOKIE_SECURE` must be `true` behind TLS |
| **[manual]** | Session id is regenerated on privilege change | ✔ `req.session.regenerate()` on login |
| **[manual]** | Bugzilla token never reaches the browser | ✔ server-side only |

> **`COOKIE_SECURE=false` today.** Correct for plain-HTTP LAN use, wrong the
> moment this is served over TLS — the cookie would be sent over unencrypted
> connections too. Flip it with the TLS rollout, not after.

---

## 3. Error handling & information disclosure

| | Check | Status |
|---|---|---|
| **[auto]** | No IPv4/IPv6 literal in any auth error payload | `auth-rate-limit.spec.ts` |
| **[auto]** | No "Your IP (…)" phrasing reaches the client | ✔ |
| **[auto]** | No stack traces, file paths or `node_modules` in errors | ✔ |
| **[auto]** | Rendered cooldown copy is human-readable, never `[object Object]` | `ui-login-errors.spec.ts` |
| **[auto]** | Password never echoed into the DOM or the URL | ✔ |
| **[auto]** | Errors announced via `role="alert"` | ✔ |
| **[manual]** | Bugzilla's `upstream` block reviewed for anything sensitive | scrubbed on the same terms as `message` |
| **[manual]** | Login failure does not reveal whether an account exists | ⚠ **see below** |

> **Account enumeration.** A wrong password on a real account and a login for an
> address that does not exist both return `401` with the same copy — good. But
> Bugzilla locks only accounts that *exist*, so a caller who reaches a
> `scope: "bugzilla-account"` lockout has learned the address is real. Inherent
> to Bugzilla's own behaviour, not something the BFF introduces; worth knowing
> before treating the 401 parity as complete protection.

---

## 4. Authorisation

| | Check | Status |
|---|---|---|
| **[manual]** | Every route behind `requireAuth` | ✔ audited: only `/api/health` and `/api/auth/login` are open |
| **[manual]** | Admin routes behind `requirePermission` | ✔ `canManageUsers` / `canManageProducts` |
| **[manual]** | Permission checks are re-verified upstream, not trusted from the session | ✔ Bugzilla independently rejects (error 304) |
| **[manual]** | Product visibility respects Bugzilla groups | ✔ `MANDATORY` group control per product |
| **[manual]** | Per-user caching never leaks across users | ✔ `categoryIndex` is keyed by user id |

> The category index is cached **per user, never globally** — deliberately.
> Bugs can be group-restricted, so the id set one user may see is not the set
> another sees, and a shared cache would leak the existence of restricted bugs
> through counts alone.

---

## 5. UI correctness & accessibility

| | Check | Status |
|---|---|---|
| **[auto]** | Light theme holds under `prefers-color-scheme: dark` | `ui-theme.spec.ts` |
| **[auto]** | Card and table surfaces are near-white; sticky header fully opaque | ✔ |
| **[auto]** | Borders use slate tokens, never default black | ✔ |
| **[auto]** | Browser column present for UI scope, **absent from the DOM** for API scope | `ui-browser-column.spec.ts` |
| **[auto]** | Header/body cell counts stay in step when the column drops | ✔ |
| **[auto]** | Badges are pale fills, dark text, bordered micro-badges | `ui-badges.spec.ts` |
| **[auto]** | Severity and status hues are visually distinguishable | ✔ |
| **[auto]** | No badge conveys meaning by colour alone | ✔ glyph or word required |
| **[manual]** | Full WCAG AA contrast audit across every token pair | partial — see `BRANDING.md` |
| **[manual]** | Keyboard-only traversal of the filter bar and table | ⚠ **not covered** |
| **[manual]** | Screen-reader pass over the bug list | ⚠ **not covered** |

> **`darkMode` is unset in `tailwind.config.js`,** so Tailwind falls back to
> `media`. Any stray `dark:` utility therefore fires off the viewer's OS setting
> alone, turning one component dark inside an app that stays light. The
> "stays light even when the OS prefers dark" spec is the tripwire for exactly
> that regression — it has caught it once already.

---

## 6. Data integrity

| | Check | Status |
|---|---|---|
| **[manual]** | `maxattachmentsize` ≥ the largest artefact the benches upload | 50 MB |
| **[manual]** | `max_allowed_packet` ≥ 2× `maxattachmentsize` | 512 MB |
| **[manual]** | Backups complete, not merely non-empty | ⚠ **verify the `Dump completed` marker** |
| **[manual]** | Restore tested into a scratch database | ⚠ **open** |

> **Backups can fail silently.** `mysqldump` hex-encodes BLOBs, so a 46 MB
> attachment needs ~93 MB on the wire. At the old 100 MB `max_allowed_packet`
> the dump died mid-table and still produced a 726 MB file that looked
> plausible by size alone. Check the trailing `-- Dump completed` marker and the
> exit code; never judge a backup by its file size.

---

## Running the suite

```bash
cd backend  && npm run dev     # BFF on :4000
cd frontend && npm run dev     # UI  on :5175
cd e2e && npm install && npx playwright install chromium
cd e2e && npm test             # all 28
cd e2e && npm run test:security
cd e2e && npm run test:visual
```

`global-setup.ts` fails the run early, with the actual cause named, if either
server is down, the test account cannot sign in, or that account can see zero
bugs.
