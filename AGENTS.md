# AGENTS.md

Guidance for any agent working in this repo. Read this before making changes.

## Project

**Playime** — open-source, local-first alternative to "OOC: The Playable Anime." Two chat "classes" sharing one interface:

- **Character** — 1:1 persona chat. A character card drives an evolving relationship (memory + relationship state).
- **Story** — DM-style branching simulation. AI narrates a world, runs multiple NPCs, reacts to player choices.

Full architecture/roadmap lives in `docs/ROADMAP.md` (or wherever `PLAYIME_ROADMAP.md` gets placed) — read it before implementing a new phase. This file is the quick-reference for day-to-day work; the roadmap is the source of truth for design decisions.

## Core architectural rule

**Playime owns memory and state. The LLM backend only generates text.**

Don't store relationship stats, plot flags, or world state inside a provider's own session/history mechanism (this applies especially to opencode — its session model is for coding-agent turns, not RPG state). All persistent state lives in Playime's own SQLite tables and is assembled into prompts explicitly on every turn.

## Stack

- Backend: Node.js + TypeScript, Fastify
- Frontend: SvelteKit + Vite
- DB: SQLite (+ `sqlite-vec` for embeddings — use `better-sqlite3` or `node:sqlite` as the driver, confirm `sqlite-vec` loads as an extension from Node before relying on it)
- LM connectivity: adapter interface (`generate(messages, system, stream)`), first implementation talks to `opencode serve` (OpenAI-compatible-ish via its own API), with a direct OpenAI-compatible fallback adapter (Ollama/LM Studio/vLLM) so opencode is never a hard dependency
- Packaging target: Docker Compose for self-host; Tauri optional later for a native build

## Repo layout (target — create as phases land, don't scaffold ahead of need)

```
playime/
  backend/
    src/
      adapters/        # opencode.ts, ollama.ts, openaiCompatible.ts
      memory/           # summarizer.ts, recall.ts, stateExtractor.ts
      models/           # character.ts, story.ts, session.ts
      routes/
    db/                 # sqlite schema + migrations
  frontend/
    src/
      lib/
        components/chat/  # shared chat shell used by both classes ($lib alias)
        data/             # sample/seed data
        state/            # shared runes state (chat.svelte.ts)
      routes/character/
      routes/story/
  docs/
    ROADMAP.md
    setup-opencode.md
    setup-ollama.md
```

## Data model quick reference

- `Session`: id, class (`character`|`story`), created_at, provider/model config
- `Message`: role, content, timestamp, session_id, `visible` flag (hide bookkeeping turns), `ooc` flag (out-of-character asides vs in-fiction dialogue)
- `MemoryEntry`: text, embedding, importance score, source turn ids, last-recalled timestamp
- `CharacterCard`: name, avatar, tagline, personality, speech_style, scenario, first_message, relationship_state (affection/trust/flags), plus card-browser metadata below — the running key-event timeline is per-session, not on the card (see "Memory system" layer 2)
- `WorldCard`: title, genre, premise, tone, locations, npcs, protagonist (stats/inventory), plot_flags, current_scene, chapter_log, plus card-browser metadata below

**Card-browser metadata** (shared by both card types, informed by OOC's card modal — see UI reference below): `cover_image`, `creator_name`, `tags[]`, `description`, `prologue_preview` (excerpt shown before starting), `stats` (replay_count, like_count, comment_count — local-only equivalents, no need for a backend service to populate these in v1), `last_updated`.

**Per-session config** (set at "New Play" time, stored on `Session`, not on the card itself — a card is reusable across many sessions with different settings): `avatar_selection` (which of the card's available user-facing avatars this session uses), `starting_scenario_id` (card can define more than one starting scenario/prologue variant, default one preselected).

Both card types are structured JSON with real schema/columns — queryable and diffable, not just prompt text.

## UI reference (from OOC screenshots — mechanics to replicate, not the skin)

Two screens matter most for the card/chat UX:

1. **Card info modal** (before starting): cover image, title, creator credit, tag chips, a short one-line description, a longer story description, a "Prologue Preview"/"Intro Preview" excerpt (character cards additionally show a sample exchange preview), a "Settings" section with an avatar picker and a starting-scenario picker, engagement stats (replays/likes/comments), last-updated date, and a "New Play" CTA that creates the session. Confirmed identical structure for Character and Story cards — build one reusable `CardInfoModal` component parameterized by card type, not two.
2. **In-session right sidebar** (persistent panel next to the chat, not a popover menu — correcting the earlier assumption): header shows the card avatar/name; below that an **Image Gallery** (grid of images generated during this session, tied to the Situation Image feature); below that a **Chat Settings** group — `Play Guide`, `Avatars` (switch user-facing avatar mid-session), `Memories` (opens the memory viewer, see below), `Situation Image` toggle, `Receive Messages` toggle (character can send unprompted/idle messages — a proactive-messaging feature, not built until Phase 7); at the bottom, a credit/currency balance section (`My Credit`) — **skip this entirely**, it's monetization for a hosted product and has no place in a local-first open-source tool.
3. **Memories modal**: a scrollable, read-only rendering of the rolling-summary timeline described below — literally titled "Memories" with the subtext *"You can see the content summarized in the AI's memory from past records."* This confirms the memory viewer is just a UI window onto the rolling-summary data, not a separate store.

`User Note`, `Output Length`, and `Keyboard Shortcuts` weren't visible in the newer reference screenshots — keep them as optional additions, not confirmed core features. Treat "Memories" and "Situation Image" as UI surfaces onto systems already in the roadmap (Phase 3 recall / rolling summary, Phase 7 image hook) rather than new backend work.

## Memory system (4 layers — implement in this order, don't skip ahead)

1. Working context — last N raw turns verbatim.
2. Rolling summary — every ~15–20 turns, background call compresses history + updates flags; raw turns drop from the prompt (kept in DB for export). **Confirmed format** (from the reference "Memories" screen): a human-readable, timestamped key-event timeline that gets appended to, not rewritten —
   ```
   [Key Event Timeline]
   - 2023-10-27 10:00–11:00
     - Abyss Weiss and Emma met for the first time in their new shared home.
     - Emma expressed immediate disdain for the new family situation.
   - 2023-10-27 11:00–12:00
     - Abyss Weiss and Emma had an argument after Abyss Weiss entered without knocking.
   ```
   Store as structured rows (`timestamp_range`, `entries: [str]`), not one growing text blob — this is what lets the Memories modal render it directly without re-parsing, and it's what gets shown to the user verbatim.
3. Long-term recall (RAG) — embed summaries/key moments, top-k retrieval injected above the system prompt.
4. Structured state extraction — after each AI turn, a cheap JSON-mode/function-calling call emits state deltas (e.g. `{"affection_delta": 2, "new_flag": "..."}`) applied deterministically.

Character mode validates this whole pipeline first. Story mode reuses the same engine generalized to multi-NPC/world state — don't build a second memory system for it.

## Build order

Phase 0 (adapter + opencode serve running) → Phase 1 (raw chat loop, no memory) → Phase 2 (Character MVP: cards + rolling summary + relationship state) → Phase 3 (RAG recall) → Phase 4 (Story MVP, reusing Phase 2/3 engine) → Phase 5 (unify UI, OOC toggle, branching) → Phase 6 (import/export cards) → Phase 7 (TTS/image gen hooks) → Phase 8 (packaging).

Don't start Story mode or RAG before Character mode's basic loop is validated — see roadmap §9.

## Conventions

- TypeScript throughout the backend; no implicit `any` on adapter/route boundaries.
- LM adapters must implement one shared interface; never call a provider's SDK directly from route/business logic.
- All state-mutating LLM calls (summarization, state extraction) should prefer a configurable "small model" — don't burn main-model context/cost on bookkeeping.
- Streaming (SSE) is expected end-to-end once Phase 1 lands; don't ship a non-streaming chat loop as final.
- Single local user for v1 — no auth/multi-tenancy work unless explicitly asked.
- Keep this file updated when stack/structure decisions change; it's what future agent sessions will trust first.

## What NOT to do

- Don't reproduce OOC's branding, copy, or UI verbatim — build the mechanic (persona chat + DM-style story mode + OOC toggle), not the skin.
- Don't hardcode a single LLM provider anywhere outside the adapters directory.
- Don't add moderation/safety policy assumptions inherited from a specific model vendor — that's a deliberate decision for the project owner, not a default.
