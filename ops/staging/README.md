# Bugzilla staging

> **Since 2026-10-16 staging runs on `bugs_preview`** — the Mantis data migrated into Bugzilla —
> on the same MariaDB server as live (127.0.0.1:3307), with its own account `bugs_preview`
> (rights on `bugs_preview` only; password only in `D:Bugzilla-staginglocalconfig`).
> It is **not** a copy of live any more, so `refresh-staging.sh` refuses to run while staging
> points at it. `bugs_preview` is backed up nightly-style by `_backups/backup-databases.ps1`.
> Rollback to the MySQL 8 copy: restore `D:Bugzilla-staginglocalconfig.bak-mysql8-20261016-173611`.
> The table below describes the original copy-of-live layout (`bugs_staging`), kept for reference.

A full copy of live Bugzilla for testing. **All test changes happen here, never on live.**

| | Live | Staging |
|---|---|---|
| Files | `D:\Bugzilla` | `D:\Bugzilla-staging` |
| Database | `bugs` (user `bugs`) | `bugs_staging` (user `bugs_staging`, rights on `bugs_staging` only) |
| Bugzilla URL | `http://192.168.0.50/` | `http://127.0.0.1:8081/` — this server only, not the LAN |
| Custom UI | `npm run dev` → `:5175` → backend `:4000` | `npm run dev:staging` → `http://localhost:5176` → backend `:4001` |
| Backend config | `backend/.env` | `backend/.env.staging` (git-ignored; template: `.env.staging.example`) |
| Email | — | `mail_delivery_method = None` (nothing is ever sent) |
| Marker | — | Red STAGING banner in Bugzilla (`announcehtml`) and in the UI, `[STAGING]` tab titles |

Use **`http://127.0.0.1:8081/`**, not `localhost:8081`: browsers share cookies across ports of one
host name, and live answers on `localhost`. The staging UI uses its own session cookie for the same
reason. Staging has its own `site_wide_secret`, so no token or cookie from one works on the other.

Test login (staging only): `qa-staging-admin@kpost.local` / `Staging-Test-Passw0rd!`
(admin, editcomponents, creategroups, editusers, tweakparams, KPost API/UI).

## Refresh staging from live

```bash
ops/staging/refresh-staging.sh            # dumps live now (read-only), restores into bugs_staging
ops/staging/refresh-staging.sh dump.sql   # or restore a dump you already have
```

About 4 minutes. Live is only read (`mysqldump --single-transaction`). The staging **database** is
replaced — test bugs, robot accounts and experiments are gone; the robot account is recreated. The
staging **files** (`localconfig`, `data/params.json`: URL, mail off, banner) are kept.

If live's *files* change (a Bugzilla upgrade, a new extension version), copy them across first,
keeping staging's `localconfig` and `data/params.json`:

```bash
robocopy D:\Bugzilla D:\Bugzilla-staging /E /XF localconfig params.json /XD data
```

## Scripts here

| File | Purpose |
|---|---|
| `refresh-staging.sh` | The refresh above |
| `StagingGuard.pm` | `use`d by every staging script; refuses to run unless the working directory is `D:\Bugzilla-staging` **and** the connected database is `bugs_staging` |
| `staging-params.pl` | Sets staging's `urlbase`, `mail_delivery_method`, `announcehtml` |
| `staging-robot.pl` | Creates/refreshes the staging test account |

## Apache

`C:\Apache24\conf\httpd.conf` has a `<VirtualHost 127.0.0.1:8081>` block for staging
(`Listen 127.0.0.1:8081`, `Require local`). Remove that block and restart Apache to retire staging.
