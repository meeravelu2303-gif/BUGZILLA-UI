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

## Deploy

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
