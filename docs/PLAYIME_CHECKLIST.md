# Playime — Build Checklist

Check items off as you finish them. Keep this file in the repo root (or `docs/`) and commit it alongside your code so progress state travels with the project. One phase should be fully checked before the next phase starts (see `CLAUDE.md` build order).

Legend: `[ ]` not started · `[~]` in progress · `[x]` done — feel free to use `[~]` as a mid-step marker.

---

## Phase 0 — Foundations

- [x] Backend language/framework decided: Node.js + TypeScript, Fastify — `CLAUDE.md` and `PLAYIME_ROADMAP.md` updated
- [x] Init repo with `backend/` and `frontend/` skeletons per the structure in `CLAUDE.md`
- [x] `npm init` backend, add TypeScript + Fastify, confirm `tsc`/dev server run clean
- [x] Install `opencode`, run `opencode serve --port 4096` locally
- [x] Explore opencode's own HTTP API (`/doc` OpenAPI spec) — confirm session-create and message-send endpoints work via a manual `curl`/Postman round-trip
- [ ] Define the LM adapter interface: `generate(messages, system, stream) -> tokens`
- [ ] Implement `adapters/opencode.ts` against opencode's own session/message API (this is the only provider in scope for now — no Ollama/LM Studio wiring yet)
- [ ] Confirm streaming works end-to-end through the opencode adapter alone
- [ ] Write a one-page setup doc (`docs/setup-opencode.md`) so future-you can rebuild the environment from scratch

**Later, out of scope for now:** each additional provider (Ollama, LM Studio, vLLM, cloud APIs) gets its own adapter that talks to *that provider's own API directly* — they're peers alongside `adapters/opencode.ts`, not routed through opencode. Add an item back here per-provider when you're ready to pick that up

## Phase 1 — Core chat loop (no memory yet)

- [ ] SQLite schema: `Session`, `Message` tables
- [ ] Basic backend route: create session → send message → get full-history-in-context reply
- [ ] Hardcode one test Character card (no CRUD yet) to have something to talk to
- [ ] Frontend: minimal chat shell (message list + input box)
- [ ] Wire frontend → backend → adapter end to end, non-streaming first
- [ ] Add SSE/streaming token-by-token output
- [ ] Sanity check: 20+ turn conversation stays coherent and doesn't crash on context length

## Phase 2 — Character class MVP

- [ ] `CharacterCard` schema + DB table (personality, speech_style, scenario, first_message, relationship_state, memory_summary)
- [ ] Character creation form (frontend) + save/load
- [ ] System prompt assembly: card fields → system prompt, reproducibly
- [ ] Rolling summary job: every ~15–20 turns, background call compresses history
- [ ] Swap raw-history-in-context for "recent turns + rolling summary" in the prompt
- [ ] Structured-state extraction call after each AI turn (JSON mode / function-calling) → relationship deltas
- [ ] Apply state deltas deterministically to `relationship_state`
- [ ] Sidebar UI: character card + relationship meter, updates live
- [ ] Test: relationship state visibly and correctly evolves over a long session

## Phase 3 — Long-term memory (RAG)

- [ ] Pick embedding source (local model via adapter, or in-process `sentence-transformers`)
- [ ] `MemoryEntry` schema + `sqlite-vec` (or chroma) integration
- [ ] Embed rolling summaries + flagged key moments on creation
- [ ] Recall step: embed current user turn, top-k similarity search, inject "relevant memories" block into prompt
- [ ] Tune k / recency-vs-relevance weighting
- [ ] Stress test: 100+ turn session, confirm the character correctly recalls an early-session detail

## Phase 4 — Story class MVP

- [ ] `WorldCard` schema + DB table (locations, npcs, protagonist, plot_flags, current_scene, chapter_log)
- [ ] World/story creation form
- [ ] DM-style system prompt: multi-NPC narration + choice generation instructions
- [ ] Reuse Phase 2/3 memory engine, generalized to plot_flags + chapter summaries instead of relationship_state
- [ ] Chapter summarization job (parallel to rolling summary, chapter-scoped)
- [ ] Sidebar UI: current scene, protagonist stats, chapter log
- [ ] Test: player choices measurably branch later narration (not just cosmetic)

## Phase 5 — Shared UI polish

- [ ] Unify Character/Story into one chat shell with a mode switch/tab
- [ ] OOC toggle on the input box (marks message as out-of-character, excluded from in-fiction context)
- [ ] Message regeneration (re-roll last AI turn)
- [ ] Message editing (edit a past turn, truncate/replay from there)
- [ ] Checkpoint/branch: save a state snapshot, try an alternate choice, switch between branches
- [ ] Pass: does the UI stay clear when switching between Character and Story mid-session?

## Phase 6 — Creation & sharing tools

- [ ] Export CharacterCard/WorldCard to a single JSON file
- [ ] Import a JSON card, validate schema, handle version mismatches gracefully
- [ ] Local gallery/list view of saved characters and stories
- [ ] (Optional) basic search/filter in the gallery

## Phase 7 — Nice-to-haves

- [ ] TTS hook for character voice (adapter-pattern, swappable engine)
- [ ] Image generation hook for scenes/portraits (local SD/ComfyUI endpoint via adapter)
- [ ] Per-session model override (pick a different model for a specific character/story)
- [ ] Cost/token usage display per session (useful once cloud providers are in the mix)

## Phase 8 — Packaging

- [ ] `docker-compose.yml` covering backend + frontend (+ optionally opencode/Ollama)
- [ ] One-command local setup verified on a clean machine/VM
- [ ] (Optional) Tauri wrapper for a native desktop build
- [ ] README: what it is, how to run it, how to plug in your own LLM

---

## Notes / decisions log

Use this space to record decisions as you make them, so the reasoning doesn't get lost between sessions.

- Backend: Node.js + TypeScript + Fastify (chosen over Python/FastAPI for a single-language stack alongside SvelteKit)
- Skeleton uses `.gitkeep` + README placeholders only — actual tooling (npm init, tsconfig, Fastify app) lands with the next checklist item, per the "don't scaffold ahead of need" rule.
- Backend toolchain: ESM (`"type": "module"`), TypeScript 7 (native `tsc`), Fastify 5, `tsx` for dev watch. Scripts: `dev` = `tsx watch src/index.ts`, `build` = `tsc`, `start` = `node dist/index.js`. Health check at `GET /health`, default port 3000 (`PORT`/`HOST` env overridable).
- opencode 1.18.11 installed; `opencode serve` already running on `127.0.0.1:4096` (plus instances on 4100 and 4105 — the latter with `--cors http://localhost:3000`, apparently wired for the Playime backend). Verified healthy via `GET /global/health` → `{"healthy":true,"version":"1.18.11"}`. Note: a second `opencode serve --port 4096` dies immediately with a bare `ServeError`/"Unexpected error" — that's just the port already being bound, not a config fault.
- LM adapter work targets the running server on 4096; opencode is not a hard dependency (direct OpenAI-compatible fallback planned).
- opencode HTTP API round-trip verified against `127.0.0.1:4096` (OpenAPI 3.1.0 spec at `/doc`, 162 paths). Two API families exist: modern `/api/session/*` (used here) and legacy `/session/*`. Flow: `POST /api/session` with `{location:{directory}}` → returns `ses_…`; `POST /api/session/{id}/prompt` with `{prompt:{text}}` → returns `msg_…` + `admittedSeq` immediately (async delivery); assistant reply streams via SSE on `GET /api/session/{id}/event`. Test: sent "Reply with exactly: Playime API round-trip OK" → received exactly that via `session.next.text.ended` event (model `deepseek-v4-flash-free`/provider `opencode`). History persists via `GET /api/session/{id}/history`. NOTE for the adapter: the `/prompt` call is *fire-and-confirm* — the reply must be read from the `/event` stream, so the adapter interface's `stream` option is not optional for opencode.
-
