# Playime — Roadmap

An open-source, local-first alternative to OOC: The Playable Anime. Two experience "classes" — **Character** (1:1 companion chat) and **Story** (DM-style branching simulation) — sharing one chat shell, backed by local/self-hosted LLMs.

---

## 0. What you're actually rebuilding

OOC (by Wrtn) splits into two loops worth copying conceptually, not visually:

- **Character mode**: persona-driven 1:1 chat. A character card (personality, speech style, scenario, opening line) drives a single evolving relationship. "Deep memory" = the AI recalls shared history and the relationship visibly changes over time.
- **Story mode**: the AI acts as a dungeon master. It narrates a world, runs multiple NPCs, and reacts to player choices, generating branching plot rather than a flat back-and-forth.

Both need: a persistent **state** object beyond raw chat history, a **memory** system so 200+ turn conversations stay coherent, and a **creation tool** so users can define characters/worlds without writing code.

Trademark note: build the *mechanic*, not their brand — different name, logo, colors, and don't reuse their copy. "Playime" is fine as a name as long as you're not implying affiliation.

---

## 1. High-level architecture

```
┌─────────────────────────────┐
│           Frontend           │  Chat shell (shared by both classes)
│  Character view | Story view │  Sidebar: cards / stats / world state
└───────────────┬──────────────┘
                │ REST/WS
┌───────────────▼──────────────┐
│         Playime Backend       │
│  - Session orchestrator       │  turn loop, prompt assembly
│  - Memory engine               │  summarization + vector recall
│  - State engine                 │  relationship/world state JSON
│  - Persona/World store          │  SQLite (cards, sessions, memories)
└───────────────┬───────────────┘
                │ OpenAI-compatible calls
┌───────────────▼───────────────┐
│      LM Provider Adapter       │
│  opencode serve (default) ─┐   │
│  Ollama / LM Studio / vLLM ┼──►│ pick per-deployment
│  Cloud API key (optional)  ┘   │
└─────────────────────────────────┘
```

Key idea: **Playime owns memory/state; the LLM backend just generates text.** Don't try to make opencode's own session history double as your RPG state — it wasn't built for that (see §5).

---

## 2. Recommended stack

- **Backend**: Node.js + TypeScript, Fastify — decided. One language end-to-end with the SvelteKit frontend; use `better-sqlite3`/`node:sqlite` for storage and confirm `sqlite-vec` loads as a Node extension before depending on it for Phase 3.
- **Frontend**: SvelteKit or React + Vite. Svelte is lighter for a chat-heavy, animation-light UI like this.
- **DB**: SQLite (via `sqlite-vec` extension for embeddings) — zero-setup, single file, fits a local-first tool. Postgres+pgvector only if you plan multi-user/hosted later.
- **Embeddings**: a small local embedding model (e.g. via the same opencode/Ollama endpoint, or `sentence-transformers` in-process) for long-term memory recall.
- **Packaging**: Tauri (if you want a native desktop app around the web UI) or plain self-hosted web app + Docker Compose. Tauri gives you the "app-like" feel closest to the original.

---

## 3. Data model

### Shared primitives
- `Session` — id, class (`character`|`story`), created_at, provider/model config, message log ref.
- `Message` — role, content, timestamp, session_id, `visible` flag (for hidden system/state-extraction turns), `ooc` flag (out-of-character aside vs in-fiction).
- `MemoryEntry` — text, embedding, importance score, source turn ids, decay/last-recalled timestamp.

### Character class
```
CharacterCard {
  name, avatar, tagline
  personality, speech_style, likes/dislikes
  scenario (starting situation), first_message
  relationship_state: { affection: int, trust: int, flags: [str] }
  // the running key-event timeline is per-session (see §4 layer 2), not on the card
}
```

### Story class
```
WorldCard {
  title, genre, premise, tone
  locations: [ {name, description} ]
  npcs: [ CharacterCard-lite ]
  protagonist: { name, stats, inventory }
  plot_flags: { key: value }        // branching state
  current_scene: { location, present_npcs, summary }
  chapter_log: [ {title, summary} ] // compressed past chapters
}
```

Both are just JSON blobs with a schema — store as structured columns/JSON in SQLite so you can query and diff them, not just embed them in prompt text.

### Card-browser metadata (both card types)

Reference screenshots of the original show a card info modal with: cover image, creator credit, tag chips, short + long description, a "Prologue Preview" excerpt, engagement stats (replay/like/comment counts), last-updated date, and a "New Play" action. Worth modeling as shared fields rather than duplicating per card type:

```
CardMeta {
  cover_image, creator_name, tags: [str]
  description, prologue_preview
  stats: { replay_count, like_count, comment_count }  // local-only, no backend needed for v1
  last_updated
}
```

A card can also define **multiple** avatar options and **multiple** starting scenarios (the original lets you pick both at "New Play" time). Store that choice on the `Session`, not the card — the card stays reusable across sessions with different settings:

```
Session += { avatar_selection, starting_scenario_id }
```

---

## 4. Memory system (the hard part)

Four layers, matching how the original claims "deep memory":

1. **Working context** — last N raw turns, sent verbatim every request.
2. **Rolling summary** — every ~15–20 turns, fire a background LLM call that compresses history into key events and updates relationship/plot flags; raw turns drop from the prompt (kept in DB for reference/export). **Confirmed format** (reference screenshots show the original's actual "Memories" view): a human-readable, timestamped key-event timeline that gets appended to over time rather than rewritten —
   ```
   [Key Event Timeline]
   - 2023-10-27 10:00–11:00
     - Abyss Weiss and Emma met for the first time in their new shared home.
     - Emma expressed immediate disdain for the new family situation.
   - 2023-10-27 11:00–12:00
     - Abyss Weiss and Emma had an argument after Abyss Weiss entered without knocking.
   ```
   Store as structured rows (`timestamp_range`, `entries: [str]`) rather than one growing blob of prose — this doubles as both the mid-term memory fed back into prompts *and* the exact content rendered in the user-facing memory viewer, so it needs to read cleanly on its own.
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
- An explicit **OOC toggle** on the input box (this is literally the source app's namesake mechanic) — lets the user step outside the fiction to give the AI direction ("make her more jealous," "skip ahead a day") without that text being treated as in-world dialogue.
- Streaming responses token-by-token (opencode/most local servers support SSE streaming — use it, it's the single biggest perceived-speed win).
- Lightweight creation forms for Character/World cards — plain forms are enough for v1; no need for a visual node editor early on.
- **In-session right sidebar** (reference screenshots: a persistent panel, not a popover menu): card avatar/name header, an **Image Gallery** of images generated this session (feeds off the Phase 7 Situation Image hook), then a **Chat Settings** group — `Play Guide`, `Avatars` (switch mid-session), `Memories` (opens a read-only viewer onto the rolling-summary timeline — no new backend, just a window onto Phase 2's data), `Situation Image` toggle, `Receive Messages` toggle (character sends unprompted/idle messages — proactive messaging, defer to Phase 7). Skip the credit/currency balance section entirely; it's monetization plumbing for a hosted product and irrelevant to a local-first tool.

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
- Rolling summary (layer 2) so long chats don't blow the context window.
- Relationship state object + structured-extraction call updating it.
- Sidebar showing character card + relationship meter.

**Phase 3 — Long-term memory (RAG)**
- Embedding pipeline, vector store (sqlite-vec/chroma).
- Recall injection into prompts; test coherence over 100+ turn sessions.

**Phase 4 — Story class MVP**
- World/scene/protagonist schema, DM-style system prompt design (multi-NPC narration, choice generation).
- Plot flags + chapter summarization (reuse the memory engine from Phase 2/3, generalized).
- Story-specific sidebar (scene state, stats, chapter log).

**Phase 5 — Shared UI polish**
- Unify Character/Story into one chat shell with a mode switch.
- OOC toggle, message editing/regeneration, branching (save a checkpoint, try an alternate choice).

**Phase 6 — Creation & sharing tools**
- Import/export cards and worlds as JSON files (community sharing without needing a backend service).
- Optional local gallery of saved characters/stories.

**Phase 7 — Nice-to-haves**
- TTS for character voice, optional image generation for scenes/portraits (hook into any local SD/ComfyUI endpoint via the same adapter pattern).
- Multi-provider per-session override (pick model per character).

**Phase 8 — Packaging**
- Docker Compose for self-hosting; optionally a Tauri build for a native app feel.
- Docs: setup guide for pairing with Ollama/LM Studio/opencode.

---

## 8. Open questions worth deciding early

- Single-user local tool vs. something you'd eventually self-host for a few friends? This affects whether you need auth/multi-tenancy at all (recommend: skip it for v1, single local user, add later if needed).
- How aggressive should structured-state extraction be — every turn (more accurate, more LLM calls) vs. every few turns (cheaper, slightly laggy state)? Start with "every turn" using a small/cheap model, tune later.
- Content moderation stance — you're building this yourself, so decide your own policy up front rather than inheriting one implicitly from whatever model you default to.

---

## 9. Suggested repo structure

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
      components/chat/  # shared shell
      routes/character/
      routes/story/
  docs/
    setup-opencode.md
    setup-ollama.md
```

Start at Phase 0 → 1 → 2 in that order; don't build Story mode or RAG until Character mode's basic loop feels good — the memory/state architecture you validate there is exactly what Story mode reuses.
