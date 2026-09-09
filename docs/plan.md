# Chat Broker AI — Build Plan

Companion to `chat-broker-ai-vibe-prompt.md`. This file breaks the project into ordered, checkable steps. Work top to bottom — each phase builds on the last and should be independently testable before moving on.

---

## Phase 0 — Project Setup

- [x] Create the monorepo root with two independent projects:
  ```
  /chat-broker-ai
    /frontend
    /backend
    /docs
      plan.md
      chat-broker-ai-vibe-prompt.md
  ```
- [x] **`frontend/`** — create Next.js 14+ app (App Router, TypeScript, Tailwind) via `create-next-app`; install shadcn/ui and set up base theme; add `frontend/lib/api-client.ts` as the single place all backend calls go through
- [~] **`backend/`** — create the API project (Next.js API-route-only app, or a standalone Express/Fastify/Hono server — pick one and stick with it); install Vercel AI SDK (`ai` package) and configure AI Gateway env vars (`AI_GATEWAY_API_KEY` / model routing config) — **Hono chosen.** Server, CORS and env config done; the `ai` package install is deferred to Phase 4 where it is first used.
- [x] **`backend/`** — set up local Postgres via Docker:
  - Add `backend/docker-compose.yml` (Postgres 16 image, persistent volume, exposed on `5432`)
  - Run `docker compose up -d` and confirm the container is healthy (`docker ps`)
  - Set `DATABASE_URL=postgresql://chatbroker:chatbroker@localhost:5432/chatbroker` in `backend/.env`
- [x] Install ORM (Drizzle or Prisma) in `backend/` and confirm a basic connection/query works against the Docker container
- [x] Set `NEXT_PUBLIC_BACKEND_URL` in `frontend/` pointing at the backend's local/dev URL; set up CORS in `backend/` to allow the frontend's origin
- [ ] Push the repo to GitHub, connect **both** `frontend/` and `backend/` as separate Vercel projects, confirm both deploy blank end-to-end before adding features — **deferred by agreement:** building locally through Phase 5 first.
- [ ] For the deployed `backend/`, provision a **hosted** Postgres (Vercel Postgres / Neon / Supabase — pick one) since the Docker container only exists on your local machine — set `DATABASE_URL` in Vercel's env var settings to the hosted connection string (local `.env` keeps pointing at Docker; nothing else changes) — **deferred with the above** (Neon is the chosen provider).
- [~] Sanity check: frontend can successfully call one dummy backend route (e.g. `GET /health`) across the deployed URLs, not just locally — verified locally (`GET /health` + CORS preflight from `http://localhost:3000`); the deployed-URL half waits on deployment.

**Checkpoint:** Blank frontend and backend both deploy on Vercel (backend talking to the hosted DB), while local dev continues to run against the Docker container — same `DATABASE_URL`-driven setup, different values.

---

## Phase 1 — Database & Lead Capture

- [x] **`backend/`** — write DB schema/migrations for `leads`, `conversations`, `messages`, `quote_requests` (see schema in the vibe prompt, Section 4)
- [x] **`backend/`** — run migration, verify tables exist
- [x] **`backend/`** — build `POST /leads` route: validates email + phone, inserts a `leads` row, returns `leadId`
- [x] **`frontend/`** — build the lead-capture UI (email + phone, with a country-code select and no default country) — this is the gate before chat unlocks
- [x] **`frontend/`** — wire form submit → `api-client.ts` → `backend`'s `POST /leads` → on success, unlock the chat UI and store `leadId` in client state (e.g. React context or a cookie/session)
- [x] Add basic validation + error states on both sides (client-side format checks in `frontend/`, server-side validation in `backend/`, plus network-failure handling in the UI)

**Checkpoint:** Submitting the form creates a row in `leads` and unlocks the chat panel.

---

## Phase 2 — Static UI Shell (matches screenshot reference)

*Everything in this phase lives entirely in `frontend/` — no backend involvement yet.*

- [x] Build the two-panel layout: chat panel (left) + coverage/results panel (right), per the layout in the vibe prompt Section 10
- [x] Header: logo, brand name, assistant subtitle, Speak/Chat toggle (non-functional placeholder for now)
- [x] Left panel: chat bubble component (assistant + user variants), pinned input bar with send button
- [x] Right panel: "COVERAGE" label + 4 chips (Inpatient, Outpatient, Dental, Maternity), multi-select toggle state
- [x] Right panel empty state: sparkle icon + "Your matches will appear here" copy
- [x] Floating WhatsApp button (can just link out to `wa.me/...` for now, no logic needed)
- [x] Make it responsive (mobile-first, since most traffic will be a redirect from a button click, likely on mobile) — mobile shows one panel at a time via a Chat/Matches tab switch; the two-panel split kicks in at `lg`.

**Checkpoint:** UI looks and behaves like the reference screenshot with dummy/static data — no AI wired up yet.

---

## Phase 3 — Mock Quotes API (build before the AI, so it can be tested standalone)

*Everything in this phase lives entirely in `backend/`.*

- [x] Define types: `CoverageType`, `QuoteRequest`, `Quote`, `QuoteResponse` (see vibe prompt Section 5)
- [x] Build `backend/src/lib/quotes-api/providers/mock-provider.ts` — returns at least 3 quotes, varied by age + coverage type(s) requested (can be randomized within realistic bounds, or a lookup table — either is fine for mock data) — 5 fictional insurers × 3 cumulative tiers; deterministic pricing (age band × insurer factor × coverage breadth), no randomness.
- [x] Build `backend/src/lib/quotes-api/index.ts` as the public `getQuotes()` wrapper function (this is the "adapter" — the seam where a real 3rd-party API will plug in later)
- [x] Expose `POST /quotes` as a standalone REST endpoint calling the wrapper
- [x] Test independently with curl/Postman/Thunder Client, hitting the backend directly — confirm it returns ≥3 quotes for a few different input combos

**Checkpoint:** `POST /quotes` works completely independent of the chat/AI and of the frontend — provable with a raw HTTP request straight to the backend.

---

## Phase 4 — AI Chat (text only first)

- [x] **`backend/`** — build `POST /chat` route using Vercel AI SDK, routed through the AI Gateway
- [x] **`backend/`** — write the system prompt (see vibe prompt Section 6) — persona name, rules, required fields to collect
- [x] **`frontend/`** — wire the chat UI to the backend's `/chat` endpoint using `useChat` (streaming responses, pointed at `NEXT_PUBLIC_BACKEND_URL`)
- [x] **`backend/`** — persist each message to the `messages` table (role, content, `input_mode: 'typed'`, `conversation_id`)
- [x] **`frontend/`** — pass the coverage-type chip selections from Phase 2 up to the backend as part of the chat request context, so the AI doesn't re-ask if already selected
- [x] Test a full text conversation manually, frontend talking to a deployed (or locally-networked) backend: greeting → name → age → coverage confirmation — verified against the local backend by curl (streaming SSE) and by build; the deployed-backend variant waits on deployment.

**Checkpoint:** You can have a real, working text conversation with the AI, and it correctly collects name/age/coverage.

---

## Phase 5 — Tool Calling: AI → Mock Quotes API

- [x] **`backend/`** — register `getQuotes` as a callable tool/function in the AI SDK request (schema: name, age, coverageTypes), calling straight into the `quotes-api` module from Phase 3 (no HTTP hop needed — same process)
- [x] **`backend/`** — when the AI has all required fields, confirm it calls the tool instead of inventing quotes itself
- [x] **`backend/`** — on tool result, insert a row into `quote_requests` (snapshot of what was returned) and stream the structured quote data back to the frontend as part of the chat response
- [x] **`frontend/`** — render the returned quotes as cards in the right-hand results panel (replacing the empty state), each with insurer, plan name, premium, coverage summary
- [x] **`frontend/`** — add a basic sort/filter control on the results panel (e.g. sort by price) — the screenshot's empty-state copy explicitly promises "ranked, filterable, comparable" — sort by cheapest/priciest/most-cover, plus an insurer filter.

**Checkpoint:** Full text-only flow works end to end: lead capture → coverage select → chat → ≥3 quotes rendered as cards.

---

## Phase 6 — Voice Input

- [x] **`frontend/`** — implement the Speak/Chat toggle in the header to switch input mode
- [x] **`frontend/`** — wire `SpeechRecognition` (Web Speech API) for voice-to-text, with a graceful fallback/message for unsupported browsers (all of this is browser-only, no backend change needed)
- [x] **`frontend/`** — show live partial transcript while speaking
- [x] **`frontend/`** — on final transcript, populate the same send pipeline used for typed messages, tagging the request with `input_mode: 'voice'`
- [x] **`backend/`** — persist the `input_mode` flag as-is on the `messages` table (no new logic needed if Phase 4 already stores it generically)
- [ ] (Optional, can defer) Add TTS playback of AI replies when in Speak mode — `frontend/` only — **deferred, not built**; voice input works without it.

**Checkpoint:** A full conversation can be conducted by voice alone, indistinguishable to the backend from a typed one.

---

## Phase 7 — Polish & Hardening

- [x] **`frontend/`** — error states: AI call fails, tool call fails, network drop — all show a graceful retry option instead of breaking the UI
- [x] **`frontend/`** — loading/typing indicators while the AI is generating or fetching quotes
- [x] **`backend/`** — basic rate limiting or bot protection on `POST /leads`
- [x] Analytics events: lead captured, coverage selected, quote shown, quote clicked — trigger from `frontend/` (user-facing actions), or `backend/` for server-confirmed events (e.g. lead actually saved); even just console.log/stub for now, or wire to a real analytics tool if you have one
- [ ] Mobile QA pass on `frontend/` — test the redirect-from-button flow on an actual phone — **not done: needs a real device**; layout audited only
- [x] **`backend/`** — confirm the CRM-facing lead data (email, phone, source, timestamp) is actually queryable/exportable from the DB for reporting
- [x] Double-check CORS and env vars are correctly scoped in production — `backend/` env vars (DB creds, AI Gateway key) must never leak into the `frontend/` bundle

**Checkpoint:** App is demo-ready end to end, on both desktop and mobile, with frontend and backend deployed as separate services.

---

## Phase 8 — Handoff Points (not required to build now)

- [ ] Swap `mock-provider.ts` for a real 3rd-party insurer API — should only require changes inside `backend/src/lib/quotes-api/`, nothing in the frontend, AI, or chat layer
- [ ] Local Docker Postgres → hosted Postgres is already handled by Phase 0 (same schema, just a different `DATABASE_URL`) — no extra migration work needed unless you want to seed the hosted DB with different test data than local
- [ ] Replace placeholder WhatsApp link with a real handoff flow if needed (`frontend/`, possibly triggering a `backend/` webhook)
- [ ] Visual redesign pass in Claude Design, once you're ready — this build plan intentionally kept the UI structural (from the screenshot reference) rather than final-pixel, since you're doing that separately; redesign work only touches `frontend/`

---

*Save this file as `docs/plan.md`. Keep `chat-broker-ai-vibe-prompt.md` alongside it in the same `docs/` folder as the source-of-truth spec — this plan just sequences it into steps.*
