# Playime

![Local-first](https://img.shields.io/badge/local--first-yes-16a085)
![Backend](https://img.shields.io/badge/backend-Fastify%20%2B%20TypeScript-2f80ed)
![Frontend](https://img.shields.io/badge/frontend-SvelteKit-ff3e00)
![Storage](https://img.shields.io/badge/storage-SQLite-044a64)
![License](https://img.shields.io/badge/license-MIT-111111)

> A local-first stage for character chats and branching anime-style stories.

Playime is an open-source, local-first playable roleplay app: a place where a
character can remember what happened, a story can track its own quests, and the
language model is treated as a text engine rather than the source of truth.

No cloud account. No hosted subscription. Your sessions, cards, relationship
state, plot flags, and memories live in your own SQLite database.

Most roleplay frontends expose their power by exposing their complexity.
Playime is aiming for a different feeling: **a real game you can simply play**.
The memory engine, card format compatibility, prompt assembly, lore triggers,
and provider adapters should stay backstage until a creator deliberately opens
the toolbox.

```
Say a line. Spark a scene. Watch the story grow.
```

## The Pitch

Playime has two play styles that share one chat shell:

| Mode | What it feels like | What Playime tracks |
|---|---|---|
| Character | A 1:1 persona chat with a persistent relationship | Character card, scenario, speech style, rolling memory, affection/trust |
| Story | A DM-style branching simulation with multiple NPCs | Story card, locations, quest log, plot flags, per-NPC relationships |

The unusual bit is this: **Story Cards are first-class objects**, not just a
pile of lore text. A Story Card is meant to be browsable, replayable,
shareable, and backed by structured data: quests, scenes, NPCs, checkpoints,
and branching state.

The player-facing goal is simple: pick a character or story, press New Play,
and be inside the scene. No prompt engineering required. No lorebook tuning
required. No provider jargon required.

## What Makes It Different

**It plays like a game, and it's a toolbox when you want it**

The default experience is game-like: clear choices, readable state, remembered
relationships, quest progress, and a living chat interface — a general user can
run it from the get-go with nothing to configure. But Playime is not a thin toy.
Every layer is reachable: advanced card, lore, memory, model, and provider
controls sit behind the curtain for creators and power users who want them,
changeable without ever blocking the casual path. Both audiences use the same
app without friction.

**Memory is data, not vibes**

Playime does not depend on a provider's chat history to remember the world. It
stores sessions, messages, rolling summaries, relationship state, and future
story state locally, then assembles prompts explicitly on each turn.

**Cards are portable**

The roadmap targets Tavern V2/V3 import compatibility, including PNG cards with
embedded `chara` or `ccv3` chunks. Imported lorebooks become Playime World Info
entries instead of disappearing into a prompt blob.

**Lore has a deterministic layer**

Before long-term vector recall, Playime adds keyword-triggered World Info:
card-authored lore that appears when relevant, with token budgeting and
priority rules.

**The backend is swappable**

The current adapter talks to `opencode serve`, but the backend is built around
a provider-neutral LM adapter. Ollama, LM Studio, vLLM, and OpenAI-compatible
servers can slot in later without rewriting chat logic.

**Only final text reaches the player**

Provider reasoning and tool chatter stay backstage. The UI shows only what the
character or narrator actually says.

## In Good Company

Playime is not pretending this genre appeared out of nowhere. It is being built
in gratitude to the open-source and community projects that already proved what
people love about AI roleplay tools.

| Project | Strength worth celebrating | How it shines through Playime |
|---|---|---|
| SillyTavern | Deep customization, extensions, World Info/lorebooks, and the de facto Tavern card ecosystem | Playime adopts card-format compatibility and treats lorebooks as a real deterministic memory layer |
| Chub.ai | A huge public library of character cards and practical card-format conventions | Playime aims to make those cards import cleanly, including embedded lore, instead of asking users to start from zero |
| RisuAI | Cross-platform polish, approachable memory UX, regex tooling, and character asset workflows | Playime borrows the lesson that power features should feel friendly, local, and visible to the player |
| Agnai | Self-hostable roleplay infrastructure, multi-character/group-chat ideas, and clean provider support | Playime keeps the provider-flexible spirit while focusing v1 on a single local user and stronger structured state |
| TavernAI | The original card-shaped seed that much of the ecosystem grew from | Playime keeps respect for the simple character-card loop: persona, scenario, greeting, conversation |
| KoboldAI / kobold.cpp | Accessible local inference for people who want the model on their own machine | Playime's adapter boundary is designed so local engines can be first-class voices, not afterthoughts |

Those projects are the limelight around Playime: they show what already works,
what users care about, and where this project can add something of its own.
Playime's contribution is the database-backed state layer: relationships,
quests, plot flags, memories, and eventually shareable Story Cards that survive
beyond a single prompt window.

The other contribution is approachability. Playime preserves the depth that
power users love, while packaging the default experience like a game anyone can
start playing — one app, both audiences.

## Current Build Status

Playime is early, but the core loop is alive.

| Phase | Status | Notes |
|---|---:|---|
| Phase 0: Foundations | Done | Node/TypeScript/Fastify backend, adapter interface, opencode setup |
| Phase 1: Core chat loop | Done | SQLite sessions/messages, hardcoded Yehwa test card, streaming SSE |
| Phase 2: Character MVP | Next | Real card storage, import, rolling summary, relationship extraction |
| Phase 2.5: World Info | Planned | Deterministic lorebook layer |
| Phase 3+: RAG, Story Cards, export, packaging | Planned | See the roadmap |

The detailed build ledger lives in
[`docs/PLAYIME_CHECKLIST.md`](docs/PLAYIME_CHECKLIST.md).

## Quickstart

Prerequisites:

- Node 24+
- An LM server. The currently wired provider is
  [`opencode serve`](https://opencode.ai).

Start opencode:

```sh
opencode serve --port 4096
```

Start the backend:

```sh
cd backend
npm install
npm run dev
```

Start the frontend:

```sh
cd frontend
npm install
npm run dev
```

Then open:

- Frontend: `http://localhost:5173`
- Backend: `http://127.0.0.1:3000`

Say hello to Yehwa, the current test character, and watch the reply stream in.

## Configuration

The opencode adapter reads these environment variables:

| Variable | Default | Purpose |
|---|---|---|
| `OPENCODE_BASE_URL` | `http://127.0.0.1:4096` | opencode server URL |
| `OPENCODE_MODEL` | `deepseek-v4-flash-free` | main generation model |
| `OPENCODE_SMALL_MODEL` | unset | cheaper model for summaries/state extraction later |
| `OPENCODE_SERVER_PASSWORD` | unset | password if the opencode server is secured |
| `OPENCODE_DIRECTORY` | temp dir | neutral working directory for the opencode session |
| `PUBLIC_API_BASE_URL` | `http://127.0.0.1:3000` | frontend API target |

Full opencode setup notes are in
[`docs/setup-opencode.md`](docs/setup-opencode.md).

## Useful Commands

Backend:

```sh
cd backend
npm run typecheck
npm run smoke:opencode
npm run smoke:chat
npm run smoke:stream
npm run smoke:longchat
```

Frontend:

```sh
cd frontend
npm run check
npm run build
```

## Project Map

```text
backend/
  src/
    adapters/    LM provider boundary
    models/      SQLite-backed domain models
    prompts/     deterministic prompt renderers
    routes/      Fastify API routes
  db/            SQLite schema
  scripts/       smoke tests and local checks

frontend/
  src/lib/
    api/         backend client
    components/ shared chat UI
    data/        sample sessions
    state/       Svelte runes state

docs/
  PLAYIME_ROADMAP.md       design canon
  PLAYIME_CHECKLIST.md     phase-by-phase build ledger
  PLAYIME_PROMPT_SPEC.md   prompt assembly source of truth
```

## Design Canon

The most important rule in the project:

> Playime owns memory and state. The LLM backend only generates text.

Before changing architecture, prompt assembly, card shapes, or memory behavior,
read:

- [`docs/PLAYIME_ROADMAP.md`](docs/PLAYIME_ROADMAP.md)
- [`docs/PLAYIME_CHECKLIST.md`](docs/PLAYIME_CHECKLIST.md)
- [`docs/PLAYIME_PROMPT_SPEC.md`](docs/PLAYIME_PROMPT_SPEC.md)

When a design decision changes, record it in the checklist notes so the next
session has a clean trail to follow.

## License

MIT. Local as in yours, open as in hackable.
