# UeducateAdmin — Bugzilla extension

Adds the admin endpoints Bugzilla 5.2's REST API lacks, under `/rest/ueducate/...`, for the
custom UI's admin screens. Every endpoint re-checks the same Bugzilla group the native admin page
checks, and changes data only through Bugzilla's own objects (`Bugzilla::Component`,
`Bugzilla::Group`, …), so validation and `audit_log` history apply exactly as on the native pages.
No core file is modified, and it adds no database tables.

| Endpoint | Method | Permission |
|---|---|---|
| `/ueducate/product/{id}/components` | GET — components with bug counts | `editcomponents` (for that product) |
| `/ueducate/component/{id}` | GET / PUT (edit) / DELETE (only with 0 bugs) | `editcomponents` (for that product) |
| `/ueducate/group/{id}/usage` | GET — what blocks a delete | `creategroups` |
| `/ueducate/group/{id}` | DELETE — not system groups; not while bugs, products or flag types use it | `creategroups` |
| `/ueducate/field/{field}/values` | GET (with bug counts and delete blockers) / POST (add) | `admin` |
| `/ueducate/field/{field}/values/{id}` | PUT (rename, sortkey, active) / DELETE (refused if default, built-in, in use, or controlling) | `admin` |
| `/ueducate/field/{field}/order` | PUT — reorder, reusing the field's own sortkeys | `admin` |
| `/ueducate/workflow` | GET / PUT — an explicit add/remove/comment diff; transitions into `duplicate_or_move_bug_status` cannot be removed | `admin` |

`{field}` is one of `bug_severity`, `priority`, `bug_status`, `resolution`, `op_sys`, `rep_platform`.
Workflow changes are written with the same SQL `editworkflow.cgi` uses (Bugzilla has no object class
for transitions), plus an `audit_log` row per change, class `Bugzilla::Extension::UeducateAdmin::Workflow`.

## Deploy

Test on staging first (`ops/staging/README.md`), then take a live backup.

Copy this folder's `UeducateAdmin` directory to `D:\Bugzilla\extensions\UeducateAdmin`.
Bugzilla runs under mod_cgi and loads extensions on every request: no Apache restart and no
`checksetup.pl` needed.

## Switch off instantly

```
type nul > D:\Bugzilla\extensions\UeducateAdmin\disabled
```

Every `/rest/ueducate/...` endpoint disappears from the next request (Bugzilla answers 404 /
code 32614; the UI shows "switched off or not installed"). Nothing else in Bugzilla is affected.
Delete the `disabled` file to switch it back on. To remove it entirely, delete the folder.

## Parameters (`/ueducate/params`, `tweakparams` group)

GET returns every panel exactly as `editparams.cgi` builds it, with Bugzilla's own titles and help
text (rendered from `admin/params/*.html.tmpl`). PUT takes `{changes, reset, confirm}`:

- every change goes through the parameter's own `checker`, with `editparams.cgi`'s normalisation;
  **all are validated before any is written** — one bad value changes nothing;
- each change is written to `audit_log` (class `Bugzilla::Extension::UeducateAdmin::Param`,
  `field` = parameter, `removed`/`added` = old/new value);
- passwords and credentials (`smtp_password`, `RADIUS_secret`, `LDAPbinddn`) are never returned —
  only whether one is set — and appear as `********` in the audit log;
- **dangerous** parameters must be listed in `confirm` or the change is refused (the UI sends the
  name only after the admin has typed it): `urlbase`, `sslbase`, `ssl_redirect`, `shutdownhtml`,
  `user_verify_class`, `user_info_class`, `cookiepath`, `cookiedomain`, `requirelogin`,
  `emailregexp`, `utf8`, `utf8_collate`, and everything on the Email (mta) panel.

### Emergency parameter reset (command line)

If a parameter change locks people out — including out of the custom UI — reset it on the server:

```bat
cd D:\TEST-BENCH-AUTOMATIONS\BUGZILLA-UI
perl ops\bugzilla\reset-param.pl D:\Bugzilla <parameter> [value]
```

It rewrites that one entry in `D:\Bugzilla\data\params.json` (backing the file up next to it
first, as `params.json.<timestamp>.bak`). Bugzilla reads that file on every request: **no Apache
restart and no `checksetup.pl` needed**. Use `D:\Bugzilla-staging` to target staging.

Why not the usual `perl -MBugzilla -e "SetParam(...)"`? With `shutdownhtml` set, every script that
loads Bugzilla — except `editparams.cgi` and `checksetup.pl` — only prints the shutdown page, so that
one-liner cannot undo it (verified on staging). `reset-param.pl` does not load Bugzilla. A reset done
this way bypasses the extension, so it is **not** in the audit log.

You can also open `data\params.json` in Notepad and edit the value by hand — it is plain JSON.

Each one below was set on **staging** through the UI and then recovered:

| Parameter | What breaks (tested on staging) | Can the UI undo it? | Recovery |
|---|---|---|---|
| `shutdownhtml` | Everything: native pages and REST answer 503, the custom UI shows errors, existing UI sessions end | **No** | `reset-param.pl D:\Bugzilla shutdownhtml` — or log in at `http://<host>/editparams.cgi` (exempt from shutdown) and clear it |
| `user_info_class` (e.g. `Env`) | **New logins fail**, native and UI. Existing sessions keep working until they expire | Only from a session that is still open | `reset-param.pl D:\Bugzilla user_info_class CGI` |
| `ssl_redirect` / `sslbase` | Would redirect all requests, REST included, to HTTPS | — | Bugzilla's checker **refuses** an `sslbase` it cannot reach, so it can't be set without working HTTPS. If it ever is: `reset-param.pl D:\Bugzilla ssl_redirect 0` |
| `user_verify_class` (e.g. `RADIUS`) | Logins would fail against an unconfigured source | — | Bugzilla's checker **refuses** it until that source is configured. If it ever gets through: `reset-param.pl D:\Bugzilla user_verify_class DB` |
| `requirelogin` | Anonymous visitors and anonymous REST calls are refused (401). The UI keeps working: it always logs in | Yes | Untick it — or `reset-param.pl D:\Bugzilla requirelogin 0` |
| `urlbase` | Links in emails and redirects point at the wrong host. Native pages and the UI keep working (they use relative links) | Yes | Set it back — or `reset-param.pl D:\Bugzilla urlbase http://192.168.0.50/` |
| `cookiepath` / `cookiedomain` | Native Bugzilla can't keep anyone logged in (the browser drops the cookie). The UI is unaffected | Yes | `reset-param.pl D:\Bugzilla cookiepath /` · `reset-param.pl D:\Bugzilla cookiedomain` |
| `emailregexp` | Addresses that don't match can't sign up or change email. Existing logins still work | Yes | Restore the old pattern — copy it from the latest `params.json.*.bak` or the audit log |
| Email panel (`mail_delivery_method`, `smtpserver`, …) | Mail stops, or starts being sent. Tested only with `Test` (writes `data/mailer.testfile`, never sends) | Yes | `reset-param.pl D:\Bugzilla mail_delivery_method None` stops all mail |
| `utf8`, `utf8_collate` | Not tested: changing a live database's character set can corrupt text | — | Restore from backup; set only during a planned migration |

`reset-param.pl` sets a plain string value. `user_verify_class` and `user_info_class` are
comma-separated strings (e.g. `DB`, `CGI`); booleans are `0` or `1`.

## Sanity check (`/ueducate/sanitycheck`, `editcomponents` group)

POST `{}` runs Bugzilla's own `sanitycheck.cgi` the way `sanitycheck.pl` does (command-line mode,
verbose) and returns the output grouped by check, with the affected bug ids and the repair Bugzilla
offers for each problem. **Without `fix` it only reads** (verified on staging: every table's
checksum unchanged). POST `{fix: "<action>"}` runs that one repair first — exactly as clicking its
link on the native page — then every check again. Allowed actions: `repair_creation_date`,
`repair_bugs_fulltext`, `repair_everconfirmed`, `createmissinggroupcontrolmapentries`,
`remove_invalid_bug_references`, `remove_invalid_attach_references`, `remove_invalid_flags`,
`rescanallBugMail`, `remove_old_whine_targets`. No email is sent by a plain check.
