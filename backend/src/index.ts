import cors from '@fastify/cors';
import multipart from '@fastify/multipart';
import Fastify from 'fastify';
import { spawn, execSync, type ChildProcess } from 'node:child_process';
import { getCharacterCard } from './models/character.js';
import { YEHWA_CARD, MIKO_CARD } from './models/character.js';
import { characterRoutes } from './routes/character.js';
import { chatRoutes } from './routes/chat.js';
import { personaRoutes } from './routes/persona.js';
import filesRoutes from './routes/files.js';
import { getDb, reserveExistingIdSequences } from './db.js';
import { initializeStorage } from './storage.js';

const app = Fastify({ logger: true });

app.get('/health', async () => ({ status: 'ok' }));

// Local-first single-user tool: reflect any request origin (the SvelteKit dev
// server and any packaged frontend both need to reach us cross-origin; there's
// no auth to protect). Override with CORS_ORIGIN when that stops being true.
await app.register(cors, {
  origin: process.env.CORS_ORIGIN ?? true,
  methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
});

// Multipart form data — needed for file uploads.
// Enforce a 10 MB limit so oversized payloads are rejected before they hit
// route handlers (the routes also check, but busboy streams the full body
// by default, making mid-stream size checks unreliable).
await app.register(multipart, {
  limits: { fileSize: 10 * 1024 * 1024 },
});

app.register(chatRoutes);
app.register(characterRoutes);
app.register(personaRoutes);

// Entity file serving (avatars, covers, etc.)
app.register(filesRoutes);

const PORT = Number(process.env.PORT ?? 3000);
const HOST = process.env.HOST ?? '127.0.0.1';
const OPENCODE_PORT = Number(process.env.OPENCODE_PORT ?? 4096);

/**
 * Check if opencode is installed and accessible.
 * Returns true if the command exists, false otherwise.
 */
function isOpencodeInstalled(): boolean {
  try {
    // Use 'where' on Windows, 'which' on Unix-like systems
    const cmd = process.platform === 'win32' ? 'where opencode' : 'which opencode';
    execSync(cmd, { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

/** Manage the child opencode process so we can kill it on shutdown. */
let opencodeProcess: ChildProcess | undefined;

/**
 * Spawn `opencode serve` if it isn't already running on the expected port.
 * Returns once the server is reachable (or after a timeout).
 */
async function ensureOpencode(): Promise<void> {
  // Quick check — is something already listening?
  try {
    const res = await fetch(`http://127.0.0.1:${OPENCODE_PORT}/api/session`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ location: { directory: '/tmp' } }),
      signal: AbortSignal.timeout(3_000),
    });
    if (res.ok || res.status < 500) {
      console.log(`opencode already running on port ${OPENCODE_PORT}`);
      return;
    }
  } catch {
    // Not running — spawn it.
  }

  // Check if opencode is installed before trying to spawn it
  const installed = isOpencodeInstalled();
  if (!installed) {
    const errorMsg = [
      'opencode is not installed or not in PATH.',
      '',
      'Please install it with:',
      '  npm install -g opencode-ai',
      '',
      'Then verify with:',
      '  opencode --version',
      '',
      'For more information, see: docs/setup-opencode.md',
    ].join('\n');
    throw new Error(errorMsg);
  }

  console.log(`Starting opencode serve on port ${OPENCODE_PORT}…`);
  opencodeProcess = spawn('opencode', ['serve', '--port', String(OPENCODE_PORT)], {
    stdio: 'ignore',
    detached: false,
    shell: true,  // Required on Windows where opencode is a shell script wrapper
  });
  opencodeProcess.on('error', (err) => {
    console.error('Failed to start opencode:', err.message);
  });
  opencodeProcess.on('exit', (code) => {
    if (code !== null && code !== 0) {
      console.error(`opencode exited with code ${code}`);
    }
    opencodeProcess = undefined;
  });

  // Poll until ready (max 15 seconds).
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`http://127.0.0.1:${OPENCODE_PORT}/api/session`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ location: { directory: '/tmp' } }),
        signal: AbortSignal.timeout(2_000),
      });
      if (res.ok || res.status < 500) {
        console.log('opencode is ready');
        return;
      }
    } catch {
      // Not yet — wait and retry.
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  console.warn('opencode did not become ready within 15s — chat may not work');
}

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
      avatars, starting_scenarios, default_persona, alternate_greetings, mes_example,
      system_prompt, post_history_instructions, creator, creator_notes,
      character_version, world_info, extensions, avatar_file, cover_file,
      cover_image, creator_name, tags, description, prologue_preview, stats, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    c.id, c.name, c.avatar, c.tagline, c.personality, c.speech_style,
    c.likes_and_dislikes, c.scenario, c.first_message,
    JSON.stringify(c.relationship_state), c.length_guidance,
    JSON.stringify(c.avatars), JSON.stringify(c.starting_scenarios),
    c.default_persona ? JSON.stringify(c.default_persona) : null,
    JSON.stringify(c.alternate_greetings), c.mes_example, c.system_prompt,
    c.post_history_instructions, c.creator, c.creator_notes,
    c.character_version, JSON.stringify(c.world_info),
    JSON.stringify(c.extensions), c.avatar_file, c.cover_file,
    c.cover_image, c.creator_name,
    JSON.stringify(c.tags), c.description, c.prologue_preview,
    JSON.stringify(c.stats), now, now,
  );

  // Also seed Miko card if it doesn't exist
  const mikoExisting = getCharacterCard(MIKO_CARD.id);
  if (!mikoExisting) {
    const m = MIKO_CARD;
    db.prepare(
      `INSERT INTO character_card (
        id, name, avatar, tagline, personality, speech_style, likes_and_dislikes,
        scenario, first_message, relationship_state, length_guidance,
        avatars, starting_scenarios, default_persona, alternate_greetings, mes_example,
        system_prompt, post_history_instructions, creator, creator_notes,
        character_version, world_info, extensions, avatar_file, cover_file,
        cover_image, creator_name, tags, description, prologue_preview, stats, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      m.id, m.name, m.avatar, m.tagline, m.personality, m.speech_style,
      m.likes_and_dislikes, m.scenario, m.first_message,
      JSON.stringify(m.relationship_state), m.length_guidance,
      JSON.stringify(m.avatars), JSON.stringify(m.starting_scenarios),
      m.default_persona ? JSON.stringify(m.default_persona) : null,
      JSON.stringify(m.alternate_greetings), m.mes_example, m.system_prompt,
      m.post_history_instructions, m.creator, m.creator_notes,
      m.character_version, JSON.stringify(m.world_info),
      JSON.stringify(m.extensions), m.avatar_file, m.cover_file,
      m.cover_image, m.creator_name,
      JSON.stringify(m.tags), m.description, m.prologue_preview,
      JSON.stringify(m.stats), now, now,
    );
  }
}

async function main(): Promise<void> {
  try {
    initializeStorage();
    seedTestCard();
    reserveExistingIdSequences(getDb());
    await ensureOpencode();
    await app.listen({ port: PORT, host: HOST });
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

// Clean shutdown so `tsx watch` restarts and CI harnesses can stop us gracefully.
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    if (opencodeProcess) {
      opencodeProcess.kill('SIGTERM');
      opencodeProcess = undefined;
    }
    void app.close().then(() => process.exit(0));
  });
}

void main();
