# Bugzilla Configuration Migration: Laptop → Office Desktop

**Audited:** 2026-10-19 · **Branch:** `18-10-26` · **Bugzilla:** 5.2 · **MariaDB:** 10.11.19 · **Database:** `bugs`

This document is the complete set of Bugzilla-side changes made on the laptop that do **not** exist on the
office desktop. Apply it and the office instance will serve the `18-10-26` application code identically.

## How this was produced

Not from memory or notes. Every statement below comes from a row-level diff of two things:

| Side | Source |
| --- | --- |
| **Office baseline** | `C:\Users\Meera\Downloads\16_10_2026_bugs_dump.sql` (1.36 GB, taken 16 Oct 2026) |
| **Local current** | the live `bugs` database, read through Bugzilla's own `Bugzilla->dbh` |

Tables compared: `bug_status`, `status_workflow`, `resolution`, `fielddefs`, `groups`, `group_group_map`,
`group_control_map`, `user_group_map`, `products`, `components`, `profiles`, plus a column-by-column
comparison of all 76 tables.

> **Caveat on the baseline.** The dump is dated 16 Oct 2026. If anything was changed on the office
> instance after that date, this diff would not see it. Every statement in `MIGRATION_SQL.sql` is
> guarded by `NOT EXISTS`, so a change already present office-side is skipped rather than duplicated.

---

## Section 1 — Executive Overview

**The headline: there are no schema changes at all.**

A column-by-column comparison of all 76 office tables against the local database found **zero DDL drift** —
no `ALTER TABLE`, no new column, no changed data type, no new table. Local has exactly one extra table,
`user_group_map_backup`, which is throwaway scaffolding from an earlier revert and **must not be migrated**
(see [Section 6](#section-6--what-must-not-be-copied)).

Everything that differs is **configuration rows**, in five groups:

| # | Change | Rows | Why it exists |
| --- | --- | --- | --- |
| 1 | `REOPENED` status | 1 | A fix that did not hold needs its own state, not a silent trip back to `CONFIRMED`. Drives the dashboard's Reopened tile. |
| 2 | Workflow transitions | 6 | Bugzilla refuses any transition not listed in `status_workflow`. Without these the status exists but is unreachable. |
| 3 | `DELETED` resolution | 1 | Bugzilla has no delete API. Half of the UI's soft delete. |
| 4 | `Deleted bugs` group + controls | 11 | The other half: the group that hides a deleted bug, its inheritance, and one control row per product. |
| 5 | Group memberships | 24 | Baskar promoted to admin; testers and admins given every product group. |

**Total: 43 configuration rows. No bug, comment, attachment or password is touched.**

### Current state, for reference

| | |
| --- | --- |
| Bugs | 1,330 |
| Users | 17 |
| Products | 6 (1 inactive: `TestProduct`) |
| Components | 88 |
| Activity records | 3,433 |
| Bugs using `REOPENED` | **0** |
| Bugs using `DELETED` | **0** |

The last two lines matter: these statuses are configured but unused, so this migration is **pure
configuration with zero data impact**. Nothing to reconcile, nothing to backfill.

---

## Section 2 — Database Schema & Data Updates

### 2.1 SQL alterations executed

**None.** No `ALTER TABLE`, `CREATE TABLE`, `DROP`, or data-type change was run locally, and none is
needed on the office machine. Both instances run Bugzilla 5.2 against the same schema; the local
`checksetup.pl` ran against the restored office database and made no structural change to it.

This was verified mechanically, not assumed — every table's column list was compared:

```
office tables parsed: 76   local tables: 77
TABLE ONLY LOCAL: user_group_map_backup (4 cols)
DDL DRIFT: 1 table(s)        <- the scaffolding table only; see Section 6
```

All changes below are `INSERT`s into Bugzilla's own configuration tables.

### 2.2 Custom field values

#### `bug_status` — one new row

| value | sortkey | isactive | is_open |
| --- | --- | --- | --- |
| `REOPENED` | 350 | 1 | **1** |

Office has 5 statuses; local has 6. `sortkey` 350 places it between `IN_PROGRESS` (300) and `RESOLVED` (400).
`is_open = 1` means a reopened bug counts as open work in every list, count and dashboard tile.

> **`CLOSED` was considered and deliberately rejected.** `VERIFIED` already carries `is_open = 0`, so it
> is the functional closed state. Adding `CLOSED` would create a second terminal state distinguished only
> by ceremony, and would be one more thing to keep in sync between the two machines.

#### `status_workflow` — six new rows

| From | To | `require_comment` |
| --- | --- | --- |
| `RESOLVED` | `REOPENED` | **1** |
| `VERIFIED` | `REOPENED` | **1** |
| `REOPENED` | `CONFIRMED` | 0 |
| `REOPENED` | `IN_PROGRESS` | 0 |
| `REOPENED` | `RESOLVED` | 0 |
| `VERIFIED` | `RESOLVED` | 0 |

Office has 16 transition rows; local has 22.

- `require_comment = 1` on the two routes **into** `REOPENED`: if a fix did not hold, the reason is the
  only genuinely useful part of the record.
- **`VERIFIED → RESOLVED` deserves a note.** No setup script creates this row — it was added by hand
  locally, almost certainly because soft delete sets a bug to `RESOLVED`/`DELETED`, and without this
  transition an already-verified bug could not be deleted. It is included in the migration because the
  Delete button would otherwise fail on verified bugs. Flagging it because it is the one row here with
  no script and no commit behind it.

#### `resolution` — one new row

| value | sortkey | isactive |
| --- | --- | --- |
| `DELETED` | 1000 | 1 |

Office has 6 resolutions; local has 7. `sortkey` 1000 keeps it clear of the stock values (100–600).

#### Custom fields (`fielddefs`)

**None.** `SELECT COUNT(*) FROM fielddefs WHERE custom = 1` returns **0** on both sides. All 59 field
definitions are stock Bugzilla.

### 2.3 Groups & RBAC permissions

#### `groups` — one new row

| name | description | `isbuggroup` |
| --- | --- | --- |
| `Deleted bugs` | Soft-deleted bugs. Visible only to testers and admins, who can restore them. | **1** |

Office has groups 1–20; local adds 21. `isbuggroup = 1` means it can be applied to a bug, not just to people.

**How soft delete actually works:** `or_groups` is `0` (Bugzilla's default, and the current value), which
means a bug in several groups is visible only to someone in **all** of them. Adding a bug to
`Deleted bugs` therefore makes it vanish for everyone outside that group while leaving it completely
intact and restorable. Nothing is destroyed.

> If `or_groups` were ever switched to `1`, soft delete would stop hiding anything. Leave it at `0`.

#### `group_group_map` — four new rows

| member | grantor | grant_type |
| --- | --- | --- |
| `admin` | `Deleted bugs` | 0 (membership) |
| `admin` | `Deleted bugs` | 1 (can bless) |
| `admin` | `Deleted bugs` | 2 (visible) |
| `canconfirm` | `Deleted bugs` | 0 (membership) |

Membership comes by **inheritance, not by a list of names** — so a tester added next month can delete and
restore without anyone remembering this step.

#### `group_control_map` — six new rows (one per product)

`Deleted bugs` on every product, with `entry = 0`, `membercontrol = 1` (SHOWN), `othercontrol = 0` (NA).

Without a control row for a product, Bugzilla **refuses** to put a bug of that product into the group and
delete fails at the final step. Applied to all 6 products including the inactive `TestProduct`, so
re-activating it never leaves delete broken. **Re-run after adding a product.**

(Constant values confirmed against `Bugzilla/Constants.pm:256-259`: NA=0, SHOWN=1, DEFAULT=2, MANDATORY=3.)

#### `user_group_map` — 24 new rows, nothing removed

The diff was run programmatically: **office 114 rows, local 138, added 24, removed 0.** Purely additive.

**(a) Baskar promoted to admin** — he is the testing team lead:

| login | groups added |
| --- | --- |
| `baskar1992@kpost.in` | `editusers`, `editcomponents` |

`editusers` + `editcomponents` is what this application treats as the admin role (`backend/src/lib/roles.ts`).

**(b) Testers and admins given every product access group:**

| login | product groups added |
| --- | --- |
| `meeravelu2303@gmail.com` | TestProduct, KPost Admin, KMail API, Kpost Admin UI |
| `lakshmiganthan027@kpost.in` | TestProduct, KPost Admin, KMail API, Kpost Admin UI |
| `baskar1992@kpost.in` | TestProduct, Kpost Admin UI |
| `sohail2795@kpostindia.com` | TestProduct, Kpost Admin UI |
| `prakash@kpost.in` | TestProduct, Kpost Admin UI |
| `ajithkumar16@kpost.in` | TestProduct, Kpost Admin UI |
| `mothilal@kpost.in` | TestProduct, Kpost Admin UI |
| `rajan@kpost.in` | TestProduct, Kpost Admin UI |
| `karthikalai91@kpost.in` | TestProduct, Kpost Admin UI |

A tester who cannot see a product cannot re-test its bugs, and the dashboard counts would silently
exclude them.

> **Developers were deliberately NOT widened.** They keep only the products they already had. An earlier
> blanket grant to all developers was reverted precisely because it broke product scoping — when filing
> against KMail API, the assignee list must show only developers with KMail API access.

#### Pre-existing office config worth knowing about

The `editbugs` group has `userregexp = '.*'` in the office dump — **every user gets `editbugs`
automatically**. That is not a local change, but it explains a behaviour that otherwise looks broken:
`UNCONFIRMED` is structurally unreachable, because `Bugzilla/Bug.pm` confirms a bug outright for anyone
holding `editbugs` **or** `canconfirm`. Do not "fix" this without deciding you want a real triage queue.

### 2.4 Runnable migration script

**→ [`MIGRATION_SQL.sql`](MIGRATION_SQL.sql)** in the project root.

```bash
# 1. Back up first.
mysqldump -u root -p --port=3306 --single-transaction bugs > pre-migration.sql

# 2. Apply. NOTE: the database is named `bugs`, not `bugzilla`.
mysql -u root -p --port=3306 bugs < MIGRATION_SQL.sql

# 3. Restart Apache so the CGI processes pick up the new status list.
```

Properties of the script:

- **Idempotent** — every statement is guarded by `NOT EXISTS`. Re-running changes nothing.
- **Transactional** — wrapped in `START TRANSACTION` / `COMMIT`. It all applies or none of it does.
- **Id-agnostic** — ids are resolved by name. Locally `REOPENED` is id 6 and `DELETED` id 7; office may
  differ and that is fine, because nothing in the schema or the application depends on the number.
- **Self-verifying** — ends with seven `SELECT`s whose expected results are in comments.

#### Preferred alternative: the Perl setup scripts

The repo already contains idempotent scripts that make these same changes through Bugzilla's own object
layer, which validates input and handles cache invalidation:

```bash
cd C:\Bugzilla
perl -T <repo>\ops\bugzilla\setup-reopened-status.pl meeravelu2303@gmail.com
perl -T <repo>\ops\bugzilla\setup-soft-delete.pl     meeravelu2303@gmail.com
```

**Prefer these over the raw SQL** where you have the choice — they go through `Bugzilla::Status` and
`Bugzilla::Field::Choice` rather than writing rows directly. Two things they do **not** cover, which the
SQL script does:

1. the `VERIFIED → RESOLVED` transition (Section 2.2), and
2. all 24 group memberships (Section 2.3).

So either run both scripts **and** the membership section of the SQL, or just run `MIGRATION_SQL.sql`,
which covers everything.

---

## Section 3 — Native Bugzilla GUI Administration Settings

### 3.1 Parameters (`editparams.cgi`)

**No parameter change needs to be migrated — and I want to be precise about why rather than hand you a list.**

Bugzilla parameters live in `C:\Bugzilla\data\params.json`, a file on disk. They are **not in the database**,
so they were **not in the office dump**, so there is nothing to diff them against. The local
`params.json` was generated fresh by `checksetup.pl` and is a stock Bugzilla 5.2 parameter set.

Presenting that file as "settings we modified" would be inventing a changelog. What follows instead is the
short list of parameters the application actually depends on, with the value to confirm office-side:

| Parameter | Required value | Why it matters |
| --- | --- | --- |
| `or_groups` | `0` | Soft delete depends on AND semantics across groups. At `1`, a deleted bug stays visible. This is the Bugzilla default. |
| `urlbase` | the office URL | Machine-specific — locally `http://localhost/`. Do **not** copy the local value. |
| `usebugaliases` / `useqacontact` / `usetargetmilestone` / `usestatuswhiteboard` | `0` | All off locally; the UI does not surface these fields. |
| `requirelogin` | `0` | The BFF authenticates; Bugzilla itself is reached server-side. |
| `maxattachmentsize` | `1000` (KB) | Attachment uploads larger than this are rejected by Bugzilla, not by the UI. |

Deliberately **not** configured locally, per your instruction to keep exact parity: `mail_delivery_method`
is still `Sendmail` with `smtpserver = localhost`, i.e. **no working SMTP**. Consequence: password reset and
notification mail do not send on the laptop. If the office box has real SMTP, that is an office-side
difference in the *opposite* direction and is fine to leave alone.

### 3.2 Custom fields (`editfields.cgi`)

**None.** No custom field was created. Confirmed: `fielddefs WHERE custom = 1` → 0 rows.

### 3.3 Workflow transitions (`editworkflow.cgi`)

The six rows in Section 2.2 are exactly what `editworkflow.cgi` writes. If you prefer the GUI to SQL:

1. **Administration → Field Values → Status** — add `REOPENED`, sortkey `350`, tick **Open**.
2. **Administration → Workflow** — tick these boxes:
   - `RESOLVED` → `REOPENED` and `VERIFIED` → `REOPENED`
   - `REOPENED` → `CONFIRMED`, `IN_PROGRESS`, `RESOLVED`
   - `VERIFIED` → `RESOLVED`
3. **Administration → Workflow → Comment required** — tick the two transitions *into* `REOPENED`.
4. **Administration → Field Values → Resolution** — add `DELETED`, sortkey `1000`.
5. **Administration → Groups** — create `Deleted bugs`, tick *Is this a bug group?*, then grant it to
   `admin` (membership + bless + visible) and `canconfirm` (membership).
6. **Administration → Products → [each product] → Group Access Controls** — set `Deleted bugs` to
   **Members: Shown / Non-members: NA**. Repeat for all 6 products.

The GUI route is more clicking and easier to get subtly wrong (step 6 especially, and it is the one whose
omission breaks Delete with no obvious cause). The SQL script is the safer path.

---

## Section 4 — System Dependencies & Environment

### 4.1 Perl modules

All **required** modules are installed and satisfied. Only three optional ones are absent:

| Module | Enables | Needed? |
| --- | --- | --- |
| `perl-ldap` | LDAP authentication | **No** — `user_verify_class = DB` |
| `mod_perl` | mod_perl | **No** — running under `mod_cgi` |
| `Apache-SizeLimit` | mod_perl | **No** — same |

Running under `mod_cgi` rather than `mod_perl` costs roughly **630 ms per Bugzilla API call**, because the
Perl interpreter starts fresh each request. That is the dominant cost in the whole stack and the reason the
BFF caches aggressively (`STATS_CACHE_TTL_MS`). Worth installing `mod_perl` on the office box eventually,
but it is a performance change, not a correctness one, and it is **not** part of this migration.

Windows install gotchas already solved locally, in case the office box is ever rebuilt:

- `$db_driver` must be `'mariadb'`, not `'mysql'` — MariaDB 10.6+ rejects the old driver name.
- `DBD::MariaDB` installs into `C:\Bugzilla\lib`; probe it with `perl -Ilib`, or it looks missing.
- `checksetup.pl` writes params before creating `data/` — create `data\` first or it dies.
- `ComSpec` must exist in `HKLM\SYSTEM\CurrentControlSet\Control\Session Manager\Environment` as
  `REG_EXPAND_SZ`, or CPAN installs die partway through.

### 4.2 Node packages

No root-level `npm test` script exists. Install per directory:

```bash
cd <repo>\backend  && npm install
cd <repo>\frontend && npm install
cd <repo>\e2e      && npm install && npx playwright install
```

> **Do not run `npm run install:all` from the repo root.** It has previously rewritten
> `frontend/package.json` with a self-referential `"bugzilla-ui": "file:.."` dependency.

### 4.3 BFF environment variables (`backend/.env`)

Contract defined in [`backend/src/config/env.ts`](backend/src/config/env.ts). Keys currently set locally:

| Variable | Notes |
| --- | --- |
| `BUGZILLA_URL` | **Machine-specific.** |
| `BUGZILLA_API_KEY` | **Secret — do not copy between machines.** Issue a separate key per instance. |
| `SESSION_SECRET` | **Secret**, min 16 chars. Rotating it signs everyone out. |
| `PROOF_LINK_SECRET` | **Secret**, min 16 chars. Kept separate from `SESSION_SECRET` so rotating session signing does not void every link in every exported sheet. |
| `PORT` | Default `4000`. |
| `CORS_ORIGIN` | Default `http://localhost:5175`. |
| `PUBLIC_APP_URL` | The address *other machines* use to reach the app. Links in exported sheets use it, so `localhost` would be wrong for a colleague. |
| `COOKIE_SECURE` | `auto` — Secure flag exactly when the request arrived over HTTPS. |
| `TRUST_PROXY` | `false` direct, `1` behind one reverse proxy. Wrong value ⇒ the login rate limiter treats all clients as one and locks everyone out together. |
| `HSTS` | `false` until HTTPS is end-to-end. |
| `SESSION_STORE` | `file` — survives restarts with no extra infrastructure. |
| `PROOF_LINK_DAYS` | Default `30`. |
| `STATS_CACHE_TTL_MS` | Default `60000`. |
| `PRODUCT_TRANSFER_ROUTES` | Default `KPost UI<->KPost API; KPost Admin UI<->KPost Admin`. |

**`TRANSFER_API_KEY` is not set locally.** Cross-product transfers therefore run under
`BUGZILLA_API_KEY` — they work, but the BFF logs a startup warning and the bug history attributes every
transfer to the admin account rather than to a service account. To fix it properly, run
`ops/bugzilla/setup-transfer-account.pl` (which has **not** been run on either machine) and set the key.
Not required for this migration; worth doing before the transfer feature sees real use.

### 4.4 Ops scripts

| Script | Status |
| --- | --- |
| `ops/bugzilla/setup-reopened-status.pl` | **Run locally.** Covered by this migration. |
| `ops/bugzilla/setup-soft-delete.pl` | **Run locally.** Covered by this migration. |
| `ops/bugzilla/setup-transfer-account.pl` | Not run on either machine (Section 4.3). |
| `ops/bugzilla/setup-password-reset.pl` | Not run — needs working SMTP. |
| `ops/bugzilla/setup-smtp.pl` | Not run — deliberately skipped. |
| `ops/apache/harden-access-log.ps1` | Apache logging hardening. |
| `ops/windows/register-backup-task.ps1` | Scheduled backup. Not registered locally. |
| `ops/verify-transfer.ps1` | Post-deploy check for the transfer feature. |
| `ops/health-check.ps1` | Stack health check. |

---

## Section 5 — Office Desktop Execution Checklist

Roughly 20 minutes. Steps 2 and 3 are the only ones that touch the database.

### 1. Pull the code

```bash
cd <repo>
git fetch origin
git checkout 18-10-26
git pull
git log --oneline -3          # expect 4debda1 feat(bugs): one-click verify & close...
```

### 2. Back up, then migrate the database

```bash
mysqldump -u root -p --port=3306 --single-transaction bugs > pre-migration-%DATE%.sql
mysql -u root -p --port=3306 bugs < MIGRATION_SQL.sql
```

Read the seven verification `SELECT`s the script prints at the end against the expected results in its
comments. **Check `bug_status` has 6 rows and `status_workflow` has 22 before moving on.**

> Local MariaDB listens on **3307**; the office instance is probably **3306**. Confirm before running.
> Confirm the database name too — it is `bugs`, not `bugzilla`.

### 3. Restart Apache and confirm Bugzilla sees the change

```bash
httpd -k restart
curl http://localhost/rest/version         # expect {"version":"5.2"}
```

Then open `editworkflow.cgi` and confirm `REOPENED` appears in the grid. If the status exists in the
dropdown but a save is rejected, a `status_workflow` row is missing — re-check step 2.

### 4. Install dependencies and start the stack

```bash
cd backend  && npm install
cd ..\frontend && npm install
cd ..
npm run typecheck                           # must pass clean
npm run dev                                 # backend :4000 + frontend :5175
```

Watch the backend's first lines. A missing or malformed `.env` exits immediately with the offending key
named. A warning about `TRANSFER_API_KEY` is expected (Section 4.3) and harmless.

### 5. Verify behaviour in the UI

| Check | Expected |
| --- | --- |
| Sign in as Baskar | Admin navigation appears (Users, etc.) |
| Sign in as any tester | All 6 products visible in the product filter |
| Open a `RESOLVED` bug as a tester | **Ready for re-test** card with **Mark as verified & close** |
| Click it | Status → `VERIFIED`, timestamped QA note added, one history entry |
| Open a `RESOLVED` bug, change status | `REOPENED` offered; selecting it demands a comment |
| Delete a bug as a tester | Succeeds; bug disappears from lists but is restorable |
| Dashboard | "Ready for re-test" counts `RESOLVED` only — not `REOPENED` |

### 6. Run the automated suite

There is **no root `npm test`.** The Playwright suite lives in `e2e/` with its own `package.json`:

```bash
cd <repo>\e2e
npm install
npx playwright install
perl provision-accounts.pl                 # run from C:\Bugzilla — creates the two robot accounts
npm test                                   # or: npm run test:security
```

Specs: `auth-rate-limit`, `auth-sessions`, `ui-badges`, `ui-browser-column`, `ui-login-errors`, `ui-theme`.
The suite expects the UI at `http://localhost:5175` (override with `E2E_UI_URL`).

Afterwards, remove the robot accounts — a bug tracker's user list should contain people:

```bash
perl purge-accounts.pl                      # from C:\Bugzilla
```

---

## Section 6 — What Must NOT Be Copied

Four things exist locally that must stay local.

### 1. `user_group_map_backup`

A 173-row scratch table created during an earlier revert of a group grant. It is the only DDL difference
between the two machines and is pure scaffolding. Not in `MIGRATION_SQL.sql`. Drop it locally once you are
satisfied the group memberships are correct:

```sql
DROP TABLE user_group_map_backup;
```

### 2. Two changed password hashes

The password-hash diff found **15 of 17 accounts still carry the office hash**, and exactly two were
changed locally so they could sign in during development:

- `ayyappan@kpostindia.com`
- `baskar1992@kpost.in`

**Do not migrate these.** They would overwrite two colleagues' real passwords with laptop test values.
`MIGRATION_SQL.sql` does not touch `profiles`.

### 3. `urlbase` and the `.env` secrets

`urlbase` is `http://localhost/` locally. `BUGZILLA_API_KEY`, `SESSION_SECRET` and `PROOF_LINK_SECRET`
should be distinct per instance — copying them means one leak compromises both machines.

### 4. The absence of SMTP

Local mail is deliberately unconfigured. If the office box has working SMTP, leave it working.

---

## Appendix — Known open items

Carried forward from earlier work; none blocks this migration.

- **All 1,330 bugs are reported by `meeravelu2303@gmail.com`** (the test bench's API key), so any
  per-reporter queue or "my filed bugs" view is meaningless until the bench authenticates as the tester
  who triggered the run. This is a bench-side change, not a Bugzilla one.
- **`UNCONFIRMED` is unreachable** by design-accident: `editbugs` has `userregexp = '.*'`, and `editbugs`
  **or** `canconfirm` confirms a bug outright. A real triage queue would mean narrowing that regexp —
  a workflow decision, not a migration step.
- **`TRANSFER_API_KEY` unset** on both machines (Section 4.3).
- **No SMTP**, so password reset cannot send mail (Section 3.1).
- **`mod_perl` not installed**, costing ~630 ms per Bugzilla call (Section 4.1).
