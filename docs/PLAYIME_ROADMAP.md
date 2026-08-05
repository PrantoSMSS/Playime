# Playime — Roadmap

An open-source, local-first playable roleplay app. Two experience "classes" — **Character** (1:1 companion chat) and **Story** (DM-style branching simulation) — sharing one chat shell, backed by local/self-hosted LLMs.

---

## 0. Core experience

Playime is built around two complementary loops:

- **Character mode**: persona-driven 1:1 chat. A character card (personality, speech style, scenario, opening line) drives a single evolving relationship. "Deep memory" = the AI recalls shared history and the relationship visibly changes over time.
- **Story mode**: the AI acts as a dungeon master. It narrates a world, runs multiple NPCs, and reacts to player choices, generating branching plot rather than a flat back-and-forth.

Both need: a persistent **state** object beyond raw chat history, a **memory** system so 200+ turn conversations stay coherent, and a **creation tool** so users can define characters/worlds without writing code.

Branding note: keep Playime's identity independent. Borrow broad interaction lessons from the wider genre, not names, copy, visual skin, or branded terminology from any single product.

### Modular Character Cards — architectural direction

Playime is moving toward **modular Character Cards**: Characters become reusable entities in a Character Pool, Stories compose Characters with worlds and scenarios, and Sessions instantiate those compositions for actual play.

```
CHARACTER POOL (reusable entities)
│
├── Character A
├── Character B
└── Character C
        │
        │ referenced by
        ▼
STORY CARD (composition)
├── character references (with story-specific role/context)
├── world, premise, plot
└── starting scenarios
        │
        │ instantiated by
        ▼
SESSION (play instance)
├── selected avatar + scenario
├── message log
├── relationship evolution
└── key-event timeline
```

The central principle: **Characters are reusable building blocks. Stories are compositions of characters, worlds, and scenarios. Sessions are instances of those compositions.**

A Story Card controls its cast through a single **`cast_mode`** field — not separate toggles. Three modes exist (`fixed`, `selectable`, `open`) and determine how players interact with the author's character selections. This is a Story-level concern, distinct from a Character Card's own native starting scenarios.

A Story also supports **multiple starting scenarios** — the same cast and world can have completely different starting situations. Instead of "one Story → one opening," a Story offers "one Story → multiple ways to begin." Each starting scenario defines its own context and first message; the selected one becomes session state.

This architecture is **planned, not yet fully implemented**. The current codebase has `CharacterCard` as a standalone entity (which already supports multiple avatars and starting scenarios). The evolution toward Character Pool + Story Character references is documented in the data model (§3) and implementation checklist (§7).

---

## 0.5. Prior art: related open source projects

Playime isn't the first attempt at this. Before building each piece, it's worth knowing what the existing "AI roleplay frontend" ecosystem already converged on, so Playime borrows the parts that work instead of rediscovering them the slow way.

| Project | License / model | What it's genuinely good at | What Playime borrows |
|---|---|---|---|
| **SillyTavern** | Open source, self-hosted, fork of TavernAI | The deepest customization and extension ecosystem of any tool in this space; the de facto card format (community "Tavern V2/V3" spec); **World Info / lorebooks** — keyword-triggered lore injection that keeps a card's description short while surfacing deep lore on demand; regex find/replace scripts that post-process AI output before render; a large community card library via Chub.ai | **Card format compatibility (import + export)** and **the World Info/lorebook layer** as their own memory tier, both described below. Regex output-scripts noted as a Phase 7 nice-to-have (not core). |
| **Chub.ai** | Hosted card repository, not a chat app | The largest public library of ready-made V2-spec cards, most with embedded `character_book` lorebooks; the reference implementation for how lorebook fields (`selective`, `secondary_keys`, `priority`, `token_budget`) are meant to behave | Not a dependency — but importing its cards is the payoff of card-format compatibility. Its docs are the practical reference for lorebook field semantics used in §4 below. |
| **RisuAI** | Open source (client), pushes a hosted/subscription model for cloud inference | Cross-platform polish (mobile/desktop/web from one codebase), regex-as-a-feature (not bolted on), an asset/emotion-image system, long-term memory tuned for casual users | Confirms regex-scripting and long-term-memory UX are worth doing eventually (Phase 7), but Playime stays local-first and free rather than adopting RisuAI's subscription push. |
| **Agnai (Agnaistic)** | Open source, self-hostable, also offers a free hosted server | The only one of these three with credible **multi-user/shared-server** support and group chats; clean, simpler UI than SillyTavern; supports Kobold/OpenAI/Claude backends | Explicitly **not** adopted — Playime is staying single-local-user per the existing decision (§8). Noted here so the choice reads as deliberate, not an oversight. |
| **TavernAI** | Open source, largely superseded | The direct ancestor SillyTavern forked from; established the original V1 card fields (`name`/`description`/`personality`/`scenario`/`first_mes`/`mes_example`) that V2/V3 still nest inside for backward compatibility | Nothing directly — relevant only as the reason the V1 field set is the compatibility floor for any card importer. |
| **KoboldAI / kobold.cpp** | Open source, local inference server | Fast, easy local model serving with a one-click installer; commonly paired *behind* Agnai/SillyTavern rather than used as a frontend itself | Orthogonal to Playime — it's an inference backend, the same role opencode/Ollama already fill. Worth documenting as an alternate backend in `docs/setup-*.md` later, not urgent. |

**The two concrete adoptions**, both threaded through the rest of this document:

1. **Character card import/export compatible with the community Tavern V2/V3 spec** — a PNG with the card JSON embedded in a `chara` tEXt chunk (base64-encoded, V2 spec) and/or a `ccv3` chunk (V3 spec), or a standalone `.json` card. This is what makes the entire existing Chub.ai library usable in Playime on day one. See §3 and §9 (Phase 2 / Phase 6).
2. **World Info / lorebook as its own deterministic memory layer**, distinct from the RAG layer — see §4 layer 2.5. A card's `character_book` maps onto this almost field-for-field, so import doesn't need a lossy conversion.

**The one deliberate departure — Story Cards as the flagship feature:**

SillyTavern has no first-class equivalent of a "Story Card." World Info/lorebooks are a config surface bolted onto a character card or a standalone lorebook file — not a browsable, shareable, structured unit with its own quest state and NPC relationships. Independent 2026 reviews consistently note that even SillyTavern's memory tools (lorebooks, the Summarize extension, vector storage) *mitigate* the context-window problem rather than solve it, because nothing outside the prompt text tracks state as data — a database-backed approach that stores state outside the context window is explicitly called out as beating it. That's exactly Playime's existing architectural bet (`CLAUDE.md` "Playime owns memory and state"), so Story mode is where Playime should press the advantage hardest rather than just matching SillyTavern's feature list:

- **`StoryCard`** (renamed from `WorldCard` — deliberately mirrors `CharacterCard` so the pitch is literally "Character Cards, but also Story Cards") gets full parity in the card browser, `CardInfoModal`, and import/export — not a second-class sibling.
- **`quest_log`** — structured objectives (id/title/status/objective/optional trigger condition), distinct from the free-form `plot_flags` bag. This is the concrete answer to "the AI forgot I was supposed to find the sword": a queryable fact instead of prose riding on context-window luck.
- **Per-NPC `relationship_state`** — every NPC in a `StoryCard` carries the same `{affection, trust, flags}` shape `CharacterCard` uses, tracked independently. SillyTavern group chats are known for relationship/state drift across multiple characters in one thread; structured per-NPC state is the direct fix.
- **Checkpoints as forks, not just snapshots** — a `chapter_log` entry can be a save point that spins off a new, shareable `StoryCard` variant (an alternate timeline), rather than SillyTavern's only real branching mechanism (swipe-to-regenerate or manually duplicating a chat).

See §3 for the updated schema and §7 Phase 4/5/6 for where each lands.

---

## 1. High-level architecture

```
┌──────────────────────────────┐
│           Frontend           │  Chat shell (shared by both classes)
│  Character view | Story view │  Sidebar: cards / stats / world state
└───────────────┬──────────────┘
                │ REST/WS
┌───────────────▼───────────────┐
│         Playime Backend       │
│  - Session orchestrator       │  turn loop, prompt assembly
│  - Character Pool             │  reusable Character entities (planned)
│  - Story composer             │  resolves Character refs → prompts (planned)
│  - Memory engine              │  summarization + vector recall
│  - State engine               │  relationship/world state JSON
│  - Persona/World store        │  SQLite (cards, sessions, memories)
└───────────────┬───────────────┘
                │ OpenAI-compatible calls
┌───────────────▼────────────────┐
│      LM Provider Adapter       │
│  opencode serve (default) ─┐   │
│  Ollama / LM Studio / vLLM ┼───│──► pick per-deployment
│  Cloud API key (optional)  ┘   │
└────────────────────────────────┘
```

Key idea: **Playime owns memory/state; the LLM backend just generates text.** Don't try to make opencode's own session history double as your RPG state — it wasn't built for that (see §5).

**Planned additions**: The **Character Pool** (reusable Character entities) and **Story composer** (resolves Character references when building prompts) are planned architectural components. The Story composer merges base Character data with Story-specific context during prompt assembly, so the prompt compiler resolves Character references rather than expecting Story Cards to contain duplicated Character data.

Key idea: **Playime owns memory/state; the LLM backend just generates text.** Don't try to make opencode's own session history double as your RPG state — it wasn't built for that (see §5).

---

## 2. Recommended stack

- **Backend**: Node.js + TypeScript, Fastify — decided. One language end-to-end with the SvelteKit frontend; use `better-sqlite3`/`node:sqlite` for storage and confirm `sqlite-vec` loads as a Node extension before depending on it for Phase 3.
- **Frontend**: SvelteKit or React + Vite. Svelte is lighter for a chat-heavy, animation-light UI like this.
- **DB**: SQLite (via `sqlite-vec` extension for embeddings) — zero-setup, single file, fits a local-first tool. Postgres+pgvector only if you plan multi-user/hosted later.
- **Embeddings**: a small local embedding model (e.g. via the same opencode/Ollama endpoint, or `sentence-transformers` in-process) for long-term memory recall.
- **Packaging**: Tauri (if you want a native desktop app around the web UI) or plain self-hosted web app + Docker Compose. Tauri gives the strongest native-app feel if the web UI later needs a desktop wrapper.

---

## 3. Data model

### Character Pool and modular architecture (planned)

Characters are **reusable entities** owned by the Character Pool. A Character owns character-level information: identity, name, personality, appearance, speech style, general traits, avatars, and other character-specific data. A Character should **not** own information that exists only because it participates in a particular Story.

**Currently implemented as**: `CharacterCard` — a standalone entity with full persona data, avatars, starting scenarios, and Tavern V2/V3 compatibility fields. The Character Pool concept is the planned evolution: Characters become first-class reusable entities referenced by Stories.

A Story should **reference** Characters from the Character Pool rather than duplicating them. Conceptually:

```ts
type StoryCharacter = {
    character_id: string;   // references a Character in the Pool

    role?: string;               // role in this story
    introduction?: string;       // how this character appears in this story
    relationship_to_user?: string; // relationship to the player
    story_notes?: string;        // story-specific notes about this character
};
```

This is conceptual documentation — the actual type will use the project's established naming conventions. The important semantic distinction:

- **Character** = "What is this character?" (identity, personality, appearance)
- **Story Character Reference** = "Who is this character in this story?" (role, context, relationships)

Story-specific information may include: role in the story, relationship to other characters, relationship to the player, story-specific traits, introduction/context, and other contextual overrides. **Avoid duplicating the entire base Character Card inside a Story.**

**Live references vs snapshots**: During authoring, Story Character references should behave as **live references** to Character Pool entries — this allows a reusable Character to appear in multiple Stories. However, published/exported Stories may need a **snapshot/versioned representation** so that publishing can preserve the Character state used by that Story. This distinction is documented here as an architectural decision; the detailed versioning strategy is future work.

### Shared primitives
- `Session` — id, class (`character`|`story`), created_at, provider/model config, message log ref. **Session-specific state must not mutate reusable Character or Story definitions.** The session owns play-specific state: message log, relationship evolution, key-event timeline, and avatar/scenario selections.
- `Message` — role, content, timestamp, session_id, `visible` flag (for hidden system/state-extraction turns), `ooc` flag (out-of-character aside vs in-fiction).
- `MemoryEntry` — text, embedding, importance score, source turn ids, decay/last-recalled timestamp.
- `Setting` — key/value app-level configuration (LM provider + models, memory tuning); the Config view's backing store. Env vars (e.g. `OPENCODE_MODEL`) remain the bootstrap default; once a `Setting` exists it wins.

### Character class

A Character is a **reusable entity** in the Character Pool. It owns character-level identity, personality, appearance, speech style, avatars, starting scenarios, and world_info. It should **not** own story-specific context.

**Currently implemented as** `CharacterCard` with full persona data + Tavern V2/V3 compatibility. The Character Pool concept (Characters as first-class reusable entities referenced by Stories) is planned.

```
CharacterCard {
  name, avatar, tagline
  personality, speech_style, likes/dislikes
  scenario (starting situation), first_message     // legacy single scenario (kept for backward compat)
  relationship_state: { affection: int, trust: int, flags: [str] }
  // the running key-event timeline is per-session (see §4 layer 2), not on the card

  // Multiple avatars and starting scenarios (implemented)
  avatars: [AvatarOption]                          // selectable visual representations
  starting_scenarios: [StartingScenario]            // distinct starting contexts

  // Tavern V2/V3 card-spec compatibility fields (see §0.5) — populated on import,
  // editable in the creation form, never silently dropped:
  alternate_greetings: [str]        // multiple possible openers for the SAME scenario
  mes_example, system_prompt, post_history_instructions
  creator, creator_notes, character_version
  world_info: [WorldInfoEntry]      // imported from a card's `character_book`, see below
  extensions: { [key]: any }        // passthrough for fields Playime doesn't model yet
}
```

**`AvatarOption`** — a selectable visual representation. The Character owns the available avatar choices; a Story may optionally specify a preferred avatar without changing the Character globally.
```
AvatarOption {
  id: str          // stable identifier — never an array index
  name?: str       // display name (optional)
  image: str       // image path or data URI
}
```

**`StartingScenario`** — a distinct opening context with its own scenario text and first message. **Different from `alternate_greetings`**: a starting scenario represents a different starting context/premise, while an alternate greeting is a different opening message for the same scenario.
```
StartingScenario {
  id: str          // stable identifier
  name: str        // display name
  description?: str // optional description shown in the picker
  scenario: str    // the scenario text injected into the prompt
  first_message: str // the opening/first message for this scenario
}
```

**Normalization**: Cards without explicit `avatars` or `starting_scenarios` (legacy imports, older card formats) are normalized on import — a default avatar is built from the legacy `avatar` field, and a default starting scenario is built from the legacy `scenario`/`first_message` fields. This preserves backward compatibility.

### Story class

`StoryCard` — renamed from `WorldCard`; this is Playime's flagship, most-unique feature (see §0.5). Structurally it's the Story-mode analog of `CharacterCard`, not a lesser cousin — same card-browser/`CardInfoModal`/import-export treatment.

A Story is a **composition** of Characters + world + scenarios. It should **reference** Characters from the Character Pool rather than duplicating them. The same Character can appear in multiple Stories with different roles:

```
Yuna (Character in Pool)
├── Story A: "Summer at the Academy" → role: childhood friend / classmate
├── Story B: "Cyberpunk City" → role: underground resistance leader
└── Story C: "Winter Festival" → role: romantic interest
```

The base Yuna Character remains reusable and independent.

**Currently**: StoryCard contains inline `NpcCard[]` definitions. **Planned**: Story Character references will allow Stories to reference Characters from the Character Pool, with story-specific role/context. NpcCards may eventually be backed by Character Pool references.

```
StoryCard {
  title, genre, premise, tone
  locations: [ {name, description} ]

  // Cast configuration
  cast_mode: 'fixed' | 'selectable' | 'open'  // default: 'selectable'

  // Character composition
  character_references: [ StoryCharacter ]  // planned: references to Character Pool
  npcs: [ NpcCard ]                         // currently: inline NPC definitions

  protagonist: { name, stats, inventory }
  plot_flags: { key: value }          // free-form branching state (booleans/counters)
  quest_log: [ QuestEntry ]           // structured objectives — distinct from plot_flags, see below
  current_scene: { location, present_npcs, summary }
  chapter_log: [ ChapterEntry ]       // compressed past chapters; entries can double as checkpoints
  world_info: [WorldInfoEntry]        // setting-wide lore, same shape as Character's

  // Multiple starting scenarios — "one Story → multiple ways to begin"
  // Same cast, same world, completely different starting situations.
  // Each defines its own scenario text and first message.
  // The selected scenario becomes session state, not story state.
  starting_scenarios: [ StartingScenario ]  // planned
}
```

**Story Character reference** (planned):
```ts
type StoryCharacter = {
    character_id: string;   // references a Character in the Pool
    role?: string;               // role in this story
    introduction?: string;       // how this character appears in this story
    relationship_to_user?: string;
    story_notes?: string;
    preferred_avatar_id?: string; // optional: preferred avatar for this story (contextual selection, not duplication)
};
```

**Story starting scenarios** (planned): A Story supports **multiple starting scenarios** — the same cast and world can support completely different starting situations. Instead of "one Story → one opening," a Story offers "one Story → multiple ways to begin."

```
Story: "Summer at the Academy"
├── Same Characters: Yuna, Akira, Ren
├── Same World: campus, dorms, training grounds
│
├── Starting Scenario: "First Day"
│   └── You arrive at the academy as a new transfer student.
│       Yuna is assigned as your guide. Akira is your rival
│       from day one. Ren is the senior who takes interest.
│
├── Starting Scenario: "Midterm Crisis"
│   └── It's been three months. You've failed your midterm
│       and face expulsion. Yuna offers to tutor you. Akira
│       sees an opportunity. Ren intervenes from the shadows.
│
└── Starting Scenario: "Festival Eve"
    └── The night before the annual festival. The campus is
        alive with preparation. Yuna asks for your help with
        decorations. Akira challenges you to a bet. Ren
        invites you somewhere private.
```

Each starting scenario defines its own scenario text (the context injected into the prompt) and first message (the opening line). The selected scenario becomes **session state** — it is not burned into the Story definition. A Story may also define its own starting scenarios **in addition to** the Characters' individual starting scenarios; the interaction between these layers is resolved during session creation.

### Cast modes

A Story Card uses a single **`cast_mode`** field to determine how the character cast is composed. This is NOT separate toggles — it is one field with three possible values.

```
cast_mode: 'fixed' | 'selectable' | 'open'
```

**`fixed`** — Author completely controls the cast. The Story uses exactly the Characters the author specified. No removal, no substitution, no custom characters. Use this when the narrative depends on specific character dynamics and the author wants to preserve that integrity.

**`selectable`** — Author provides a pool of Characters; the player chooses which of those Characters participate in the Story. The player **cannot** add custom characters from their own library. **This is the default and recommended mode** — it gives players agency over cast composition while keeping the author's vision intact.

**`open`** — The author's Characters are available, **and** the player can add custom Characters from their own library. This is the sandbox/open-ended mode, best for sandbox play or stories designed to accommodate unexpected character additions.

Example:
```
Story: "Cyberpunk City"
  cast_mode: 'selectable'
  character_references: [
    { character_id: "yuna",  role: "fixer" },
    { character_id: "akira", role: "netrunner" },
    { character_id: "ren",   role: "corpo agent" }
  ]
  // Player can choose which of Yuna, Akira, Ren participate.
  // Player cannot add their own characters.
```

### Distinction from native Character Card scenarios

Character Cards have **native starting scenarios** (independent, character-level). Story Cards have **cast configuration** (controls which Characters participate and how). These are separate concepts:

| Concern | Lives on | Scope |
|---|---|---|
| Starting scenario (premise, first message) | **Character Card** | Independent — the Character's own opening contexts |
| Cast mode (fixed/selectable/open) | **Story Card** | Story-level — governs which Characters the player can use |

A Story's `cast_mode` does **NOT** replace or override a Character Card's native starting scenarios. Both layers coexist and are resolved during session creation. A Character's own starting scenarios remain available to that Character regardless of which Story cast mode is active.

### Import/export and Character Card reusability

Character Card import/export workflows (§2, §6) remain fully supported. When a Story Card is exported, its **character references** (pointers to Character Pool entries) are preserved — not duplicated Character data. This means:

- Character Cards remain independent, importable, exportable entities.
- A Character Card that participates in multiple Story Cards does not need to be re-exported per Story.
- Story Card portable export (§6) includes the `cast_mode` and `character_references` so the receiving user can reconstruct the cast configuration.

NpcCard {
  name, avatar?, tagline?
  personality, speech_style
  relationship_state: { affection: int, trust: int, flags: [str] }  // same shape as CharacterCard's — tracked per NPC, not shared
}
// Planned: NpcCards may eventually be backed by Character Pool references
// rather than inline definitions, allowing the same NPC to appear across
// multiple Stories with different story-specific context.

QuestEntry {
  id, title, objective
  status: 'active' | 'completed' | 'failed'
  triggers_on: [ {flag: str, op: 'eq'|'gte'|'lte', value: any} ]?  // optional: evaluated against plot_flags to auto-update status
}

ChapterEntry {
  title, summary
  checkpoint_id: str?    // present if this chapter is a save point; see §Phase 5/6 for fork behavior
}
```

### World Info entries (shared by both card types)

Playime's name for what the community card spec calls `character_book`/lorebook — kept field-compatible so import/export is a straight copy, not a lossy conversion:

```
WorldInfoEntry {
  keys: [str]                       // trigger keywords
  secondary_keys: [str]?            // used with `selective`
  selective: bool?                  // require a secondary_keys match too
  selective_logic: 'AND' | 'NOT'?
  constant: bool?                   // always inject, regardless of keyword match
  content: str
  insertion_order: int              // lower = inserted higher/first
  priority: int?                    // lower = dropped first when over token_budget
  position: 'before_char' | 'after_char'?
  case_sensitive: bool?
  enabled: bool
}
// book-level settings (live on the card, not per-entry):
// scan_depth (how many recent turns to scan), token_budget, recursive_scanning
```

Both are just JSON blobs with a schema — store as structured columns/JSON in SQLite so you can query and diff them, not just embed them in prompt text.

### Card-browser metadata (both card types)

Reference UX patterns show a card info modal with: cover image, creator credit, tag chips, short + long description, a "Prologue Preview" excerpt, engagement stats (replay/like/comment counts), last-updated date, and a "New Play" action. Worth modeling as shared fields rather than duplicating per card type:

```
CardMeta {
  cover_image, creator_name, tags: [str]
  description, prologue_preview
  stats: { replay_count, like_count, comment_count }  // local-only, no backend needed for v1
  last_updated
}
```

A card can also define **multiple** avatar options and **multiple** starting scenarios, chosen at "New Play" time. Store that choice on the `Session`, not the card — the card stays reusable across sessions with different settings:

```
Session += {
  avatar_selection: str,              // which avatar the user picked
  starting_scenario_id: str,          // which starting scenario the user picked
  avatar_snapshot: AvatarOption,      // snapshot of the selected avatar
  starting_scenario_snapshot: StartingScenario  // snapshot of the selected scenario
}
```

**Clarification — alternate greetings vs starting scenarios**: An `alternate_greeting` is a different opening message for the **same** scenario/context (Tavern V2/V3 compatibility). A `starting_scenario` is a **different** starting context/premise with its own scenario text and first message. These are distinct concepts and should not be merged.

---

## 4. Memory system (the hard part)

Four layers, aimed at making long-running play feel genuinely remembered:

1. **Working context** — last N raw turns, sent verbatim every request.
2. **Rolling summary** — every ~15–20 turns, fire a background LLM call that compresses history into key events and updates relationship/plot flags; raw turns drop from the prompt (kept in DB for reference/export). **Confirmed format**: a human-readable, timestamped key-event timeline that gets appended to over time rather than rewritten —
   ```
   [Key Event Timeline]
   - 2023-10-27 10:00–11:00
     - Abyss Weiss and Emma met for the first time in their new shared home.
     - Emma expressed immediate disdain for the new family situation.
   - 2023-10-27 11:00–12:00
     - Abyss Weiss and Emma had an argument after Abyss Weiss kicked Emma's cat.
   ```
   Store as structured rows (`timestamp_range`, `entries: [str]`) rather than one growing blob of prose — this doubles as both the mid-term memory fed back into prompts *and* the exact content rendered in the user-facing memory viewer, so it needs to read cleanly on its own.
2.5. **World Info / lorebook** — keyword-triggered and deterministic, *not* embedding-based (borrowed from SillyTavern's "World Info", see §0.5). Every user turn, scan the last `scan_depth` turns for literal matches against the active card's (and, for Story mode, the world's) `WorldInfoEntry[]`; matching entries render into their own system block, `constant` entries always included, lowest-`priority` entries dropped first if `token_budget` is exceeded. The key distinction from layer 3: this layer surfaces lore the *card author wrote in advance* (and is exactly what an imported `character_book` populates), while layer 3 surfaces memories *Playime generates itself* during play. Cheap (no embedding calls), fully diffable, and — because it's the same shape as the community `character_book` field — it's what makes an imported SillyTavern/Chub.ai card work immediately, before any RAG infrastructure exists.
3. **Long-term recall (RAG)** — embed every summary chunk + key moments. On each new user turn, embed the user's message, pull top-k similar memories, inject as a short "relevant memories" block above the system prompt.
4. **Structured state** — after each AI turn, run a cheap structured-output call (JSON mode / function-calling) that extracts state deltas: `{"affection_delta": +2, "new_flag": "confessed_secret"}`. Apply deterministically to the state object. This is what makes relationships/plots feel like they *persist* rather than just being remembered as text.

This 4-layer split keeps the main context window small (fast, cheap) while still feeling like the character/world "remembers everything."

---

## 5. Using opencode serve as the LM source

`opencode serve` gives you one thing that's genuinely useful here: **provider abstraction**. Point one config at Ollama, LM Studio, vLLM, or a cloud key, and every mode of Playime just talks to `localhost:4096` without caring what's actually running underneath. That's worth building on.

What it's *not* good for: opencode's session/message model is designed around coding-agent turns (tool calls, diffs, file context), not RPG state. Don't try to store relationship stats or world state inside opencode's own session history.

Recommended integration pattern:
- Run `opencode serve --port 4096` (optionally with `OPENCODE_SERVER_PASSWORD` set, even locally).
- Playime backend creates **one opencode session per Playime session** purely as the text-generation channel — send your fully-assembled prompt (system prompt + memory block + recent turns) as the message, take the completion, discard opencode's own bookkeeping of it.
- For the cheap structured-extraction calls (state deltas, summaries), either reuse the same session with a `small_model` configured in opencode's config, or open a second lightweight session — don't burn your main model's context budget on bookkeeping calls.
- Since you control the adapter layer, also implement a **direct OpenAI-compatible fallback** (talk straight to Ollama/LM Studio's own `/v1/chat/completions`) so opencode is a swappable backend, not a hard dependency. This matters for anyone who doesn't want to run opencode at all.

---

## 6. UI/UX plan

Match the *clarity*, not the chrome:
- Single chat shell component reused by both classes; a mode toggle/tab switches which sidebar renders (character card + relationship meter vs. world/scene panel + protagonist stats).
- An explicit **out-of-character guidance toggle** on the input box — lets the user step outside the fiction to give the AI direction ("make her more jealous," "skip ahead a day") without that text being treated as in-world dialogue.
- Streaming responses token-by-token (opencode/most local servers support SSE streaming — use it, it's the single biggest perceived-speed win).
- Lightweight creation forms for Character/World cards — plain forms are enough for v1; no need for a visual node editor early on.
- **In-session right sidebar**: a persistent panel, not a popover menu. Header: card avatar/name. Below: an **Image Gallery** of images generated this session (feeds off the Phase 7 Situation Image hook), then a **Chat Settings** group — `Play Guide`, `Avatars` (switch mid-session), `Memories` (opens a read-only viewer onto the rolling-summary timeline — no new backend, just a window onto Phase 2's data), `Situation Image` toggle, `Receive Messages` toggle (character sends unprompted/idle messages — proactive messaging, defer to Phase 7). Skip any credit/currency balance section; monetization plumbing has no place in a local-first open-source tool.
- A **Config view**, opened from a button in the app's lower-left corner (not a top-level tab — keeps the shell game-clean), is the single home for app-level configuration: LM provider + models (main and small), memory-system tuning, and global defaults. The default play path never touches it (progressive disclosure — see the product stance). Config is **layered**: app-global settings live here, per-card settings (e.g. `length_guidance`, World Info book settings) live on the card, per-session picks (avatar, starting scenario, optional model override) live on the Session.

---

## 7. Phased roadmap

**Phase 0 — Foundations (few days)**
- Repo scaffold, chosen stack, `opencode serve` running locally with Ollama behind it.
- Write the LM adapter interface (`generate(messages, system, stream) -> tokens`) with opencode as first implementation.

**Phase 1 — Core chat loop, no memory**
- SQLite schema for Session/Message.
- Character class only, single hardcoded persona, raw full-history-in-context chat.
- Basic chat UI, streaming responses working end to end.

**Phase 2 — Character class MVP**
- Character card CRUD + creation form.
- **SillyTavern-compatible card import**: parse a PNG's embedded `chara` tEXt chunk (V2, base64 JSON) and `ccv3` chunk (V3) or a standalone `.json` card; map the community field set onto `CharacterCard`; preserve anything unmapped in `extensions` rather than dropping it (see §0.5, §3).
- Rolling summary (layer 2) so long chats don't blow the context window.
- Relationship state object + structured-extraction call updating it.
- Sidebar showing character card + relationship meter.

**Phase 2.5 — World Info / lorebook layer**
- `WorldInfoEntry` schema + storage, attached to Character and World cards alike (see §3, §4 layer 2.5).
- Keyword scan over recent turns → matching entries injected as their own system block.
- Token-budget enforcement (drop lowest-priority first) and `constant`/`selective` handling.
- Import path: a card's `character_book` (from Phase 2's import) populates this directly.
- Test: import a real community card with an embedded lorebook, confirm keyword-triggered lore actually surfaces mid-conversation.

**Phase 3 — Long-term memory (RAG)**
- Embedding pipeline, vector store (sqlite-vec/chroma).
- Recall injection into prompts; test coherence over 100+ turn sessions.

**Phase 4 — Story class MVP**
- `StoryCard`/scene/protagonist schema (including `cast_mode`, `quest_log` and per-NPC `relationship_state` via `NpcCard`), DM-style system prompt design (multi-NPC narration, choice generation).
- Plot flags + quest_log + chapter summarization (reuse the memory engine from Phase 2/3, generalized — per-NPC relationship deltas use the same structured-extraction call pattern as Character mode).
- Story-specific sidebar (scene state, stats, quest log, chapter log).

**Phase 5 — Shared UI polish**
- Unify Character/Story into one chat shell; **Config** opens from a button in the lower-left corner rather than a top-level tab.
- **Config view** (opened via the lower-left button; the single home for app-level configuration): LM & Models section (list configured opencode models, set the global default main + small model, provider/connection settings), plus memory-system tuning as later phases land. Persists to the `Setting` store; the adapter reads resolved config (Setting > env var > default) on every request.
- Out-of-character toggle, message editing/regeneration, branching (save a checkpoint, try an alternate choice — a `chapter_log` checkpoint can fork into a new, independently shareable `StoryCard` variant, not just a session-local snapshot; see §0.5).

**Phase 6 — Creation & sharing tools**
- Import/export cards and worlds as JSON files (community sharing without needing a backend service).
- **PNG export**: embed a card's JSON as a `chara` tEXt chunk (and optionally a `ccv3` chunk) so exported cards round-trip with SillyTavern, RisuAI, and Chub.ai — not just Playime-to-Playime. Import already landed in Phase 2; this is the reverse direction.
- **Story Card portable export** — bundle a `StoryCard` (world, cast_mode, character references, NPCs + their `relationship_state` templates, starting `quest_log`, `world_info`) into one shareable JSON. No PNG embed here (a story isn't a portrait); this is Playime's own format with no SillyTavern equivalent — the concrete payoff of §0.5's flagship-feature bet. Can slip to a Phase 6.5 if Phase 6 is otherwise done, but shouldn't be dropped.
- Optional local gallery of saved characters/stories.

**Phase 7 — Nice-to-haves**
- TTS for character voice, optional image generation for scenes/portraits (hook into any local SD/ComfyUI endpoint via the same adapter pattern).
- Per-session model override (in the sidebar Chat Settings — overrides the Config-tab default for one session only; conversation and state persist because Playime owns memory, so the swap is seamless).

**Phase 8 — Packaging**
- Docker Compose for self-hosting; optionally a Tauri build for a native app feel.
- Docs: setup guide for pairing with Ollama/LM Studio/opencode.

---

## 8. Open questions worth deciding early

- Single-user local tool vs. something you'd eventually self-host for a few friends? This affects whether you need auth/multi-tenancy at all (recommend: skip it for v1, single local user, add later if needed).
- How aggressive should structured-state extraction be — every turn (more accurate, more LLM calls) vs. every few turns (cheaper, slightly laggy state)? Start with "every turn" using a small/cheap model, tune later.
- Content moderation stance — you're building this yourself, so decide your own policy up front rather than inheriting one implicitly from whatever model you default to.
- V2 vs V3 as the import/export target — recommend **read both, write V2**: V3 (`ccv3` chunk) is newer and less universally supported, while V2's `chara` chunk is what SillyTavern, RisuAI, and Chub.ai all reliably read today. Import should accept either (V3 is a superset, see §0.5); export should default to V2 for maximum compatibility, with a V3 chunk as an optional addition later if the ecosystem shifts.
- **Live references vs snapshots for published/exported Stories**: During authoring, Story Character references behave as live references to Character Pool entries. But when exporting/publishing a Story, should the Character data be snapshotted (frozen at publish time) or remain a live reference? This affects how shared Stories behave when the original Character is edited. Recommend deferring to after the modular architecture is implemented — the right answer may depend on how the community uses Story sharing.

---

## 9. Suggested repo structure

```
playime/
  backend/
    src/
      adapters/        # opencode.ts, ollama.ts, openaiCompatible.ts
      memory/           # summarizer.ts, recall.ts, stateExtractor.ts, worldInfo.ts
      models/           # character.ts, story.ts, session.ts, characterPool.ts (planned)
      cards/            # sillytavern.ts (V2/V3 import+export), pngText.ts (tEXt chunk read/write)
      routes/
    db/                 # sqlite schema + migrations
  frontend/
    src/
      components/chat/  # shared shell
      routes/character/
      routes/story/
  docs/
    setup-opencode.md
    setup-ollama.md
```

Start at Phase 0 → 1 → 2 in that order; don't build Story mode or RAG until Character mode's basic loop feels good — the memory/state architecture you validate there is exactly what Story mode reuses.
