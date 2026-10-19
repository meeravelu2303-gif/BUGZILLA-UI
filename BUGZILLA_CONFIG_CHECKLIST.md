# Bugzilla Office Instance — Configuration Checklist

**Audited:** 2026-10-19 · **Bugzilla:** 5.2 · Apply through the admin UI. No SQL, no data migration.

Everything below is done through `editparams.cgi`, `editvalues.cgi`, `editworkflow.cgi`, `editgroups.cgi`
and each product's **Group Access Controls** page. Nothing here reads or writes a single row of user or
bug data.

**Scope note.** Two things are deliberately *not* in this document, per the config-only constraint:

- **Group memberships** (who is in `editusers`, `canconfirm`, or a product group). These are user-table
  data, but the application's roles depend on them — covered in
  [`BUGZILLA_DB_CONFIG_MIGRATION.md` §2.3](BUGZILLA_DB_CONFIG_MIGRATION.md).
- **Any password or account change.** Nothing below touches `profiles`.

---

## 1. Parameters (`Administration → Parameters`)

**We changed nothing.** I diffed the live local parameters against the defaults Bugzilla 5.2 ships in
`Bugzilla/Config/*.pm`. Exactly one differs:

| Parameter | Shipped default | Local value |
| --- | --- | --- |
| `urlbase` | *(empty)* | `http://localhost/` |

That one is machine-specific — **do not copy it.** The office value must be the office URL.

So there is no parameter changelog to apply. What follows is the short list the application actually
**depends on**, to verify rather than change.

### 1a. Must be correct — verify these

| Parameter | Required | Why |
| --- | --- | --- |
| `or_groups` | **`0`** | Load-bearing for soft delete. At `0`, a bug in several groups is visible only to someone in **all** of them, which is what makes a deleted bug disappear. Set it to `1` and Delete silently stops hiding anything — the bug stays visible to everyone. `0` is the Bugzilla default, so this is a *check*, not a change. |
| `urlbase` | office URL | Used for links Bugzilla generates itself. |

> `or_groups` is the single most important line in this document. It is the one setting that can make the
> Delete feature appear to work while actually doing nothing.

### 1b. Read automatically — no action needed

The BFF reads these from `/rest/parameters` at startup and adapts the UI to whatever it finds
([`backend/src/lib/bugFeatures.ts`](backend/src/lib/bugFeatures.ts)). They do **not** need to match the
laptop:

`useqacontact` · `usetargetmilestone` · `use_see_also` · `insidergroup` · `comment_taggers_group` · `maxattachmentsize`

If one is off, the UI hides that field rather than offering a control whose save Bugzilla would reject.

**One consequence worth knowing**, since it runs the *opposite* way to everything else here: the BFF's
fallback assumes `maxattachmentsize = 51200` (50 MB), which suggests the office instance is set to that.
The laptop is on Bugzilla's default of **1000 KB**. Attachments between 1 MB and 50 MB therefore succeed
at the office and fail on the laptop. The UI adapts, so nothing breaks — but local attachment testing is
not representative. Worth confirming the office value while you are on the Parameters page.

### 1c. Authentication and mail — confirm, do not change

| Parameter | Local | Note |
| --- | --- | --- |
| `user_verify_class` | `DB` | Bugzilla's own accounts. LDAP is not configured and `perl-ldap` is not installed. |
| `requirelogin` | `0` | The BFF authenticates each user and reaches Bugzilla server-side. |
| `mail_delivery_method` | `Sendmail` / `smtpserver = localhost` | **No working SMTP on the laptop.** Password reset and notification mail do not send there. If the office box has real SMTP, leave it alone — that is a difference in the office's favour. |

### 1d. The service account must be an admin

Not a parameter, but it belongs on this page. Bugzilla returns `/rest/parameters` **only to
administrators** — an ordinary user's response omits every one of them. If the account behind
`BUGZILLA_API_KEY` is not an admin, feature detection silently falls back to defaults and optional fields
disappear from the UI with no error anywhere.

---

## 2. Status values, resolutions & workflow

### 2a. Statuses (`Administration → Field Values → Status`)

**One new status. `VERIFIED` is not new** — it is stock Bugzilla and already present on the office
instance, alongside `UNCONFIRMED`, `CONFIRMED`, `IN_PROGRESS` and `RESOLVED`.

| Value | Sortkey | Open? | Action |
| --- | --- | --- | --- |
| `REOPENED` | **350** | **Yes — tick *Open*** | **Add** |

`350` places it between `IN_PROGRESS` (300) and `RESOLVED` (400). Ticking *Open* is what makes a reopened
bug count as live work in every list, filter and dashboard tile; leave it unticked and the bug vanishes
from the open queues.

> **`CLOSED` was considered and rejected.** `VERIFIED` already has `is_open = 0`, so it is the functional
> closed state. A second terminal state would differ only in ceremony and would be one more thing to keep
> in sync across two instances.

### 2b. Resolutions (`Administration → Field Values → Resolution`)

| Value | Sortkey | Action |
| --- | --- | --- |
| `DELETED` | **1000** | **Add** |

`1000` keeps it clear of the stock values (100–600). Bugzilla has no delete API; this is one half of the
UI's soft delete. The other half is the group in §3.

### 2c. Workflow (`Administration → Workflow`)

Six transitions to enable. Bugzilla **refuses** any transition not ticked here, so without these the
`REOPENED` status exists but cannot be reached.

| From | To | Comment required? |
| --- | --- | --- |
| `RESOLVED` | `REOPENED` | **Yes** |
| `VERIFIED` | `REOPENED` | **Yes** |
| `REOPENED` | `CONFIRMED` | No |
| `REOPENED` | `IN_PROGRESS` | No |
| `REOPENED` | `RESOLVED` | No |
| `VERIFIED` | `RESOLVED` | No |

Comment-required is set on the separate **Workflow → Comment required** page, not the main grid.

Two notes on the list:

- **The two routes into `REOPENED` require a comment** because if a fix did not hold, the reason is the
  only genuinely useful part of the record.
- **`VERIFIED → RESOLVED` is easy to dismiss and shouldn't be.** It exists so an already-verified bug can
  still be deleted — soft delete sets a bug to `RESOLVED`/`DELETED`, and without this transition Delete
  fails on exactly the bugs QA has signed off. It is also the one row here that no setup script creates;
  it was added by hand locally.

---

## 3. Groups & access control (`Administration → Groups`)

### 3a. Create the group

| Field | Value |
| --- | --- |
| Name | `Deleted bugs` |
| Description | `Soft-deleted bugs. Visible only to testers and admins, who can restore them.` |
| **Is this a bug group?** | **Yes** |
| User regexp | *(leave empty)* |

*Is this a bug group?* is mandatory — without it the group cannot be applied to a bug at all.

### 3b. Grant it to existing groups, not to people

On the `Deleted bugs` group page, under **Group Permissions**:

| Group | Grant |
| --- | --- |
| `admin` | Members · Can bless · Visible |
| `canconfirm` | Members |

Granting by **inheritance** rather than by naming individuals means a tester added next month can delete
and restore without anyone remembering this page. This is group-to-group configuration — it names no user.

### 3c. Product access controls — the step that gets missed

For **every product**, go to `Administration → Products → [product] → Group Access Controls` and set:

| Setting | Value |
| --- | --- |
| `Deleted bugs` → **Members** | **Shown** |
| `Deleted bugs` → **Non-members** | **NA** |
| Entry | leave unticked |

**Do this for all products, including inactive ones.** Without a control row for a product, Bugzilla
refuses to put that product's bugs into the group and **Delete fails at the final step with no obvious
cause** — the status and resolution change, the bug does not hide. This is the single most common way to
get soft delete half-working.

Locally that is 6 products: `KPost API`, `KPost UI`, `KMail API`, `KPost Admin`, `KPost Admin UI`,
`TestProduct` (inactive). **Repeat after creating any new product.**

### 3d. Existing product groups — verify, don't change

Each product already has its own access group (`KPost API`, `KPost UI`, `TestProduct`, …). Three of them
carry **Entry: ticked, Members: Mandatory, Non-members: Mandatory**, which is what scopes a product to its
team. Leave these exactly as they are.

> **Do not widen developer access.** A blanket product grant to all developers was tried and reverted: it
> broke assignee scoping, so filing against KMail API offered developers with no KMail API access.

### 3e. Custom fields — none

No custom field was created (`editfields.cgi` needs no changes). Confirmed: zero rows in `fielddefs` with
`custom = 1`. All 59 field definitions are stock.

---

## 4. Office execution checklist

Ten minutes in the admin UI. No user or bug data is read or written.

1. **Parameters** → confirm `or_groups = 0`. Confirm `urlbase` is the office URL, not `localhost`.
   Note the `maxattachmentsize` value (§1b).
2. **Field Values → Status** → add `REOPENED`, sortkey `350`, tick **Open**.
3. **Field Values → Resolution** → add `DELETED`, sortkey `1000`.
4. **Workflow** → tick the six transitions in §2c.
5. **Workflow → Comment required** → tick the two transitions *into* `REOPENED`.
6. **Groups** → create `Deleted bugs` as a **bug group** (§3a), then grant it to `admin` and
   `canconfirm` (§3b).
7. **Products → each product → Group Access Controls** → `Deleted bugs` = Members **Shown**,
   Non-members **NA**. All products. Do not skip the inactive one.
8. **Restart Apache** so the CGI processes pick up the new status list.

### Verification — admin UI only

| Check | Where | Expected |
| --- | --- | --- |
| Status exists and is open | Field Values → Status | `REOPENED`, sortkey 350, *Open* ticked |
| Resolution exists | Field Values → Resolution | `DELETED`, sortkey 1000 |
| Transitions enabled | Workflow grid | All six from §2c ticked |
| Comment enforced | Workflow → Comment required | The two routes into `REOPENED` |
| Group is a bug group | Groups → `Deleted bugs` | *Is this a bug group?* = Yes |
| Inheritance correct | Groups → `Deleted bugs` | `admin` (3 boxes), `canconfirm` (Members) |
| **Controls on every product** | each product's Group Access Controls | `Deleted bugs` = Shown / NA — **count them; one missing breaks Delete for that product only** |

### Then confirm in the application

| Action | Expected |
| --- | --- |
| Open a `RESOLVED` bug, change status | `REOPENED` offered |
| Select `REOPENED` and save without a comment | Rejected, asking for one |
| Open a `RESOLVED` bug as a tester | **Ready for re-test** card with **Mark as verified & close** |
| Delete a bug as a tester | Disappears from lists, still restorable |
| Delete a `VERIFIED` bug | Also succeeds — this is what `VERIFIED → RESOLVED` is for |
| Dashboard | Reopened tile renders; "Ready for re-test" counts `RESOLVED` only |

### If something does not work

| Symptom | Cause |
| --- | --- |
| `REOPENED` missing from the dropdown | Step 2 missing, or Apache not restarted |
| `REOPENED` offered but save is rejected | A workflow transition from step 4 is not ticked |
| Status saves without demanding a comment | Step 5 missing |
| Delete "succeeds" but the bug stays visible | **`or_groups = 1`** (§1a), or step 7 missing for that product |
| Delete fails only on certain products | Step 7 missing for those products |
| Delete fails only on verified bugs | `VERIFIED → RESOLVED` not ticked (§2c) |
| Optional fields missing everywhere | The `BUGZILLA_API_KEY` account is not an admin (§1d) |
