---
name: CodeVault Setup
description: Architecture decisions, gotchas, and state for the CodeVault AI coding tool project
---

## Architecture
- Frontend: React+Vite at artifacts/codevault (port 21609, base /)
- API: Express 5 at artifacts/api-server (port 8080)
- DB: Mongoose + MongoDB (MONGODB_URI secret required)
- Shared types: lib/api-spec/openapi.yaml → codegen → lib/api-client-react + lib/api-zod

## Auth
- Email + password (passport-local + bcryptjs). No GitHub OAuth.
- SESSION_SECRET: already in Replit Secrets
- MONGODB_URI: already in Replit Secrets
- Passport serializes/deserializes user by MongoDB `_id.toString()`

## Database (MongoDB / Mongoose)
- Models in `artifacts/api-server/src/lib/db.ts`: User, Workspace, Message
- Workspace._id is a UUID string (not ObjectId)
- Message._id is a UUID string
- `connectDB()` must be called before `app.listen()` — done in index.ts
- `mongoose` is in the esbuild external list (build.mjs) — do not remove

## Projects (no GitHub required)
- Users create blank projects or choose from templates: node, python, react, express
- Templates defined in `workspace-manager.ts` → TEMPLATES map
- All projects get a local git init + initial commit (no remote)
- `commitChanges()` commits locally; pushes only if a remote is configured
- Cloned repos: /tmp/codevault-workspaces/{workspaceId}/

## Codegen Quirk — Orval Params Collision
- Orval generates BOTH Zod schema XxxParams AND TypeScript interface XxxParams when an endpoint has both path + query params — these collide in the barrel.
- Fix: put extra params in request body for any endpoint that also has path params.
- Run codegen: pnpm --filter @workspace/api-spec run codegen

## Vite Proxy
- vite.config.ts proxies /api → http://localhost:8080 in dev.
- Frontend uses direct fetch(credentials: include) for auth endpoints.
- Generated hooks (from @workspace/api-client-react) used for workspace/file/git/message endpoints.

## AI
- Groq SDK, model llama-3.3-70b-versatile, GROQ_API_KEY secret required.
- Prompt → JSON { summary, fileChanges[] } → files written to disk immediately.

## Build
- esbuild bundles api-server to dist/index.mjs (ESM)
- `zod` must be a direct dependency of @workspace/api-server (not just transitive)
- Use `import { z } from "zod"` (NOT "zod/v4") — workspace uses Zod v3
- `mongoose` is externalized in build.mjs
