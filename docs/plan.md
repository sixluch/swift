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

## Phase 4 — AI Chat (text only first) — *the guided-question parts were superseded by Phase 10 on 2026-09-12; the chat is now support-only*

- [x] **`backend/`** — build `POST /chat` route using Vercel AI SDK, routed through the AI Gateway
- [x] **`backend/`** — write the system prompt (see vibe prompt Section 6) — persona name, rules, required fields to collect
- [x] **`frontend/`** — wire the chat UI to the backend's `/chat` endpoint using `useChat` (streaming responses, pointed at `NEXT_PUBLIC_BACKEND_URL`)
- [x] **`backend/`** — persist each message to the `messages` table (role, content, `input_mode: 'typed'`, `conversation_id`)
- [x] **`frontend/`** — pass the coverage-type chip selections from Phase 2 up to the backend as part of the chat request context, so the AI doesn't re-ask if already selected
- [x] Test a full text conversation manually, frontend talking to a deployed (or locally-networked) backend: greeting → name → age → coverage confirmation — verified against the local backend by curl (streaming SSE) and by build; the deployed-backend variant waits on deployment.

**Checkpoint:** You can have a real, working text conversation with the AI, and it correctly collects name/age/coverage.

---

## Phase 5 — Tool Calling: AI → Mock Quotes API — *superseded by Phase 10 on 2026-09-12: the form calls the quotes API directly and the model has no tools*

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

## Phase 9 — Admin Console

Staged so each stage ships on its own. **Stage 1 is complete**; the rest are proposed, not approved.

### Stage 1 — Auth + lead report + transcript + CSV export (done 2026-09-09)

- [x] `backend/` — `admin_users` + `admin_sessions` tables (migration `0004`), plus an index on `leads.created_at` (the report's default sort)
- [x] `backend/` — scrypt password hashing and opaque server-side sessions in `src/lib/admin-auth.ts`; only the SHA-256 of a session token is stored, so a DB dump is not a set of live cookies
- [x] `backend/` — `npm run admin:create -- <username>` creates or resets the single operator account; the password comes from stdin or `ADMIN_PASSWORD`, never argv. No default credentials exist anywhere in the repo
- [x] `backend/` — `/admin/auth/{login,logout,me}`, `/admin/leads`, `/admin/leads/:id`, `/admin/leads.csv`; everything but login sits behind `requireAdmin`
- [x] `backend/` — login rate-limited to 10 per 15 minutes, reusing the `/leads` limiter
- [x] `backend/` — CSV export with formula-injection escaping, a UTF-8 BOM and CRLF endings (`src/lib/csv.ts`, unit-tested with `node src/lib/csv.test.ts`)
- [x] `frontend/` — `/admin/login`, `/admin` (filterable, paginated lead report) and `/admin/leads/[id]` (transcript + quote snapshots); `noindex` on the whole section
- [ ] Deliberately out of scope for Stage 1, and not started: password reset by email, roles/permissions, 2FA, audit log, editing or deleting leads. Delete-a-lead is the one most likely to be needed next (data-removal requests) and is cheap — the foreign keys already cascade

### Stage 2 — Insurer records + rate-card upload (part 1 done 2026-09-10)

Locked answers from the client (2026-09-10): import **all 7** area tables; map the existing 4 coverage tiers onto VUMI's 5 plan tiers (**Q2b**); show premiums **as-is (annual)**; the admin toggles which optional benefits are **available**, and a new insurer with a new benefit adds it to that list; deductible/excess/coinsurance is **one row only**, not stackable; tables 2-4 are **prefilled from the parse and editable**; a country outside every area gets an explicit **"not available in your country"**; **no** review screen for the 490 parsed premiums; structure is **insurer -> products -> rate cards**; the original PDF is **stored**, and re-uploading the same file **replaces** it.

- [x] `backend/` — `insurers` + `insurer_documents` tables (migration `0005`). The PDF is stored as `bytea`: a few hundred KB, and Vercel has no persistent local disk
- [x] `backend/` — `src/lib/pdf.ts` validates by **magic bytes**, not the browser's `Content-Type`, caps at 10 MB (refused from `Content-Length` before the body is buffered), hashes content with SHA-256 and sanitises the filename. Pure and unit-tested (`node src/lib/pdf.test.ts`, 11 tests)
- [x] `backend/` — `/admin/insurers` (list, create), `/admin/insurers/:id`, and per-document upload / inline view / delete, all behind `requireAdmin`. Re-uploading the same filename for an insurer replaces that row (`onConflictDoUpdate` on `(insurer_id, filename)`)
- [x] `frontend/` — an **Insurers** tab in the admin header, `/admin/insurers` (list), `/admin/insurers/new` (name + optional PDF in one submit), `/admin/insurers/[id]` (upload, replace, open, remove)
- [x] `backend/` — **rate-card parsing.** Page-accurate PDF extraction (`lib/pdf-text.ts` `extractPdfPages`), a deterministic VUMI parser (`lib/rate-cards/vumi-parser.ts`), name→ISO resolution generated from the frontend's country list, and persistence into `products` / `rate_cards` / `rate_areas` / `rate_area_countries` / `rate_area_restrictions` / `rate_plans` / `rate_premiums` / `rate_benefits` / `rate_surcharges` / `rate_deductibles` (migration `0006`). Re-parsing replaces the card in one transaction. Verified against the printed Area 1 table cell for cell: 7 areas, 490 premiums, 208 countries, 1 unresolved
- [x] `frontend/` — a **Parse rate card** button per document, a summary panel, and `/admin/rate-cards/[id]`: the premium table per area, plus the editable optional-benefits, payment-surcharge and deductible sections (prefilled from the parse, per Q6)
- [x] Found a **fifth table the brief didn't cover** — "DISCOUNT FOR COVERAGE RESTRICTION" (Asia −7.5%, Indian Sub-Continent −20%, Africa −23.5%). It varies **by area**, unlike the other three, so it is stored per area and flagged in the UI. **Needs a decision before it can feed a quote.**
- [x] **DB-backed quotes** (done 2026-09-10). `lib/quotes-api/providers/rate-card-provider.ts` resolves country → area → age band → plan rows against any parsed card, and `lib/quotes-api/index.ts` merges them with the mock. Locked answers from the client (2026-09-10): premiums shown **as printed (annual)**, so `Quote` carries a `premiumBasis` and every comparison normalises through `monthlyEquivalent()`; **merge** with the mock rather than replace; a cover the card doesn't price is **shown flagged** ("Dental not covered by this plan") rather than hidden; optional benefits are **selectable on the card** and add to the total; a deductible discounts the base premium and flat add-ons are added afterwards (`lib/quotes-api/pricing.ts`, unit-tested). The out-of-area (Q7) and 80+ paths return an explicit notice, rendered in the results panel and passed to the model
  - The merge is asymmetric on purpose: **every** rate-card quote is kept and the mock only fills the remaining slots. A cheapest-first cut of six across both pools returned six fictional insurers and no VUMI, because VUMI's cheapest Area 1 plan is USD 320/month against the mock's USD 110
  - **Q2b mapping is derived, not configured:** BASIC is inpatient-only (the outpatient benefit carries `only_plans = {BASIC}`, which is only coherent if BASIC lacks it), STANDARD upward include outpatient. BASIC is still offered against an outpatient request, flagged with the +65% add-on, rather than filtered out for a cover that is purchasable
- [ ] **Blocked on the card, not the code:** the parsed VUMI card contains **no dental and no maternity** rows at all, so chat tiers 3 and 4 have no VUMI price — those quotes render flagged. Needs either a second document or a client decision
- [ ] **Not applied to quotes yet:** the per-area coverage-restriction discounts still need the decision noted above. Area 1 has none, so USA is unaffected; Asia, Indian Sub-Continent and Africa are not
- [ ] **Open question:** 12 countries VUMI covers are absent from the lead gate's dial-code list (Cocos, Anguilla, Cook Is, St Martin, Faroe, Tuvalu, BVI, Fr Polynesia, Christmas Is, Palau, Nauru, Marshall Is), so a resident there cannot be quoted. Canada, Ireland, Russia, Iran, Cuba, North Korea and Syria are absent from VUMI's own area lists

### Stage 3 — Scanned rate cards (not started)

- [ ] Stage 2 covers upload and the deterministic parser for **clean-text** cards. Still open: LLM extraction for a **scanned** card (`extractPdfPages` returns nothing and the parse is refused with an explanation today), and support for a second insurer whose layout differs from VUMI's

### Stage 4 — Insurer API adapters (not started)

- [ ] Per-insurer API credentials and an adapter registry behind the existing `QuoteProvider` seam

---

## Phase 10 — Quote form + support chat (done 2026-09-12)

Client change of direction: the questions move out of the chat into a form (mockup supplied), and the chat becomes a support chat about the quotes. Answers recorded in `decisions.md` → "Quote form replaces the guided flow".

- [x] `backend/` — migration `0007`: `conversations` gains `gender`, `effective_date`, `dependants` (JSONB, structured spouse/children) and loses `plan_type` / `family_ages`; `quote_requests` gains `profile` and `notices` so each COMPARE is a self-contained snapshot
- [x] `backend/` — `POST /quotes/request` (persist profile → price → snapshot, one call), `POST /quotes/delivery` (email/WhatsApp preference); `/quotes/preview` removed; `quoteFormSchema` requires every pricing input and rejects a start date before today
- [x] `backend/` — chat is support-only: no tools, no slot machine; `prompt.ts` is a brief built from the stored profile + latest snapshot (verified against the gateway: the answer cited only snapshot prices and refused to change the form). **Prompt wording is the client's to tune next**
- [x] `backend/` — admin report + CSV: Gender, Start date, derived Plan type, Family (one-line household) columns
- [x] `frontend/` — `components/quote-form.tsx` (name, expatriation country, nationality, effective date, age, gender, spouse/child rows, cover level, COMPARE, trust line, disclaimer), pure rules in `lib/quote-form.ts` (12 tests), collapse-to-summary with Edit, sessionStorage prefill
- [x] `frontend/` — left column is form-over-chat per the client's sketch; results-panel chip row removed; delivery buttons under the results; slot prompt / choice cards / country picker / `use-coverage-quotes` deleted
- [ ] **Not verified in a browser** (no browser available from the session): the layout at real viewport sizes, the date input's dark colour scheme, the collapsed/expanded form transition, and that the 62dvh cap leaves the chat input reachable on small laptops. `tsc`, ESLint and SSR were checked; `next build` was skipped because `next dev` was running

### Knowledge base (done 2026-09-12)

The client's answer to "how do we teach the assistant what each insurer covers": admin-written text, injected into the prompt. Decision and limits in `decisions.md` → "Knowledge base is prompt text, not training".

- [x] `backend/` — migration `0008`: `insurers.knowledge_base` (text, default `''`) and an `app_settings` key/value table for the general text
- [x] `backend/` — `src/lib/knowledge.ts` (cap, lookups by quoted insurer name), `PATCH /admin/insurers/:id`, `GET|PUT /admin/settings/knowledge-base`, create-insurer accepts `knowledgeBase`; the list endpoint returns only the text's length
- [x] `backend/` — `prompt.ts`: GENERAL KNOWLEDGE BASE and ABOUT <INSURER> sections (only for insurers on screen), fenced, with a grounding rule. Verified against the gateway with a VUMI quote: waiting periods and claims answered from the text, a mock insurer with no entry got "I don't have that detail", dental implants (not in the text) got the same plus the adviser
- [x] `frontend/` — `/admin/knowledge-base` page (nav item), knowledge-base section on the insurer page and on the create form, shared `KnowledgeTextarea` with a live counter; list shows a KB indicator
- [x] `backend/` — knowledge API for the voice AI (2026-09-13): `GET /api/knowledge`, `GET /api/knowledge/insurers/:ref`, `POST /api/ask` behind `KNOWLEDGE_API_KEY` (Bearer; 503 while unset). Verified with curl on a throwaway key: 401 without/with a wrong key, list + by-name + 404, and two `/ask` calls against the gateway — maternity on Standard answered from VUMI's text, a Dubai hospital list (not in the text) got "I don't have that"
- [x] `backend/` — `POST /api/quotes` (2026-09-13): the quote form for the voice AI, same schema as the web form plus optional `contact`; COMPARE's three steps extracted to `lib/quote-flow.ts` and shared with `/quotes/request`. Verified with curl: 401 without the key; nested validation errors (`dependants.0.age`, `contact.phone`, tier message lists the valid values); stateless call → 11 quotes, `lead: null`; with contact → lead created with source `voice-ai`, conversation profile written, snapshot per call, same lead reused on the second call (email lower-cased, phone normalised); web `/quotes/request` still works after the refactor and still 404s on an unknown lead. Test leads deleted
- [x] Postman guide (Word) + collection regenerated in the user's Downloads with the `/api/quotes` section and two more requests
- [ ] **Not verified in a browser**: the textarea rendering and the Save/Discard states. `tsc` and ESLint on the new files pass; three pre-existing `react-hooks/set-state-in-effect` errors (`insurer-detail`, `rate-card-detail`, `leads-report` — all the `void load()` effect pattern) remain and will block `next build` until fixed

---

## Phase 8 — Handoff Points (not required to build now)

- [ ] Swap `mock-provider.ts` for a real 3rd-party insurer API — should only require changes inside `backend/src/lib/quotes-api/`, nothing in the frontend, AI, or chat layer
- [ ] Local Docker Postgres → hosted Postgres is already handled by Phase 0 (same schema, just a different `DATABASE_URL`) — no extra migration work needed unless you want to seed the hosted DB with different test data than local
- [ ] Replace placeholder WhatsApp link with a real handoff flow if needed (`frontend/`, possibly triggering a `backend/` webhook)
- [ ] Visual redesign pass in Claude Design, once you're ready — this build plan intentionally kept the UI structural (from the screenshot reference) rather than final-pixel, since you're doing that separately; redesign work only touches `frontend/`

---

*Save this file as `docs/plan.md`. Keep `chat-broker-ai-vibe-prompt.md` alongside it in the same `docs/` folder as the source-of-truth spec — this plan just sequences it into steps.*
