# Implementation & Deployment Guide

How to stand up the Bugzilla UI properly: configure Bugzilla once, run the two
services, verify end-to-end, then roll it out to your team.

> **Mental model.** This app is a thin, modern skin over Bugzilla's REST API.
> Bugzilla stays the system of record. You configure the *structure* in
> Bugzilla once (products, groups, workflow), then everyone does their *daily
> work* in this UI. The app never touches Bugzilla's database directly.

```
Browser (React)  ──►  BFF (Node/Express)  ──►  Bugzilla 5.2 REST API
   :5173 dev            :4000                     /bugzilla/rest
```

---

## Phase 0 — Prerequisites

| Component | Notes |
|---|---|
| A running Bugzilla 5.2 | e.g. via XAMPP at `http://localhost/bugzilla` |
| Node.js 18+ | `node -v` (project verified on 18/20) |
| An admin Bugzilla account | member of `editusers` and `editcomponents` groups |
| Git | to pull the branch / apply changes |

Confirm Bugzilla's REST API is reachable **before** anything else — open this in a browser:

```
http://localhost/bugzilla/rest/version
```

You should get JSON like `{"version":"5.2"}`. If it 404s, your Bugzilla path is
different — note the correct base; you'll need it for `BUGZILLA_URL`.

---

## Phase 1 — Configure Bugzilla once (admin, in the Perl admin)

Do this **before** rolling the app out. These are the structural settings
Bugzilla's REST API cannot write, so they're set up once in Bugzilla's own admin
(`http://localhost/bugzilla/` → Administration):

1. **Parameters** (`editparams.cgi`)
   - `urlbase` = your Bugzilla URL (e.g. `http://localhost/bugzilla/`)
   - Mail settings so notifications send
   - `requirelogin` = On (recommended)
2. **Products / Components / Versions / Milestones** (`editproducts.cgi`)
   - Create at least one product with one component (bugs can't be filed otherwise)
   - *(products & components can also be created later from the app)*
3. **Groups & Permissions** (`editgroups.cgi`)
   - Decide who can see restricted products; create groups as needed
4. **Field Values** (`editvalues.cgi`) — only if you want custom severities /
   priorities / resolutions beyond the defaults
5. **Status Workflow** (`editworkflow.cgi`) — only if you want to change the
   default transitions
6. **Create an API key for the service account** (Preferences → API Keys → generate)
   - Used by the BFF only for pre-login connectivity/meta probes; per-user
     actions use each user's own session token.

> You can view all of the above **inside this app** later (Administration →
> Field Values / Status Workflow / Groups / Parameters) — read-only, with an
> "Edit in Bugzilla" link for the actual change.

---

## Phase 2 — Run the Backend (BFF)

```bash
cd backend
cp .env.example .env        # Windows: copy .env.example .env
```

Edit `backend/.env`:

```ini
BUGZILLA_URL=http://localhost/bugzilla/rest   # MUST end in /rest
BUGZILLA_API_KEY=<the key from Phase 1 step 6>
PORT=4000
SESSION_SECRET=<random string, 16+ chars>     # e.g. openssl rand -hex 32
COOKIE_SECURE=false                            # true only behind HTTPS
CORS_ORIGIN=http://localhost:5173
```

Then:

```bash
npm install
npm run dev        # → "BFF listening on http://localhost:4000"
```

Sanity check: `http://localhost:4000/api/health` → `{"ok":true}`.

**Common startup errors**
- `Invalid environment configuration` → a required `.env` value is missing/blank.
- `EADDRINUSE :::4000` → port 4000 already in use; stop the other instance
  (`Get-Process -Id (Get-NetTCPConnection -LocalPort 4000).OwningProcess | Stop-Process -Force`).

---

## Phase 3 — Run the Frontend

In a **separate** terminal:

```bash
cd frontend
npm install
npm run dev        # → http://localhost:5173  (proxies /api to :4000)
```

Open **http://localhost:5173** and sign in with a Bugzilla email + password
(this calls Bugzilla's own login — no separate credential store).

Both servers must be running at once: backend on :4000, frontend on :5173.

---

## Phase 4 — Verify end-to-end

Sign in as your admin account and confirm:

- [ ] Dashboard shows real stat cards and breakdown charts
- [ ] All Bugs lists, filters, sorts, paginates
- [ ] Open a bug → edit a field in the sidebar → Save succeeds
- [ ] Create a new bug → redirected to its detail page
- [ ] Advanced Search → results land in the bug list with filter chips
- [ ] Reports & Charts renders
- [ ] Administration → Users / Products load; Field Values / Workflow / Groups /
      Parameters render natively (read-only), Sanity Check shows the action card
- [ ] Sign in as a **non-admin** account → admin menus are absent, and only
      permitted products/bugs are visible

---

## Phase 5 — Production deployment

For a real rollout, don't ship the Vite dev server. Build static assets and
serve everything behind **one origin** (this also makes the "Edit in Bugzilla"
handoffs and any embedding behave, and lets cookies be `Secure`).

1. **Build the frontend**
   ```bash
   cd frontend && npm run build      # outputs frontend/dist
   ```
2. **Build & run the backend**
   ```bash
   cd backend && npm run build && npm start
   ```
3. **Front it with a reverse proxy** (nginx / Apache / IIS) on a single host+domain:
   - `/api/*` → BFF (`:4000`)
   - everything else → the static `frontend/dist`
   - (ideally same domain as Bugzilla, so it all feels like one system)
4. **Harden the BFF `.env`**
   - `COOKIE_SECURE=true` (you're on HTTPS)
   - `CORS_ORIGIN=https://your-app-domain`
   - a strong, secret `SESSION_SECRET`
5. **HTTPS everywhere** — terminate TLS at the proxy.

---

## Phase 6 — Team rollout

- Give each team member a **Bugzilla account** (create them in-app: Administration
  → Users, or in Bugzilla). Their app access = their Bugzilla permissions.
- Share the app URL. The app enforces per-user permissions via Bugzilla itself:
  non-admins never see admin menus and only see products/bugs their groups allow.
- Point people at daily flows: **My Bugs**, **Advanced Search**, **New Bug**,
  **Reports**. The Perl admin becomes a rarely-visited back room.

---

## What stays in Bugzilla (by design)

Writes with **no REST API** — done in Bugzilla, viewable in-app read-only:
field values, status workflow, group definitions/membership, instance
parameters, sanity check, and renaming/deleting existing
components/versions/milestones. This boundary is a Bugzilla API limitation, not
a UI shortcut — see `README.md` → "Why some admin stays native".

Everything else (bugs, comments, user create/enable-disable, product/component
**create**) is fully native in the app.
