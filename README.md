# Bug Tracker (Bugzilla UI)

A modern web front end for **Bugzilla 5.2**, plus the Bugzilla-side extensions and the
operations scripts that run it on Windows Server.

Bugzilla stays the system of record. The web app and its backend talk to Bugzilla only
through its REST/JSON-RPC API; Bugzilla's own Perl code is **not modified** - every
server-side customisation is a Bugzilla extension or template override kept in
[`bugzilla/`](./bugzilla/).

```
┌───────────────────┐  /api/*   ┌──────────────────────┐  JSON-RPC  ┌──────────────────────────┐
│  Web app (React)  │──────────▶│  BFF (Node/Express)  │───────────▶│  Bugzilla 5.2 (Perl)     │
│  :5175            │◀──────────│  :4000               │◀───────────│  Apache :80 + extensions │
└───────────────────┘  session  └──────────────────────┘ user token └────────────┬─────────────┘
                       cookie                                                     │
                                                                       MariaDB "bugs" :3307
```

The browser never sees a Bugzilla credential: the BFF keeps each user's Bugzilla token in
a server-side session, so Bugzilla's own permissions apply to every request. Details:
[`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md).

---

## Tech stack

| Layer | Language | Main frameworks & libraries | Location |
|---|---|---|---|
| **Web app** (SPA) | TypeScript (React TSX), CSS | React 18.3, Vite 5.4, Tailwind CSS 3.4, TanStack React Query 5, React Router 6, Radix UI, Framer Motion, cmdk, lucide-react | [`frontend/`](./frontend/) |
| **BFF** (backend-for-frontend) | TypeScript (Node.js) | Express 4, express-session (file / Redis store), Zod 3, ExcelJS, archiver, tsx (dev) | [`backend/`](./backend/) |
| **Bugzilla customisations** | Perl 5, Template Toolkit | Bugzilla 5.2 extension API (hooks + WebService) - AttachmentDelete, CommentEdit, SubComponents, Teams, Welcome | [`bugzilla/extensions/`](./bugzilla/extensions/), [`bugzilla/templates/`](./bugzilla/templates/) |
| **Bugzilla setup, admin & migration** | Perl 5, SQL | Bugzilla libraries (`Bugzilla->dbh`), one-time setup scripts, Mantis → Bugzilla import | [`bugzilla/`](./bugzilla/) |
| **Operations** (Windows Server) | PowerShell, Perl, Node.js (CJS), Batch | Task Scheduler supervisor, daily Excel team reports, Apache hardening, backups | [`ops/`](./ops/) |
| **End-to-end tests** | TypeScript | Playwright 1.62 | [`e2e/`](./e2e/) |
| **Docs** | Markdown (+ generated HTML / DOCX / PDF) | `docs/guides/build-guide.mjs` builds the user guide | [`docs/`](./docs/) |

**Runtime platform (production server)**

| Component | Version | Notes |
|---|---|---|
| Windows Server | 2022 Standard | Hosts everything below |
| Node.js | 24.x (see [`.nvmrc`](./.nvmrc)) | Runs the BFF and serves the built web app |
| Bugzilla | 5.2 | `C:\Bugzilla`, unmodified upstream checkout + extensions |
| Apache HTTP Server | 2.4 (Win64) | Serves Bugzilla on port 80 |
| Strawberry Perl | 5.40 | Runs Bugzilla and every `.pl` script here |
| MariaDB | 10.11 | Bugzilla database `bugs`, port 3307 |
| Redis | optional | Only when `SESSION_STORE=redis` (multi-instance BFF) |

**Code by language** (tracked source, excluding lock files and generated docs)

| Language | Lines | Used for |
|---|---:|---|
| TypeScript / TSX | ~36,200 | Web app, BFF, e2e tests |
| Perl | ~4,400 | Bugzilla extensions, setup/admin/migration scripts, reports, mail |
| SQL | ~1,800 | Database schema reference, migration helpers |
| PowerShell | ~700 | Service supervisor, scheduled tasks, server hardening, checks |
| JavaScript (Node) | ~860 | Report builder, guide builder, Tailwind/PostCSS config |
| Template Toolkit | ~320 | Bugzilla email and error-message templates |
| CSS | ~200 | Global styles on top of Tailwind |
| Batch | ~30 | Network name helper |

---

## Repository structure

```
BUGZILLA-UI/
├── frontend/                   Web app - React + TypeScript + Vite + Tailwind  (port 5175)
│   ├── public/                 Static files served as-is (favicon)
│   └── src/
│       ├── api/                Fetch client + React Query hooks (calls /api/* only)
│       ├── assets/             Brand images
│       ├── components/         ui/ (design system), layout/, bugs/, dashboard/, admin/, auth/, ...
│       ├── context/            React context providers (toasts)
│       ├── lib/                Hooks, roles, filters, report model, utilities
│       ├── pages/              Route screens; admin/ holds the admin screens
│       └── types/              Shared TypeScript types
│
├── backend/                    BFF - Node + Express + TypeScript  (port 4000) - layers: backend/README.md
│   ├── .env.example            Every setting, documented - copy to .env (never commit .env)
│   ├── Dockerfile              Two-stage image: compile TypeScript, run dist/ as non-root
│   └── src/
│       ├── index.ts            Entry point: security headers, CORS, sessions, mounts /api, listen
│       ├── routes/             api.route.ts - the one route file: every endpoint, middleware, handler
│       ├── middleware/         Auth / permission checks, rate limits, error handler
│       ├── controllers/        Exported request handlers only, one file per resource
│       ├── dto/                Zod request schemas + Bugzilla → API mappers (*.dto.ts)
│       ├── services/           Business logic (*.service.ts)
│       ├── clients/            Bugzilla JSON-RPC client, Bugzilla sign-in, session store
│       ├── events/             Live updates (Server-Sent Events)
│       ├── helpers/            Responses, errors, validation, memo cache, proof pages
│       ├── config/             app.config.ts - Zod-validated environment configuration
│       └── types/              Express type augmentation
│
├── bugzilla/                   Everything that is deployed into, or runs inside, C:\Bugzilla (Perl)
│   ├── extensions/             Bugzilla extensions - copy each folder to C:\Bugzilla\extensions
│   ├── templates/              Template overrides - copy to C:\Bugzilla\template
│   ├── mail-queue/             Background mail sender + its scheduled-task installer
│   ├── setup/                  One-time, idempotent configuration (statuses, groups, SMTP, ...)
│   ├── admin/                  Operator utilities (unlock account, change login, delete product)
│   ├── migration/              Mantis → Bugzilla data import
│   └── schema/                 Reference dump of the Bugzilla database structure (no data)
│
├── ops/                        Running the stack on Windows Server
│   ├── app/                    Supervisor for BFF + web app, its task installer, update script
│   ├── reports/                Daily per-team Excel reports, emailed
│   ├── mail/                   One-off announcement mail
│   ├── server/                 Apache log hardening, DB-backup task, LAN name helper
│   └── checks/                 Health check, transfer end-to-end check
│
├── e2e/                        Playwright end-to-end + security tests (own package.json)
├── scripts/                    Small build helpers used by npm scripts
├── docs/                       Architecture, deployment, API contract, branding, guides, reports
│
├── package.json                Root scripts that drive both apps (dev / build / typecheck)
├── .editorconfig               Shared editor settings
├── .gitattributes              Line-ending and binary rules
├── .gitlab-ci.yml              CI: secret scan, dependency audit, backend + frontend build
└── .nvmrc                      Node.js version
```

Each of `bugzilla/`, `ops/` and `e2e/` has its own README describing its scripts.

---

## Getting started (development)

Prerequisites: Node.js 24 (`.nvmrc`), and a reachable Bugzilla 5.2 with an admin account.

```bash
npm run install:all                    # root + backend + frontend dependencies

cp backend/.env.example backend/.env   # then edit: BUGZILLA_URL, BUGZILLA_API_KEY, SESSION_SECRET
npm run dev                            # BFF on :4000 and web app on :5175 (proxies /api to :4000)
```

Open <http://localhost:5175> and sign in with a Bugzilla account.

| Command | What it does |
|---|---|
| `npm run dev` | Backend (watch mode) + frontend (Vite dev server) together |
| `npm run build` | Compiles the backend to `backend/dist` and builds the web app to `frontend/dist` |
| `npm run typecheck` | `tsc --noEmit` for backend and frontend |
| `npm run serve` | Builds the web app, then runs backend + `vite preview` (production-like) |
| `cd e2e && npm test` | Playwright suite - see [`e2e/README.md`](./e2e/README.md) first |

## Production

On the server the stack runs from this folder as the Windows scheduled task
**"Bug Tracker app"**, which starts [`ops/app/bug-tracker-supervisor.ps1`](./ops/app/bug-tracker-supervisor.ps1)
(keeps the BFF and the built web app running; logs in `logs/`). To put new code live:

```powershell
git pull
powershell -ExecutionPolicy Bypass -File ops\app\update-bug-tracker.ps1   # builds, then restarts
```

Bugzilla-side changes (extensions, templates, setup scripts) are deployed separately -
see [`bugzilla/README.md`](./bugzilla/README.md). Full install and configuration:
[`docs/DEPLOYMENT.md`](./docs/DEPLOYMENT.md).

## Documentation

| Document | Contents |
|---|---|
| [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md) | Request flow, auth model, BFF API surface, design boundaries, scope notes |
| [`docs/DEPLOYMENT.md`](./docs/DEPLOYMENT.md) | Install, configure Bugzilla, run, operate |
| [`docs/API_CONTRACT.md`](./docs/API_CONTRACT.md) | Live-probed Bugzilla API behaviour and the BFF endpoints |
| [`docs/BRANDING.md`](./docs/BRANDING.md) | Palette, logo, contrast decisions |
| [`docs/guides/`](./docs/guides/) | End-user guides (Markdown source + HTML / DOCX / PDF) |
| [`docs/reports/`](./docs/reports/) | Point-in-time production-readiness audit |
| [`CONTRIBUTING.md`](./CONTRIBUTING.md) | Branching, commits, checks, and rules for working on this repo |
