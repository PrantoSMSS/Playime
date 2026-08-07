# Implementation Plan: AI-Generated Story Cards from Source Text

Repo: https://github.com/PrantoSMSS/Playime

## Concept
User pastes a story (finished or in-progress). AI reads it through a
multi-step pipeline and produces a **StoryCard** whose `quest_log` is the
plot's major turns as waypoints — not scripted scenes. Each quest is an
objective + a completion condition; how the player gets there, and what
actually happens along the way, stays fully improvised. The last waypoint
is a speculative ending, generated immediately even for unfinished stories,
clearly marked as AI-projected and freely editable/regeneratable — its
*position* in the chain is fixed, its *content* is not binding on play.

This builds directly on structure `docs/PLAYIME_ROADMAP.md` already
planned but never implemented — `StoryCard.quest_log: QuestEntry[]` and
`QuestEntry { id, title, objective, status, triggers_on }`. StoryCard
itself doesn't exist in code yet (Story-class sessions currently just
reuse `CharacterCard`), so this plan includes building that foundation,
not just the AI parsing on top of it.

## Decisions locked in
- **Extraction is a multi-step pipeline** (outline → cast/locations →
  quest chain), not a single AI pass — slower, but each stage gets a
  narrower, more reliable job.
- **A speculative ending is always proposed immediately**, even for
  clearly-unfinished input — tagged so the user knows it's a guess, and
  can edit or regenerate it before saving.

---

## Phase 1 — Data model: StoryCard + QuestEntry actually exist in code

- [ ] `backend/src/models/story.ts` (new, parallel to `models/character.ts`):
      `StoryCard` interface per the roadmap's §3 shape (`title, genre,
      premise, tone, locations, cast_mode, npcs, protagonist, plot_flags,
      quest_log, current_scene, chapter_log, world_info,
      starting_scenarios`) — start with the fields this feature actually
      needs (`title, genre, premise, tone, locations, npcs, quest_log,
      world_info`) and stub the rest (`plot_flags: {}`, `chapter_log: []`,
      `current_scene: null`) rather than blocking on the full roadmap
      shape.
- [ ] Extend `QuestEntry` beyond the roadmap's original sketch with two
      fields this feature needs:
      ```ts
      interface QuestEntry {
        id: string;
        title: string;
        objective: string;
        order: number;                          // position in the primary chain
        status: 'pending' | 'active' | 'completed' | 'failed';
        origin: 'source' | 'projected';          // literally in the text vs AI-extrapolated
        is_ending?: boolean;
        triggers_on?: { flag: string; op: 'eq' | 'gte' | 'lte'; value: unknown }[];
      }
      ```
- [ ] `backend/db/schema.sql`: new `story_card` table, same conventions as
      `character_card` (JSON columns as TEXT, `created_at`/`updated_at`).
      Add a migration file.
- [ ] CRUD in `models/story.ts` mirroring `models/character.ts`
      (`createStoryCard`, `getStoryCard`, `updateStoryCard`,
      `deleteStoryCard`, `listStoryCards`, `countSessionsForStoryCard`).
- [ ] `backend/src/routes/story.ts` — `GET/POST /api/stories`,
      `GET/PATCH/DELETE /api/stories/:id`, following `routes/character.ts`.
- [ ] **Session-side quest state mirrors the existing `relationship_state`
      pattern**: `StoryCard.quest_log` is the *template* (starting
      chain — first quest `active`, rest `pending`), and each session gets
      its own evolving copy (`session.quest_log_state`, JSON column,
      analogous to how `character_card.relationship_state` is the starting
      value and sessions track their own drift — check whether sessions
      currently snapshot relationship_state anywhere as precedent before
      inventing a new pattern here).
- [ ] `frontend/src/lib/api/chat.ts` — `ApiStoryCard`, `ApiQuestEntry`
      types + `listStories/getStory/createStory/updateStory/deleteStory`
      client functions, mirroring the character equivalents.

---

## Phase 2 — Extraction pipeline (backend, text-only — no vision needed here)

Runs on the existing roleplay `LmAdapter` (opencode) via `generate()` with
strict-JSON prompts, same pattern as other structured-extraction calls in
this codebase. No new adapter needed — this is pure text.

- [ ] `backend/src/story-extraction.ts` — orchestrates the pipeline as
      three sequential stages, each a separate prompt + JSON parse/validate
      step so a bad output at stage 2 doesn't have to be diagnosed inside a
      monolithic call:

  - [ ] **Stage 1 — Outline.** Input: full source text (chunked — see
        below). Output: `{ title, genre, tone, premise, locations: [{name,
        description}], beats: [{summary, order}] }` — a rough ordered list
        of major turns in plain language, no quest formatting yet. This is
        the scaffold later stages build on.
  - [ ] **Stage 2 — Cast.** Input: outline + source text. Output:
        `npcs: [{name, personality, speech_style, tagline}]` — one entry
        per named character who matters to the plot (heuristic: appears in
        more than one beat, or is explicitly named as significant).
  - [ ] **Stage 3 — Quest chain.** Input: outline's `beats` + cast. Output:
        the actual `quest_log` — one `QuestEntry` per beat (`title,
        objective, order, origin: 'source'`), plus **one additional
        appended entry** for the ending: `origin: 'projected',
        is_ending: true`, generated unconditionally per the "always
        propose" decision — the prompt explicitly asks for the most
        plausible resolution given everything extracted so far, framed as
        a proposal, not a certainty. Each quest also gets a best-effort
        `triggers_on` guess (simple flag conditions inferred from the beat
        description) — these are a starting point for Phase 4's runtime
        evaluation, not guaranteed accurate; the user can edit them in
        Phase 3's review step.

- [ ] **Chunking for long input.** If source text exceeds a safe token
      budget for Stage 1, split into sequential segments, summarize each
      segment individually, then feed the concatenated segment summaries
      into the outline prompt instead of raw text (map-reduce, not a
      single giant call). Needs a defined chunk size and overlap so beats
      spanning a chunk boundary aren't lost.
- [ ] `POST /api/stories/extract` — takes `{ text: string }`, runs all
      three stages, returns the assembled draft (`title, genre, premise,
      tone, locations, npcs, quest_log`) **without writing to the DB** —
      same "propose, don't commit" pattern as the persona autofill idea.
      Stream stage-progress over SSE (`{stage: 'outline' | 'cast' |
      'quests', status: 'started' | 'done'}`) so the UI can show real
      progress instead of one long spinner, given this is a multi-call
      pipeline that will take a while on longer stories.
- [ ] `POST /api/stories/extract/quest/:questId/regenerate` (or similar) —
      re-runs just Stage 3's prompt for a single quest given the existing
      outline/cast context, so the user can regenerate one weak entry
      without rerunning the whole pipeline.

---

## Phase 3 — Review & create UI (frontend)

- [ ] `frontend/src/lib/components/chat/StoryImportModal.svelte` (or
      extend the existing card-creation entry point) — a textarea for
      pasting the story, "Generate" button, stage-progress indicator
      driven by the SSE stream from Phase 2.
- [ ] `frontend/src/lib/components/chat/StoryDraftReview.svelte` — the
      editable review step:
  - [ ] Title/genre/premise/tone/locations as plain editable fields.
  - [ ] NPC list, editable like existing character forms.
  - [ ] Quest chain as an ordered, editable list — each row shows title,
        objective, and an **origin badge** (`Source` vs `AI-projected`)
        so the user can see at a glance what actually happened in the text
        vs what the AI guessed. The ending quest gets a distinct visual
        treatment (e.g. flagged "Proposed ending — not binding").
  - [ ] Per-quest actions: edit text inline, delete, reorder (drag or
        up/down), regenerate (calls the Phase 2 single-quest endpoint).
  - [ ] "Create Story Card" button — only now does anything hit the DB
        (`POST /api/stories`), building the `StoryCard` from the
        (possibly edited) draft.

---

## Phase 4 — Runtime quest progression (making the waypoints real during play)

- [ ] Reuse the existing structured-extraction bookkeeping call pattern
      (the same mechanism the roadmap describes for relationship-state
      deltas) — after each turn, a small-model call checks the session's
      current `active` quest's `objective`/`triggers_on` against recent
      turns + `plot_flags`, and:
  - [ ] Updates `plot_flags` based on what happened.
  - [ ] Flips the active quest to `completed` or `failed` if its
        condition is met, and promotes the next `pending` quest in
        `order` to `active`. This lives entirely in
        `session.quest_log_state` — the `StoryCard`'s own `quest_log`
        template is never mutated by play.
- [ ] Story-mode prompt assembly (wherever the Story system prompt gets
      built, per `docs/PLAYIME_PROMPT_SPEC.md`) includes the current
      active quest's `objective` as **directional guidance** — phrased to
      the model as "the story should be drifting toward..." not "the next
      scene must be...". No dialogue or scene content from the quest chain
      is ever injected verbatim.
- [ ] Reaching the `is_ending` quest's `completed` status surfaces a soft
      "the story has reached its ending" signal in the UI — not a hard
      stop. Since the ending is explicitly non-binding, the user can keep
      playing past it if they want; nothing forces the session closed.
- [ ] A quest going `failed` (player action made the original beat
      impossible) does not break the chain — the next quest still
      activates in order. The model isn't told to force a failed quest
      back on track.

---

## Phase 5 — Deferred / explicitly out of scope for v1
- [ ] Promoting extracted NPCs into full, reusable Character Pool entries
      (v1 keeps them as inline `NpcCard`s on the StoryCard, per the
      roadmap's "currently inline, planned to reference the Pool" note).
- [ ] Non-linear/branching quest chains (multiple valid next-quests instead
      of one strict `order` sequence).
- [ ] Multiple candidate endings generated up front instead of one.

---

## Manual verification checklist
- [ ] Pasting a short, clearly-finished story produces a quest chain
      where every non-ending entry is tagged `Source` and the final entry
      is tagged `AI-projected`/ending even though the text had a real
      ending (since the pipeline always appends its own projected ending
      per the locked-in decision — confirm this is the desired feel in
      practice, or whether a `Source`-tagged ending should suppress the
      auto-projected one; worth a real test since the current design
      generates a projected ending even when the source already has one).
- [ ] Pasting a long story exceeding one context window still produces a
      coherent outline (chunking didn't drop a major beat).
- [ ] Regenerating a single quest doesn't alter any other quest's text or
      order.
- [ ] Starting a session from a created Story Card, then taking actions
      that satisfy the first quest's `triggers_on`, flips it to
      `completed` and activates the next quest — verified via
      `session.quest_log_state`, not just prompt-level vibes.
- [ ] Deliberately steering play away from a quest's objective results in
      `failed`, not a stuck session — the chain still advances.
- [ ] Reaching the ending quest doesn't terminate the session.
