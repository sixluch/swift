# Locked Decisions

Answers to the open questions on `chat-broker-ai-vibe-prompt.md` + `plan.md`. These override anything ambiguous in those two docs.

## Spec clarifications
- **Quote cards render in the right-hand results panel only.** The chat posts a short text summary; the panel holds the cards (ranked, sortable, filterable). Supersedes §3.8's "inside the chat".
- **Lead gate is hard.** Email + phone must be submitted and saved before the chat input unlocks. The assistant greeting may be visible behind/above the gate, but no message can be sent until the lead row exists.
- **Phone is collected with a country-code `<select>`, and there is no default country** (2026-09-09). The visitor picks their dial code from the full list in `frontend/lib/country-codes.ts`; the form joins it to the typed digits and posts one E.164 string, so `POST /leads` still takes a single `phone` field. The dropdown is preselected from the browser locale where that yields a region, and left empty otherwise — never guessed. (Phone was briefly removed from the gate earlier the same day and then restored; `drizzle/0001` and `0002` are that round trip.)

## Quote form replaces the guided flow (2026-09-12)

The client supplied a form mockup (`form.html`, from their existing site) and a layout sketch: **form top-left, chat beneath it, results on the right**. Answers locked before building:

| Question | Answer |
|---|---|
| Cover level isn't on the mockup | **Add a cover selector to the form**; the results-panel chip row is removed. COMPARE is self-contained |
| Spouse / child rows | Spouse = age + Male/Female; child = age + Boy/Girl. **Structured** (`dependants` JSONB), replacing the free-text `family_ages`; each priced at its own age band |
| Gender and effective date | **Stored** (conversation + snapshot) for the CRM; **not a pricing input** until a rate card needs them |
| Name isn't on the mockup | **Add a full-name field** |
| What the chat does now | **Support only.** No tools, no question sequence. Nomi gets the submitted form and the on-screen quotes as read-only context and cannot change either — she sends the visitor back to the form. The client will tune the prompt themselves |
| After COMPARE | Form **collapses to a summary with Edit** so the chat gets room; on mobile it sits at the top of the "Quote & chat" tab |
| Lead gate and the mockup's trust line | **Both kept as-is**, including "No personal data required"; the disclaimer's "DFHE SYSTEMS" becomes the brand name from config |
| Delivery (email / WhatsApp) | Kept under the results; since no chat slot asks any more, both are offered as buttons and the choice is recorded via `POST /quotes/delivery` |

Consequences:

- **`POST /quotes/request` is the only quote-producing route for a visitor** — it persists the profile, prices it and snapshots the result in one call. `/quotes/preview`, the `saveProfile`/`getQuotes` tools, `slotAnswer`, the `data-profile` stream part and the slot machine are gone.
- **The snapshot is now the history.** The conversation row holds only the *latest* submission (COMPARE overwrites it); `quote_requests` gains `profile` and `notices` so each press stays readable on its own — and the chat prompt reads the latest one, so the model can only discuss quotes that were actually shown.
- `plan_type` is no longer stored — the report derives Family/Individual from `dependants`. Migration `0007` (generated in two non-interactive steps and merged, because drizzle-kit prompts interactively when a table both gains and loses columns).
- The country lists use our ISO list (`frontend/lib/country-codes.ts`), not the mockup's, which contains non-countries (Abu Dhabi, Bali, "GOPO").

## Knowledge base is prompt text, not training (2026-09-12)

The client asked for a "knowledge base" field on each insurance company "to train the AI". Agreed approach, with the client's yes to a general one as well:

- **Prompt injection, not fine-tuning and not retrieval.** The text goes into the system prompt verbatim on every message, so edits take effect immediately and the model can only say what the admin wrote. Fine-tuning would bake in cover details that change; RAG is unnecessary at a handful of insurers.
- **Two texts.** A *general* one (cover-type explanations, how the process works, brand FAQ) always sent; a *per-insurer* one sent **only for insurers in the visitor's current quotes** — keeps the prompt small and stops the assistant volunteering details about a company the visitor wasn't quoted. Before COMPARE the assistant has the general text only.
- **Grounding rule.** Cover questions are answered from these sections alone; anything absent is "I don't have that detail — an adviser will confirm". For insurance a confident wrong answer about an exclusion is worse than none.
- **30,000-character cap per text, refused not truncated.** A silently cut-off knowledge base is one the admin believes was read. Whole policy wordings are where this stops and chunked retrieval would start — not built.
- **Insurer level, not product level**, matching the request; a per-product field can be added later without redoing anything.
- Matched to quotes by **insurer name** — the only identity a `Quote` carries. The mock provider's fictional insurers therefore never have one, which is correct.
- **Exposed to the client's voice AI over `/api/*` with a Bearer key** (2026-09-13), not the admin cookie (a server can't hold one) and not CORS (only restrains browsers). No key configured = closed. Raw text endpoints return what the admin wrote; `POST /api/ask` returns the assistant's whole answer as JSON, grounded the same way as the chat but with **no prices** — there is no personalised quote to cite, so it says so and points at the website.
- **The quote form is on the same API (`POST /api/quotes`), and voice-AI callers become leads when a `contact` is given** (2026-09-13; the client chose this over prices-only). Rationale: the spec's core rule is that every lead is persisted for the CRM, and the voice channel would otherwise be invisible in the admin report. Leads from the API are `source: "voice-ai"` and **reused by email**, because the caller identifies the person — the web gate, which cannot, creates a lead per visit. Without `contact` the call is stateless, so pricing can still be exercised without inventing a lead.

## Guided question flow (2026-09-09) — superseded 2026-09-12
The chat is no longer free-form. The **backend owns a slot machine** (`backend/src/lib/profile.ts`) that decides which question is outstanding; the model only supplies wording and handles off-script questions. Mandatory order:

`name → country of residence → nationality → age → individual/family → (family ages, only if family) → cover level → getQuotes → delivery channel`

- **Cover is single-select and cumulative**: Inpatient only < Inpatient + Outpatient < + Dental < + Maternity. This replaced the four multi-select chips (`components/coverage-chips.tsx` deleted).
- **Card and dropdown answers bypass the model.** They ride on the chat request as `slotAnswer` and are written to the database by the route before the model sees anything, so a selection can never be mis-mapped. Typed and spoken answers go through the model's `saveProfile` tool.
- `getQuotes` **takes no arguments** — it reads the stored profile and refuses while anything is missing, so quotes cannot appear before the flow completes.
- The results-panel tier selector is disabled until the flow completes, then re-quotes through the same `slotAnswer` path (chat, database and panel can't disagree).
- **Mock prices vary by country of residence** via a factor table (`quotes-api/country-pricing.ts`) shaped like the VUMI Area bands — US ≈ 2.3×, Gulf/W. Europe ≈ 1.55×, Levant 1.0×, South Asia ≈ 0.62×. Unlisted countries get 1.0 rather than erroring. Family members are each priced at their own age band and summed.
- **Delivery**: WhatsApp opens a `wa.me` deep link with the comparison pre-filled — real sending needs the WhatsApp Business API (Meta business verification + approved templates), which is out of scope. Email sending is **not built**; the choice is recorded and the copy promises an adviser, never an automated mail. The system prompt forbids Nomi from claiming she sent anything.

## Admin console (2026-09-09)
Built in stages; **Stage 1** (auth, lead report, transcript, CSV) is shipped. Client answers that shaped it: **one admin user**, frontend and backend on the **same registrable domain**, and a **separate login page at `/admin/login`** rather than a hidden path.

- **Lives in the existing `frontend/` app** under `app/admin/`, not a third project. One deploy, shared design tokens and `api-client.ts`; the REST boundary means splitting it out later costs almost nothing. `app/admin/(console)/` is the authenticated group — `/admin/login` sits outside it.
- **Sessions, not JWTs.** `admin_sessions` rows keyed by the SHA-256 of an opaque token; the raw token lives only in an HttpOnly cookie. Sign-out and revocation are therefore real operations, and a database dump is not a set of usable cookies. **Passwords use Node's built-in `crypto.scrypt`** — bcrypt and argon2 both need a native build step, which is a recurring problem on this Windows dev machine.
- **`SameSite=Lax` works because the two servers are same-site.** Ports don't affect same-site, so `localhost:3000 → localhost:3001` qualifies locally; in production `app.example.com → api.example.com` qualifies via `ADMIN_COOKIE_DOMAIN`. If the backend ever moves to an unrelated domain this must become `SameSite=None; Secure`.
- **No default credentials.** `npm run admin:create -- <username>` is the only way to create or reset the account; the password comes from stdin or `ADMIN_PASSWORD`, never argv (argv lands in shell history and `ps`). A reset deletes that user's sessions — a reset that leaves old sessions alive isn't one.
- **The report LEFT JOINs conversations.** A lead that passed the gate and never sent a message is a real outcome (drop-off), so it must appear. The UI renders a blank cell for "never chatted" and an em dash for "chatted but never reached this answer".
- **CSV is generated server-side and fetched by navigation**, not XHR — a plain `<a download>` sends the cookie and lets the browser handle the file. Every cell is escaped against **formula injection**: with `+`-prefixed E.164 phone numbers in every row, that is the common case, not an edge case. UTF-8 BOM plus CRLF so Excel doesn't mangle it. Capped at 5000 rows.
- **Session length is 8h** (`ADMIN_SESSION_HOURS`) and the whole section is `noindex` — this is a bulk PII surface, not a dashboard.
- **Known limitation:** login rate limiting (10 per 15 min) uses the same in-memory limiter as `/leads`, so it resets on restart and is per-instance. Fine for one long-lived Node process; a multi-instance deployment needs a shared store.

## Stack
| Choice | Decision |
|---|---|
| Backend runtime | **Hono** (standalone Node server, `backend/`) |
| ORM | **Drizzle** |
| Prod Postgres | **Neon** (local dev stays on Docker Postgres) |
| Package manager | **npm** |
| AI routing | Vercel AI Gateway, key in `backend/.env` as `AI_GATEWAY_API_KEY`, model via `AI_MODEL` |

## Sequencing
- Build **locally through Phase 5** (lead capture → UI shell → mock quotes → AI chat → tool calling). Git/Vercel/Neon deployment happens after, not in Phase 0.

## Product details
- Brand: **SwiftBrokers**. Assistant persona: **Nomi**.
- ~~Market: **Lebanon**. Phone default country code **+961**.~~ **Superseded 2026-09-09:** the client confirmed the product is **multi-country**, so the gate no longer defaults to any country code. Country is also no longer cosmetic — the VUMI rate card prices by geographic *Area* (Lebanon = Area 3, USA = Area 1), so it becomes a pricing input. Whether the phone country code doubles as the *residence* country for pricing is **undecided** — they are not the same thing (an expat with a UK mobile living in Dubai), so pricing should ask separately rather than infer it from the dial code.
- Quote currency **USD**.
- Voice: on final transcript, **auto-send after a ~1.5s pause**, with a visible cancel/edit affordance before it fires.
- UI: build Phase 2 **structurally** off the §10 ASCII mock (dark navy, correct layout) — not pixel-final. A Claude Design redesign pass comes later and touches `frontend/` only.
- Placeholders for now: marketing-site origin (CORS) and the WhatsApp FAB number.

## Layout
`frontend/` and `backend/` sit directly under `swiftbroker/` (no nested `chat-broker-ai/`). Spec lives at `docs/chat-broker-ai-vibe-prompt.md`.

## Quoting from rate cards (2026-09-10)

Answers locked with the client once the parsed VUMI card was ready to price against.

| Question | Answer |
|---|---|
| Annual or monthly on the card? | **As printed — annual.** `Quote` carries a `premiumBasis`; the card renders "per year" |
| Rate-card quotes vs the mock's | **Merge**, not replace |
| Cover the card doesn't price (dental, maternity) | **Show the plan flagged** ("Dental not covered by this plan"), don't hide it |
| Optional benefits on the card | **Selectable** — ticking one adds to the displayed total |
| Deductible vs flat add-ons | Deductible discounts the **base premium only**; flat add-ons are added afterwards at face value |

Consequences worth keeping in view:

- **The merge had to be made asymmetric to honour "merge".** Ranking both pools cheapest-first and cutting at six returned six fictional insurers and no VUMI, because VUMI's cheapest Area 1 plan is USD 320/month against the mock's USD 110. Every rate-card quote is now kept and the mock fills only the remaining slots.
- **Mixed bases can't be compared raw.** The mock prices monthly and a rate card annually, so sorting, the "Best price" badge and the `quotes_shown` analytics all go through `monthlyEquivalent()`. Display stays in the native basis.
- **The Q2b tier mapping is derived from the card, not configured.** "Outpatient Treatment - $5,000" carries `only_plans = {BASIC}`, which is only coherent if BASIC is the one plan without outpatient built in — so BASIC is inpatient-only and STANDARD upward include outpatient. BASIC is still offered against an outpatient request, flagged with its +65% add-on, rather than filtered out for a cover the visitor can simply buy.
- **Dental and maternity appear nowhere on the card** — not as a plan, a benefit or a deductible. Chat tiers 3 and 4 therefore have no VUMI price and render flagged. This is a gap in the document, not the code.
- **The per-area coverage-restriction discounts are still not applied** to any quote, pending the decision recorded in `plan.md`. Area 1 has none, so USA is unaffected.
