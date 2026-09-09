# Locked Decisions

Answers to the open questions on `chat-broker-ai-vibe-prompt.md` + `plan.md`. These override anything ambiguous in those two docs.

## Spec clarifications
- **Quote cards render in the right-hand results panel only.** The chat posts a short text summary; the panel holds the cards (ranked, sortable, filterable). Supersedes §3.8's "inside the chat".
- **Lead gate is hard.** Email + phone must be submitted and saved before the chat input unlocks. The assistant greeting may be visible behind/above the gate, but no message can be sent until the lead row exists.
- **Phone is collected with a country-code `<select>`, and there is no default country** (2026-09-09). The visitor picks their dial code from the full list in `frontend/lib/country-codes.ts`; the form joins it to the typed digits and posts one E.164 string, so `POST /leads` still takes a single `phone` field. The dropdown is preselected from the browser locale where that yields a region, and left empty otherwise — never guessed. (Phone was briefly removed from the gate earlier the same day and then restored; `drizzle/0001` and `0002` are that round trip.)

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
