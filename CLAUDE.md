# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

**SwiftBrokers** (a.k.a. "Chat Broker AI") — a standalone insurance-quotation chat app that an existing marketing site deep-links into. A visitor submits email + phone, chats with an AI broker persona named **Nomi** by text or voice, and gets at least 3 mock quotations. Every lead is persisted for CRM/reporting.

Three documents govern the work; read them before making design decisions:

- `docs/chat-broker-ai-vibe-prompt.md` — the full spec (user flow, data model, system prompt, UI layout §10)
- `docs/plan.md` — the phased build plan with checkboxes reflecting real progress
- `docs/decisions.md` — resolved ambiguities and locked stack choices; **this overrides the other two where they conflict**

Work proceeds phase by phase, top to bottom in `plan.md`. Tick the boxes as phases complete, and annotate items that were deferred or partially done rather than silently checking them — an item marked done that isn't is worse than an unticked one.

**Status: Phases 0–7 are complete** (setup, lead capture, UI shell, mock quotes, AI chat, tool calling, voice input, polish — bar a mobile QA pass that needs a real device), plus **Phase 9 Stages 1–2** (admin console: auth, lead report, transcript, CSV export, insurers, rate-card parsing) and **Phase 10** (2026-09-12): the guided chat flow was replaced by a **quote form** — the form is the only thing that produces quotes, and the chat is a support chat about them — plus an admin-written **knowledge base** (general + per insurer) that the chat answers cover questions from, and a **Bearer-keyed `/api/*`** (2026-09-13) exposing that knowledge, a JSON Q&A, and the quote form to the client's voice AI. Deployment (GitHub, two Vercel projects, Neon) was deliberately deferred out of Phase 0; local dev is the only environment so far.

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
npm run admin:create -- <username>   # create or reset the admin console account
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
3. **Node runs `.ts` directly** (Node 24 strips types), so pure helpers can be unit-tested without any tooling: `cd frontend && node lib/country-codes.test.ts`. A test whose module graph contains a `.js` or extensionless specifier needs `npx tsx` instead — Node does not remap `./x.js` to `./x.ts` (all the `src/lib/rate-cards/*` tests and `frontend/lib/profile.test.ts` are in that group). Such a test imports with an explicit `./x.ts` extension, which `next build`'s typecheck rejects — hence `"**/*.test.ts"` in `frontend/tsconfig.json`'s `exclude`. Keep pure logic out of components so it can be tested this way (`speech.ts`, `country-codes.ts`).
4. **Check the database** after any flow that should persist something; don't infer it from a 200.

Anything requiring a real browser — rendering, the microphone, hydration — cannot be verified from here. Say so plainly rather than implying it was tested. Clean up test rows afterwards, but never delete data the user created themselves without asking.

## Architecture

**The frontend never touches the database, the AI Gateway, or quotes logic.** It talks to the backend over REST only, and every call goes through `frontend/lib/api-client.ts` (or the `useChat` transport in `lib/use-broker-chat.ts`). Adding a `fetch` anywhere else breaks the separation the spec is built around.

### Backend (Hono on Node, ESM, `type: module`)

Routes: `GET /health`, `POST /leads`, `POST /quotes/request`, `POST /quotes/delivery`, `POST /quotes`, `POST /chat`, the admin console's `/admin/*`, and the machine-facing `/api/*` (knowledge base and quote form for the voice AI).

`POST /quotes/request` is the form's COMPARE button and the **only** route that produces quotes for a web visitor. One call: writes the submitted profile onto the lead's conversation (what the admin report reads), prices it, and snapshots `{profile, quotes_returned, notices}` into `quote_requests`. Those three steps live in `src/lib/quote-flow.ts` (`saveProfile` → `priceForm` → `snapshotQuotes`) and are shared with `POST /api/quotes`, so a quote from either channel is priced and recorded identically. Every pricing input is required by `quoteFormSchema`, so the provider is never asked to quote a half-filled form. `POST /quotes/delivery` records the email/WhatsApp preference chosen under the results. `POST /quotes` is the stateless curl surface over the same provider call — no lead, nothing persisted.

- `src/index.ts` — server entry, CORS, route mounting. CORS uses an explicit origin allowlist from `CORS_ALLOWED_ORIGINS`, never a wildcard, because these routes carry PII.
- `src/env.ts` — the single place env vars are read; `DATABASE_URL` is required and throws at boot.
- `src/db/` — Drizzle schema, client (postgres.js driver), standalone migrate script.
- `src/lib/validation.ts` — all Zod schemas. Messages here are **user-facing**: the frontend renders them inline under form fields, so missing/wrong-type cases carry the same wording as malformed ones rather than Zod's defaults. `quoteFormSchema` (the form) and `quoteRequestSchema` (the stateless `/quotes` surface) share `coverageTypeSchema` so they can't drift; `chatRequestSchema` is just `{leadId, messages, inputMode}`.
- `src/lib/http.ts` — `fieldErrors()` flattens Zod issues into the `{ field: message }` shape every route returns. A nested issue is reported under the top-level field (`dependants`), the row (`dependants.0` — what the form's family rows read) **and** the exact path (`dependants.0.age`, `contact.phone` — what an API caller needs); first message wins per key.
- `src/lib/quotes-api/` — the adapter seam. `index.ts` exports `getQuotes()` behind a `QuoteProvider` interface; `providers/mock-provider.ts` holds 5 fictional insurers × 3 cumulative tiers with **deterministic** pricing (age band × insurer factor × coverage breadth — no `Math.random`, so responses are reproducible). A plan qualifies only if it covers everything requested; results are sorted cheapest-first and capped at 6, with a fallback guaranteeing ≥3.
- `src/lib/ai/` — `model.ts` (env-driven model string, throws if the gateway key is missing) and `prompt.ts`, a **support brief rebuilt every request**: the submitted form, the latest quote snapshot and the knowledge base, all read from the database — never from the request body — so the model can only discuss prices that were actually shown. **The model has no tools.** It cannot change the form or re-run quotes; the prompt tells it to send the visitor back to the form for that. The user plans to tune this prompt themselves.
- `src/lib/knowledge.ts` — the **knowledge base**: admin-written text injected into the prompt verbatim (no fine-tuning, no retrieval). Two kinds: a *general* text (`app_settings`, key `general_knowledge_base`) sent on every message, and a *per-insurer* text (`insurers.knowledge_base`) sent **only for insurers that appear in the visitor's current quotes**, matched on the insurer's name — the only identity a `Quote` carries, so mock insurers simply have none. Both are capped at `KNOWLEDGE_BASE_MAX_CHARS` (30k) and **refused, not truncated**, above it; pasting whole policy wordings is where this design stops and chunked retrieval would start. The prompt fences each text with BEGIN/END markers and a grounding rule: cover questions are answered only from these sections, and anything not there gets "I don't have that detail, an adviser will confirm". Admin routes: `PATCH /admin/insurers/:id` and `GET|PUT /admin/settings/knowledge-base`.
- `src/routes/api.ts` + `src/lib/api-key.ts` — the **knowledge API for server-side callers** (the client's voice AI, Postman): `GET /api/knowledge` (general + every insurer with text; `?insurers=A,B`, `?include=empty`), `GET /api/knowledge/insurers/:nameOrId`, and `POST /api/ask` (`{question, insurers?, history?}` → `{answer, insurers, model, usage}` — `generateText`, non-streaming, grounded in the knowledge base alone via `buildKnowledgePrompt`, which forbids prices because there is no quote snapshot). Plus `POST /api/quotes`: the quote form for a machine caller — `apiQuoteSchema` is `quoteFormSchema` minus `leadId` plus an optional `contact: {email, phone}`, so the two forms cannot drift. With `contact` the caller becomes a lead (`source: "voice-ai"`, **reused by email** so repeat calls accumulate on one CRM record — unlike the web gate, which creates a lead per visit) and the profile + snapshot are written exactly like a web COMPARE; without it nothing is stored. All four routes need `Authorization: Bearer <KNOWLEDGE_API_KEY>`; with the env var empty they answer **503, never open**. The knowledge routes persist nothing — the caller passes its own `history` back for continuity. Rate limit on `/api/*` is 300 per 5 min per IP, much wider than `/chat`'s, because one voice-AI server fronts many callers.
- `src/lib/profile.ts` — the applicant-profile vocabulary shared by the form route, the prompt and the CSV: cumulative cover tiers, genders, `Dependant` (`{relation, age, gender}` — spouse/children are structured, not free text, and each is priced at its own age band), `describeDependants()`. Pure and unit-tested (`node src/lib/profile.test.ts`).
- `src/lib/conversations.ts` — one conversation per lead, created on first form submit or message and reused; throws `LeadNotFoundError` for an unknown `leadId` so routes answer `404` instead of a foreign-key `500`. Owns `getProfile`/`updateProfile` (keeps `coverage_type` derived from `coverage_tier` so the two can't drift) and `latestQuotes()`, the snapshot the chat prompt reads.

**Relative imports must carry the `.js` extension** (`from "../env.js"`) — ESM + `verbatimModuleSyntax`. `backend/tsconfig.json` includes only `src/**/*.ts`; `drizzle.config.ts` sits outside `rootDir` and errors if included.

### Admin console (`/admin`)

Same Next app, separate concern. `docs/decisions.md` → "Admin console" records why each choice was made; the load-bearing ones:

- `src/lib/admin-auth.ts` owns password hashing (Node's `crypto.scrypt` — no native build step) and **opaque server-side sessions**. Only the SHA-256 of the token is stored; the raw token lives in an HttpOnly cookie. `requireAdmin` guards every `/admin` route except login — the frontend's redirect is convenience, this is the gate. **It is applied as an explicit per-prefix list in `routes/admin.ts`** (`adminRoute.use("/insurers/*", requireAdmin)` …), not a catch-all, so a new sub-router (`/settings` was the latest) is wide open until its prefix is added there — curl it without a cookie and expect 401 before anything else.
- **There are no default credentials.** `npm run admin:create -- <username>` is the only way in; the password comes from stdin or `ADMIN_PASSWORD`, never argv. Resetting a password deletes that user's sessions.
- `src/lib/csv.ts` is pure and unit-tested (`node src/lib/csv.test.ts`). **Do not "simplify" the formula-injection escaping** — every row's phone number starts with `+`, so an unescaped export is a live formula in Excel on every single line. The BOM and CRLF matter for the same reason.
- The lead report **LEFT JOINs** conversations on purpose: a lead who passed the gate and never chatted is a real outcome. `leadColumns` in `routes/admin.ts` is shared by the table and the CSV so the two can't drift.
- The CSV is downloaded by navigating to `/admin/leads.csv` from a plain `<a download>`, not by `fetch` — that's the one place a URL is built outside `api-client.ts`, and `api.admin.leadsCsvUrl()` still builds it.
- `components/admin/knowledge-textarea.tsx` is the one editor for both knowledge bases (live counter against the same 30k cap, duplicated in `lib/admin-types.ts` because the two projects share no package); the general text has its own page at `/admin/knowledge-base`, the per-insurer text sits at the top of the insurer's page and on the create form.
- `frontend/app/admin/(console)/` is the authenticated route group; `/admin/login` sits outside it. `api-client.ts` sends `credentials: "include"` on every request so the cross-origin session cookie rides along.
- Session cookie is `SameSite=Lax`, which works only because frontend and backend share a registrable domain (`ADMIN_COOKIE_DOMAIN` in production; ports don't affect same-site locally). Moving the backend to an unrelated domain means `SameSite=None; Secure`.

### Rate-card parsing (`/admin/rate-cards`)

- `src/lib/pdf-text.ts` — dependency-free extraction. **Use `extractPdfPages`, not `extractPdfLines`, for anything where "which section does this value belong to" matters.** Content streams are emitted in drawing order, and on VUMI's card some area headings precede their own tables while others follow — pairing by stream position mispairs whole areas, i.e. gives a country group the wrong prices. `extractPdfPages` resolves the real page tree (`/Type /Pages` → `/Kids` → `/Contents`) so a heading and its table are grouped by sheet of paper. It deliberately returns `[]` when the page tree can't be read, so the caller refuses instead of guessing. Known limit: form XObjects aren't followed, so the product name printed up the page spine is absent from the per-page output (cosmetic only — every priced table is in the page content).
- `src/lib/rate-cards/vumi-parser.ts` — deterministic, no LLM. These cards have an intact text layer, so there is nothing to infer, and a wrong premium is worse than no premium. Anything unaccounted for goes into `warnings`, which are stored on the rate card and shown to the admin; a short premium row is skipped with a warning rather than stored half-read. The parser also **checks the three per-area repeated tables against each other** and warns if a future card stops being identical, instead of silently keeping the first.
- `src/lib/countries.ts` is **generated from `frontend/lib/country-codes.ts`** (the test asserts the count, so they can't drift). `resolveCountryIso` returns null rather than a guess; unresolved names are stored with `country_iso = null` and surfaced, because a silently missing country is a silently missing price. Aliases cover the insurer's abbreviations, former names and typos ("KSA", "Swaziland", "Papa New Guinea").
- Data model: `insurers → products → rate_cards → {rate_areas → rate_area_countries / rate_area_restrictions, rate_plans, rate_premiums}` plus `rate_benefits`, `rate_surcharges`, `rate_deductibles`. A rate card is unique per document, so **re-parsing replaces it in one transaction** (and drops a product left with no cards). `parse_status` on the document becomes `parsed` / `parsed_with_warnings` / `failed`.
- **A fifth table the original brief didn't mention:** "DISCOUNT FOR COVERAGE RESTRICTION" (Asia −7.5%, Indian Sub-Continent −20%, Africa −23.5%). Unlike benefits/surcharges/deductibles it **varies by area**, so it hangs off `rate_areas`, not the card. Flagged in the UI as needing a decision before it feeds a quote.
- Tests: `npx tsx src/lib/rate-cards/vumi-parser.test.ts` (synthetic pages, so the rules are locked without depending on the PDF) and `src/lib/countries.test.ts`. **These need `npx tsx`, not bare `node`** — they import a module that itself uses `.js` specifiers, which Node's type-stripping does not remap to `.ts`.

### Frontend (Next 16 App Router, React 19, Tailwind v4, shadcn/ui `base-nova`, lucide)

- `components/app-shell.tsx` owns page state (mode, mobile tab, voice-unsupported flag) and stacks the left column as **form on top, chat beneath** (the client's design), with the results panel on the right. `app/page.tsx` is a thin server component wrapping it in `LeadProvider`.
- `components/quote-form.tsx` is the quote form; its rules live in `lib/quote-form.ts` (pure, tested via `npx tsx lib/profile.test.ts`): the draft holds input strings, `validateQuoteForm()` is the only place it becomes a typed `QuoteProfile`, and the backend re-validates. The form **collapses to a summary with Edit** once COMPARE succeeds so the chat gets room; a failed COMPARE leaves it open. The last submission is kept in `sessionStorage` so a reload prefills the fields — the quotes are not, so every snapshot the backend records is a deliberate press. The shell keys the form on `leadId`, which is why the stored draft can be read in a lazy initializer without a hydration mismatch (it is null until after hydration).
- `lib/country-codes.ts` holds the dial-code list plus `toE164()` (joins the selected code to the typed digits, strips separators and the national trunk zero) and `guessCountryIso()` (browser-locale preselect — call from an effect only, never during render). **There is no default country**: the product is multi-country, so an undetectable locale leaves the select empty rather than guessing.
- `lib/lead-context.tsx` gates the app: the input stays disabled until `POST /leads` succeeds. `leadId` lives in context, mirrored to `sessionStorage`. The `?src=` param is captured here for CRM attribution.
- `lib/use-broker-chat.ts` wraps `useChat` and sends `{leadId, inputMode}` with every request — nothing about the form or the quotes travels on it; the backend reads both from the database.
- `lib/use-quote-request.ts` is COMPARE as state: `submit()` calls `POST /quotes/request`, aborting any call still in flight so the panel can never show quotes for an older form. Backend field errors go back under the inputs; only non-field errors reach the results panel.
- `components/delivery-actions.tsx` sits under the results: WhatsApp is a `wa.me` deep link with the comparison pre-filled, email is a recorded preference — nothing is sent by the app, and the copy promises an adviser.
- `lib/speech.ts` + `lib/use-speech-input.ts` — Web Speech API. `speech.ts` holds the vendor-prefix lookup and pure helpers (unit-testable, SSR-safe); the hook manages the live transcript and a 1.5s-silence auto-send the user can cancel.
- Brand palette lives as Tailwind v4 `@theme` tokens in `app/globals.css` — use `bg-navy-900`, `bg-navy-850`, `bg-navy-800`, `bg-brand`, `bg-whatsapp`, never hex literals.
- Below `lg` the two-panel layout collapses to a Chat/Matches tab switch; quote arrival auto-switches to Matches so results aren't hidden.
- `frontend/AGENTS.md` is generated and re-added by `next dev` — don't fight it; `frontend/CLAUDE.md` is just an `@AGENTS.md` pointer.

**Config, not hardcoding:** brand name, assistant name, currency, country code and model come from env, surfaced through `backend/src/env.ts` and `frontend/lib/config.ts`. The AI is model-agnostic by design — routed through the Vercel AI Gateway so providers swap via `AI_MODEL`, not code. This project uses the **Vercel AI SDK, not the Anthropic SDK**; that is a deliberate spec decision, not an oversight.

**Data model** (`backend/src/db/schema.ts`): `app_settings` (key/value for console-wide settings — today just the general knowledge base) and `insurers.knowledge_base`; `leads` → `conversations` (the last submitted form: name, country, nationality, age, gender, effective_date, `dependants` JSONB, coverage_tier + derived `coverage_type`, delivery_channel) → `messages` (each tagged `input_mode: 'typed' | 'voice'` for conversion analytics) and `quote_requests` (one per COMPARE: the `profile` as submitted, `quotes_returned` and `notices` as JSONB — the history of what was asked lives here, since the conversation row is overwritten).

## Environment

`backend/.env` and `frontend/.env.local` are gitignored; the `.env.example` files beside them are the committed templates. Local dev points `DATABASE_URL` at Docker; production will point it at Neon — same variable, different value. `AI_GATEWAY_API_KEY` is filled in by the user directly in the file; never ask for a key to be pasted into the conversation.

## Gotchas hit in this repo

- **AI SDK v7 differs from the v5 shape most docs show:** `convertToModelMessages()` returns a promise and must be awaited, and if tools are ever reintroduced `streamText` needs `stopWhen: stepCountIs(n)` or a tool-calling turn ends on raw tool output with no spoken reply.
- **Never run `next build` while `next dev` is running** — they share `frontend/.next`, and the build corrupts the dev server's Turbopack cache. The symptom is every dynamic route returning 500 with `Jest worker encountered 2 child process exceptions` or a Turbopack `FATAL ... exit code: 0xc0000142` on `globals.css`, while `next build` itself passes. **The same corruption has also appeared with no build at all** (2026-09-13, after new files were added under `app/admin/(console)/` while dev was running), so treat the symptom as "stale `.next`" regardless of what preceded it. Fix: stop the dev server, `Remove-Item -Recurse -Force .next`, restart. (`rm -rf .next` fails with "Directory not empty" until the node process has actually exited.)
- **Inside a raw `sql` template, drizzle only qualifies columns of tables that are in the query's FROM/JOIN set.** A correlated subquery over an *unjoined* table emits `where "insurer_id" = "id"` — Postgres then resolves the bare `"id"` against the inner table and the condition silently matches nothing, returning 0 instead of erroring. Count with a `leftJoin` + aggregate + `groupBy` instead (see `routes/admin-insurers.ts`). The subqueries in `routes/admin.ts` are safe because `conversations` *is* joined there — verified against hand-written SQL.
- **`.env` changes need a manual backend restart** — `tsx watch` only watches `src/`.
- **Killing a dev server needs the port, not the task.** Stopping the background task kills the npm wrapper and leaves the node child bound. Use `netstat -ano | grep :3001` then `taskkill //F //PID <pid>`.
- Any `flex-1` + `overflow-y-auto` child in the chat column needs `min-h-0`, or it grows past its parent and slides under the pinned input instead of scrolling.
- `devIndicators: false` in `next.config.ts` is deliberate: the Next dev badge pins itself bottom-left, over the input bar's avatar.
- `suppressHydrationWarning` on `<body>` is deliberate too — browser extensions (ColorZilla's `cz-shortcut-listen`) inject attributes before hydration.
- The system prompt forbids pasting the plan list or prices as a table in chat; quote cards render in the right panel and the reply compares in prose. Loosening that prompt reintroduces markdown tables in the chat.
- It also forbids **claiming to have sent anything** — nothing emails yet, so Nomi says an adviser will send it — and forbids inventing or extrapolating a premium that isn't in the snapshot. The first was an observed regression, not a hypothetical; re-test the wording after any prompt edit.
- **`react-hooks/set-state-in-effect` is an error in this ESLint config.** Derive state during render or use a lazy `useState` initializer instead of syncing props into state with an effect (`quote-form.tsx` shows both patterns). `next build` runs lint, so this blocks the build, not just the editor. **As of 2026-09-13 three pre-existing instances remain** — the `useEffect(() => { void load(); }, [load])` fetch-on-mount pattern in `components/admin/insurer-detail.tsx`, `rate-card-detail.tsx` and `leads-report.tsx` — so `next build` fails until they're reworked. `tsc --noEmit` does not catch this; run `npx eslint <files>` on anything touched.
- `docker compose up -d` can take several minutes on first run; wait on container health (`docker inspect --format '{{.State.Health.Status}}' swiftbroker-postgres`) rather than assuming failure.
- Windows environment: Bash and PowerShell are both available; `python` is not. Node resolves `/tmp/x` as `C:\tmp\x`, so don't share paths between shell redirects and node scripts.
- **Bash heredocs here mangle backslash escapes** — a `node - <<'EOF'` script containing `\n`, `\r` or `\d` inside a JS string or regex arrives with the backslash stripped (`/^\d{4}/` became `/^d{4}/` once, `"\n"` became a literal newline another time), and a heredoc body with an apostrophe or a `C:\tmp`-style path has died at parse time. Write multi-line scripts to the scratchpad with the Write tool and run them by path; make single-line edits with the Edit tool.
- Both dev servers may have been started from a Claude session rather than a terminal (logs in `%TEMP%\backend-dev.log` / `%TEMP%\frontend-dev.log`); they outlive the session, so check `netstat -ano | grep :3000` / `:3001` before assuming nothing is running.
