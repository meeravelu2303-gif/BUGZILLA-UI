# Bugzilla Platform — Production-Readiness Audit

**Scope:** the custom Bug Tracker (React front end + Node/Express backend), its integration with Bugzilla 5.2, the Bugzilla instance and database it runs on, and the operational setup around them.
**Method:** code review of the full repository (≈20,900 lines of TypeScript across backend and frontend, 34 commits), live read-only checks against the running system (Bugzilla REST API, MariaDB, Apache logs and configuration, Windows scheduled tasks), and dependency vulnerability scans. No data was modified.
**Date:** 17 October 2026.

> **How to read severity.** 🔴 **Blocker** — must be fixed before this is exposed beyond a trusted LAN or used as a system of record. 🟠 **High** — fix within the next iteration. 🟡 **Medium** — fix on the roadmap. 🟢 **Low** — polish.

---

# 1. Executive summary & codebase overview

## 1.1 What has been built

The team has built a **modern front end on top of an unmodified Bugzilla 5.2**, in the "backend-for-frontend" (BFF) pattern:

```
Browser (React 18, Vite, Tailwind)  →  BFF (Node 24, Express, TypeScript, Zod)  →  Bugzilla 5.2 REST API  →  MariaDB 10.11
         port 5175                              port 4000                               Apache :80             port 3307
```

- **No database of its own.** The BFF holds no persistent state. Bugzilla's MariaDB database (`bugs`, ≈1.0 GB, 1,330 bugs, 1,847 attachments stored in-database) is the single system of record. Every read and write goes through Bugzilla's official REST API, so Bugzilla's own permission model is enforced on every call.
- **Backend (≈6,900 lines):** session-based login on top of Bugzilla's token, per-user token pass-through, a role model derived from Bugzilla groups, bug list/count/stats/export endpoints with a classification layer, full bug update coverage, soft delete/restore, report revisions, raw-file attachment upload, background export jobs with progress and cancellation, signed no-login "proof" links, and admin endpoints for users and products.
- **Frontend (≈14,000 lines):** dashboard, bug list with faceted filters and date ranges, bug page with a complete field editor and a structured report editor, New Bug wizard, My Bugs, Advanced Search, Reports, admin pages, command palette, a consistent glass design system, and a light-only theme.
- **Bugzilla configuration delivered as code:** two idempotent Perl scripts add the soft-delete machinery (DELETED resolution, "Deleted bugs" group, per-product group controls) and the REOPENED status with its workflow transitions.
- **Tests:** 35 Playwright end-to-end tests (authentication rate limiting, session limits, login error copy, theme, badges, conditional columns). No unit tests. No CI pipeline.
- **Documentation:** README, DEPLOYMENT, a live-probed API contract, an end-user guide and a general Bugzilla guide.

## 1.2 Overall readiness assessment

| Area | Score (0–10) | One-line verdict |
|---|---|---|
| Functional coverage of daily bug work | **8.5** | Broader than stock Bugzilla's UI for the triage/fix loop; a few native features (history view, flags page, trend charts) are not surfaced |
| Code quality & architecture | **8** | Clean layering, Zod validation everywhere, honest comments, no DB coupling; single-process design limits scale |
| Security | **3** | Credentials and tokens are written to Apache's access log in plain text; plain HTTP; anonymous read access to unrestricted products; in-memory session store |
| Operations & resilience | **3** | No scheduled backups, no Bugzilla maintenance jobs, no monitoring, no CI, sessions and jobs lost on restart |
| Testing | **4** | Good e2e coverage of auth edge cases; zero unit coverage of the parsers and rules that carry the business logic; the e2e account no longer exists |
| Performance at current size | **7** | Fine for 1–5k bugs and ~20 users; Bugzilla under mod_cgi is the bottleneck (~0.6 s per API call) |
| Performance at enterprise scale (50k+ bugs, 200+ users) | **4** | Full-scan stats, per-user caches, in-memory job state and MemoryStore do not scale horizontally |

**Overall: 5.5 / 10 — a well-engineered internal tool that is not yet production-grade.** The functional product is close to, and in places ahead of, a standard Bugzilla deployment. What stands between it and production is not features: it is **four security findings** (one of them a blocker), the **absence of any operational safety net** (backups, jobs, monitoring, CI), and **testing** of the logic that the product's correctness depends on. Section 4 gives a prioritised roadmap; the blocker items are a few days of work.

---

# 2. Feature coverage audit — what is implemented

## 2.1 Product & component management

**How it is mapped.** Products and components are Bugzilla's own objects; the UI stores nothing extra. Bugzilla has no "sub-product" concept, and neither does the UI: hierarchy is *product → component*. Bugzilla's optional *Classifications* layer (product groupings) is switched off (`useclassification = 0`).

| Capability | Status | Notes |
|---|---|---|
| List products with components, versions, milestones | ✅ | `GET /api/products` (enterable, scoped to the user) and `GET /api/admin/products` (accessible, so componentless new products appear) |
| Create product | ✅ | Name, description, initial version; validated; access cache cleared for all users |
| Create component with default assignee | ✅ | Validated email |
| Activate / deactivate product | ✅ | `PUT /product/{id} {is_active}` |
| Rename/delete component, manage versions & milestones | ➖ Link-out | No REST endpoint in Bugzilla 5.2 (`PUT /component` returns 404 — verified live); the UI deep-links to `editcomponents.cgi` |
| Per-product visibility group | ⚠️ Manual | Convention: a Bugzilla group with the same name as the product. Creating the product in the UI does **not** create the group or its group controls; an admin must do that in Bugzilla and re-run `setup-soft-delete.pl` |
| Product "test type" (API vs UI bench) | ✅ Derived | From the product name (`UI` → UI Automation; `API`/`Admin` → API Automation). Display only |

**Assessment:** solid for creation, honest about Bugzilla's API limits. The gap is the **two-step product onboarding** (group + script) that is easy to forget and silently leaves a new product either visible to everyone or with Delete refused.

## 2.2 User authentication, roles & security

| Capability | Status | Detail |
|---|---|---|
| Login | ✅ | Calls Bugzilla's own login; the Bugzilla token is stored **server-side** in an `httpOnly`, `SameSite=Lax` session cookie (8 h). The browser never sees a Bugzilla token or API key |
| Per-user authorisation | ✅ | Every Bugzilla call for a request uses *that user's* token, so Bugzilla's group rules apply exactly as in its own UI |
| Role model | ✅ | Developer (`editbugs`), Tester (`+canconfirm`), Administrator (`+editusers +editcomponents`). Derived at login; the raw `admin` group is never granted by the UI |
| Permissions used by the BFF | ✅ | `canTriage` (reassign others' bugs, reopen, delete/restore), `canManageUsers`, `canManageProducts`; every admin write is re-checked by Bugzilla (error 304 → 403) |
| Product visibility scoping | ✅ | Lists, counts, stats and exports are scoped to products the user has a same-named group for; cached 5 min per user; admins unscoped |
| Login rate limiting | ✅ | 10 failures per (IP + account) → 5-minute lock; structured 429 with `Retry-After`; Bugzilla's own 5-failure/30-minute lock mapped cleanly |
| Multi-device limit | ✅ | 3 sessions per account; a 4th sign-in evicts the least-recently-used device; per-device logout |
| Security headers | ✅ partial | `nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy`; `x-powered-by` off. No CSP, no HSTS (no TLS) |
| Input validation | ✅ | Zod schemas on every route with `.strict()` on update payloads; file names stripped of paths; MIME types pattern-checked; 60 MB body cap on raw uploads |
| Error handling | ✅ | One error shape; Bugzilla's numeric codes mapped to HTTP semantics; no stack traces leak; body-parser 413 mapped |
| Session store | 🔴 | `express-session` **MemoryStore** — explicitly not for production: single process, lost on restart, unbounded growth |
| Credential transport to Bugzilla | 🔴 | Login password, session tokens and the service API key are sent as **URL query parameters** → recorded in Apache's access log (see 3.3) |
| Transport encryption | 🔴 | Everything runs over plain HTTP (`COOKIE_SECURE=false`, Apache has no TLS listener) |
| CSRF | 🟡 | No token. Mitigated by `SameSite=Lax` cookies, JSON bodies (preflighted) and a CORS allow-list. The raw upload route accepts any content type but is still protected by SameSite |
| Proxy awareness | 🟡 | `trust proxy` not set; behind a reverse proxy the rate limiter would key on the proxy's IP |

## 2.3 Bug lifecycle & workflow

The instance's workflow (statuses are Bugzilla's; the UI reads `can_change_to` live and offers only legal moves):

```
UNCONFIRMED → CONFIRMED → IN_PROGRESS → RESOLVED → VERIFIED (final)
                                            ↑            │
                                            └── REOPENED ◄┘   (comment required; testers/admins only in the UI)
```

| Capability | Status | Detail |
|---|---|---|
| Status transitions per Bugzilla workflow | ✅ | Dropdown limited to legal targets; `comment_required` honoured (REOPENED) |
| Resolutions | ✅ | FIXED, INVALID, WONTFIX, DUPLICATE (with validated `dupe_of`), WORKSFORME; DELETED reserved for soft delete |
| Reopen with mandatory reason | ✅ | BFF rule + Bugzilla transition rule; dashboard counts and lists reopened bugs |
| Assignee rules | ✅ | Cannot reassign a closed bug or while closing; developers reassign only their own bugs; bulk reassign |
| Confirm (UNCONFIRMED → CONFIRMED) | ✅ | Via status dropdown for `canconfirm` holders |
| CLOSED status | ➖ | Not configured (stock Bugzilla 5 ends at VERIFIED). Documented how to add |
| Workflow editing | ➖ Link-out | Read-only matrix in the UI; edited in `editworkflow.cgi` |
| Enforcement location | ⚠️ | The "reassign only your own", "reopen only as tester" and "delete reason" rules live in the **BFF only**. Anyone with `editbugs` (everyone) can bypass them through Bugzilla's own web UI, which is reachable on the LAN |

## 2.4 Bug filing & tracking

| Area | Status | Detail |
|---|---|---|
| New Bug wizard | ✅ | API-bug and UI-bug variants; 9 mandatory fields; severity level sets both Bugzilla fields; generated, bench-compatible description; `[KP-xxxxxx]` fingerprint; category/browser whiteboard tags; live preview |
| Fields editable after filing | ✅ | Summary, status, resolution, duplicate-of, priority, severity, product (with component/version re-validation), component, version, milestone*, OS, platform, assignee (+ reset to default), QA contact*, CC (add/remove), depends on / blocks (validated, loop-checked), see also, URL, alias, keywords*, whiteboard, deadline, estimated/remaining/worked time, visibility groups, reporter/CC accessibility, flags* — *where the instance enables them |
| Save model | ✅ | One PATCH per save with all deltas; optional comment; mid-air collision detection on `last_change_time`; change summary from Bugzilla's own `changes` |
| Description ("report") editing | ✅ | Section-by-section editor; stored as revision comments (Bugzilla cannot edit comment #0); newest revision used everywhere; history preserved. Verified lossless on all 1,330 live descriptions |
| Comments | ✅ | Add; tag (Bugzilla comment tags); private comments disabled on this instance (no `insidergroup`) |
| Attachments | ✅ | Add later (choose/drag/paste), raw upload with progress and cancel, 50 MB (Bugzilla's `maxattachmentsize`), edit metadata, obsolete, inline image/video preview, download |
| Soft delete / restore | ✅ | DELETED resolution + "Deleted bugs" group; reason required; prior state recorded in the comment and restored exactly; excluded from every list/count/export by default |
| Classification layer | ✅ | Severity bands, P0–P3, categories, browsers — derived from Bugzilla fields and whiteboard tags, with a legacy fallback; used in filters, charts, exports |
| Search & filters | ✅ | Text/ID search, product, component, status, resolution, severity, priority, category, browser, date range (created/updated, presets), assignee/reporter/CC; URL-addressable; facet counts; sort |
| Reporting | ✅ | Dashboard tiles (clickable), open-load charts, severity × category matrix, reopened panel, worst components, Reports page (lifetime), Excel export (30 columns + Export info), evidence pack zip, signed proof links |
| Bug history (field-change audit trail) | ❌ | Not surfaced. Bugzilla records it; the UI shows comments only |

## 2.5 Custom UI ↔ Bugzilla integration

- **Pattern:** strict BFF. The SPA calls only `/api/*` with a cookie; the BFF calls Bugzilla with the user's token (or the service key for the three places a user token cannot: proof links, the assignee directory, start-up checks). 15 s timeout per call; responses parsed with Zod (`.passthrough()` for Bugzilla's extra fields).
- **Reads:** one search call per list page plus one count, one stats call (cached 60 s) and up to five facet-count calls — i.e. **7–8 Bugzilla CGI invocations per list page view**.
- **Writes:** `PUT /bug/{id}` with Bugzilla's add/remove delta shapes; comments and attachments via their endpoints; admin via `/user`, `/product`, `/component`.
- **Bugzilla-side additions:** none to Bugzilla's code. Configuration added by script (resolution, status, group, group controls, workflow rows).
- **What stays native (by design):** group membership, workflow, field values, parameters, sanity check, component/version/milestone edits — all deep-linked with "Edit in Bugzilla".

**Assessment:** the integration is the strongest part of the system — permission-correct, side-effect-free on Bugzilla, and honest about API gaps. Its weakness is the **number of CGI calls per page** and the fact that **business rules exist only in the BFF**.

---

# 3. Missing features & gap analysis

## 3.1 Against a full-featured Bugzilla

| Bugzilla feature | Instance | UI | Gap & recommendation |
|---|---|---|---|
| **Email notifications** | ❌ `mail_delivery_method = None` | — | Nobody is notified of anything. Configure SMTP; set `use_mailer_queue` with `jobqueue.pl` so sends don't block requests. 🟠 |
| **Whining (scheduled search emails)** | ❌ no `whine.pl` task | — | Needs email first; then a scheduled task. 🟡 |
| **Bug activity / audit log** | ✅ recorded | ❌ | Add a "History" tab reading `GET /bug/{id}/history` — the single most-asked question in a tracker is "who changed this?". 🟠 |
| **Dependency tree / graph** | ✅ | ⚠️ lists only | Show the transitive tree (`showdependencytree.cgi` data via recursive `/bug` reads) and open-blocker warnings on close (`noresolveonopenblockers` is off). 🟡 |
| **Flags / review requests** | no flag types defined | ✅ if defined | Define flag types (e.g. `review`, `qa-verified`); add a "My requests" view. 🟡 |
| **Custom fields** | none defined | reads/writes via passthrough only | Expose `cf_*` fields generically in the editor and New Bug form. 🟡 |
| **Keywords** | none defined | ✅ if defined | Define a keyword vocabulary (`regression`, `security`, `flaky`). 🟢 |
| **Saved searches** | ✅ native | ❌ (URL bookmarks) | Add named saved views per user (and shared team views) in the UI. 🟡 |
| **Voting** | off | ❌ | Low value for an internal QA tool. 🟢 |
| **Milestones / QA contact / status whiteboard display** | off | hidden accordingly | Enable milestones if release planning is wanted; the UI adapts automatically. 🟢 |
| **Private (insider) comments & attachments** | off (`insidergroup` empty) | ready | Set an insider group if confidential notes are needed. 🟢 |
| **Time-series charts** (`collectstats.pl`) | ❌ not scheduled | ❌ | No "open bugs over time" anywhere. Schedule `collectstats.pl` nightly and add a trend chart. 🟡 |
| **Tabular/graphical reports by arbitrary axes** | ✅ native | partial | UI covers severity/category/component; link out or add axis pickers. 🟢 |
| **Bulk edit (any field)** | ✅ native | reassign/delete only | Extend the bulk bar (status, priority, CC, keywords). 🟡 |
| **Clone bug / move between installations** | ✅ native | ❌ | Clone is cheap to add. 🟢 |
| **API keys per user** | ✅ native | link-out | Fine. |
| **Quick search syntax** (`product:`, `@assignee`, `#keyword`) | ✅ native | partial | Add the common prefixes to the command palette. 🟢 |
| **CLOSED status** | not configured | reads any status | Optional. 🟢 |

## 3.2 Against modern enterprise trackers (Jira, Azure DevOps, Linear)

- **No notifications of any kind** (email, in-app, Slack/Teams webhooks). 🟠
- **No SSO / MFA.** The login page's footer claims "Secured by enterprise single sign-on" — this copy is **false** and should be removed until SSO exists. 🟠
- **No OpenAPI/Swagger description** of the BFF; integrators must read the code. 🟡
- **No audit of admin actions** beyond Bugzilla's own tables. 🟡
- **No SLA / ageing views** ("critical bugs open > 7 days"). 🟡
- **No per-user notification preferences inside the UI** (link-out to Bugzilla's page only). 🟢
- **No localisation**, no right-to-left support. 🟢
- **No dark mode** — by explicit decision; fine.

## 3.3 Security findings (verified live)

| # | Finding | Evidence | Severity |
|---|---|---|---|
| S1 | **Passwords, session tokens and the service API key are sent to Bugzilla as URL query parameters** (`GET /rest/login?login=…&password=…`, `?token=…`, `?api_key=…`). Apache's `combined` log format records the full request line. | `C:\Apache24\logs\bugzilla-access.log` (30 MB): **2,813** lines contain `password=`, **104,138** contain `token=`, **44,344** contain `api_key=` — in plain text, readable by any local administrator or backup operator. | 🔴 Blocker |
| S2 | **Anonymous read access to unrestricted products.** `requirelogin = 0` and three products (KMail API, KPost Admin, KPost Admin UI) have no mandatory group. | `GET http://<server>/rest/bug?product=KMail%20API` with no credentials returns bug data. Any device on the LAN can read these bugs and their attachments through Bugzilla's own pages and API, bypassing the UI entirely. | 🟠 High |
| S3 | **No TLS anywhere.** The UI (5175), the BFF (4000) and Bugzilla (80) all speak plain HTTP; `COOKIE_SECURE=false`. | Passwords and session cookies cross the network in clear text. | 🟠 High (🔴 if ever reachable beyond the LAN) |
| S4 | **In-memory session store** (`MemoryStore`), in-memory rate limiter, in-memory export jobs and caches. | A restart signs everyone out and drops running exports; memory grows with sessions; cannot run two BFF instances. | 🟠 High for production |
| S5 | **Business rules enforced only in the BFF.** Reassign-only-your-own, reopen-only-tester, delete-with-reason. | Every user holds `editbugs`; Bugzilla's own UI is reachable and enforces none of these. | 🟡 Medium |
| S6 | **Vulnerable dependencies.** Backend: 1 critical (`proxy-addr` IP-spoofing via Express), 5 moderate. Frontend: 7 high, all in dev tooling (Vite path traversal in dev server, `braces`/`micromatch` DoS). | `npm audit` | 🟡 Medium (backend critical is a one-line `npm update express`) |
| S7 | **Weak password policy** (`password_complexity = no_constraints`; UI enforces 6+ characters only). Bugzilla login cookies table has 379 rows and is never pruned. | Bugzilla parameters | 🟡 Medium |
| S8 | **Proof links signed with a key derived from `SESSION_SECRET`.** Rotating the session secret silently invalidates every link in every exported sheet. | `proofLinks.ts` | 🟢 Low (use a separate `PROOF_LINK_SECRET`) |
| S9 | **Large uploads held in memory.** A 50 MB upload becomes ~67 MB base64 plus Bugzilla's JSON; several concurrent uploads could exhaust the Node process. | `express.raw({ limit: '60mb' })` | 🟢 Low at current scale |

## 3.4 Error-handling and edge-case gaps

- **Attachments stored in the database** (`maxlocalattachment = 0`): 1.1 GB of the 1.0 GB database is attachment blobs; dumps are large and slow, and every attachment read passes through Perl as base64. Consider on-disk storage (`maxlocalattachment`) for new attachments.
- **Report revisions are plain comments in Bugzilla's UI.** A user on Bugzilla's own pages sees a `[report-revision]` comment, not an edited description. Acceptable, but should be documented in-product.
- **Soft-delete depends on configuration per product.** A product created after the script ran refuses Delete with an opaque Bugzilla error until the script is re-run. Automate: create the group control from the product-creation endpoint, or detect and explain.
- **Export job state is per process.** A BFF restart orphans running jobs; the UI shows an error only after polling fails.
- **Category index rebuild** is O(categories × bugs) of Bugzilla searches per user per minute of staleness; fine now, costly at scale.
- **Upstream shape changes** map to a generic 502 ("unexpected shape") with no diagnostic code for operators.
- **Mid-air collision for report edits** compares revision counts, not content; two edits that both add a revision are detected, but a report edit racing a field edit is not (by design, documented).
- **Time zones:** the BFF formats exported dates in the server's local zone; date-range filters use the server's day boundaries. Fine for one office; document it.
- **`PUBLIC_APP_URL` hard-coded to a LAN IP**; a server move breaks proof links in previously exported sheets (by design — links are time-limited anyway).
- **README drift:** mentions port 5173 (actual 5175), `cookie-session` (actual `express-session`), a 200-bug dashboard limit (removed), and lists `ZZZ_THROWAWAY_*` test objects that should be purged from the live instance.

---

# 4. Production-grade validation & recommendations

## 4.1 Security & validation verdict

**Validation is production-grade.** Every endpoint parses its input with Zod, update payloads are `.strict()`, uploads are size- and type-checked, file names are sanitised, HTML written by the proof page is escaped, and the BFF never exposes stack traces or upstream bodies. The permission model is correct in design: authorisation is delegated to Bugzilla per user, with the BFF only *narrowing* what Bugzilla allows.

**Transport and secret handling are not.** S1 alone disqualifies the current deployment from being called production-ready: a plain-text log of every user's password and session token sits on the web server. S2 and S3 compound it. All three are configuration-level fixes:

1. **S1 — stop sending credentials in URLs.** Bugzilla 5 accepts `X-BUGZILLA-API-KEY`, `X-BUGZILLA-TOKEN`, `X-BUGZILLA-LOGIN` and `X-BUGZILLA-PASSWORD` request headers. Change `bugzillaClient.ts` and `bugzillaAuth.ts` to use headers (≈20 lines). Then **rotate the service API key**, invalidate all Bugzilla sessions (`DELETE FROM logincookies` or `Bugzilla::Auth` logout-all), ask users to change passwords, **scrub or delete the existing access logs**, and change Apache's `LogFormat` to omit the query string (`%U` instead of `%r`) or redact `password|token|api_key`.
2. **S2 — require login.** Set `requirelogin = 1` in Bugzilla parameters. Give KMail API, KPost Admin and KPost Admin UI mandatory groups like the other three products (and grant those groups to the right users via the UI).
3. **S3 — TLS.** Put Apache (Bugzilla), the BFF and the built front end behind one HTTPS host (the existing DEPLOYMENT plan), set `COOKIE_SECURE=true`, `ssl_redirect = 1` in Bugzilla, and add HSTS.
4. **S4 — durable session store.** Use `connect-redis` (or a MariaDB-backed store) for `express-session`; move the login rate limiter and export-job registry to the same store. Set `app.set('trust proxy', 1)` when behind the proxy.
5. **S6** — `npm update express` (backend critical), `npm update vite tailwindcss` (frontend dev-only highs).
6. **S5** — either enforce the triage rules in Bugzilla too (custom group controls / a small Bugzilla extension hook on `bug_end_of_update`), or accept that Bugzilla's native UI is an admin-only back door and restrict it with Apache auth or firewall rules to administrators.

## 4.2 Performance & scalability

**Today (1,330 bugs, 17 users): adequate.** Measured costs are dominated by Bugzilla running under **mod_cgi**: each REST call starts a Perl interpreter (~0.6 s). A list page triggers 7–8 calls; the stats endpoint scans every bug (one call, cached 60 s per user); an Excel export of 331 bugs took 64 s (comments and attachments fetched in batches of 100 with 4-way concurrency).

**Bottlenecks at scale:**

| Pressure point | Effect at 50k bugs / 200 users | Fix |
|---|---|---|
| Bugzilla under mod_cgi | Every request pays Perl start-up; 200 concurrent users → Apache process storm | Switch Apache to **mod_perl** (Bugzilla supports it; 5–10× faster per call) |
| `/stats` full scan per user per minute | 50k-row search per user per minute of cache staleness | Cache stats globally (not per user) keyed by product-access signature; or precompute nightly with `collectstats.pl` and query that |
| Category index (one search per category per user) | O(categories × bugs) per rebuild | Same global cache; or persist `[cat:]` as a real custom field so Bugzilla indexes it |
| Facet counts (≤5 searches per filter change) | Multiplies list-page cost | Debounce (done), compute facets from one `include_fields`-minimal search server-side |
| In-memory job/session/cache state | Cannot add a second BFF instance; restart loses state | Redis-backed stores (S4) |
| Attachments in the DB as base64 through Perl | Evidence packs stream hundreds of MB through CGI | `maxlocalattachment` on-disk storage; serve files via `attachment.cgi` or a signed static path |
| 10,000-row export cap | Hard Bugzilla search limit | Paginate exports server-side with `offset` and stream the workbook |
| Frontend bundle 480 kB (gzip 144 kB), no code-splitting | Slower first load on LAN laptops | Route-level lazy loading (one Vite config line) |

**Scalability verdict:** vertical scaling plus mod_perl carries this comfortably to ~20k bugs and ~100 users. Beyond that, the shared-state changes in S4 and the global stats cache are required.

## 4.3 Testing & delivery

- **Unit tests: none.** The highest-value, zero-infrastructure targets are the pure modules: `classification.ts` (severity/priority/category mapping and the Bugzilla query builder), `defectReport.ts` / `reportDoc.ts` (parsers verified lossless once by hand — turn that into a fixture test), `bugUpdate.ts` (payload mapping and validators), `softDelete.ts` (restore state machine), `reportRevision.ts`, `loginRateLimit.ts`, `useBugEditor.ts` (delta building).
- **E2E:** 35 good tests, but they require a robot account on a non-production Bugzilla, which was deleted with the staging environment. Either recreate a disposable Bugzilla (Docker image is in `C:\Bugzilla\docker`) or mock Bugzilla for e2e.
- **CI: none.** Add a pipeline (GitHub Actions or a local runner): typecheck both apps, unit tests, build, `npm audit --audit-level=high`, e2e against a Bugzilla container.
- **Staging: none.** Every change is currently verified against production data with read-only harnesses. A disposable Bugzilla container restored from the nightly dump would restore a safe testing path.

## 4.4 Operations

- **Backups: script exists, never scheduled.** `backup-databases.ps1` works (2.5 GB dump, 14-day retention) but no Task Scheduler entry exists; the last backups were run by hand. Restore has never been rehearsed. 🔴 for a system of record.
- **Bugzilla maintenance jobs: none scheduled.** `collectstats.pl` (chart data), `whine.pl` (scheduled mails), `jobqueue.pl` (async mail), `clean-bug-user-last-visit.pl` — none run. 🟠
- **Monitoring: none.** No uptime check on `/api/health`, no log aggregation, no alert when Bugzilla is down or the DB is full. 🟠
- **Secrets management:** `backend/.env` holds the service key and session secret in plain text on disk (acceptable for a single server if file ACLs are tight; verify they are). 🟡
- **Upgrade path:** Bugzilla 5.2 is current. MariaDB 10.11 is an LTS. Node 24 is current. Fine.
- **Disaster recovery:** attachments live in the DB, so the dump is the full backup — good. Binary logs exist (`C:\MariaDB-binlog`), enabling point-in-time recovery, but no procedure is written. 🟡

## 4.5 Actionable roadmap (prioritised)

**Phase 0 — Stop the bleeding (1–3 days)** 🔴
1. Move Bugzilla credentials from URL parameters to `X-BUGZILLA-*` headers in `bugzillaClient.ts` and `bugzillaAuth.ts`.
2. Change Apache `LogFormat` to drop query strings; delete/scrub existing access logs; rotate the service API key; clear `logincookies`; require a password reset for all 17 accounts.
3. Set `requirelogin = 1`; add mandatory groups to the three open products.
4. `npm update express` in the backend.
5. Schedule `backup-databases.ps1` daily in Task Scheduler and **test a restore** into a scratch database.
6. Remove the "Secured by enterprise single sign-on" claim from the login page.

**Phase 1 — Make it deployable (1–2 weeks)** 🟠
7. One HTTPS origin via reverse proxy (IIS/nginx/Apache): `/api` → BFF, static front-end build, Bugzilla on the same host; `COOKIE_SECURE=true`; `trust proxy`; HSTS; CSP.
8. Redis (or DB) session store; move rate limiter, export jobs and caches to it; run the BFF as a Windows service (NSSM/pm2) with restart-on-failure.
9. Configure SMTP; enable `use_mailer_queue` + `jobqueue.pl`; schedule `collectstats.pl`, `whine.pl`, `clean-bug-user-last-visit.pl`.
10. Switch Apache to mod_perl for Bugzilla.
11. Uptime monitor on `/api/health` and Bugzilla `/rest/version`; disk-space and backup-success alerts.
12. Recreate a disposable staging Bugzilla (Docker) from the nightly dump; restore the e2e robot account there.

**Phase 2 — Harden the product (2–4 weeks)** 🟡
13. Unit tests for the pure modules listed in 4.3; CI pipeline (typecheck, tests, build, audit).
14. Bug **History** tab (field-change audit trail) and a transitive **dependency tree**.
15. Saved views (per user and shared), extended bulk edit, clone bug.
16. Automate product onboarding: create the product's visibility group and group controls from the UI (via Bugzilla's `Group.create` + a small script hook) and run the soft-delete control automatically.
17. Enforce triage rules in Bugzilla too (hook/extension) or restrict Bugzilla's native UI to admins.
18. Generic custom-field support in the editor; define flag types and keywords for the team's workflow; "My requests" page.
19. Global stats cache; route-level code splitting; export streaming beyond 10k rows.
20. Separate `PROOF_LINK_SECRET`; on-disk attachments for new uploads; document time-zone behaviour.
21. Refresh README/DEPLOYMENT (ports, session library), purge `ZZZ_THROWAWAY_*` objects, publish an OpenAPI description of the BFF.

**Phase 3 — Enterprise polish (ongoing)** 🟢
22. SSO (SAML/OIDC in front of the BFF) and MFA; Slack/Teams webhooks; SLA/ageing reports; trend charts; localisation.

---

## Appendix A — Evidence index

| Claim | How verified |
|---|---|
| Credentials in URL / logs | `bugzillaAuth.ts` lines 16–25, `bugzillaClient.ts` lines 26–29; `grep -c` on `bugzilla-access.log` |
| Anonymous product access | Unauthenticated `GET /rest/bug?product=…` returned bugs for KMail API and KPost Admin; empty for KPost API (mandatory group) |
| No TLS | No listener on 443; `ssl_redirect = 0`; `COOKIE_SECURE=false` |
| MemoryStore | `backend/src/index.ts` session config (no `store`) |
| No scheduled tasks | `schtasks /query` contains no Bugzilla, Perl or backup entries |
| Email off | `mail_delivery_method = "None"`, `use_mailer_queue = 0` |
| Dependency vulnerabilities | `npm audit` in `backend` (1 critical, 5 moderate) and `frontend` (7 high dev-only, 5 moderate) |
| Database facts | `information_schema` size ≈ 1,047 MB; 1,847 attachments ≈ 1,172 MB; 1,330 bugs; 379 login cookies |
| Test inventory | 6 spec files / 35 tests under `e2e/tests`; no `*.test.ts`; no `.github` |
| Code size | 20,933 lines of TypeScript; 34 commits |

*End of audit.*
