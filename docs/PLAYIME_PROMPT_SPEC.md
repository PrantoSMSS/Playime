# Playime — Prompt Specification

Source of truth for how Playime assembles every prompt sent to the LM backend. Implements the Character and Story classes; the memory/state sections map onto the 4-layer memory engine from `PLAYIME_ROADMAP.md` §4.

## 0. Principles

1. **Playime owns memory & state; the LLM only generates text.** No relationship stats, plot flags, or world state ever lives in the provider's session history. Every turn, Playime re-assembles the full prompt from its own SQLite data and discards the provider's bookkeeping of the exchange.
2. **Reproducibility.** Same card + state + memory ⇒ same prompt, byte-for-byte. No ad-hoc prose injected by the app layer. All sections are deterministic renderings of structured data.
3. **Final text only.** The model emits no reasoning, planning, or meta-commentary. The adapter additionally strips `session.next.reasoning.*` events defensively (opencode) so nothing but `session.next.text.*` reaches the UI. This is a hard product requirement — see decisions log.
4. **Small context.** A request carries working context (last ~12 turns) + rolling summary + top-k recalled memories — never the full raw history.
5. **One request ⇒ one in-character reply.** The prompt asks for a single response; all bookkeeping (summarization, state extraction) happens in separate background calls with a small/cheap model.

## 1. Request anatomy

A Character-mode request has two logical parts that map 1:1 onto the adapter interface `generate(messages, system, stream)`:

- **system** — the assembled system prompt (below).
- **messages** — recent turns verbatim (user/assistant alternating), oldest → newest, plus the current user turn.

For the **opencode** adapter, the whole thing (system + messages) is sent as one prompt message and the reply is read from the `/event` stream. For **OpenAI-compatible** providers it's a real `system` + `messages` array. Both produce the same prompt text — the assembly is provider-agnostic.

### Character system prompt (template)

```
You are {name}. {tagline}

## Personality
{personality}

## Speech style
{speech_style}

## Likes and dislikes
{likes_and_dislikes}

## Scenario
{scenario}

## Relationship state (authoritative, current)
- Affection: {affection}/100
- Trust: {trust}/100
- Flags: {flags}                          # comma-joined, or "none"
{relationship_prose}                      # see §2, deterministic

## Memory
### Long-term summary
{memory_summary}                          # from rolling summarizer

### Recalled moments
{recalled_memories}                       # top-k from RAG, or "none right now"

## Behavior rules
- Stay fully in character as {name}. Never mention being an AI, a model, a system, or "the user".
- Address the user directly, in character.
- Produce ONLY the final in-character response text. No reasoning, no planning, no
  narration of your thought process, no meta-commentary.
- Let the relationship state and memories shape your tone and attitude. Refer to shared
  past naturally — never by listing it.
- Keep responses {length_guidance}.       # e.g. "1–3 sentences unless the moment calls for more"
- Never re-describe your own card, scenario, or the scene's premise.
```

### Story (DM) system prompt (template)

```
You are the dungeon master of "{title}", a {genre} story.

## Premise
{premise}

## Tone
{tone}

## World
### Locations
{locations}                               # "· {name}: {description}" per line

### NPCs
{npcs}                                    # "· {name}: {personality / speech_style}" per line

## Protagonist
{protagonist_name} — Stats: {stats} · Inventory: {inventory}

## Current scene
- Location: {current_scene.location}
- Present: {current_scene.present_npcs}
- {current_scene.summary}

## Plot state
{plot_flags}                              # "· {key}: {value}" per line

## Story so far
{chapter_log}                             # "· {title}: {summary}" per line

## Narration rules
- You narrate the world, run every NPC, and react to the player's choices. Never break the fourth wall.
- Only the protagonist is the player's character; you control everyone else.
- Keep narration vivid and concise. Show, don't tell. Never reveal hidden plot state.
- End each reply with 2–4 distinct choices the player can take. When the player picks one,
  advance the scene accordingly — choices must measurably change what happens next.
- Produce ONLY the final story text (narration + choices). No reasoning, no planning,
  no game-mechanics chatter unless the player asks for it.
```

## 2. Deterministic rendering rules

- **relationship_prose** — a fixed band lookup from `(affection, trust)`, not an LLM call, so state stays diffable and reproducible:
  - both ≥ 70 → "Close and trusting"
  - both ≥ 40 → "Warm and comfortable"
  - affection ≥ 40, trust < 40 → "Affectionate but guarded"
  - affection < 40, trust ≥ 40 → "Respectful, still warming up"
  - else → "Distant and unproven"
  - Append recent flags as prose: `Recently: {flag1}, {flag2}.`
- **recalled_memories** — plain lines `· {text}`, top-k = 5, no importance stars, no timestamps unless the memory entry carries a useful one.
- **length_guidance** — a per-card setting with a sane default; never hardcoded per model.
- Every placeholder above resolves from a card + state object (Character: `CharacterCard` + `relationship_state`; Story: `WorldCard` + `current_scene`/`plot_flags`/`chapter_log`). No free-form text from the request may leak into the system prompt.

## 3. Message assembly (working context)

- Take the last **N = 12** turns (`user` + `assistant`), verbatim, oldest → newest, alternating roles, ending on the current user turn.
- **OOC turns** (flagged `ooc`) are **excluded** from this fiction sequence.
- When a rolling summary exists, turns older than the summary boundary are dropped from the prompt (kept in SQLite for export/reference).

### OOC handling

An OOC message is out-of-fiction direction, not dialogue. Assembly:

1. Do **not** append it to the fiction turns.
2. Emit it as a separate short `system` block placed **after** the character system prompt:
   ```
   (Out-of-character note for {name}: {ooc_text})
   ```
3. The character adjusts its next in-character reply accordingly but never acknowledges the note in-fiction, and the OOC block is never rendered as character dialogue.

## 4. Memory block (RAG injection)

- Embed the current user turn, pull top-k = 5 similar `MemoryEntry` rows, and inject them as a **distinct system message immediately above** the character/story system prompt:
  ```
  ## Relevant memories from earlier conversations
  · {text}
  ```
- Keep it short; these are recall hints, not a dump. Recency-vs-relevance weighting is tuned later (Phase 3).

## 5. Structured state extraction (post-turn, small model)

After each AI turn, a cheap JSON-mode call computes deltas applied deterministically by the state engine.

**System:**
```
You extract roleplay state deltas from a single in-character message.
Respond with ONLY a JSON object, no other text:
{"affection_delta": int, "trust_delta": int, "flags": [str], "memory_note": str}

Rules:
- affection_delta / trust_delta in -5..5; use 0 when the message leaves them unchanged.
- flags = new plot or relationship flags established by this message; [] if none.
- memory_note = one sentence noting a fact worth long-term memory, or "".
```

**User:** the character's latest in-character message.

→ State engine clamps results to 0..100, appends new flags, and queues `memory_note` for the memory layer. The model cannot edit state directly — it only proposes deltas.

## 6. Rolling summarization (every ~15–20 turns, small model)

**System:**
```
Summarize the recent roleplay turns in 3–5 sentences: what happened, key emotional beats,
promises made, and anything the character must remember long-term. Preserve concrete facts.
Do not add interpretation. Output only the summary text.
```

**User:** the turns since the last summary boundary.

→ Replaces `memory_summary`; the raw turns remain in SQLite. Story mode runs the same job chapter-scoped, feeding `chapter_log`.

## 7. Streaming

The main generation call streams. The adapter surfaces `session.next.text.*` content only; `session.next.reasoning.*` and tool/step bookkeeping events are dropped before the UI. This satisfies the "final text only" rule end-to-end even if a model emits reasoning internally.

## 8. Where this lands in the build

| Phase | Piece |
|---|---|
| 0 | This spec; adapter interface `generate(messages, system, stream)` |
| 1 | Character loop with a hardcoded card, using §1 + §3 only (no memory yet) |
| 2 | Card CRUD; rolling summary (§6), relationship state + extraction (§5), sidebar |
| 3 | RAG block (§4) |
| 4 | Story DM prompt (§1), chapter-scoped summary, plot state deltas |
