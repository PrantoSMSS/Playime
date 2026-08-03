import cors from '@fastify/cors';
import Fastify from 'fastify';
import { chatRoutes } from './routes/chat.js';

const app = Fastify({ logger: true });

app.get('/health', async () => ({ status: 'ok' }));

// Local-first single-user tool: reflect any request origin (the SvelteKit dev
// server and any packaged frontend both need to reach us cross-origin; there's
// no auth to protect). Override with CORS_ORIGIN when that stops being true.
await app.register(cors, { origin: process.env.CORS_ORIGIN ?? true });

app.register(chatRoutes);

const PORT = Number(process.env.PORT ?? 3000);
const HOST = process.env.HOST ?? '127.0.0.1';

async function main(): Promise<void> {
  try {
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
