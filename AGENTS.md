# AGENTS.md

Guidance for any agent working in this repo. Read this before making changes.

## Project

**Playime** — open-source, local-first playable roleplay app. Two chat "classes" sharing one interface:

- **Character** — 1:1 persona chat. A character card drives an evolving relationship (memory + relationship state).
- **Story** — DM-style branching simulation. The AI narrates a world, runs multiple NPCs, and reacts to player choices.

### Modular Character Cards (architectural direction)

Characters are **reusable building blocks**. Stories are **compositions** of characters, worlds, and scenarios. Sessions are **instances** of those compositions.

```
CHARACTER POOL
│
├── Yuna        ← reusable Character entity
├── Akira       ← reusable Character entity
├── Ren         ← reusable Character entity
└── Mika        ← reusable Character entity
        │
        │ referenced by
        ▼
STORY CARD: "Summer at the Academy"
├── character references (Yuna, Akira, Ren)
│   └── story-specific role/context per character
├── world, premise, plot
└── starting scenarios
```

A Character lives in the **Character Pool** — owned, authored, and maintained independently. A Story **references** Characters from the Pool rather than duplicating them. A Session **instantiates** a Story's composition for actual play.

This separation means the same Character can appear in multiple Stories with different roles, and editing a Character does not break existing Stories or Sessions. **This architecture is planned, not yet fully implemented** — see `PLAYIME_CHECKLIST.md` for current status.

**Story Cards are Playime's flagship feature** — the thing no comparable tool has: a browsable, shareable, structured story unit with its own quest log and per-NPC relationships (see `PLAYIME_ROADMAP.md` §0.5 for the prior-art research that decided this). Treat `StoryCard` as a first-class peer of `CharacterCard`, never a lesser sibling.

**Source-of-truth docs** — read these before implementing, and keep them in sync when a decision changes:
- `docs/PLAYIME_ROADMAP.md` — design decisions, full data-model shapes, memory-system spec (§3, §4).
- `docs/PLAYIME_CHECKLIST.md` — build progress phase by phase, plus the Notes/decisions log where decisions are recorded.
- `docs/PLAYIME_PROMPT_SPEC.md` — the single source of truth for prompt assembly.

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
      memory/           # summarizer.ts, recall.ts, stateExtractor.ts, worldInfo.ts
      models/           # character.ts, story.ts, session.ts
      cards/            # sillytavern.ts (Tavern V2/V3 import+export), pngText.ts (tEXt chunk read/write)
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
    PLAYIME_ROADMAP.md
    PLAYIME_CHECKLIST.md
    PLAYIME_PROMPT_SPEC.md
    setup-opencode.md
    setup-ollama.md
```

## Data model quick reference

Full field shapes live in `PLAYIME_ROADMAP.md` §3 — this is the quick map. Everything is structured JSON with real schema/columns, queryable and diffable — never just prompt text.

### Character Pool (planned — not yet implemented as a separate entity)

Characters are **reusable entities** owned by the Character Pool. A Character owns character-level information: identity, name, personality, appearance, speech style, general traits, avatars, and other character-specific data. A Character should **not** own information that exists only because it participates in a particular Story.

```
CharacterPool
├── Character A (reusable)
├── Character B (reusable)
└── Character C (reusable)
```

**Currently implemented as**: `CharacterCard` — a standalone entity with full persona data, avatars, starting scenarios, and Tavern V2/V3 compatibility fields. The Character Pool concept is the planned evolution: Characters become first-class reusable entities referenced by Stories.

### Story → Character references (planned — not yet implemented)

A Story should **reference** Characters from the Character Pool rather than duplicating them. Conceptually:

```
Story
├── character_references: [
│   { character_id, role?, introduction?, relationship_to_user?, story_notes? }
│ ]
├── world, premise, plot
└── starting_scenarios
```

The semantic distinction:
- **Character** = "What is this character?" (identity, personality, appearance)
- **Story Character Reference** = "Who is this character in this story?" (role, context, relationships)

Story-specific information may include: role in the story, relationship to other characters, relationship to the player, story-specific traits, introduction/context, and other contextual overrides. **Avoid duplicating the entire base Character Card inside a Story.**

### Current data model entities

- `Session` — id, class (`character`|`story`), created_at, provider/model config, plus per-session picks: `avatar_selection`, `starting_scenario_id` (the card stays reusable across sessions; the choice lives on the session). **Session-specific state must not mutate reusable Character or Story definitions.**
- `Message` — role, content, timestamp, session_id, `visible` flag (hide bookkeeping turns), `ooc` flag (out-of-character asides vs in-fiction dialogue).
- `CharacterCard` — name, avatar, tagline, personality, speech_style, scenario, first_message, `relationship_state` (`{affection, trust, flags}`), plus Tavern V2/V3-compatible fields (`alternate_greetings`, `mes_example`, `system_prompt`/`post_history_instructions`, `creator`/`creator_notes`/`character_version`, `world_info`, `extensions`). The running key-event timeline is per-session, not on the card. **Characters are reusable entities** — they own identity, personality, appearance, and speech style. They should not own story-specific context.
  - **`avatars: AvatarOption[]`** — multiple selectable avatar options per character. Each has a stable `id`, optional `name`, and `image`. The Character owns the available choices; a Story may optionally specify a preferred avatar without changing the Character globally.
  - **`starting_scenarios: StartingScenario[]`** — multiple starting scenarios per character, each with a stable `id`, `name`, optional `description`, `scenario` text, and `first_message`. A starting scenario is a **different starting context/premise** — distinct from `alternate_greetings` (same scenario, different opening message).
- `StoryCard` (flagship — formerly "WorldCard") — title, genre, premise, tone, locations, `npcs: NpcCard[]`, protagonist (stats/inventory), `plot_flags` (free-form branching bag), `quest_log: QuestEntry[]`, `current_scene`, `chapter_log: ChapterEntry[]`, `world_info`. **A Story is a composition of Characters + world + scenarios** — it should reference Characters from the Character Pool rather than containing duplicated Character data.
  - `NpcCard` — each NPC carries its own `relationship_state` (`{affection, trust, flags}`, same shape as `CharacterCard`'s) — tracked independently per NPC, not shared across the cast. **Planned**: NpcCards may eventually be backed by Character Pool references rather than inline definitions.
  - `QuestEntry` — id/title/status/objective, optional `triggers_on` condition evaluated against `plot_flags` to auto-update status. Structured, distinct from the `plot_flags` bag.
  - `ChapterEntry` — title/summary, optional `checkpoint_id`; a checkpoint can fork into a new, independently shareable `StoryCard` variant (alternate timeline), not just a session snapshot.
- `WorldInfoEntry` (shared by both card types) — the lorebook layer, field-compatible with SillyTavern's `character_book`: `keys`, `secondary_keys`, `selective`/`selective_logic`, `constant`, `content`, `insertion_order`, `priority`, `position`, `case_sensitive`, `enabled`. Book-level settings (`scan_depth`, `token_budget`, `recursive_scanning`) live on the card.
- `MemoryEntry` — text, embedding, importance score, source turn ids, last-recalled timestamp.

**Card-browser metadata** (shared by both card types, informed by the reference card modal): `cover_image`, `creator_name`, `tags[]`, `description`, `prologue_preview`, `stats` (replay_count, like_count, comment_count — local-only), `last_updated`.

## UI reference (mechanics to preserve, not branding or skin)

1. **Card info modal** (before starting): cover image, title, creator credit, tag chips, short + long description, a "Prologue Preview"/"Intro Preview" excerpt (character cards additionally show a sample exchange preview), engagement stats, last-updated date, and a "New Play" CTA. **Identical structure for Character and Story cards** — build one reusable `CardInfoModal` parameterized by card type, not two. "New Play" creates the session with the avatar + starting-scenario picks.
2. **In-session right sidebar** (persistent panel next to the chat, not a popover): header shows the card avatar/name; below that an **Image Gallery** (grid of images generated during this session, tied to the Phase 7 Situation Image hook); below that a **Chat Settings** group — `Play Guide`, `Avatars` (switch user-facing avatar mid-session), `Memories` (opens the memory viewer, see below), `Situation Image` toggle, `Receive Messages` toggle (proactive messaging — Phase 7). At the bottom, a credit/currency balance section (`My Credit`) — **skip this entirely**, it's monetization for a hosted product and has no place in a local-first open-source tool.
3. **Memories modal**: a scrollable, read-only rendering of the rolling-summary timeline — literally titled "Memories" with the subtext *"You can see the content summarized in the AI's memory from past records."* Confirms the memory viewer is just a UI window onto the rolling-summary data, not a separate store.

`User Note`, `Output Length`, and `Keyboard Shortcuts` were not confirmed as core surfaces in the reference material — keep them optional additions. Treat "Memories" and "Situation Image" as UI surfaces onto systems already in the roadmap (rolling summary / Phase 7 image hook) rather than new backend work.

## Session architecture and ownership chain

```
Character Pool (reusable Characters)
       ↓ references
Story (compositions of Characters + world + scenarios)
       ↓ references
Session (play instance)
       ↓ assembled by
Prompt Assembly (canonical prompt pipeline)
```

**Key ownership rules:**
- **Character Pool** owns: identity, personality, appearance, speech style, avatars, starting scenarios, world_info. Characters are reusable across Stories.
- **Story** owns: world/story context, character references (with story-specific role/context), starting scenarios, plot_flags, quest_log, chapter_log. A Story references Characters rather than duplicating them. **A Story supports multiple starting scenarios** — the same cast and world can have completely different starting situations ("one Story → multiple ways to begin"). The selected scenario becomes session state, not story state.
- **Session** owns: play-specific state (message log, relationship evolution, key-event timeline, avatar/scenario selections). **Sessions must not mutate reusable Character or Story definitions.**
- **Prompt Assembly** must happen through the canonical prompt pipeline (`docs/PLAYIME_PROMPT_SPEC.md`). The prompt compiler resolves Character references by merging base Character data with Story-specific context. **Do not construct independent prompts ad-hoc in UI components.**

### Live references vs snapshots (planned — implementation deferred)

During authoring, Story Character references should behave as **live references** to Character Pool entries — this allows a reusable Character to appear in multiple Stories. However, published/exported Stories may need a **snapshot/versioned representation** so that publishing can preserve the Character state used by that Story. This is future work; the detailed versioning strategy is not yet designed.

## Memory system (implement in this order, don't skip ahead)

1. **Working context** — last N raw turns verbatim (N = 12, per `PLAYIME_PROMPT_SPEC.md` §3).
2. **Rolling summary** — every ~15–20 turns, background call compresses history + updates flags; raw turns drop from the prompt (kept in DB for export). **Confirmed format**: a human-readable, timestamped key-event timeline that gets appended to, not rewritten —
   ```
   [Key Event Timeline]
   - 2023-10-27 10:00–11:00
     - Abyss Weiss and Emma met for the first time in their new shared home.
     - Emma expressed immediate disdain for the new family situation.
   ```
   Store as structured rows (`timestamp_range`, `entries: [str]`), not one growing text blob — this is what the Memories modal renders verbatim.
2.5. **World Info / lorebook** — keyword-triggered, deterministic, *not* embedding-based (borrowed from SillyTavern's World Info; see roadmap §0.5). Every user turn, scan the last `scan_depth` turns for literal matches against the card's (and, for Story mode, the world's) `WorldInfoEntry[]`; matching entries render into their own system block, `constant` entries always included, lowest-`priority` entries dropped first when over `token_budget`. This is the layer an imported card's `character_book` populates — it's what makes an imported SillyTavern/Chub.ai card work before any RAG infrastructure exists.
3. **Long-term recall (RAG)** — embed summaries/key moments, top-k retrieval injected above the system prompt.
4. **Structured state extraction** — after each AI turn, a cheap JSON-mode/function-calling call emits state deltas (e.g. `{"affection_delta": 2, "new_flag": "..."}`) applied deterministically.

Character mode validates this whole pipeline first. Story mode reuses the same engine generalized to `plot_flags`/`quest_log` + chapter summaries instead of a single `relationship_state` — per-NPC relationship deltas use the same structured-extraction call pattern. Don't build a second memory system for it.

## Build order

Phase 0 (adapter + opencode serve running) → Phase 1 (raw chat loop, no memory — **done**) → Phase 2 (Character MVP: cards + SillyTavern V2/V3 import + rolling summary + relationship state) → Phase 2.5 (World Info / lorebook layer, wired to imported `character_book`) → Phase 3 (RAG recall) → Phase 4 (Story MVP: StoryCard + quest_log + per-NPC state + chapter summarization, reusing the Phase 2/3 engine) → Phase 5 (unify UI, out-of-character toggle, checkpoints-as-forks) → Phase 6 (JSON/PNG export + Story Card portable bundle, import already landed in Phase 2) → Phase 7 (TTS/image gen hooks) → Phase 8 (packaging).

**Modular Character Cards** (planned, cross-cutting) — this architectural evolution can begin after Phase 2 when Character CRUD and import are solid. See `docs/PLAYIME_CHECKLIST.md` for the dedicated feature sections (Phases A–H). The work touches data models, import normalization, Story composition, session creation, prompt assembly, and the Story Editor UI. It does not require a new phase number — it refines existing phases.

One phase should be fully checked before the next starts (per `docs/PLAYIME_CHECKLIST.md`). Don't start Story mode or RAG before Character mode's basic loop is validated — see roadmap §9.

## Conventions

- TypeScript throughout the backend; no implicit `any` on adapter/route boundaries.
- LM adapters must implement one shared interface; never call a provider's SDK directly from route/business logic.
- All state-mutating LLM calls (summarization, state extraction) should prefer a configurable "small model" — don't burn main-model context/cost on bookkeeping.
- Streaming (SSE) is expected end-to-end once Phase 1 lands; don't ship a non-streaming chat loop as final.
- Single local user for v1 — no auth/multi-tenancy work unless explicitly asked.
- **Record design decisions** in `docs/PLAYIME_CHECKLIST.md`'s Notes/decisions log (and the roadmap when a shape changes) as you make them, so reasoning doesn't get lost between sessions.
- Tavern card-format default: **read both V2 (`chara`) and V3 (`ccv3`) tEXt chunks, write V2** (what SillyTavern/RisuAI/Chub.ai all reliably read today) — see roadmap §8. Never silently drop an unmapped field; put it in `extensions`.
- Keep this file updated when stack/structure decisions change; it's what future agent sessions will trust first.

### Modular Character Card conventions

- **Use stable IDs** for Characters, avatar options, Story Character references, and starting scenarios. **Never use array indexes as persistent identifiers.**
- **Do not duplicate Character Cards into Stories** unless a deliberate snapshot/export operation requires it. Stories reference Characters from the Character Pool.
- **Do not break existing Character Card imports or `alternate_greetings`**. Legacy cards with `avatar`, `scenario`, `first_mes`/`first_message` fields must continue to work. Normalization bridges older/simpler card structures into the modular model.
- **Prompt construction must happen through the canonical prompt assembly pipeline** (`docs/PLAYIME_PROMPT_SPEC.md`). Do not construct independent prompts ad-hoc in UI components.
- **Sessions must not mutate reusable Character or Story definitions** from ordinary session interactions. Session-specific state (relationship evolution, key-event timeline) belongs to the session.
- **Before modifying the architecture**, inspect: existing types (`backend/src/models/`), persistence (`backend/db/schema.sql`), import normalization (`backend/src/cards/sillytavern.ts`), session creation (`backend/src/models/session.ts`), prompt assembly (`backend/src/prompts/`). Reuse existing abstractions; update documentation when architectural behavior changes.

## What NOT to do

- Don't reproduce any reference product's branding, copy, or UI verbatim — build the mechanic (persona chat + DM-style story mode + out-of-character guidance), not the skin.
- Don't hardcode a single LLM provider anywhere outside the adapters directory.
- Don't add moderation/safety policy assumptions inherited from a specific model vendor — that's a deliberate decision for the project owner, not a default.
- Don't duplicate Character Card data inside Stories. Stories reference Characters from the Character Pool; they do not contain copies.
- Don't claim modular Character Cards are "implemented" if they are not. Distinguish architecture/direction from implementation status accurately.
- Don't use array indexes as persistent identifiers for Characters, avatars, scenarios, or Story Character references.
- Don't mutate reusable Character or Story definitions from session-level interactions.
- Don't build a second prompt assembly pipeline. The canonical pipeline in `docs/PLAYIME_PROMPT_SPEC.md` is the single source of truth.
