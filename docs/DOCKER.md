# Running the Bug Tracker in Docker

The whole stack - web app, backend, Bugzilla, database, session store - runs from one
`docker-compose.yml`. This guide moves the live Windows installation into it.

> **Status:** these files were written and statically checked (YAML, shell syntax, line endings,
> the generated Bugzilla answers file), but **not yet built**: the current Windows server has no
> Docker. Do the first build on a Linux machine with Docker and follow this guide end to end.

## What runs

| Service | Image | Built from | Published | Data kept in |
|---|---|---|---|---|
| `web` | nginx serving the React app; forwards `/api` to `bff` | [`frontend/Dockerfile`](../frontend/Dockerfile) | `WEB_PORT` (80) | - |
| `bff` | Node.js backend-for-frontend | [`backend/Dockerfile`](../backend/Dockerfile) | internal | - |
| `bugzilla` | Bugzilla 5.2 + this repo's extensions | [`bugzilla/Dockerfile`](../bugzilla/Dockerfile) | `BUGZILLA_PORT` (8080) | volume `bugzilla-data` |
| `db` | MariaDB 10.11 | official image | internal | volume `db-data` |
| `redis` | Redis 7 (login sessions) | official image | internal | volume `redis-data` |

```
browser ──► web (nginx :80) ──/api──► bff (:4000) ──JSON-RPC──► bugzilla (:80) ──► db (:3306)
                                          └──sessions──► redis
browser ──► bugzilla (:8080)   native admin pages and links in emails
```

Bug attachments are stored in the database (`maxlocalattachment = 0`), so the database dump
carries them.

## Requirements

- Linux host with Docker Engine 24+ and the Compose plugin (`docker compose version`)
- Outbound HTTPS during the build (the Bugzilla image downloads Bugzilla 5.2 from GitHub and Perl modules from CPAN)
- A recent dump of the live `bugs` database

## 1. Settings

```bash
cp .env.docker.example .env      # .env is git-ignored
```

Fill in every value. The ones to copy from the Windows server:

| `.env` | Take it from |
|---|---|
| `BUGZILLA_API_KEY`, `SESSION_SECRET`, `PROOF_LINK_SECRET`, `TRANSFER_API_KEY`, `PRODUCT_TRANSFER_ROUTES` | `backend\.env` (keeping `SESSION_SECRET` and `PROOF_LINK_SECRET` keeps exported proof links valid) |
| `BZ_SITE_WIDE_SECRET` | `$site_wide_secret` in `C:\Bugzilla\localconfig` |
| `BZ_DB_PASSWORD` | a **new** strong password (the database is created fresh) |

`APP_PUBLIC_URL` and `BUGZILLA_PUBLIC_URL` are the addresses people will type, without a trailing slash.

## 2. Database

On the Windows server, take a dump (the nightly task already writes one to
`D:\TEST-BENCH-AUTOMATIONS\_backups\bugzilla-full-<date>.sql`, or run the same command by hand):

```powershell
& 'C:\Program Files\MariaDB 10.11\bin\mysqldump.exe' -u bugs -p -h 127.0.0.1 -P 3307 `
  --single-transaction --quick --hex-blob --max-allowed-packet=512M bugs > bugs.sql
```

Copy it to the Docker host **securely** (it holds every bug, attachment, email address and
password hash), then:

```bash
mkdir -p db-init && gzip -c bugs.sql > db-init/bugs.sql.gz     # db-init/ is git-ignored
```

MariaDB loads it automatically on the **first** start only, while its volume is empty.

## 3. Start

```bash
docker compose up -d --build
docker compose ps                          # all services "running" / "healthy"
docker compose logs -f bugzilla            # first start: checksetup.pl, then "Starting Apache"
curl -s http://localhost/api/health        # {"ok":true,...}
```

The first build takes a while (Perl modules compile). The first start of `db` takes as long
as the dump takes to load.

## 4. Bugzilla parameters

Bugzilla's parameters (mail server, `urlbase`, ...) are not in the database; they are
`C:\Bugzilla\data\params.json`. Copy it in once, then fix the address:

```bash
docker compose cp params.json bugzilla:/var/www/html/data/params.json
docker compose restart bugzilla
```

Then in Bugzilla (`BUGZILLA_PUBLIC_URL`) > Administration > Parameters, set **urlbase** to
`BUGZILLA_PUBLIC_URL/` and check the **Email** section. `params.json` contains the SMTP
password - treat the file as a secret.

## 5. Check

Sign in at `APP_PUBLIC_URL`, open a bug, add a comment, open an attachment, run an Excel
export, and send yourself a "Forgot password" email (its link must open `APP_PUBLIC_URL`).

## Everyday operations

| Task | Command |
|---|---|
| Deploy new code | `git pull && docker compose up -d --build` |
| Logs | `docker compose logs -f bff` (or `web`, `bugzilla`, `db`) |
| Run a Bugzilla setup / admin script | `docker compose exec -w /var/www/html bugzilla perl -T /opt/bugtracker/admin/unlock-account.pl <login>` |
| Database backup | `docker compose exec db sh -c 'mariadb-dump -u root -p"$MARIADB_ROOT_PASSWORD" --single-transaction --quick --hex-blob --max-allowed-packet=512M bugs' \| gzip > bugs-$(date +%F).sql.gz` |
| Stop / start | `docker compose stop` / `docker compose start` |

Schedule the backup line with cron (daily), and keep copies off the host.

## Not covered by the containers

| Windows piece | In Docker |
|---|---|
| `ops/app` supervisor and its scheduled task | Replaced by Docker's `restart: unless-stopped` |
| `bugzilla/mail-queue` worker (Windows-only) | Replaced by Bugzilla's own `jobqueue.pl`, started inside `bugzilla` |
| `ops/server/harden-access-log.ps1` | Built in: Apache's access log in the image omits query strings |
| `ops/reports` daily team reports (PowerShell + Perl + Node) | **Not yet containerised** - keep running them on Windows, or port them to a cron job |
| `ops/server/register-backup-task.ps1` | Replace with the cron backup above |
| `ops/server/add-bugtracker-name.bat` | Use a DNS record for the new host instead |

## HTTPS

Put TLS in front of `web` (and `bugzilla`) - a cloud load balancer or a reverse proxy such as
Caddy or Traefik - then set `HSTS=true` and use `https://` in both public URLs. Cookies switch to
`Secure` automatically (`COOKIE_SECURE=auto`, `TRUST_PROXY=1`).
