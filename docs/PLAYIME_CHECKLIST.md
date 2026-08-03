# Playime — Build Checklist

Check items off as you finish them. Keep this file in the repo root (or `docs/`) and commit it alongside your code so progress state travels with the project. One phase should be fully checked before the next phase starts (see `AGENTS.md` build order).

Legend: `[ ]` not started · `[~]` in progress · `[x]` done — feel free to use `[~]` as a mid-step marker.

---

## Phase 0 — Foundations

- [x] Backend language/framework decided: Node.js + TypeScript, Fastify — `AGENTS.md` and `PLAYIME_ROADMAP.md` updated
- [x] Init repo with `backend/` and `frontend/` skeletons per the structure in `AGENTS.md`
- [x] `npm init` backend, add TypeScript + Fastify, confirm `tsc`/dev server run clean
- [x] Install `opencode`, run `opencode serve --port 4096` locally
- [x] Explore opencode's own HTTP API (`/doc` OpenAPI spec) — confirm session-create and message-send endpoints work via a manual `curl`/Postman round-trip
- [x] Define the LM adapter interface: `generate(messages, system, stream) -> tokens`
- [x] Implement `adapters/opencode.ts` against opencode's own session/message API (this is the only provider in scope for now — no Ollama/LM Studio wiring yet)
- [x] Confirm streaming works end-to-end through the opencode adapter alone
- [x] Write a one-page setup doc (`docs/setup-opencode.md`) so future-you can rebuild the environment from scratch

**Later, out of scope for now:** each additional provider (Ollama, LM Studio, vLLM, cloud APIs) gets its own adapter that talks to *that provider's own API directly* — they're peers alongside `adapters/opencode.ts`, not routed through opencode. Add an item back here per-provider when you're ready to pick that up.

## Phase 1 — Core chat loop (no memory yet)

- [x] SQLite schema: `Session`, `Message` tables
- [x] Basic backend route: create session → send message → get full-history-in-context reply
- [ ] Hardcode one test Character card (no CRUD yet) to have something to talk to
- [ ] Frontend: minimal chat shell (message list + input box)
- [ ] Wire frontend → backend → adapter end to end, non-streaming first
- [ ] Add SSE/streaming token-by-token output
- [ ] Sanity check: 20+ turn conversation stays coherent and doesn't crash on context length

## Phase 2 — Character class MVP

- [ ] `CharacterCard` schema + DB table (personality, speech_style, scenario, first_message, relationship_state) — the key-event timeline is per-session rows, not a card field (see `AGENTS.md` memory system layer 2)
- [ ] Add card-browser metadata fields (`cover_image`, `creator_name`, `tags`, `description`, `prologue_preview`, local `stats`, `last_updated`) — see `AGENTS.md` UI reference
- [ ] Support multiple avatar options + multiple starting scenarios per card
- [ ] `CardInfoModal` component (reusable for Character and Story): cover, tags, description, prologue preview, avatar picker, starting-scenario picker, "New Play" CTA
- [ ] "New Play" flow: modal selections → create `Session` with `avatar_selection` + `starting_scenario_id`
- [ ] Character creation form (frontend) + save/load
- [ ] System prompt assembly: card fields → system prompt, reproducibly
- [ ] Rolling summary job: every ~15–20 turns, background call compresses history into a timestamped key-event timeline (append-only rows, not a rewritten blob) — see `AGENTS.md` memory system for the exact confirmed format
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
- [ ] Reuse card-browser metadata + `CardInfoModal` from Phase 2 (parameterize by card type, don't rebuild)
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
- [ ] In-session right sidebar (persistent panel, not a popover): card avatar/name header + `Play Guide` + `Avatars` (switch mid-session) + `Memories` (read-only viewer rendering the Phase 2 timeline directly) + `Situation Image` toggle (no-op until Phase 7 lands) + `Receive Messages` toggle (no-op until Phase 7's proactive messaging lands) — explicitly skip a credit/currency section, it's monetization plumbing with no place here
- [ ] Pass: does the UI stay clear when switching between Character and Story mid-session?

## Phase 6 — Creation & sharing tools

- [ ] Export CharacterCard/WorldCard to a single JSON file
- [ ] Import a JSON card, validate schema, handle version mismatches gracefully
- [ ] Local gallery/list view of saved characters and stories
- [ ] (Optional) basic search/filter in the gallery

## Phase 7 — Nice-to-haves

- [ ] TTS hook for character voice (adapter-pattern, swappable engine)
- [ ] Image generation hook for scenes/portraits (local SD/ComfyUI endpoint via adapter) — wires up the Phase 5 `Situation Image` toggle
- [ ] Image Gallery: store/display generated images per session (sidebar grid, per reference screenshots)
- [ ] Proactive/idle messaging: character sends an unprompted message after some elapsed time — wires up the Phase 5 `Receive Messages` toggle
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
- **Product decision: never surface model reasoning to the user.** Only the assistant's final text is shown. The `/event` stream carries `session.next.reasoning.*` events — the adapter/UI must filter those out and deliver only `session.next.text.*` content. This applies to any provider, not just opencode.
- **Prompt architecture defined in `docs/PLAYIME_PROMPT_SPEC.md`** — the single source of truth for prompt assembly. Key choices: Character & Story system prompts are deterministic renderings of card + state + memory (no ad-hoc prose); working context = last 12 turns; OOC turns excluded from fiction and delivered as a separate system block; RAG block injected as its own system message above the main prompt (top-k = 5); state extraction and rolling summary run as separate small-model calls producing deterministic deltas (clamped 0–100) and an append-only key-event timeline respectively; system prompts explicitly require final-text-only output, backing up the adapter-level reasoning filtering.
- **LM adapter interface defined** (`backend/src/adapters/index.ts` `LmAdapter` + `types.ts`). Design: `LmAdapter` exposes two methods — `stream(request, opts): AsyncIterable<StreamChunk>` (token deltas) and `generate(request, opts): Promise<GenerateResult>` (full text, may internally collect a stream) — which together satisfy the checklist's `generate(messages, system, stream) -> tokens`. `GenerateRequest` = assembled `{system, messages}` straight from the prompt assembler (adapters never assemble prompts). `StreamChunk` is a discriminated union (`text` delta | `usage` | `done`); `LmError` normalizes failures to stable codes (`config`/`provider`/`timeout`/`cancelled`/`context`/`not-implemented`). Contract guarantees: final-text-only, prompt-agnostic, streaming-native, cancellable via `AbortSignal`, failure-normalized. `AdapterConfig` is a discriminated union per provider (opencode / openai-compatible / ollama); a factory/registry lands with the first implementation.
- The rolling-summary **format is confirmed as an append-only key-event timeline** (see `AGENTS.md` "Memory system" and `PLAYIME_PROMPT_SPEC.md` §6) — not a single prose blob. Each run appends `{timestamp_range, entries: [str]}` rows; this same data feeds the prompt (`{memory_timeline}`) and renders verbatim in the user-facing Memories modal.
- **`adapters/opencode.ts` implemented and smoke-tested against the live server on 4096.** Class `OpenCodeAdapter` implements the `LmAdapter` shape (`stream()` + `generate()`; the interface file in `index.ts` is an interface, the adapter is the concrete class). It: creates/reuses an opencode session (main + small tiers), renders the assembled `GenerateRequest` into opencode's single-text prompt shape (`src/prompt.ts` `renderOpencodePrompt` — System/User/Assistant sections in code fences), POSTs `/prompt`, then reads the `/event` SSE stream from the `admittedSeq` cursor. Event mapping: `session.next.text.delta`→`{type:'text',delta}` and `text.ended`→`{type:'text',text}` (dedup: this deepseek model emits ended-only, no deltas), `step.ended`→`{type:'usage'}` then `{type:'done'}`. `session.next.reasoning.*` events are **never** surfaced (final-text-only requirement). Optional `options.model` → `POST /api/session/{id}/model` (204). Cancellation via `AbortSignal` (120s hard timeout), failures → `LmError` with stable codes, `dispose()` deletes tracked sessions. Env config: `OPENCODE_BASE_URL`, `OPENCODE_MODEL`, `OPENCODE_SMALL_MODEL`, `OPENCODE_SERVER_PASSWORD`. **Streaming confirmed end-to-end through the adapter alone** (`npm run smoke:opencode`, checklist item 18): a multi-sentence prompt streamed a ~950-char response over the `/event` SSE in ~6.7s (text → usage → done, clean termination), `generate()` produced a complete response, and neither surfaced reasoning/metacommentary. Two notes: (1) the verification caught a contract bug — the adapter returned after `usage` without emitting `{type:'done'}`, now fixed to always emit `done`; (2) deepseek-v4-flash-free emits the whole reply in one `text.ended` (no `text.delta`), so "streaming" here is live SSE delivery of the completed text, not token-by-token — models that do emit deltas will stream incrementally.
- **`docs/setup-opencode.md` written** (checklist item 19) — one-page rebuild-from-scratch guide: install (`npm i -g opencode-ai`, tested v1.18.11), run `opencode serve --port 4096`, secure with `OPENCODE_SERVER_PASSWORD`, verify via `/global/health` + `/doc`, a curl round-trip (session → prompt → `/event` SSE), the adapter's env vars, the smoke test, and troubleshooting (ServeError=port bound; models may emit ended-only; 401=password mismatch). **Phase 0 is now complete.**
- **SQLite schema landed** (Phase 1, item 1). Driver: **`node:sqlite` (built-in `DatabaseSync`)** — chosen over `better-sqlite3` for zero native build on Windows; verified working on Node 24 (no flag/warning). DDL lives in `backend/db/schema.sql` (`session`, `message`; `session.id`/`message.id` are UUID TEXT PKs, ms-epoch `created_at`, `message.seq` = per-session monotonic order, `visible`/`ooc` INTEGER 0/1 flags, `session.class` CHECK character|story, `ON DELETE CASCADE`). `backend/src/db.ts` opens the DB (default `backend/db/playime.db`, env `PLAYIME_DB_PATH`), applies connection PRAGMAs (foreign_keys, WAL) + schema, exposes `openDb()`/`getDb()`. Verified via `npm run db:check` (temp DB: 4 messages ordered by seq incl. an OOC + hidden system turn, cascade delete works) and confirmed the compiled `dist/db.js` also resolves the schema.
- **Phase 1 chat loop landed** (item 2). New modules: `backend/src/models/session.ts` (SQLite repo: createSession/getSession/nextMessageSeq/insertMessage/listTurns — no raw SQL in business code), `backend/src/chat.ts` (service: `sendMessage` persists the user turn, assembles system + last-12-turns working context per PLAYIME_PROMPT_SPEC §1+§3, calls the adapter, persists the reply; **OOC turns are dropped from the fiction sequence and emitted as a separate system block** per §3, so the `ooc` flag works end-to-end already), `backend/src/adapters/factory.ts` (`createAdapter(config)` — the single way routes obtain an LmAdapter; opencode registered, future providers slot in), `backend/src/routes/chat.ts` (Fastify plugin: `POST /api/sessions` + `POST /api/sessions/:id/messages`; maps ChatError→4xx and LmError→5xx with stable codes). Placeholder character system prompt in `backend/src/prompts/character.ts` (a hardcoded persona "Miko") — item 3 replaces it with real CharacterCard rendering. `LmAdapter` interface gained a `dispose()` method (release provider sessions on shutdown). **Verified** via `npm run smoke:chat` (HTTP round-trip with `app.inject` against the live opencode server on a temp DB): session create → two in-context message round-trips → OOC turn → 404/400 paths, all asserted; DB state checked (seq ordering, ooc flag). **The smoke test caught a real bug**: the adapter created its opencode session in `process.cwd()` (the Playime repo), so the model saw the repo and replied "I'm actually a coding agent working in the Playime repo" — breaking character. Fixed by defaulting the agent session directory to a neutral temp dir (`OpenCodeAdapterConfig.directory` / `OPENCODE_DIRECTORY` override), after which replies stayed in character ("Hey! I'm Miko.") and the second turn correctly recalled the first. `npm run smoke:opencode` still passes. Non-streaming by design; SSE is item 6.

