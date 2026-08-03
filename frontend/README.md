# Playime — Frontend

SvelteKit + Vite (Svelte 5, runes mode). See `../AGENTS.md` for the
architecture and build order.

## Directory map

```
src/
  lib/
    components/chat/   shared chat shell used by both Character and Story classes
    data/              sample/seed data (swapped for real API calls in Phase 1 wiring)
    state/             shared runes state (chat.svelte.ts)
    messageParse.ts    narration / dialogue / action splitting for message bubbles
    types/             shared chat types
  routes/character/    Character class views
  routes/story/        Story class views
```

## Design tokens

The entire palette, spacing, and typography scale lives in `src/app.css` as
CSS custom properties on `:root` (deep teal/emerald dark theme). Components
reference `--space-*` / `--font-*` / `--color` variables only — no hardcoded
hex values — so the visual identity can be swapped in one file without
touching layout code.

## Developing

```sh
npm install
npm run dev        # dev server
npm run check      # svelte-check (type + a11y)
npm run build      # production build
```

## Layout structure

- `+layout.svelte` — app shell: `NavRail` (persistent) + page slot.
- `+page.svelte` — chat column: `ChatTopBar` + `MessageList` + `ChatInput`.

The right session sidebar (image gallery, settings, toggles) is a later pass
and is not built yet.
