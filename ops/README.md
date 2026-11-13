# ops/ - running the Bug Tracker on Windows Server

PowerShell, Perl and Node scripts that keep the stack running, report on it, and harden
the server. Bugzilla-side code (extensions, setup scripts) lives in [`../bugzilla/`](../bugzilla/).

> **Do not move or rename `app/` or `reports/`.** Live Windows scheduled tasks call these
> scripts by their full path:
>
> | Scheduled task | Runs |
> |---|---|
> | Bug Tracker app | `ops\app\bug-tracker-supervisor.ps1` (boot + every 5 min) |
> | Bugzilla daily team reports | `ops\reports\run-daily-team-reports.ps1` (daily) |
>
> If they ever move, re-run the matching installer so the task points at the new path.

| Folder | Script | Purpose |
|---|---|---|
| `app/` | `bug-tracker-supervisor.ps1` | Starts the BFF (:4000) and built web app (:5175) whenever they are down. Logs to `logs/` |
| | `install-bug-tracker-task.ps1` | Registers the "Bug Tracker app" scheduled task (run once, as Administrator) |
| | `update-bug-tracker.ps1` | Puts new code live: builds the web app, restarts backend + app |
| `reports/` | `run-daily-team-reports.ps1` | Daily driver: gather → build → email, once per day |
| | `team-report-data.pl` | Step 1 - one day's activity per team, as JSON (read-only) |
| | `build-team-report.cjs` | Step 2 - JSON → one Excel workbook + email per team (uses `backend/node_modules/exceljs`) |
| | `send-team-reports.pl` | Step 3 - emails each workbook to its team leader via Bugzilla's mailer |
| `mail/` | `send-launch-email.pl` | One-off "Bug Tracker is live" email, one per person. Keeps a send log beside itself so nobody is mailed twice - keep it in this folder |
| `server/` | `harden-access-log.ps1` | Stops Apache logging query strings (which can contain credentials) |
| | `register-backup-task.ps1` | Registers / removes the nightly database-backup task |
| | `add-bugtracker-name.bat` | Adds `bugtracker.ueducate` to a PC's hosts file (per client PC, as admin) |
| `checks/` | `health-check.ps1` | One-shot stack health check; exit code 0 = healthy |
| | `verify-transfer.ps1` | End-to-end check of cross-product bug transfer |

Run PowerShell scripts with:

```powershell
powershell -ExecutionPolicy Bypass -File D:\TEST-BENCH-AUTOMATIONS\BUGZILLA-UI\ops\<folder>\<script>.ps1
```
