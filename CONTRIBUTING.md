# Contributing

## Branches

- `main` is what runs in production. Do not commit to it directly.
- Work on a short-lived branch from `main`, named by purpose:
  `feature/<topic>`, `fix/<topic>`, `chore/<topic>`, `docs/<topic>`
  (e.g. `feature/attachment-delete`, `fix/login-lockout-message`).
- Merge through a pull/merge request with at least one review.

## Commit messages

[Conventional Commits](https://www.conventionalcommits.org/), as the history already mostly uses:

```
<type>(<optional scope>): <what changed, imperative, lower case>

<optional body: why, and anything a reviewer must know>
```

Types: `feat`, `fix`, `refactor`, `perf`, `docs`, `test`, `chore`, `ops`.
Scopes that fit this repo: `frontend`, `backend`, `bugzilla`, `ops`, `e2e`, `docs`.

## Before you push

```bash
npm run typecheck        # backend + frontend, must be clean
npm run build            # must succeed
```

If you changed anything under `bugzilla/`, deploy it to a Bugzilla you are allowed to
change and exercise it there - see [`bugzilla/README.md`](./bugzilla/README.md).

## Rules

- **No secrets in git.** Only `*.example` env files are committed; real values live in
  `backend/.env` on the server. API keys, passwords, SMTP credentials and session secrets
  never go in code, scripts, docs or commit messages. If one is committed by mistake,
  revoke it first - removing it from the latest commit does not remove it from history.
- **The live Bugzilla is production.** There is no staging copy. Never run tests, e2e
  suites or data-changing scripts against it to "try something"; use a script's dry-run
  mode, and agree any real write beforehand.
- **Bugzilla core stays unmodified.** Customise through `bugzilla/extensions/` and
  `bugzilla/templates/` only, so Bugzilla can be upgraded.
- **Keep `ops/app/` and `ops/reports/` where they are** - live scheduled tasks call them
  by path (see [`ops/README.md`](./ops/README.md)).
- Follow `.editorconfig` (2-space indent, LF line endings, UTF-8).
