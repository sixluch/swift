# Locked Decisions

Answers to the open questions on `chat-broker-ai-vibe-prompt.md` + `plan.md`. These override anything ambiguous in those two docs.

## Spec clarifications
- **Quote cards render in the right-hand results panel only.** The chat posts a short text summary; the panel holds the cards (ranked, sortable, filterable). Supersedes §3.8's "inside the chat".
- **Lead gate is hard.** Email + phone must be submitted and saved before the chat input unlocks. The assistant greeting may be visible behind/above the gate, but no message can be sent until the lead row exists.

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
- Market: **Lebanon**. Phone default country code **+961**. Quote currency **USD**.
- Voice: on final transcript, **auto-send after a ~1.5s pause**, with a visible cancel/edit affordance before it fires.
- UI: build Phase 2 **structurally** off the §10 ASCII mock (dark navy, correct layout) — not pixel-final. A Claude Design redesign pass comes later and touches `frontend/` only.
- Placeholders for now: marketing-site origin (CORS) and the WhatsApp FAB number.

## Layout
`frontend/` and `backend/` sit directly under `swiftbroker/` (no nested `chat-broker-ai/`). Spec lives at `docs/chat-broker-ai-vibe-prompt.md`.
