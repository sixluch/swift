# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

**SwiftBrokers** (a.k.a. "Chat Broker AI") — a standalone insurance-quotation chat app that an existing marketing site deep-links into. A visitor submits email + phone, chats with an AI broker persona named **Nomi** by text or voice, and gets at least 3 mock quotations. Every lead is persisted for CRM/reporting.

Two source-of-truth documents govern the work; read them before making design decisions:

- `docs/chat-broker-ai-vibe-prompt.md` — the full spec (user flow, data model, system prompt, UI layout §10)
- `docs/plan.md` — the phased build plan with checkboxes reflecting real progress
- `docs/decisions.md` — resolved ambiguities and locked stack choices; **this overrides the other two where they conflict**

Work proceeds phase by phase, top to bottom in `plan.md`. Tick the boxes as phases complete, and annotate items that were deferred or partially done rather than silently checking them.

## Repo layout

`frontend/` and `backend/` are two independent, separately-deployable npm projects under one root (no workspace tooling — install and run each on its own). There is no root `package.json`.

## Commands

Backend (`cd backend`):
```bash
docker compose up -d      # local Postgres 16 on :5432 (required before db/dev commands)
npm run dev               # tsx watch, serves on :3001
npm run db:generate       # drizzle-kit generate — writes SQL into backend/drizzle/
npm run db:migrate        # applies backend/drizzle/*.sql to DATABASE_URL
npx tsc --noEmit          # typecheck (there is no test suite yet)
```

Frontend (`cd frontend`):
```bash
npm run dev               # Next dev on :3000
npm run build             # also runs the TypeScript pass — the closest thing to CI here
npm run lint
```

Inspecting the database directly:
```bash
docker exec swiftbroker-postgres psql -U chatbroker -d chatbroker -c "select * from leads;"
```

Verify API behavior with curl against `http://localhost:3001` rather than only through the UI — every backend route is designed to be exercisable without the frontend.

## Architecture

**The frontend never touches the database, the AI Gateway, or quotes logic.** It talks to the backend over REST only, and every call goes through `frontend/lib/api-client.ts`. Adding a `fetch` anywhere else in the frontend breaks the separation the spec is built around.

**Backend** (Hono on Node, ESM, `type: module`):
- `src/index.ts` — server entry, CORS, route mounting. CORS uses an explicit origin allowlist from `CORS_ALLOWED_ORIGINS`, never a wildcard, because these routes carry PII.
- `src/env.ts` — the single place env vars are read and validated; `DATABASE_URL` is required and throws at boot if missing.
- `src/db/` — Drizzle schema, client (postgres.js driver), and a standalone migrate script.
- `src/lib/validation.ts` — Zod schemas. Error messages here are **user-facing**: the frontend renders them inline under form fields, so missing/wrong-type cases carry the same wording as malformed ones rather than Zod's defaults.
- `src/lib/quotes-api/` — the adapter seam. `index.ts` exports `getQuotes()`; `providers/mock-provider.ts` is swappable for a real insurer API without touching routes, AI, or frontend code. It is exposed twice: as a plain function for the AI SDK tool definition, and as `POST /quotes` for standalone testing.

**Relative imports must carry the `.js` extension** (e.g. `from "../env.js"`) — ESM + `verbatimModuleSyntax`. `backend/tsconfig.json` deliberately includes only `src/**/*.ts`; `drizzle.config.ts` sits outside `rootDir` and would error if included.

**Frontend** (Next 16 App Router, React 19, Tailwind v4, shadcn/ui `base-nova` style, lucide icons):
- `components/app-shell.tsx` owns all page state (coverage selection, messages, mode, mobile tab) and is where Phase 4/5 wiring lands. `app/page.tsx` is a thin server component wrapping it in `LeadProvider`.
- `lib/lead-context.tsx` gates the app: the chat input stays disabled until `POST /leads` succeeds. `leadId` lives in React context, mirrored to `sessionStorage` so a refresh doesn't re-gate. The `?src=` query param is captured here for CRM attribution.
- Brand palette is defined as Tailwind v4 `@theme` tokens appended to `app/globals.css` — use `bg-navy-900`, `bg-navy-850`, `bg-navy-800`, `bg-brand`, `bg-whatsapp` rather than hex literals.
- Below `lg`, the two-panel layout collapses to a Chat/Matches tab switch; the split from spec §10 applies at `lg` and up.
- `frontend/AGENTS.md` is generated and re-added by `next dev` — don't fight it; `frontend/CLAUDE.md` is just an `@AGENTS.md` pointer.

**Config, not hardcoding:** brand name, assistant name, currency, country code and model come from env (`BRAND_NAME`, `ASSISTANT_NAME`, `AI_MODEL`, …), surfaced through `backend/src/env.ts` and `frontend/lib/config.ts`. The AI is model-agnostic by design — routed through the Vercel AI Gateway so providers swap via env, not code.

**Data model** (`backend/src/db/schema.ts`): `leads` → `conversations` (holds the `coverage_type` array) → `messages` (each tagged `input_mode: 'typed' | 'voice'` for conversion analytics) and `quote_requests` (snapshots what the mock API returned in `jsonb`). All four tables are already migrated even though Phases 4–5 haven't populated the last three yet.

## Environment

`backend/.env` and `frontend/.env.local` are gitignored; `.env.example` files alongside them are the committed templates. Local dev points `DATABASE_URL` at the Docker container; production points it at Neon — same variable, different value, no code change. `AI_GATEWAY_API_KEY` is filled in by the user directly in the file.

## Gotchas hit in this repo

- In the chat column, any `flex-1` + `overflow-y-auto` child needs `min-h-0` or it grows past its parent and slides under the pinned input instead of scrolling.
- `devIndicators: false` in `next.config.ts` is deliberate: the Next dev badge pins itself to the bottom-left, directly over the input bar's assistant avatar.
- `docker compose up -d` can take several minutes on first run here; wait on container health (`docker inspect --format '{{.State.Health.Status}}' swiftbroker-postgres`) rather than assuming failure.
- Windows environment: Bash and PowerShell are both available; `python` is not.
