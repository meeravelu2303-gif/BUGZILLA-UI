# backend/ - Bug Tracker BFF

Node.js + Express + TypeScript. The browser talks only to this service (`/api/*`);
this service talks only to Bugzilla's API. It has **no database driver** - Bugzilla is
the data source (see [`../docs/ARCHITECTURE.md`](../docs/ARCHITECTURE.md)).

## Layers

A request flows top to bottom; each layer only calls the ones below it.

```
src/
├── index.ts            Entry point: security headers, CORS, sessions, mounts /api, listen
├── routes/
│   └── api.route.ts    THE route file: every endpoint, its middleware and its controller handler
├── middleware/         Runs before controllers
│   ├── auth.middleware.ts        requireAuth (session → user's Bugzilla token), requirePermission
│   ├── rateLimit.middleware.ts   Sign-in and password-reset limits
│   └── error.middleware.ts       404 + the single error-response format
├── controllers/        One per resource. Only imports + exported handlers - nothing else
│   └── *.controller.ts
├── dto/                Zod schemas and response types: what comes in, what Bugzilla returns
│   └── *.dto.ts
├── services/           Business logic and Bugzilla calls the handlers use
│   └── *.service.ts
├── clients/            Outbound connections
│   ├── bugzilla.client.ts        Bugzilla JSON-RPC client (per-user token or service key)
│   ├── bugzillaAuth.client.ts    Bugzilla sign-in / sign-out
│   └── session.store.ts          Session storage: memory | file | redis
├── events/             Server-Sent Events: live updates pushed to every open browser
├── helpers/            Shared helpers: responses, errors, validation, memo cache, proof pages
├── config/             app.config.ts - every environment variable, validated with Zod at start-up
└── types/              Express request augmentation (req.sessionUser, req.bugzilla)
```

| Layer | May use | Must not |
|---|---|---|
| `routes/` | `middleware/`, `controllers/` | contain request logic |
| `controllers/` | `services/`, `dto/`, `clients/`, `helpers/` | declare anything except exported handlers |
| `services/` | `clients/`, `dto/`, `helpers/`, other services | write responses (they may read `req`: the session user, their Bugzilla client) |
| `clients/` | `helpers/`, `config/` | know about HTTP requests from the browser |

## Naming

| Kind | File | Export |
|---|---|---|
| Routes | `routes/api.route.ts` | `apiRouter`, mounted at `/api` |
| Controller | `bugs.controller.ts` | one exported handler per endpoint: `listBugs`, `getBug`, `createBug`, ... |
| DTO | `bug.dto.ts` | `createBugSchema`, `normalizeBug`, ... |
| Service | `bugExportJobs.service.ts` | plain functions and constants |
| Helper | `response.helper.ts` | `sendSuccess`, `asyncHandler`, ... |
| Middleware | `auth.middleware.ts` | `requireAuth(env)`, ... |

`api.route.ts` imports each controller as a namespace - `import * as BugsController from '../controllers/bugs.controller'` -
so every route line reads `router.get('/bugs/:id', auth, BugsController.getBug)`, grouped by resource.

## Controller pattern

```ts
export const getTeam = asyncHandler(async (req, res) => {
  const { id } = parseInput(idSchema, req.params);       // invalid input -> 400
  const team = await loadTeam(id);
  if (!team) throw notFound('That team could not be found.');
  sendSuccess(res, { team });
});
```

| Helper | File | Purpose |
|---|---|---|
| `asyncHandler(fn)` | `helpers/response.helper.ts` | Runs the handler; anything it throws goes to the error middleware - no try/catch in handlers |
| `sendSuccess(res, data, status?)` | `helpers/response.helper.ts` | JSON response (`201` etc. as the third argument) |
| `sendNoContent(res)` | `helpers/response.helper.ts` | `204` with no body |
| `badRequest` `unauthenticated` `forbidden` `notFound` `conflict` | `helpers/errors.helper.ts` | Throwable errors for 400 / 401 / 403 / 404 / 409 |
| `parseInput(schema, value)` | `helpers/validate.helper.ts` | Validates body / query / params with a DTO schema; throws 400 |
| `env` | `config/app.config.ts` | The validated configuration, read once at start-up |

Every error response has one shape - `{ error: true, status, code, message }` - built only by
`middleware/error.middleware.ts`. The frontend relies on it. Errors thrown on purpose (`notFound(...)` etc.) send
their own message; anything unexpected is logged on the server and answered with a generic message.

## Adding an endpoint

1. **DTO** - add the request schema in `dto/<resource>.dto.ts`.
2. **Service** - put any business rule or helper in `services/` - never in the controller file.
3. **Controller** - add an exported handler in `controllers/<resource>.controller.ts`, as above.
4. **Route** - add one line to `routes/api.route.ts`, in that resource's group:
   `router.get('/things/:id', auth, ThingController.getThing);`

## Commands

```bash
npm run dev         # tsx watch on src/ (port 4000)
npm run typecheck   # tsc --noEmit
npm run build       # compile to dist/
npm start           # node dist/index.js
```

Configuration: copy `.env.example` to `.env`. Container image: [`Dockerfile`](./Dockerfile)
(two-stage build; settings are passed as environment variables, never baked in).
