# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

**SwiftBrokers** (a.k.a. "Chat Broker AI") — a standalone insurance-quotation chat app that an existing marketing site deep-links into. A visitor submits email + phone, chats with an AI broker persona named **Nomi** by text or voice, and gets at least 3 mock quotations. Every lead is persisted for CRM/reporting.

Three documents govern the work; read them before making design decisions:

- `docs/chat-broker-ai-vibe-prompt.md` — the full spec (user flow, data model, system prompt, UI layout §10)
- `docs/plan.md` — the phased build plan with checkboxes reflecting real progress
- `docs/decisions.md` — resolved ambiguities and locked stack choices; **this overrides the other two where they conflict**

Work proceeds phase by phase, top to bottom in `plan.md`. Tick the boxes as phases complete, and annotate items that were deferred or partially done rather than silently checking them — an item marked done that isn't is worse than an unticked one.

**Status: Phases 0–6 are complete** (setup, lead capture, UI shell, mock quotes, AI chat, tool calling, voice input). Next is Phase 7 — polish and hardening. Deployment (GitHub, two Vercel projects, Neon) was deliberately deferred out of Phase 0; local dev is the only environment so far.

## Repo layout

`frontend/` and `backend/` are two independent, separately-deployable npm projects under one root (no workspace tooling — install and run each on its own). There is no root `package.json`.

## Commands

Backend (`cd backend`):
```bash
docker compose up -d      # local Postgres 16 on :5432 (required before db/dev commands)
npm run dev               # tsx watch, serves on :3001
npm run db:generate       # drizzle-kit generate — writes SQL into backend/drizzle/
npm run db:migrate        # applies backend/drizzle/*.sql to DATABASE_URL
npx tsc --noEmit          # typecheck
```

Frontend (`cd frontend`):
```bash
npm run dev               # Next dev on :3000
npx tsc --noEmit          # fast check — prefer this while iterating
npm run build             # full build + TypeScript pass; memory-heavy, save it for phase boundaries
```

Inspecting the database:
```bash
docker exec swiftbroker-postgres psql -U chatbroker -d chatbroker -c "select * from leads;"
```

## Testing

There is no test framework installed, and the plan doesn't call for one. Verification is:

1. **curl against `http://localhost:3001`** — every backend route is designed to be exercisable without the frontend, including `/chat` (send a UIMessage-shaped body and read the SSE stream). Add `-H "Origin: http://localhost:3000"` to also prove CORS on the same call.
2. **`tsc --noEmit` on both projects**, plus `next build` at phase boundaries.
3. **Node runs `.ts` directly** (Node 24 strips types), so pure helpers can be unit-tested without any tooling: `cd frontend && node lib/country-codes.test.ts`. Such a test imports with an explicit `./x.ts` extension, which `next build`'s typecheck rejects — hence `"**/*.test.ts"` in `frontend/tsconfig.json`'s `exclude`. Keep pure logic out of components so it can be tested this way (`speech.ts`, `country-codes.ts`).
4. **Check the database** after any flow that should persist something; don't infer it from a 200.

Anything requiring a real browser — rendering, the microphone, hydration — cannot be verified from here. Say so plainly rather than implying it was tested. Clean up test rows afterwards, but never delete data the user created themselves without asking.

## Architecture

**The frontend never touches the database, the AI Gateway, or quotes logic.** It talks to the backend over REST only, and every call goes through `frontend/lib/api-client.ts` (or the `useChat` transport in `lib/use-broker-chat.ts`). Adding a `fetch` anywhere else breaks the separation the spec is built around.

### Backend (Hono on Node, ESM, `type: module`)

Routes: `GET /health`, `POST /leads`, `POST /quotes`, `POST /quotes/preview`, `POST /chat`.

`POST /quotes/preview` exists so a coverage-chip click can fill the results panel immediately: it takes `coverageTypes` and an **optional** `age`, defaulting to a mid-band 30 and flagging `assumedAge` so the UI can label the prices indicative. It deliberately persists nothing — only the AI's `getQuotes` tool snapshots into `quote_requests`, because only that call belongs to a conversation. Keep `quoteRequestSchema` (name + age required) as the AI tool's contract; loosening it would let the model skip collecting them.

- `src/index.ts` — server entry, CORS, route mounting. CORS uses an explicit origin allowlist from `CORS_ALLOWED_ORIGINS`, never a wildcard, because these routes carry PII.
- `src/env.ts` — the single place env vars are read; `DATABASE_URL` is required and throws at boot.
- `src/db/` — Drizzle schema, client (postgres.js driver), standalone migrate script.
- `src/lib/validation.ts` — all Zod schemas. Messages here are **user-facing**: the frontend renders them inline under form fields, so missing/wrong-type cases carry the same wording as malformed ones rather than Zod's defaults. `coverageTypeSchema` is shared by the REST route and the AI tool so they can't drift.
- `src/lib/http.ts` — `fieldErrors()` flattens Zod issues into the `{ field: message }` shape every route returns.
- `src/lib/quotes-api/` — the adapter seam. `index.ts` exports `getQuotes()` behind a `QuoteProvider` interface; `providers/mock-provider.ts` holds 5 fictional insurers × 3 cumulative tiers with **deterministic** pricing (age band × insurer factor × coverage breadth — no `Math.random`, so responses are reproducible). A plan qualifies only if it covers everything requested; results are sorted cheapest-first and capped at 6, with a fallback guaranteeing ≥3.
- `src/lib/ai/` — `model.ts` (env-driven model string, throws if the gateway key is missing), `prompt.ts` (system prompt built per-request with the UI's coverage selection injected), `tools.ts` (`getQuotes` tool that calls the quotes module in-process and snapshots the result into `quote_requests`).
- `src/lib/conversations.ts` — one conversation per lead, created on first message and reused; throws `LeadNotFoundError` for an unknown `leadId` so `/chat` can answer `404` instead of a foreign-key `500`.

**Relative imports must carry the `.js` extension** (`from "../env.js"`) — ESM + `verbatimModuleSyntax`. `backend/tsconfig.json` includes only `src/**/*.ts`; `drizzle.config.ts` sits outside `rootDir` and errors if included.

### Frontend (Next 16 App Router, React 19, Tailwind v4, shadcn/ui `base-nova`, lucide)

- `components/app-shell.tsx` owns page state (coverage chips, mode, mobile tab, voice-unsupported flag) and wires the chat hook to both panels. `app/page.tsx` is a thin server component wrapping it in `LeadProvider`.
- `lib/country-codes.ts` holds the dial-code list plus `toE164()` (joins the selected code to the typed digits, strips separators and the national trunk zero) and `guessCountryIso()` (browser-locale preselect — call from an effect only, never during render). **There is no default country**: the product is multi-country, so an undetectable locale leaves the select empty rather than guessing.
- `lib/lead-context.tsx` gates the app: the input stays disabled until `POST /leads` succeeds. `leadId` lives in context, mirrored to `sessionStorage`. The `?src=` param is captured here for CRM attribution.
- `lib/use-broker-chat.ts` wraps `useChat`, sends `{leadId, coverageTypes, inputMode}` with every request, and exposes `quotes` / `fetchingQuotes` derived from the `tool-getQuotes` parts in the message stream. `messageText()` joins text parts with a blank line — a tool-calling turn emits one part before the call and one after, and joining them bare runs sentences together.
- `lib/use-coverage-quotes.ts` debounces the chip selection into `POST /quotes/preview`. `app-shell.tsx` then applies one rule: **if any chip is selected the panel shows the chip-driven quotes; otherwise it shows the AI's.** Once the AI has quoted, `extractQuotedAge()` feeds its age back into the preview, so — the mock being deterministic — both surfaces return byte-identical results and the switch is invisible.
- `lib/speech.ts` + `lib/use-speech-input.ts` — Web Speech API. `speech.ts` holds the vendor-prefix lookup and pure helpers (unit-testable, SSR-safe); the hook manages the live transcript and a 1.5s-silence auto-send the user can cancel.
- Brand palette lives as Tailwind v4 `@theme` tokens in `app/globals.css` — use `bg-navy-900`, `bg-navy-850`, `bg-navy-800`, `bg-brand`, `bg-whatsapp`, never hex literals.
- Below `lg` the two-panel layout collapses to a Chat/Matches tab switch; quote arrival auto-switches to Matches so results aren't hidden.
- `frontend/AGENTS.md` is generated and re-added by `next dev` — don't fight it; `frontend/CLAUDE.md` is just an `@AGENTS.md` pointer.

**Config, not hardcoding:** brand name, assistant name, currency, country code and model come from env, surfaced through `backend/src/env.ts` and `frontend/lib/config.ts`. The AI is model-agnostic by design — routed through the Vercel AI Gateway so providers swap via `AI_MODEL`, not code. This project uses the **Vercel AI SDK, not the Anthropic SDK**; that is a deliberate spec decision, not an oversight.

**Data model** (`backend/src/db/schema.ts`): `leads` → `conversations` (holds the `coverage_type` array, updated as chips toggle) → `messages` (each tagged `input_mode: 'typed' | 'voice'` for conversion analytics) and `quote_requests` (JSONB snapshot of what the provider returned).

## Environment

`backend/.env` and `frontend/.env.local` are gitignored; the `.env.example` files beside them are the committed templates. Local dev points `DATABASE_URL` at Docker; production will point it at Neon — same variable, different value. `AI_GATEWAY_API_KEY` is filled in by the user directly in the file; never ask for a key to be pasted into the conversation.

## Gotchas hit in this repo

- **AI SDK v7 differs from the v5 shape most docs show:** `convertToModelMessages()` returns a promise and must be awaited, and `streamText` needs `stopWhen: stepCountIs(n)` or a tool-calling turn ends on raw tool output with no spoken reply.
- **`.env` changes need a manual backend restart** — `tsx watch` only watches `src/`.
- **Killing a dev server needs the port, not the task.** Stopping the background task kills the npm wrapper and leaves the node child bound. Use `netstat -ano | grep :3001` then `taskkill //F //PID <pid>`.
- Any `flex-1` + `overflow-y-auto` child in the chat column needs `min-h-0`, or it grows past its parent and slides under the pinned input instead of scrolling.
- `devIndicators: false` in `next.config.ts` is deliberate: the Next dev badge pins itself bottom-left, over the input bar's avatar.
- `suppressHydrationWarning` on `<body>` is deliberate too — browser extensions (ColorZilla's `cz-shortcut-listen`) inject attributes before hydration.
- The system prompt forbids listing plans or prices in chat; quote cards render in the right panel and the reply is a one-line summary. Loosening that prompt reintroduces markdown tables in the chat.
- `docker compose up -d` can take several minutes on first run; wait on container health (`docker inspect --format '{{.State.Health.Status}}' swiftbroker-postgres`) rather than assuming failure.
- Windows environment: Bash and PowerShell are both available; `python` is not. Node resolves `/tmp/x` as `C:\tmp\x`, so don't share paths between shell redirects and node scripts.
