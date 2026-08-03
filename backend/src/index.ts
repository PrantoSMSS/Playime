import cors from '@fastify/cors';
import Fastify from 'fastify';
import { getCharacterCard } from './models/character.js';
import { YEHWA_CARD } from './models/character.js';
import { characterRoutes } from './routes/character.js';
import { chatRoutes } from './routes/chat.js';
import { getDb } from './db.js';

const app = Fastify({ logger: true });

app.get('/health', async () => ({ status: 'ok' }));

// Local-first single-user tool: reflect any request origin (the SvelteKit dev
// server and any packaged frontend both need to reach us cross-origin; there's
// no auth to protect). Override with CORS_ORIGIN when that stops being true.
await app.register(cors, { origin: process.env.CORS_ORIGIN ?? true });

app.register(chatRoutes);
app.register(characterRoutes);

const PORT = Number(process.env.PORT ?? 3000);
const HOST = process.env.HOST ?? '127.0.0.1';

/** Seed the test card into the database if it doesn't exist yet. */
function seedTestCard(): void {
  const existing = getCharacterCard(YEHWA_CARD.id);
  if (existing) return;

  const db = getDb();
  const now = Date.now();
  const c = YEHWA_CARD;
  db.prepare(
    `INSERT INTO character_card (
      id, name, avatar, tagline, personality, speech_style, likes_and_dislikes,
      scenario, first_message, relationship_state, length_guidance,
      avatars, starting_scenarios, alternate_greetings, mes_example,
      system_prompt, post_history_instructions, creator, creator_notes,
      character_version, world_info, extensions, cover_image, creator_name,
      tags, description, prologue_preview, stats, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    c.id, c.name, c.avatar, c.tagline, c.personality, c.speech_style,
    c.likes_and_dislikes, c.scenario, c.first_message,
    JSON.stringify(c.relationship_state), c.length_guidance,
    JSON.stringify(c.avatars), JSON.stringify(c.starting_scenarios),
    JSON.stringify(c.alternate_greetings), c.mes_example, c.system_prompt,
    c.post_history_instructions, c.creator, c.creator_notes,
    c.character_version, JSON.stringify(c.world_info),
    JSON.stringify(c.extensions), c.cover_image, c.creator_name,
    JSON.stringify(c.tags), c.description, c.prologue_preview,
    JSON.stringify(c.stats), now, now,
  );
}

async function main(): Promise<void> {
  try {
    seedTestCard();
    await app.listen({ port: PORT, host: HOST });
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

// Clean shutdown so `tsx watch` restarts and CI harnesses can stop us gracefully.
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    void app.close().then(() => process.exit(0));
  });
}

void main();
