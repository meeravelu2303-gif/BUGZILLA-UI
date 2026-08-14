# Bugzilla UI

A standalone, modern SaaS-style front end for Bugzilla 5.2, built entirely on top of its
REST API. Bugzilla remains the sole system of record — this project never touches its
database and never modifies its Perl/Template-Toolkit code.

## Architecture

```
┌──────────────────┐        ┌──────────────────────┐        ┌────────────────────────┐
│                  │  HTTPS │                       │  HTTPS │                        │
│  Browser (React) │───────▶│  BFF (Node/Express)   │───────▶│  Bugzilla 5.2 REST API │
│  Vite dev :5173  │◀───────│  :4000                │◀───────│  /bugzilla/rest         │
│                  │ cookie │                       │  token/ │                        │
└──────────────────┘ session└──────────────────────┘ api_key └────────────────────────┘
                                        │
                                        │  signed, httpOnly session cookie
                                        │  (Bugzilla session token + user identity)
                                        ▼
                              No database driver anywhere.
                              Bugzilla's MySQL DB is never touched directly.
```

- **Browser → BFF**: the React SPA only ever calls its own `/api/*` routes, with the
  session cookie sent automatically (`credentials: 'include'`). It never sees a Bugzilla
  API key or talks to Bugzilla directly.
- **BFF → Bugzilla**: every upstream call goes through Bugzilla's REST API
  (`BUGZILLA_URL`, e.g. `http://localhost/bugzilla/rest`) with a 15s timeout and Zod
  validation on the way back in.
- **Auth model**: per-user token pass-through. Logging in calls Bugzilla's own
  `GET /login`, and the returned session token is stored server-side in a signed,
  httpOnly cookie — never sent to the browser as JS-readable state. All subsequent
  Bugzilla calls for that request use *that user's* token, so Bugzilla's native
  per-user group permissions (e.g. a restricted product) are respected exactly as they
  would be in Bugzilla's own web UI. A service-level `BUGZILLA_API_KEY` exists only as a
  fallback/connectivity credential and is not used for normal per-user data operations.
- **Admin gating**: at login, the BFF also reads the user's own Bugzilla group
  membership (`GET /user/{ownId}`, which always shows a user their own full groups
  regardless of privilege) and derives `{ canManageUsers, canManageProducts }` from the
  presence of the `editusers` / `editcomponents` groups. This is stored on the session
  and returned to the frontend, which uses it to hide the Users/Products nav entirely
  for non-admins. That's a UX convenience only — the real enforcement is Bugzilla
  itself: every admin write is re-checked live, and a stale/forged permission is
  rejected with Bugzilla error code `304`, mapped to a `403 FORBIDDEN` the UI shows as
  a clean "you don't have permission" state rather than a crash.

See [`API_CONTRACT.md`](./API_CONTRACT.md) for the full live-probed REST contract this
was built against, including exact request/response shapes and Bugzilla's error
behavior.

## Confirmation: no database drivers

`backend/package.json` dependencies: `cookie-session`, `cors`, `dotenv`, `express`,
`zod`. No `mysql`, `mysql2`, `pg`, `sqlite3`, an ORM, or any other DB driver is
installed or imported anywhere in this repo. Every read, create, update, and comment
goes through Bugzilla's REST API exclusively (see `backend/src/lib/bugzillaClient.ts`
and `backend/src/lib/bugzillaAuth.ts`).

## Project structure

```
BUGZILLA-UI/
├── API_CONTRACT.md          # Phase 0 live discovery notes
├── backend/                 # BFF — Node + Express + TypeScript
│   ├── .env.example
│   └── src/
│       ├── config/env.ts        # Zod-validated environment config
│       ├── lib/                 # Bugzilla REST client, auth, typed errors, input validation
│       ├── middleware/          # requireAuth (per-user token), requirePermission (admin gate), error handler
│       ├── routes/              # auth, bugs, products, meta, adminUsers, adminProducts
│       ├── schemas/             # Zod schemas + upstream→normalized mappers
│       └── index.ts
└── frontend/                # React + TypeScript + Vite + Tailwind
    └── src/
        ├── api/              # fetch client + React Query hooks
        ├── components/       # ui/ (glassmorphism design system), layout/, bugs/, dashboard/, admin/
        ├── context/          # ToastContext
        ├── pages/            # Login, Dashboard, BugList, BugDetail, CreateBug
        │   └── admin/        # Users, CreateUser, UserDetail, Products
        └── types/
```

## Setup

### 1. Backend (BFF)

```bash
cd backend
cp .env.example .env
# Edit .env:
#   BUGZILLA_URL     — e.g. http://localhost/bugzilla/rest
#   BUGZILLA_API_KEY — generate via Bugzilla web UI: Preferences > API Keys
#   SESSION_SECRET   — any long random string (openssl rand -hex 32)
npm install
npm run dev      # starts on http://localhost:4000
```

### 2. Frontend

```bash
cd frontend
npm install
npm run dev       # starts on http://localhost:5173, proxies /api to :4000
```

Open `http://localhost:5173` and sign in with a Bugzilla account's email + password
(this calls Bugzilla's own login, not a separate credential store).

### Type checking

```bash
cd backend  && npm run typecheck   # tsc --noEmit
cd frontend && npm run typecheck   # tsc --noEmit
```

Both pass cleanly with zero errors.

## API surface (BFF)

| Method | Path | Notes |
|---|---|---|
| POST | `/api/auth/login` | `{ login, password }` → Bugzilla session token stored server-side |
| POST | `/api/auth/logout` | Clears the session cookie |
| GET | `/api/auth/me` | Current user identity |
| GET | `/api/bugs` | List with filters, search, sort, pagination |
| GET | `/api/bugs/:id` | Bug + comments + attachment metadata in one call |
| GET | `/api/bugs/:id/attachments/:attachmentId` | Streams the raw attachment (binary), not base64 JSON |
| POST | `/api/bugs` | Create; defaults `op_sys`/`platform` to `All` and `version` to `unspecified` unless overridden |
| PATCH | `/api/bugs/:id` | Partial update of any editable field |
| POST | `/api/bugs/:id/comments` | Add a comment |
| GET | `/api/products` | Enterable products with components/versions/milestones (any logged-in user) |
| GET | `/api/meta` | Field enums, `bugzillaWebUrl` for native-admin links |
| GET | `/api/admin/users?search=` | **Admin.** Search users by name/email — requires `editusers` |
| GET/POST/PATCH | `/api/admin/users(/:id)` | **Admin.** View, create, update (name/password/enable-disable) — requires `editusers` |
| POST/PATCH | `/api/admin/products(/:id)` | **Admin.** Create a product, update description/active state — requires `editcomponents` |
| POST | `/api/admin/products/:id/components` | **Admin.** Create a component — requires `editcomponents` |

Every error response has the same shape: `{ error: true, status, code, message }`,
classified by Bugzilla's own numeric error code rather than its (inconsistently mixed)
HTTP status — see `API_CONTRACT.md` §8 (and §12 for the admin-specific error catalog)
for why that mattered.

## Why some admin stays native

Bugzilla's REST API exposes enough to safely build **user creation/enable-disable** and
**product/component creation** over HTTP — so this app does. It deliberately does
**not** attempt to rebuild:

- Group and permission administration (`editgroups.cgi`, group membership on
  `editusers.cgi`)
- Field-level security, flag types, custom field definitions
- Status/resolution workflow configuration (`editworkflow.cgi`)
- Full product/component editing beyond what's shown here (e.g. renaming a component)

Two different reasons drive this boundary, and it matters which one applies where:

1. **It's not exposed at all.** `PUT /component/{id}` returns a REST `404` on this
   Bugzilla version — component editing after creation has no REST path, full stop
   (confirmed live, see `API_CONTRACT.md` §12.3). There's nothing to build here even if
   we wanted to.
2. **It's deliberately not used, even though it might exist.** Group/permission
   membership editing is the kind of security-critical, mature, upgrade-sensitive
   surface where a reimplementation risks getting subtly wrong what Bugzilla's own
   admin UI has gotten right for two decades — a bug in *this* app's group editor could
   silently misconfigure who can see what. The cost of "just link out" is one click;
   the cost of a permission bug is a data exposure incident. That trade isn't close.

Every "Advanced Administration" link in the sidebar opens the real Bugzilla admin page
in a new tab — this app never mirrors, proxies, or reimplements what happens there.

## End-to-end verification performed

Run against the live local Bugzilla instance (`http://localhost/bugzilla`), driven
through an actual headless browser (Edge via `playwright-core`), not just curl:

- Login screen renders and authenticates against real Bugzilla credentials
- Dashboard renders live stat cards (total/open/resolved/blocker+critical) and
  status/severity breakdown charts computed from real bug data
- Bug list renders, filters, sorts, and paginates against the live dataset
- Bug detail renders description, comments, attachment (with working download link),
  and an editable metadata sidebar
- Created a new bug through the UI (defaults applied correctly: OS=All, Platform=All)
  and was redirected to its detail page
- Edited a bug's priority through the sidebar and saved via `PATCH`
- Added a comment through the UI
- Confirmed `tsc --noEmit` is clean on both `backend` and `frontend`

**Glassmorphism + admin extension**, verified the same way (real Edge browser, real
Bugzilla instance, real admin and non-admin accounts):

- Login, Dashboard, Bug List, Bug Detail, and Create Bug all render the frosted-glass
  treatment (translucent cards over a soft mesh gradient) with body text staying fully
  legible — no light-on-light contrast anywhere
- As the admin account: Users and Products nav items are visible; created a real user
  through the UI form, was redirected to its detail page, then disabled it with a
  reason and confirmed the `Enabled → Disabled` pill flip; created a real product
  through the UI, added a component to it, and toggled it inactive then back to active,
  each step confirmed via toast and a re-fetched pill state
- As a genuinely non-admin account (a real login, not just an anonymous request): Users
  and Products nav items are absent, the "Advanced Administration" section doesn't
  render at all, and forcing direct navigation to `/admin/users` and `/admin/products`
  renders the clean "You don't have permission to view this page" state — no crash, no
  bounce to the login screen. Ordinary features (bug list, correctly scoped to only the
  products this account can see) kept working normally throughout
- Found and fixed two real bugs surfaced by this testing, not just cosmetic issues:
  1. `Input`/`Select`/`Textarea` didn't auto-generate an `id`, so labels were never
     programmatically associated with their fields — a real accessibility gap against
     the brief's ARIA requirement, not just a test-selector inconvenience. Fixed with
     `useId()` in `components/ui/Field.tsx`, app-wide, in one place.
  2. The admin Products page originally reused the public product list
     (`product_enterable`), but Bugzilla excludes componentless products from
     "enterable" — so a freshly created product (which has no components yet) would
     have been invisible on the very page meant to let you add its first component.
     Fixed with a dedicated `GET /api/admin/products` backed by `product_accessible`
     instead (see `backend/src/routes/adminProducts.ts`).
  3. `useLogout`'s `queryClient.clear()` didn't reliably resolve `RequireAuth`'s
     reactive redirect after logout (a known sharp edge of `.clear()` vs. mounted
     query observers) — the app would sit on a stale, data-less shell indefinitely.
     Fixed with an explicit hard redirect (`window.location.href = '/login'`) after
     clearing the cache, which is also just the more robust choice for a
     security-sensitive transition.

### Test objects on the live instance

Every object below is clearly labeled `ZZZ_THROWAWAY_*` and safe to delete — none are
auto-cleaned so you can inspect them first.

| Type | Id | Identifier | Current state |
|---|---|---|---|
| Bug | 38 | `ZZZ_THROWAWAY_DISCOVERY_BUG_DELETE_ME` (TestProduct) | CONFIRMED |
| Bug | 39 | `ZZZ_THROWAWAY_BFF_TEST` (TestProduct) | RESOLVED/WONTFIX |
| Bug | 40 | `ZZZ_THROWAWAY_UI_TEST` (TestProduct) | CONFIRMED |
| User | 4 | `zzz-throwaway-probe@example.invalid` | Enabled (used as the non-admin test account throughout) |
| User | 5 | `zzz-throwaway-ui-user-*@example.invalid` | **Disabled** (deliberately, to demonstrate the disable flow) |
| Product | 5 | `ZZZ_THROWAWAY_TEST_PRODUCT` (+ component `ZZZ_THROWAWAY_COMPONENT`) | Active |
| Product | 6 | `ZZZ_THROWAWAY_UI_PRODUCT_*` (+ component `ZZZ_THROWAWAY_COMPONENT_*`) | Active |

## Known scope notes

- Pagination has no total count because Bugzilla's REST search doesn't return one; the
  BFF fetches `limit + 1` rows to detect a next page instead of showing a page count.
- The dashboard computes its breakdown from the first 200 bugs (sufficient for this
  dataset); a very large instance would want a dedicated aggregation strategy.
- Status transitions in the sidebar aren't restricted to Bugzilla's exact
  `can_change_to` state machine per current status — an invalid transition is caught
  and surfaced as a normal validation error from Bugzilla rather than pre-validated
  client-side.
