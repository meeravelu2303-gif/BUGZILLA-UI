# UEducate Bug Tracker — The Complete Layman's Guide

*How to use our Bugzilla-based bug tracker, explained in plain English for admins, testers, developers and office staff. Version 2.0 — 20 October 2026.*

This guide covers **our** bug tracker: the web app at `http://192.168.0.50:5175` that sits on top of Bugzilla 5.2. It describes every screen, every button and every status as they work today, including the Mantis history that was migrated in October 2026. Where the older "Bugzilla Master Guide" explained Bugzilla in general, this one explains *this* system.

> **Who should read what.** Everyone should read Sections 1–5. Then jump to the playbook for your role in Section 6: Tester, Developer, Reporter (office staff) or Admin. Sections 7–14 go through every screen in detail and are there for when you need them.

---

# Section 1: The basics

## What the tracker is for

A bug is anything that is wrong with one of our products: a crash, a wrong number, a button that does nothing, a slow screen, a security hole. The tracker is the one place where every bug lives from the moment it is found until a tester confirms it is fixed. It answers four questions at any time:

- What is broken right now, and how badly?
- Who is working on it?
- What has been fixed and is waiting for re-test?
- What has been fixed and verified?

Two things feed it:

- **People** — testers, developers, admins and office staff who file bugs by hand in the app.
- **The test benches** — our automated API and UI test suites, which file bugs by themselves when a test fails.

Both kinds of bug land in the same list, with the same format, and are told apart by a label (see "Automation vs Manual" below).

## Where it runs

| What | Where |
|---|---|
| The app you use every day | `http://192.168.0.50:5175` |
| Native Bugzilla (admins only, for advanced settings) | `http://192.168.0.50/` |
| Your sign-in | Your work email and password. Everyone has an account. |

Use Chrome or Edge. The app works on a phone too, but filing bugs is easier on a laptop.

## The four roles

Everybody has exactly one role. It decides which dashboard you see and which buttons exist for you.

| Role | Who | What you can do |
|---|---|---|
| **Tester** | QA engineers | File bugs, confirm and triage new bugs, re-test fixes and verify or reopen them, transfer bugs between teams, delete and restore bugs, add components to products, view users and products. |
| **Developer** | Engineers who fix bugs | File bugs, work the bugs assigned to you, move them to In progress and Resolved, reassign your own bugs, comment, attach evidence. |
| **Reporter** | Office staff who find bugs but are not testers or developers | File bugs, follow them, comment, attach files. You are never assigned work and never appear in assignee lists. |
| **Admin** | The people who run the tracker | Everything a tester can do, plus create and edit users, products and components, change roles, and reach Bugzilla's own settings. |

> Your role is set by an admin. If you cannot see something this guide says you should, your role is probably wrong — ask an admin to check it on the Users page.

## Reading a bug at a glance

Every bug shows the same things wherever it appears:

| Item | Example | Meaning |
|---|---|---|
| **ID** | `KPA-12404` | The bug's number. Always `KPA-` followed by the number. Type it into the search box to jump straight to the bug. |
| **Title** | `[MT-2235] Kall: The device got struck…` | What is wrong, in one line. Bugs migrated from Mantis start with `[MT-<Mantis number>]`; bench bugs start with a `[KP-…]` code. |
| **Source badge** | `UI Automation`, `API Automation`, `Manual UI test`, `Manual API test` | Who filed it (bench or person) and what was tested (a screen or the API). |
| **Status** | `IN PROGRESS` | Where the bug is in its life. See Section 3. |
| **Severity** | `Critical` | How bad it is: Critical, Major, Minor, Trivial. |
| **Priority** | `P1` | How soon it should be worked: P0 (now) to P3 (when possible). |
| **Category** | `Functional` | What kind of problem: Functional, Performance, Security, Compatibility, Accessibility. |
| **Product / Component** | `KPOST 5.0 / Kall` | Which product, and which module inside it. |
| **Assignee** | `Jaganathan Murthy` | The person responsible for the next step. |
| **Reporter** | `Ajith Kumar` | Who filed it. |
| **Mantis #** | `Mantis #2235` | Only on migrated bugs: the original Mantis issue number, shown as a reference on the bug page. |

## Automation vs Manual

Every bug carries a *source* so you can always tell how it was filed:

| Badge | Filed by | Tested |
|---|---|---|
| **UI Automation** | The UI test bench | A screen, in a browser |
| **API Automation** | The API test bench | A backend endpoint |
| **Manual UI test** | A person, in the app | A screen or app |
| **Manual API test** | A person, in the app | An endpoint (e.g. the "API and SERVER Issue" product) |

The bug list has a **Source** filter (Automation / Manual) so you can look at either half on its own.

---

# Section 2: Signing in and your account

## Signing in

1. Open `http://192.168.0.50:5175`.
2. Enter your work email and password and press **Sign in**.
3. You land on your dashboard — the one for your role.

Ten wrong passwords in a row on the same account from the same device locks it for 5 minutes. Wait, then try again. You can be signed in on up to 3 devices at once; signing in on a fourth signs out the oldest.

## Forgot your password

1. On the sign-in page, click **Forgot password?**
2. Enter your email. A reset link is emailed to you (check spam).
3. Open the link within the time shown and choose a new password.

You can ask for at most **3 reset links per day** per address. After that the page says the limit is reached — ask an admin to set a password for you instead.

## Changing your password while signed in

Open **Preferences** (your name at the bottom of the sidebar, or the gear icon top-right) → **Change password**. Enter your current password, the new one twice, and save. Other devices where you are signed in are signed out.

## Signing out

Click the sign-out arrow next to your name at the bottom of the sidebar.

---

# Section 3: The life of a bug

Every bug has a **status**. The status says what should happen next and who should do it.

| Status | Meaning | Who moves it on |
|---|---|---|
| **UNCONFIRMED** | Filed, but nobody has checked it is real yet. On the QA board this is "Needs triage". | A tester confirms it. |
| **CONFIRMED** | Checked and accepted. Sitting with its component owner, waiting to be worked. | The developer starts work. |
| **IN PROGRESS** | A developer is working on it. | The developer resolves it. |
| **RESOLVED** | The developer says it is done. On the QA board this is "Ready for re-test". | A tester re-tests. |
| **VERIFIED** | A tester re-tested and agrees. Closed for good. | Nobody (unless it comes back, then REOPENED). |
| **REOPENED** | A tester re-tested and it still fails. Back to the developer. | The developer fixes it again. |

When a bug is resolved, it also gets a **resolution** that says *how*:

| Resolution | Use it when |
|---|---|
| **FIXED** | The code was changed and the bug is gone. |
| **INVALID** | It was never a bug (misunderstanding, wrong expectation). |
| **DUPLICATE** | It is the same as another bug — you must say which one. |
| **WONTFIX** | It is real but will not be changed (by decision). |
| **WORKSFORME** | It could not be reproduced. |
| **DELETED** | Only ever set by the Delete button (see Section 9). |

## The normal flow

```
 filed by a tester, developer, staff member, or a bench
            │
            ▼
      UNCONFIRMED ──(tester confirms)──► CONFIRMED
            │                                │
       (a bug filed by someone with         ▼
        editbugs skips this step)      IN PROGRESS   ◄───────────┐
                                             │                   │
                                  (developer fixes)              │
                                             ▼                   │
                                      RESOLVED / FIXED           │
                                             │                   │
                                     (tester re-tests)           │
                                   ┌─────────┴─────────┐         │
                              passes                 fails       │
                                   ▼                   ▼         │
                               VERIFIED            REOPENED ─────┘
                               (closed)        (needs a comment)
```

Which moves are allowed is enforced by Bugzilla (Administration → Status Workflow shows the full table). The ones you will use:

| From | You may move to |
|---|---|
| UNCONFIRMED | CONFIRMED, IN PROGRESS, RESOLVED |
| CONFIRMED | IN PROGRESS, RESOLVED |
| IN PROGRESS | CONFIRMED, RESOLVED |
| RESOLVED | VERIFIED, REOPENED, IN PROGRESS, CONFIRMED, UNCONFIRMED |
| VERIFIED | REOPENED, RESOLVED, CONFIRMED, UNCONFIRMED |
| REOPENED | IN PROGRESS, CONFIRMED, RESOLVED |

Two rules the app enforces on top:

- **Reopening needs a comment.** Say what still fails after the fix. Only testers and admins can reopen.
- **Resolving as DUPLICATE needs the other bug's number** (for example `KPA-806`).

## Who is the assignee at each step

- A newly filed bug goes to the **owner of its component** (every component has a default owner — a developer). The filer can pick someone else at filing time.
- A tester may hand it to a different developer (**Transfer**, or the Assignee field).
- A developer may hand their own bug to a colleague, but cannot reassign other people's bugs.
- When the developer resolves it, it **stays assigned to the developer**. The tester finds it under "Ready for re-test" without any reassignment — this is different from Mantis, where the bug was handed back to the reporter.

---

# Section 4: The screen

## The sidebar

| Section | Page | What it is |
|---|---|---|
| **Work** | **Dashboard** | Your home page. One or more tabs depending on your role (Section 5). |
| | **My Bugs** | Everything on your desk, in three tabs: *Assigned to me*, *Reported by me*, *I'm on CC*. |
| | **All Bugs** | The full list of every bug you can see, with filters. |
| | **Advanced Search** | The same list with Assignee and Reporter dropdowns on top. |
| **Insights** | **Reports & Charts** | Breakdowns by severity, category and component. |
| **Administration** (testers see only the first two, read-only) | **Users**, **Products**, Field Values, Status Workflow, Groups & Permissions, Parameters, Sanity Check | See Section 12. |

Above the sidebar is the blue **New Bug** button — the full filing form (Section 8). At the bottom is your name, with the sign-out arrow.

## The search box (Ctrl+K / ⌘K)

The box at the top of every page is a command palette. Type:

- a **bug number** — `12404`, `KPA-12404` or `#12404` — and press Enter to open that bug;
- a **page name** — "users", "reports" — to jump to it;
- any **word** — to search bug titles.

## Back links

Pages you reach from elsewhere (New bug, Advanced Search, Reports, My Bugs) have a **← Back** link at the top that returns you to exactly where you were, filters included.

---

# Section 5: The dashboards

The Dashboard has up to four tabs. Which ones you see depends on your role:

| Role | Tabs |
|---|---|
| Admin | Admin · QA · Developer · Overview |
| Tester | QA · Developer · Overview |
| Developer | Developer only |
| Reporter (staff) | QA (your own reported bugs) only |

## Overview tab — the whole picture

Everyone's total: Total bugs, Open, Resolved, Critical (P0) open, Reopened; bars by severity and by category; the "Reopened bugs" and "Recently changed" lists. Nothing here is personal — it is the state of all the products you can access.

## QA tab — the tester's board

| For a tester | For an admin |
|---|---|
| Shows **only the bugs you reported**. Every card says "Reported by you". | Shows everyone's bugs. A **Reporter** dropdown narrows to one person: testers, office-staff reporters, developers who have filed bugs, admins. |

The five cards (each is a link to the matching list):

| Card | What it counts |
|---|---|
| **Open defects** | Everything still open (Unconfirmed, Confirmed, In progress, Reopened). |
| **Needs triage** | Unconfirmed — waiting for a tester to confirm it is real. |
| **Blocker / critical** | Open bugs at Critical severity. |
| **Ready for re-test** | Resolved — fixed by a developer, waiting for your verification. |
| **Closed** | Verified. |

Below the cards: **File a bug** (opens the full form) and **Advanced search**. Then two lists: **Longest open** (open bugs, oldest first) and **Latest incoming** (newest first). Each row has a transfer arrow for moving a bug to another team (Section 10).

## Developer tab — the developer's board

| For a developer | For an admin or tester |
|---|---|
| Shows **your assigned work** only. | Opens on **All developers** — the whole team's assigned work. A **Developer** dropdown lists every developer with their open-bug count ("Ayyappan Ashok · 543 open") to narrow to one person. |

The four cards: **Open backlog** (open bugs to fix), **Blockers / critical** (open at Critical), **Reopened by QA** (fixes that did not hold), **Resolved** (lifetime fixes). All link to lists.

Below is a split pane: the **backlog** on the left, grouped by severity, worst first; click a bug and it opens on the right with a **Quick change** row (Status, Severity) so you can move it without leaving the board. **Open full list** takes you to My Bugs.

## Admin tab

Service health and who can reach what. See Section 12.

---

# Section 6: Playbooks by role

## Tester — your day

1. **Open the QA tab.** Your own reported bugs are already selected. (Admins: pick a reporter if you want one person's.)
2. **Triage.** Click **Needs triage**. For each Unconfirmed bug: open it, read it, and either set it to **CONFIRMED** (it is real), or resolve it as **INVALID** / **DUPLICATE** / **WORKSFORME** with a comment saying why. If it belongs to another team, **Transfer** it (Section 10).
3. **Re-test.** Click **Ready for re-test**. For each Resolved bug: test the fix on the build named in the comments.
   - It works → click **Mark as verified & close** at the top of the bug (or set Status to VERIFIED).
   - It still fails → set Status to **REOPENED** and write a comment saying exactly what still fails. It goes back to the developer.
4. **Watch the blockers.** The **Blocker / critical** card should be small. If it is not, chase.
5. **File what you find.** Use **File a bug** (Section 8). Fill every starred field.
6. **Keep products tidy.** You may add a component to a product (Administration → Products → open the product → Add component) when a new module appears. Creating products is an admin's job.

What you cannot do: create or edit users and products (you can view them), change anyone's role.

## Developer — your day

1. **Open the Developer tab.** Your backlog is on the left, worst first. The top of the list is what to do next.
2. **Take a bug.** Click it; in the Quick change row set Status to **IN PROGRESS**. This tells everyone you have it.
3. **Fix it.** Use the report's steps, expected vs actual, the curl command and response (API bugs), the page and browser (UI bugs) and the attachments. If something is missing, **comment on the bug** asking the reporter — do not guess.
4. **Resolve it.** Set Status to **RESOLVED** and Resolution to **FIXED**, and say in a comment which build or version has the fix. Testers re-test from that comment.
   - Not a bug → RESOLVED / INVALID with a comment.
   - Same as another bug → RESOLVED / DUPLICATE, enter the other bug's number.
   - Cannot reproduce → RESOLVED / WORKSFORME with what you tried.
   - Will not be changed → RESOLVED / WONTFIX with the reason.
5. **Reopened by QA.** This card is the fixes that did not hold. Read the tester's comment, fix again, resolve again.
6. **Handing a bug on.** You can change the Assignee on your own bugs to a colleague. You cannot take or reassign other people's bugs — ask a tester or admin.

What you cannot do: confirm Unconfirmed bugs, reopen, transfer between teams, delete.

## Reporter (office staff) — filing and following

1. **File a bug** with the New Bug button. The form asks for everything a developer needs; fill every starred field (Section 8). It goes to the right developer automatically.
2. **Follow it.** Your dashboard shows only the bugs you reported: how many are open, waiting for triage, ready for re-test, or closed. Open any bug to read the comments and add your own.
3. **Add evidence** at any time: screenshots, recordings, logs — the Attachments card on the bug.

You are never assigned bugs and will not appear in any assignee dropdown. You cannot confirm, resolve or reopen bugs — testers and developers do that.

## Admin — running the tracker

Day to day you are also a tester (everything in the tester playbook applies). On top of that:

- **People** (Administration → Users): create accounts, set the role (Reporter / Developer / Tester / Admin), choose which products they can access, reset passwords, disable or delete accounts. See 12.1.
- **Products** (Administration → Products): create products, edit names and descriptions, activate/deactivate, delete (only when empty), add components and set each component's default owner. See 12.2.
- **Dashboards for anyone**: the QA tab's Reporter dropdown and the Developer tab's Developer dropdown let you see any person's board.
- **Bulk reassign**: in any bug list, tick several bugs and reassign them in one go.
- **Transfers, deletes, restores**: same as testers (Section 10).
- **Native Bugzilla** (`http://192.168.0.50/`): groups, parameters, email settings, workflow edits. Links to it are on the Administration pages.

---

# Section 7: Finding bugs

## All Bugs

The master list. Every bug you have access to, 25 per page (page controls at the bottom).

**Filters** (top of the list). Each is a dropdown with counts beside the options; several can be combined, and every active filter shows as a chip you can remove:

| Filter | Options |
|---|---|
| Search | Words from the title, or a bug number. |
| Date | Filed or last changed, in a range. |
| Product | Any product you can access. |
| Severity | Critical, Major, Minor, Trivial, Unclassified. |
| Priority | P0, P1, P2, P3. |
| Category | Functional, Performance, Security, Compatibility, Accessibility, Unclassified. |
| **Source** | Automation, Manual. |
| Browser | Chromium, Firefox, WebKit/Safari, Mobile Chrome — only shown when the current list has browser-tagged bugs. |
| Component | Components of the chosen product. |
| Status | Unconfirmed, Confirmed, In progress, Reopened, Resolved, Verified. |
| Resolution | Unresolved (open), Fixed, Invalid, Duplicate, Won't fix, Works for me. |

The count on the right ("265 bugs · 6,617 hidden by filters") always tells you how much the filters are hiding.

**Columns:** ID, Summary (with the source badge and component under it), Severity, Priority, Category, Browser (a pill — `API` for API bugs, `Not recorded` where no browser was captured), Status, Assignee, Changed. Click a column header to sort.

**Selecting bugs:** the tick boxes on the left. With bugs selected, a bar appears with **Reassign to** (testers and admins) and **Delete** (testers and admins).

**Buttons top-right:**

| Button | What it does |
|---|---|
| **Deleted bugs** | Switches the list to show soft-deleted bugs (testers and admins), each with a Restore option. |
| **Export to Excel** | Downloads the current list (with all its filters) as a spreadsheet, including the report text, source and browsers. |
| **Evidence pack (.zip)** | Downloads the current list's attachments and reports as a zip, for sharing outside the tracker. |

## My Bugs

Three tabs — **Assigned to me**, **Reported by me**, **I'm on CC** — with the same filters and buttons as All Bugs.

## Advanced Search

All Bugs plus two dropdowns above the filters: **Assignee** (every developer, tester and admin, grouped by role) and **Reporter** (testers, office-staff reporters, developers who have filed bugs, admins). **Reset everything** clears all of it. The address bar holds the whole search, so you can copy the URL and send it to a colleague.

---

# Section 8: Filing a bug

Press **New Bug** (sidebar) or **File a bug** (QA tab). There is one form; it is the only way to file in the app, and it will not submit until every starred field is filled. A live preview on the right shows the report exactly as it will appear.

## Step 1 — Where

| Field | What to enter |
|---|---|
| **Product** ★ | The product the bug is in. |
| **Component (module)** ★ | The module inside the product. Choosing it shows who the bug will go to ("Assigned to Ramesh Kamaraj" — the component's owner). |
| Assign to | Leave it on the component owner unless you know the bug belongs to a specific developer. The list is the product's developers. |
| **Bug type** | **API bug** (a backend endpoint misbehaves — asks for endpoint, curl and response) or **UI bug** (something on a screen is wrong — asks for page and browsers). It is pre-set from the product; change it if the bug is the other kind. |

## Step 2 — The defect

| Field | What to enter |
|---|---|
| **Title** ★ | One line: *where* and *what*. "Kall: device freezes after opening the call log" — not "bug in Kall". |
| Category | Functional (default), Performance, Security, Compatibility, Accessibility. |
| **Classification** ★ | A short label for the kind of fault (the preview shows examples). |
| Severity | Critical (blocks work or loses data), Major (a feature does not work), Minor (works with a workaround or cosmetic), Trivial. Priority is set from it. |
| Version | Optional. |

## Step 3 — Report

| Field | What to enter |
|---|---|
| **Summary** ★ | Two or three sentences describing the problem. |
| Preconditions | What must be true first (logged in as…, data set up…). |
| **Steps to reproduce** ★ | Numbered, one action per line. A developer must be able to follow them blind. |
| **Expected** ★ | What should have happened. |
| **Actual** ★ | What happened instead. |
| Why it matters / How to fix | Optional, but a sentence on impact helps prioritise. |

## Step 4 — Reproduce (API bugs) or page (UI bugs)

| API bug | UI bug |
|---|---|
| Method and **Endpoint** ★, the **curl** command ★ that reproduces it, HTTP status, correlation ID, response body. | **Page / screen** ★ and the browsers it was seen on. |

## Step 5 — Context & evidence

| Field | What to enter |
|---|---|
| **Environment** ★ | Device, OS, app build or browser version ("Android 12, KPost 5.0 build 150"). |
| Attachments | Screenshots, screen recordings, logs. Drag files in or click to choose. A recording of the steps is worth more than any paragraph. |

Press **File bug**. The bug is created as **CONFIRMED**, tagged as a manual filing, assigned to the component owner (or whoever you chose), and opened for you. If anything starred is missing, the form lists it in red and nothing is sent.

> **A report that gets fixed fast** says where, what you did, what you expected, what you got, and shows it. "Login broken" gets a question back; "Login: tapping Sign in with a 20-character password shows a spinner forever on Android 12, build 150 — recording attached" gets fixed.

---

# Section 9: Working on a bug

Open any bug (from a list, a dashboard card, or by typing its number in the search box).

## The header

- **KPA number**, product / component, and on migrated bugs a **Mantis #** badge.
- **Transfer** (testers and admins, only on products that have a partner team) — Section 10.
- **Delete** (testers and admins) — Section 10.
- The **title**: click the pencil to edit it.
- **Mark as verified & close** (testers and admins, on Resolved bugs) — one click to verify.

## Description

The report as filed. **Edit** (pencil) opens the report editor: changes are saved as a dated revision in the comments, so the original is never lost and everyone can see what changed.

## Attachments

Every file on the bug, with size and date. **Add files** to upload more; migrated Mantis attachments are here too. Where a Mantis description was too long for Bugzilla (a few bugs with pasted API responses), the full original text is attached as `mantis-<number>-description.txt`.

## Comments

The conversation on the bug, oldest first, with the author and time. Type in the box at the bottom and **Comment**. You can tag a comment (for example `build-152`, `needs-info`) to find it later.

## The side panel — every field you can change

Click a section to open it; change what you need; **Save** at the bottom. The panel shows a "changed" mark on every section you touched before you save.

| Section | Fields |
|---|---|
| **Status** | Status (only the moves the workflow allows from the current one), Resolution (required when resolving), Duplicate of (required for DUPLICATE). Reopening requires a comment. |
| **Priority & severity** | Priority P0–P3, Severity. |
| **Product & component** | Product, Component, Version, Milestone, OS, Platform. Changing the product moves the bug (testers and admins; developers use Transfer). |
| **People** | Assignee (developers can change it only on their own bugs), QA contact, CC list (people who get a copy of every change). |
| **Relationships** | Depends on, Blocks, See also (links to other bugs or pages), URL. |
| **Time tracking** | Estimate, remaining, hours worked, deadline — if your account has time tracking. |
| **Visibility** | Which groups may see the bug. Normally the product's own group. |
| **Labels** | Alias, keywords, whiteboard (the tags such as `[cat:Functional][source:manual]` live here — leave them alone unless you know why). |
| **Flags** | Bugzilla flags, if any are configured. |

Everything you change is recorded in the bug's history with your name and the time.

---

# Section 10: Transfers, deletes and bulk changes

## Transfer to another team

Some products are paired — the KPost UI team and the KPost API team, the KPost Admin UI and KPost Admin. When a bug filed against one really belongs to the other:

1. Open the bug and click **Transfer** (also available from the arrow on the QA board's lists).
2. Pick the receiving product and component; the bug's new owner is shown.
3. Write one line saying why. It is posted as a comment under your name so the receiving team knows.
4. **Transfer.** The bug moves product, component and assignee in one step, and the history records it.

Only testers and admins transfer. The pairs are set by the admin in the server configuration.

## Delete and restore

Deleting never destroys anything. **Delete** (testers and admins; on the bug page or from the selection bar in a list) marks the bug as DELETED and hides it from every list, count and chart. To see deleted bugs, click **Deleted bugs** at the top of All Bugs; each has **Restore**, which puts it back exactly as it was. Developers and reporters cannot delete.

## Bulk reassign

In any list, tick the bugs, choose a person in **Reassign to**, and confirm. Testers and admins only.

---

# Section 11: The test benches and the Mantis history

## Bugs the benches file

The API bench (`KPost API`, `KMail API`, `KPost Admin` products) and the UI bench (`KPost UI`, `KPost Admin UI`) run our automated tests and file a bug for each failure, with the request, the response, the stack trace and (for UI) the browsers it failed on. These carry the **UI Automation** / **API Automation** badge and a `[KP-…]` code in the title that the bench uses to recognise the same failure next time:

- If the same failure happens again while the bug is open, the bench adds a comment rather than filing a duplicate.
- If it happens again after the bug was **Resolved/FIXED**, the bench **reopens** it.

Treat them exactly like a human-filed bug: confirm, fix, resolve, re-test.

## Bugs migrated from Mantis

In October 2026 every Mantis issue (11,830 of them) was moved into this tracker with its comments, attachments, reporter, dates and status:

| In Mantis | Here |
|---|---|
| Issue #2235 | `KPA-<new number>`, title starting `[MT-2235]`, and a **Mantis #2235** badge on the bug page. Search `MT-2235` or `2235` to find it. |
| Status new / feedback | UNCONFIRMED |
| acknowledged / confirmed | CONFIRMED |
| assigned | IN PROGRESS |
| resolved | RESOLVED / FIXED — in **Ready for re-test** for its reporter |
| closed | VERIFIED |
| Handler | The **developer who resolved it**, found in the Mantis history. Where that developer's Mantis account had been deleted, the bug went to its component owner. |
| Reporter | The same person's account here. Bugs whose Mantis reporter had been deleted were filed under Baskar. |

They all carry the **Manual** source badge.

---

# Section 12: Administration

## 12.1 Users

Administration → **Users** (admins edit; testers view).

- **The list** shows every account with its role badge and Enabled/Disabled state. Filter by name or email, by role, or by product access.
- **New user**: name, email (their sign-in), a password, the **role**, and the **products** they may access. The account is ready to use immediately.
- **Open a user** to edit: full name, email, whether bug mail is sent to them, a new password, disable (with a reason shown to them) or enable, the role, and product access. **Save**.
- **Delete**: only for accounts with no history (no bugs, comments or attachments). Bugzilla refuses otherwise — disable instead, which keeps every record.
- **Roles**: Reporter (office staff who file bugs), Developer, Tester, Admin. Changing the role changes only the groups behind it and the chosen products; anything else the account holds is left alone.

> After you change someone's role, they must sign out and in again to see their new dashboard.

## 12.2 Products

Administration → **Products** (admins edit; testers may view and add components).

- **The list** is collapsed: one row per product with its bug and component counts. Click a product to open it.
- **New product**: name, description, first version. Creating a product also creates its access group, so you then give people access on their user page.
- **Inside a product**: **Edit** name/description (renaming also renames the access group), **Activate / Deactivate** (inactive products cannot receive new bugs), **Delete** (only possible at zero bugs). The **Components** list shows each module and its default owner — the developer who receives every new bug in it. **Add component**: name, description, default owner (a dropdown of the developers with access to that product). To change an existing component's owner, use the Edit link to Bugzilla.

## 12.3 The other admin pages

| Page | What it shows |
|---|---|
| **Field Values** | The allowed statuses, resolutions, severities, priorities, OS and platform values. Changing them is done in Bugzilla. |
| **Status Workflow** | The table of allowed status moves (Section 3). Editing is done in Bugzilla. |
| **Groups & Permissions** | The groups your own account holds. Group creation and membership stay in Bugzilla. |
| **Parameters** | Bugzilla's instance settings that are safe to show. |
| **Sanity Check** | Runs Bugzilla's database consistency check and can repair simple problems. |

## 12.4 Things only done in native Bugzilla

Open `http://192.168.0.50/` and sign in with the same account (admins only):

- Email: switching bug mail on for accounts, the mail server settings.
- Groups: creating groups, bulk membership changes.
- Workflow and field values: adding a status or a resolution.
- Parameters such as search limits.

---

# Section 13: Reports and email

## Reports & Charts

Insights → Reports & Charts: Severity distribution, Category distribution, Severity × category matrix, Defects by component — all for the products you can access, with Reports links from the Overview dashboard.

## Email

- **Bug mail**: when it is switched on for your account, Bugzilla emails you when a bug you reported, own, or are CC'd on changes. An admin switches it on per account (the "Send bug mail" box on your user page). Accounts imported from Mantis start with it **off**.
- **Password reset mail** is always sent.

---

# Section 14: Quick reference and troubleshooting

## Who can do what

| Action | Reporter | Developer | Tester | Admin |
|---|---|---|---|---|
| File a bug | ✓ | ✓ | ✓ | ✓ |
| Comment, attach files | ✓ | ✓ | ✓ | ✓ |
| Confirm an Unconfirmed bug | | | ✓ | ✓ |
| Move to In progress / Resolved | | ✓ (own bugs) | ✓ | ✓ |
| Verify or Reopen | | | ✓ | ✓ |
| Reassign | | own bugs only | ✓ | ✓ |
| Transfer between teams | | | ✓ | ✓ |
| Delete / restore | | | ✓ | ✓ |
| Bulk reassign | | | ✓ | ✓ |
| See any reporter's / developer's board | | | developers' | ✓ |
| View Users and Products | | | ✓ | ✓ |
| Add a component | | | ✓ | ✓ |
| Create/edit users and products, change roles | | | | ✓ |

## Statuses in one line each

UNCONFIRMED needs a tester's look · CONFIRMED is real and waiting · IN PROGRESS is being fixed · RESOLVED is fixed and waiting for re-test · VERIFIED is done · REOPENED failed re-test and is back with the developer.

## Troubleshooting

| Problem | What to do |
|---|---|
| "Too many attempts" when signing in | Wait 5 minutes. |
| Reset link never arrives | Check spam; you get 3 a day; otherwise ask an admin to set a password. |
| A product is missing from my lists or the filing form | You do not have access to it — ask an admin (user page → Product access). |
| A bug I know exists is not in the list | Check the chips under the filters and the "hidden by filters" count; check **Deleted bugs**; or type its number in the search box. |
| I cannot change the status | The move is not allowed from the current status (Section 3), or the role cannot (reopen is testers/admins). |
| The Save button says a comment is needed | Reopening, and some moves, require a comment explaining why. |
| My dashboard looks wrong for my role | Sign out and in again (roles load at sign-in), then ask an admin to check the role on your user page. |
| A developer is missing from the assignee dropdown | They need access to that product — admin, user page → Product access. |
| Counts on the dashboard do not match the list | Refresh; counts are cached for up to five minutes. |

*End of guide.*
