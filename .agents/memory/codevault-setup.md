---
name: CodeVault Setup
description: Architecture decisions, gotchas, and state for the CodeVault AI coding tool project
---

## Architecture
- Frontend: React+Vite at artifacts/codevault (port 21609, base /)
- API: Express 5 at artifacts/api-server (port 8080)
- DB: Drizzle ORM + Postgres (lib/db), schema: users, workspaces, messages
- Shared types: lib/api-spec/openapi.yaml → codegen → lib/api-client-react + lib/api-zod

## Codegen Quirk — Orval Params Collision
Orval generates BOTH Zod schema XxxParams (path params) AND TypeScript interface XxxParams (query params)
when an endpoint has both — these collide in the lib/api-zod/src/index.ts barrel.
Fix: put extra params in request body, not query, for any endpoint that also has path params.
Current workaround: file read/write use POST/PUT with ReadFileInput/WriteFileInput bodies.
Run codegen: pnpm --filter @workspace/api-spec run codegen (Orval overwrites lib/api-zod/src/index.ts every run).

## Auth
- SESSION_SECRET: already in Replit Secrets
- GITHUB_CLIENT_ID / GITHUB_CLIENT_SECRET: user must create GitHub OAuth App
  Callback URL: https://<replit-dev-domain>/api/auth/github/callback
- passport-config.ts silently skips GitHub strategy if env vars absent (avoids boot crash)

## Vite Proxy
vite.config.ts proxies /api → http://localhost:8080 in dev.
custom-fetch.ts sends credentials: include by default.
QueryClient: retry: false on 401/403.

## AI
Groq SDK, model llama-3.3-70b-versatile, GROQ_API_KEY secret required.
Prompt → JSON { summary, fileChanges[] } → files written to disk immediately.

## Workspace Storage
Cloned repos: /tmp/codevault-workspaces/{workspaceId}/
simple-git for all git ops.
