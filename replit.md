# CodeVault

AI-assisted code workspace that connects to GitHub repos and uses Groq AI to help you ship code directly from the browser.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 8080)
- `pnpm --filter @workspace/codevault run dev` — run the frontend (port 21609)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes to the dev database (run this after schema edits)

## Required Secrets

| Secret | Where to get it | Notes |
|---|---|---|
| `SESSION_SECRET` | Any random string | Already set |
| `GITHUB_CLIENT_ID` | github.com/settings/developers → New OAuth App | Add when ready |
| `GITHUB_CLIENT_SECRET` | Same OAuth App page | Add when ready |
| `GROQ_API_KEY` | console.groq.com | Add when ready |

**GitHub OAuth callback URL:**
`https://<your-replit-dev-domain>/api/auth/github/callback`

The app boots without GitHub credentials (OAuth is disabled but the server runs). GitHub login will 404 until credentials are added.

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- **Frontend:** React + Vite + Tailwind CSS + Radix UI + Monaco Editor
- **Backend:** Express 5, Passport.js (GitHub OAuth), Simple-git, Groq SDK, Pino
- **DB:** PostgreSQL + Drizzle ORM (`lib/db/src/schema/`)
- **Validation:** Zod (zod/v4), drizzle-zod
- **API codegen:** Orval (from `lib/api-spec/openapi.yaml`)
- **Build:** esbuild (CJS bundle)

## Where things live

- `artifacts/codevault/` — React frontend
- `artifacts/api-server/` — Express API (routes in `src/routes/`)
- `lib/db/` — Drizzle schema + migrations (source of truth for DB shape)
- `lib/api-spec/openapi.yaml` — API contract (source of truth for endpoints)
- `lib/api-zod/` — Generated Zod schemas (run codegen, don't edit manually)

## Architecture decisions

- Vite dev server proxies `/api` → `http://localhost:8080` — no CORS config needed in dev
- GitHub OAuth strategy is skipped silently if `GITHUB_CLIENT_ID`/`GITHUB_CLIENT_SECRET` are absent — safe to boot without them
- Cloned repos land in `/tmp/codevault-workspaces/{workspaceId}/` via simple-git
- Orval codegen collision quirk: endpoints with both path params AND query params must put extra params in the request body (not query string) — see `.agents/memory/codevault-setup.md`

## Product

CodeVault lets users connect their GitHub account, clone repos into ephemeral workspaces, browse and edit files with Monaco Editor, and use Groq AI to generate code changes that are written directly to disk and committed via Git.

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Gotchas

- Run `pnpm --filter @workspace/db run push` after any schema change in `lib/db/src/schema/`
- Run `pnpm --filter @workspace/api-spec run codegen` after any change to `lib/api-spec/openapi.yaml`
- Never edit `lib/api-zod/src/index.ts` manually — it's overwritten by codegen
- Orval param collision: if an endpoint has path params, put query params in the request body instead

## Pointers

- See `.agents/memory/codevault-setup.md` for architecture decisions and gotchas
- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
