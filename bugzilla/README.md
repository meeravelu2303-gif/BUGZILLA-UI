# bugzilla/ - Bugzilla-side customisations

Everything here is **Perl / Template Toolkit / SQL that runs inside Bugzilla 5.2**
(`C:\Bugzilla`). The Bugzilla installation itself is an unmodified upstream checkout
(`bugzilla-5.2` tag); this folder is the source of truth for every customisation on top of it.

> Bugzilla does **not** read from this folder. Extensions, templates and the mail worker
> are *copied* into `C:\Bugzilla`; the scripts are *run* from `C:\Bugzilla` so they can
> load Bugzilla's libraries. After changing a file here, deploy it (below).

| Folder | What it is | How it is used |
|---|---|---|
| [`extensions/`](./extensions/) | Bugzilla extensions (hooks + REST web services) | Copied to `C:\Bugzilla\extensions\<Name>` |
| [`templates/`](./templates/) | Template overrides (bug-mail layout) | Copied to `C:\Bugzilla\template\en\custom` |
| [`mail-queue/`](./mail-queue/) | Background mail sender, and the installer for its scheduled task | Installer copies the worker to `C:\Bugzilla` |
| [`setup/`](./setup/) | One-time, idempotent configuration scripts | Run once per environment (safe to re-run) |
| [`admin/`](./admin/) | Operator utilities for day-to-day support | Run on demand |
| [`migration/`](./migration/) | Mantis → Bugzilla data import | Run in order during a migration |
| [`schema/`](./schema/) | Structure-only dump of the `bugs` database | Reference only - never executed |

## Extensions

| Extension | Purpose | Needs a setup script |
|---|---|---|
| `AttachmentDelete` | Removes an attachment for good (row, data, flags, history) | - |
| `CommentEdit` | Lets a comment's author correct it, keeping every earlier version | `setup/setup-comment-edits.pl` |
| `SubComponents` | Sub-component values per component, with REST routes | `setup/add-subcomponent-field.pl` |
| `Teams` | Named teams with a leader (used by the daily team reports) | `setup/setup-teams.pl` |
| `Welcome` | Emails a new account its sign-in address and a set-password link | - |

## Deploying a change

Run in PowerShell **as Administrator** on the Bugzilla server. `$repo` is this repository.

```powershell
$repo = 'D:\TEST-BENCH-AUTOMATIONS\BUGZILLA-UI'

# Extensions (one folder per extension; repeat for the one you changed)
Copy-Item "$repo\bugzilla\extensions\Teams" 'C:\Bugzilla\extensions\' -Recurse -Force

# Template overrides
Copy-Item "$repo\bugzilla\templates\en\custom\*" 'C:\Bugzilla\template\en\custom\' -Recurse -Force

# Let Bugzilla pick up new extensions/templates (recompiles templates, runs install hooks)
cd C:\Bugzilla
perl checksetup.pl

# Mail worker: re-run its installer (copies the worker, re-registers the task)
powershell -ExecutionPolicy Bypass -File "$repo\bugzilla\mail-queue\install-mail-queue-task.ps1"
```

Bugzilla runs under Apache as CGI, so no Apache restart is needed for Perl changes.

## Running a script

Every script documents its own usage, options and dry-run mode in its header comment.
They are all run **from `C:\Bugzilla`** (so `use lib` finds Bugzilla's modules), usually
with taint mode and the admin login to act as:

```powershell
cd C:\Bugzilla
perl -T D:\TEST-BENCH-AUTOMATIONS\BUGZILLA-UI\bugzilla\setup\setup-soft-delete.pl <admin login>
```

Scripts that change data default to a **dry run** where noted in their header; pass the
flag shown there (e.g. `--execute`) to write. They change the **live** database - there is
no staging copy - so read the header and run the dry run first.

### `setup/` - one-time configuration

| Script | Configures |
|---|---|
| `setup-reopened-status.pl`, `setup-in-review-status.pl`, `setup-pending-approval-status.pl`, `setup-awaiting-requirement-status.pl` | Extra bug statuses and their workflow transitions |
| `rename-status.pl` | Renames a status everywhere (e.g. VERIFIED → CLOSED) |
| `setup-soft-delete.pl` | DELETED resolution + "Deleted bugs" group used by the UI's delete. Re-run for each new product |
| `setup-transfer-account.pl` | Service account that performs cross-product transfers |
| `setup-password-reset.pl` | "Forgot password" email pointing at the Bug Tracker UI |
| `setup-smtp.pl` | Outbound mail (SMTP) and a test message |
| `setup-teams.pl`, `setup-comment-edits.pl` | Tables for the Teams / CommentEdit extensions |
| `add-subcomponent-field.pl` | The "Sub-component" custom field |
| `add-reporter-role.pl` | The "reporter" role group and its members |
| `set-params.pl` | Bugzilla parameters, through Bugzilla's own validators |

### `admin/` - operator utilities

| Script | Does |
|---|---|
| `unlock-account.pl` | Clears a login lockout, optionally sets a new password |
| `change-login.pl` | Changes an account's email address, keeping all its history |
| `set-bulk-password.pl` | Sets one password on every tester / developer / reporter account |
| `hard-delete-product.pl` | **Permanently** deletes a product and everything in it |

### `migration/` - Mantis → Bugzilla

| Script | Role |
|---|---|
| `mantis-step1-users-products.pl` | **Step 1** - users and products (no bugs). Writes a state file used by later scripts |
| `mantis-step2-bugs.pl` | **Step 2** - bugs with comments and attachments, one reporter at a time |
| `mantis-assignee-map.sql` | Builds the real-assignee map passed to step 2 (`--assignee-map`) |
| `set-component-owners.pl` | Default owner for every component of a product, with access to it |
| `add-mantis-ref-field.pl` | "Mantis bug #" column, filled for already-imported bugs |
| `mantis-import-history.sql` | Imports Mantis change history into Bugzilla's activity log |
| `trim-developer-access.pl` | Narrows the developer access that step 1 granted broadly |

Each header says when it applies and what it depends on - read those before running.
Imported bugs carry the alias `mantis-<id>`; Bugzilla refuses a duplicate alias, so a
re-run of step 2 skips bugs that are already imported. Note that step 1/`trim-developer-access.pl`
keep their state in `D:\TEST-BENCH-AUTOMATIONS\_backups\mantis-migration\` (hard-coded).
