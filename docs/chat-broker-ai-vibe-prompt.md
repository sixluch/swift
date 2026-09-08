# Vibe Prompt: "Chat Broker AI" — Insurance Quotation Chat App

Copy everything below into your AI coding tool (Cursor, bolt.new, v0, Claude Code, etc.) as the project brief.

---

## 1. Project Summary

Build **Chat Broker AI**, a standalone web app that lives behind a link from an existing marketing site. A user clicks a "Get a Quote" button on the existing site, lands on this app, chats with an AI insurance broker (by text or voice), and walks away with at least 3 mock insurance quotations tailored to what they asked for. Every lead (email + phone) is captured to a database for CRM/reporting.

This is a **new, separate app** (not a page bolted onto the existing site) that the existing site deep-links into via a button URL, e.g. `https://quote.example.com/?src=existing-site`.

---

## 2. Tech Stack & Repo Structure

This is a **monorepo with two independent, separately-deployable projects**: `frontend/` and `backend/`. The frontend never touches the DB, AI Gateway, or quotes logic directly — it only ever talks to the backend over REST.

```
/chat-broker-ai
  /frontend                  -- Next.js app, UI only
    /app
    /components
    /lib
      api-client.ts          -- thin fetch wrapper calling BACKEND_URL
    package.json
  /backend                   -- API server, all business logic
    /src
      /routes (or /app/api)  -- leads, chat, quotes endpoints
      /lib
        /quotes-api           -- mock quotation wrapper/adapter
        /db                    -- ORM schema + client
        /ai                    -- Vercel AI Gateway client + system prompt
    docker-compose.yml        -- local Postgres container for dev
    .env                      -- DATABASE_URL (points at Docker locally, hosted DB in prod)
    package.json
  /docs
    plan.md
    chat-broker-ai-vibe-prompt.md
```

- **Frontend:** Next.js 14+ (App Router), TypeScript, Tailwind CSS + shadcn/ui. Pure presentation + client state — calls the backend via a small typed API client (`frontend/lib/api-client.ts`), configured with a `NEXT_PUBLIC_BACKEND_URL` env var. Handles streaming chat responses via the AI SDK's client hooks (`useChat`), pointed at the backend's `/chat` endpoint.
- **Backend:** Can be a Next.js app used **API-route-only** (simplest, keeps the whole stack on Vercel/AI SDK conventions) or a standalone Node server (Express/Fastify/Hono) if you want a harder separation. Either way, it owns: the database, the Vercel AI Gateway calls + system prompt, the mock quotes wrapper, and lead/message persistence.
- **AI orchestration:** Vercel AI SDK, routed through **Vercel AI Gateway** (model-agnostic — configure with an env var so providers/models can be swapped without code changes). Lives entirely in `backend/`.
- **Voice input:** Web Speech API (`SpeechRecognition`) for speech-to-text — runs in the **frontend** browser only; the transcribed text is sent to the backend exactly like a typed message, with an `input_mode: 'voice'` flag.
- **Database:** Postgres, accessed via Drizzle or Prisma ORM — lives entirely in `backend/`.
  - **Local dev:** Postgres run in a **Docker container** via `docker-compose.yml` inside `backend/` — free, fast to reset, no external account needed.
  - **Production:** a hosted Postgres provider (Vercel Postgres / Neon / Supabase — pick one), since the deployed `backend/` runs as serverless functions and can't reach a container on someone's laptop.
  - Both cases are driven by the same `DATABASE_URL` env var — swapping from local Docker to the hosted provider is a one-line env change, not a code change.
- **Mock quotation API:** Isolated module inside `backend/src/lib/quotes-api/`, structured as a clean **adapter/wrapper interface** so a real 3rd-party insurer integration can be swapped in later without touching AI or route logic.
- **CORS:** Backend must allow requests from the frontend's origin(s) — set up explicit CORS config rather than a wildcard, since this will handle PII (email/phone).
- **Deployment target:** Vercel for both — as two separate Vercel projects (or two services in one Vercel project), each with its own env vars.

---

## 3. User Flow (must match exactly)

1. **Entry point** — User clicks a button on the existing website → redirected to `/` (or `/chat`) on this new app, optionally carrying a UTM/source param for CRM attribution.
2. **Landing / chat shell** — User lands on a page that already shows the AI chat interface waiting (empty state, e.g. "Hi, I'm here to help you find the right insurance plan 👋").
3. **Lead capture gate** — Before the user can send their first message, they must submit:
   - Email (validated format)
   - Phone number (validated format, consider country code selector)
   - On submit: save `{ email, phone, source, createdAt }` to the database (this is the CRM lead record). Only after this succeeds does the chat input unlock.
4. **Coverage type selector** — User picks **one or more** of: **Inpatient, Outpatient, Dental, Maternity** via quick-select chips in the right-hand panel (see Section 10 for exact layout — chips are additive/multi-select, e.g. "Inpatient" + "Outpatient" + "Dental" can all be active at once). This selection should be passed to the AI as context/state, not just left for the AI to ask about again.
5. **Input mode toggle** — User can switch between **typing** and **speaking** at any point in the conversation (mic icon toggle next to the input box). Transcribed speech populates the same message pipeline as typed text.
6. **AI qualification questions** — The AI (via Vercel AI Gateway) asks, conversationally:
   - Name
   - Age
   - What kind of insurance quotation they're asking about (reconciled with the coverage type already picked in step 4 — AI shouldn't re-ask if already selected, just confirm)
7. **Quotation retrieval** — Once the AI has enough info (name, age, coverage type), it calls the internal mock **quotes API** (via an AI SDK **tool/function call**) to fetch quotations.
8. **Results** — AI presents **at least 3 quotation options** back to the user in a clean, comparable card format inside the chat (plan name, insurer, monthly premium, coverage summary, CTA like "Select this plan" or "Talk to an agent").

---

## 4. Data Model (initial schema)

```
leads
  id            uuid PK
  email         text, not null
  phone         text, not null
  source        text            -- e.g. "existing-site-button"
  created_at    timestamptz default now()

conversations
  id            uuid PK
  lead_id       uuid FK -> leads.id
  coverage_type text[]          -- e.g. ["inpatient","dental"]
  started_at    timestamptz default now()

messages
  id              uuid PK
  conversation_id uuid FK -> conversations.id
  role            text            -- 'user' | 'assistant' | 'system'
  content         text
  input_mode      text            -- 'typed' | 'voice'
  created_at      timestamptz default now()

quote_requests
  id              uuid PK
  conversation_id uuid FK -> conversations.id
  name            text
  age             int
  coverage_type   text[]
  quotes_returned jsonb           -- snapshot of what mock API returned
  created_at      timestamptz default now()
```

---

## 5. Mock Quotation API (wrapper library)

Build this as an isolated module inside `backend/` so it can later be swapped for real insurer APIs without touching the AI/chat code.

```
backend/src/lib/quotes-api/
  index.ts          -- exported getQuotes(params) function
  types.ts          -- QuoteRequest, QuoteResponse types
  providers/
    mock-provider.ts -- returns hardcoded/randomized mock quotes
```

```ts
// types.ts
export type CoverageType = "inpatient" | "outpatient" | "dental" | "maternity";

export interface QuoteRequest {
  name: string;
  age: number;
  coverageTypes: CoverageType[];
}

export interface Quote {
  id: string;
  insurer: string;
  planName: string;
  monthlyPremium: number;
  currency: string;
  coverageSummary: string;
  coverageTypes: CoverageType[];
}

export interface QuoteResponse {
  quotes: Quote[]; // minimum 3
}
```

```ts
// providers/mock-provider.ts
export async function getMockQuotes(req: QuoteRequest): Promise<QuoteResponse> {
  // return >= 3 plausible, randomized-but-deterministic-looking quotes
  // vary premium based on age + number of coverage types requested
}
```

Expose this as:
1. A plain internal function callable from an AI SDK **tool definition**, AND
2. A REST endpoint (`POST /api/quotes`) for direct testing with curl/Postman.

---

## 6. AI Behavior / System Prompt (starting point)

```
You are a friendly, professional insurance broker assistant for [Company Name].
Your job: help the user get insurance quotations quickly and clearly.

Rules:
- Always be conversational, warm, concise — no long paragraphs.
- If coverage type wasn't already selected by the UI, ask for it before anything else.
- You must collect: name, age, and coverage type(s) before requesting quotes.
- Never invent quotes yourself — always call the `getQuotes` tool once you have
  name, age, and coverage type(s).
- Present quote results as a short comparison, not a wall of text.
- If the user asks something outside insurance quoting, gently redirect.
- Never ask for email/phone — that was already collected before the chat started.
```

Wire this as the system message in the Vercel AI Gateway request, with `getQuotes` registered as a callable tool (function calling) that hits the mock provider from Section 5.

---

## 7. Voice Input Details

- Mic button toggles `SpeechRecognition` (or a graceful fallback message on unsupported browsers, e.g. Safari desktop).
- Live partial transcript shown while speaking; final transcript auto-fills the chat input (user can edit before sending, or auto-send — your call, but auto-send with a 1–2s pause feels more "voice assistant" like).
- Tag each message in the DB with `input_mode: 'voice' | 'typed'` for later analytics (e.g. does voice convert better?).

---

## 8. Pages / Routes

**Frontend (`frontend/`)**
- `/` — chat shell + lead-capture gate + coverage-type selector + chat UI (this can realistically be a single page with modal/step states)

**Backend (`backend/`)** — all consumed by the frontend via `NEXT_PUBLIC_BACKEND_URL`
- `POST /leads` — save email/phone, create the lead record
- `POST /chat` — streams AI responses (Vercel AI SDK route handler), includes tool-calling to quotes API
- `POST /quotes` — mock quotation REST endpoint (standalone testable, independent of the AI)

---

## 9. Non-Functional / Nice-to-Haves (flag as v2 if scope is tight)

- Basic rate limiting / bot protection on the lead capture form
- Analytics events (lead captured, coverage selected, quote shown, quote selected)
- Mobile-first responsive layout (assume most traffic comes from a mobile redirect)
- Environment-based model config for the AI Gateway (dev vs prod model/provider)
- Graceful error state if the AI/tool call fails (e.g. "Something went wrong, want me to try again?")

---

## 10. UI Layout (from provided screenshot reference)

Two-panel split layout on a dark navy background, roughly like this:

```
┌─────────────────────────────────────────────────────────────┐
│ [Logo] SwiftHealth              [🎙 Speak] [💬 Chat]          │  <- top bar, thin accent
│        AI Insurance Assistant · AskNomi                       │
├───────────────────────────┬─────────────────────────────────┤
│ LEFT: CHAT PANEL          │ RIGHT: RESULTS PANEL             │
│                            │  COVERAGE                        │
│ [N] Hey! I'm Nomi 👋       │  [🛏 Inpatient][+🚶Outpatient]   │
│     I'll find you the best │  [+🦷 Dental][+🤰 Maternity]     │
│     health insurance plans │                                 │
│     in seconds.            │        ✨                        │
│     What's your name?      │   Your matches will appear here │
│                            │   Start a quote with Nomi and    │
│                            │   the whole market lands here —  │
│                            │   ranked, filterable, comparable │
│                            │                                 │
│ [Type your answer...] [↑]  │                                 │
└───────────────────────────┴─────────────────────────────────┘
                                              [💬 WhatsApp FAB] ⬇ bottom-right
```

**Key structural elements to replicate:**
- **Header bar:** square logo mark (top-left) + brand name (bold, white) + small subtitle line ("AI Insurance Assistant · [Assistant Name]") underneath in muted gray. Top-right has a two-way toggle: outlined "🎙 Speak" pill + filled/active "💬 Chat" pill (this is the text/voice mode switch from Section 3 point 5). A thin lighter-blue accent line runs across the very top edge.
- **Left panel — Chat:** dark navy background (slightly darker than the right panel), assistant messages shown as a rounded light-navy bubble with a small circular avatar badge (single letter, e.g. "N" for the AI's name) to the bottom-left of the bubble. No user avatar shown until the user sends a message. Input bar pinned to the bottom: pill-shaped text field ("Type your answer...") + circular arrow-up send button.
- **Right panel — Coverage & Results:** slightly lighter navy background, separated from the chat panel by a subtle vertical divider.
  - A small uppercase label "COVERAGE" at the top.
  - Coverage type chips in a row, pill-shaped, each with an emoji/icon + label. First one ("Inpatient") shown as the base/selected state; the others are prefixed with "+" (Outpatient, Dental, Maternity) implying they're additive/multi-select toggles, not a single radio choice — **this confirms coverage selection is multi-select, update Section 3 accordingly.**
  - Below that, a centered empty-state placeholder (shown before any quotes exist): a sparkle icon, bold headline "Your matches will appear here", and a muted two-line description ("Start a quote with Nomi and the whole market lands here — ranked, filterable, comparable"). Once quotes come back from the mock API, this empty state is replaced by the actual quote cards (grid or list), which should also be **ranked, filterable, and comparable** per the copy — i.e. plan to support sort/filter controls on the results panel, not just a flat list.
- **Floating WhatsApp button:** fixed bottom-right circular green FAB with the WhatsApp icon — a secondary channel/handoff option (e.g. "continue this on WhatsApp"), separate from the in-page chat.

**Color palette (approximate, refine in Claude Design/Figma):**
- Background: deep navy `#0F1B3D`–`#14224A` range, right panel a shade lighter than left
- Bubbles / chips: translucent lighter navy `#1E2C55`-ish with subtle border
- Accent line (top): light blue `#4A9FE8`-ish
- Primary CTA / active chip: blue (Chat pill)
- FAB: WhatsApp green `#25D366`
- Text: white for primary, muted gray-blue for secondary/labels

**Naming convention spotted in the mock:** the assistant has its own persona name (e.g. "Nomi") separate from the brand ("SwiftHealth" / "SwiftBrokers") — bake a configurable `ASSISTANT_NAME` and `BRAND_NAME` into the system prompt and UI copy rather than hardcoding.

> You mentioned you'll build the actual UI in Claude Design next — treat this section as the brief to hand it, not final pixel specs.

---

## 11. What to Build First (suggested order)

1. Next.js scaffold + Tailwind/shadcn setup
2. Lead capture form + `/api/leads` + DB schema/migration
3. Coverage type selector UI
4. Chat UI shell wired to `/api/chat` with Vercel AI Gateway (text only first)
5. Mock quotes API + tool-calling integration
6. Voice input toggle
7. Polish: quote result cards, mobile responsiveness, error states
