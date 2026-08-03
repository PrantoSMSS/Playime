# Playime — Backend

Node.js + TypeScript + Fastify. See `../AGENTS.md` for the architecture and build order.

## Directory map

```
src/
  adapters/   LM provider adapters (opencode, Ollama, OpenAI-compatible) behind one shared interface
  memory/     summarizer, recall (RAG), state extractor
  models/     domain models: character, story, session
  routes/     Fastify route handlers
db/           SQLite schema + migrations
```

This is a skeleton — directories are populated as their phases land (Phase 0 → 1 → 2, per the build order in `AGENTS.md`).
