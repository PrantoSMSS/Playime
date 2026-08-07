/**
 * Story card CRUD routes — Phase 4 foundation + Phase 2 extraction.
 *
 *   GET    /api/stories                      list all story cards
 *   GET    /api/stories/:id                  get one story card
 *   POST   /api/stories                      create a story card
 *   PATCH  /api/stories/:id                  update a story card (partial patch)
 *   DELETE /api/stories/:id                  delete a story card
 *   POST   /api/stories/extract              AI extraction pipeline (SSE)
 *   POST   /api/stories/extract/quest/:questId/regenerate  single quest regeneration
 */
import { Readable } from 'node:stream';
import type { FastifyInstance } from 'fastify';
import { createAdapter } from '../adapters/factory.js';
import { LmError } from '../adapters/types.js';
import {
  createStoryCard,
  deleteStoryCard,
  getStoryCard,
  listStoryCards,
  updateStoryCard,
  countSessionsForStoryCard,
} from '../models/story.js';
import type {
  CreateStoryCardInput,
  QuestEntry,
  UpdateStoryCardInput,
} from '../models/story.js';
import { deleteEntityDir } from '../storage.js';
import { extractStoryDraft, regenerateQuest } from '../story-extraction.js';
import type { ExtractionDraft, OutlineResult, CastResult } from '../story-extraction.js';

export async function storyRoutes(app: FastifyInstance): Promise<void> {
  // One shared adapter for extraction calls; disposed on shutdown.
  const adapter = createAdapter({ id: 'opencode' });
  app.addHook('onClose', async () => {
    await adapter.dispose();
  });
  // ── GET /api/stories ─────────────────────────────────────────────────
  app.get('/api/stories', async (_request, reply) => {
    return reply.send(listStoryCards());
  });

  // ── GET /api/stories/:id ─────────────────────────────────────────────
  app.get(
    '/api/stories/:id',
    {
      schema: {
        params: {
          type: 'object',
          properties: { id: { type: 'string' } },
          required: ['id'],
        },
      },
    },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const story = getStoryCard(id);
      if (!story) {
        return reply.code(404).send({
          error: { code: 'story_not_found', message: `Story ${id} not found` },
        });
      }
      return reply.send(story);
    },
  );

  // ── POST /api/stories ────────────────────────────────────────────────
  app.post(
    '/api/stories',
    {
      schema: {
        body: {
          type: 'object',
          properties: {
            title: { type: 'string' },
            genre: { type: 'string' },
            premise: { type: 'string' },
            tone: { type: 'string' },
            description: { type: ['string', 'null'] },
            cover_image: { type: ['string', 'null'] },
            locations: { type: 'array', items: { type: 'string' } },
            world_info: { type: 'array' },
            cast_mode: { type: 'string', enum: ['fixed', 'selectable', 'open'] },
            character_references: { type: 'array' },
            npcs: { type: 'array' },
            quest_log: { type: 'array' },
            starting_scenarios: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  id: { type: 'string' },
                  name: { type: 'string' },
                  description: { type: 'string' },
                  scenario: { type: 'string' },
                  first_message: { type: 'string' },
                },
                required: ['id', 'name', 'scenario', 'first_message'],
                additionalProperties: false,
              },
            },
            plot_flags: { type: 'object' },
            current_scene: { type: ['string', 'null'] },
            chapter_log: { type: 'array' },
            creator_name: { type: 'string' },
            tags: { type: 'array', items: { type: 'string' } },
            stats: { type: 'object' },
            favorite: { type: 'number' },
          },
          required: ['title'],
          additionalProperties: false,
        },
      },
    },
    async (request, reply) => {
      const body = request.body as CreateStoryCardInput | undefined;
      if (!body) {
        return reply.code(400).send({
          error: { code: 'invalid_body', message: 'Request body is required' },
        });
      }
      const story = createStoryCard(body);
      return reply.code(201).send(story);
    },
  );

  // ── PATCH /api/stories/:id ───────────────────────────────────────────
  app.patch(
    '/api/stories/:id',
    {
      schema: {
        params: {
          type: 'object',
          properties: { id: { type: 'string' } },
          required: ['id'],
        },
        body: {
          type: 'object',
          properties: {
            title: { type: 'string' },
            genre: { type: 'string' },
            premise: { type: 'string' },
            tone: { type: 'string' },
            description: { type: ['string', 'null'] },
            cover_image: { type: ['string', 'null'] },
            locations: { type: 'array', items: { type: 'string' } },
            world_info: { type: 'array' },
            cast_mode: { type: 'string', enum: ['fixed', 'selectable', 'open'] },
            character_references: { type: 'array' },
            npcs: { type: 'array' },
            quest_log: { type: 'array' },
            starting_scenarios: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  id: { type: 'string' },
                  name: { type: 'string' },
                  description: { type: 'string' },
                  scenario: { type: 'string' },
                  first_message: { type: 'string' },
                },
                required: ['id', 'name', 'scenario', 'first_message'],
                additionalProperties: false,
              },
            },
            plot_flags: { type: 'object' },
            current_scene: { type: ['string', 'null'] },
            chapter_log: { type: 'array' },
            creator_name: { type: ['string', 'null'] },
            tags: { type: 'array', items: { type: 'string' } },
            stats: { type: 'object' },
            favorite: { type: 'number' },
          },
          additionalProperties: false,
        },
      },
    },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const body = request.body as UpdateStoryCardInput | undefined;
      if (!body) {
        return reply.code(400).send({
          error: { code: 'invalid_body', message: 'Request body is required' },
        });
      }
      const story = updateStoryCard(id, body);
      if (!story) {
        return reply.code(404).send({
          error: { code: 'story_not_found', message: `Story ${id} not found` },
        });
      }
      return reply.send(story);
    },
  );

  // ── DELETE /api/stories/:id ──────────────────────────────────────────
  app.delete(
    '/api/stories/:id',
    {
      schema: {
        params: {
          type: 'object',
          properties: { id: { type: 'string' } },
          required: ['id'],
        },
      },
    },
    async (request, reply) => {
      const { id } = request.params as { id: string };

      // Pre-check: sessions referencing this story block deletion
      const sessionCount = countSessionsForStoryCard(id);
      if (sessionCount > 0) {
        return reply.code(409).send({
          error: {
            code: 'has_active_sessions',
            message: `Cannot delete — ${sessionCount} conversation(s) still reference this story. Delete the conversations first.`,
          },
        });
      }

      const deleted = deleteStoryCard(id);
      if (!deleted) {
        return reply.code(404).send({
          error: { code: 'story_not_found', message: `Story ${id} not found` },
        });
      }
      deleteEntityDir('stories', id);
      return reply.code(204).send();
    },
  );

  // ── POST /api/stories/extract ──────────────────────────────────────
  // AI extraction pipeline — runs 3 stages and streams progress via SSE.
  // Returns the assembled draft WITHOUT writing to the DB ("propose, don't commit").
  //
  // SSE events:
  //   event: stage   data: {"stage":"outline","status":"started"}
  //   event: stage   data: {"stage":"outline","status":"done"}
  //   event: stage   data: {"stage":"cast","status":"started"}
  //   ...
  //   event: done    data: {"draft": {...}}
  //   event: error   data: {"code":"...","message":"..."}
  app.post(
    '/api/stories/extract',
    {
      schema: {
        body: {
          type: 'object',
          properties: {
            text: { type: 'string', minLength: 1 },
          },
          required: ['text'],
          additionalProperties: false,
        },
      },
    },
    async (request, reply) => {
      const body = request.body as { text?: string } | undefined;
      if (!body?.text) {
        return reply.code(400).send({
          error: { code: 'invalid_body', message: 'text field is required' },
        });
      }

      // Queue-based pattern: the callback pushes events, the generator yields them.
      const queue: string[] = [];
      let resolve: (() => void) | null = null;
      let done = false;

      function push(event: string, data: unknown): void {
        queue.push(sseFrame(event, data));
        resolve?.();
      }

      function wait(): Promise<void> {
        return new Promise<void>((r) => {
          if (queue.length > 0 || done) { r(); return; }
          resolve = r;
        });
      }

      // Client disconnect cancels the extraction pipeline.
      const ctrl = new AbortController();
      reply.raw.once('close', () => {
        if (!reply.raw.writableEnded) {
          done = true;
          ctrl.abort();
          resolve?.();
        }
      });

      // Run the extraction pipeline in the background, pushing progress events.
      const pipeline = extractStoryDraft(
        adapter,
        body.text,
        (event) => push('stage', event),
      ).then(
        (draft) => { push('done', { draft }); done = true; resolve?.(); },
        (err) => { push('error', streamError(err)); done = true; resolve?.(); },
      );

      const frames = async function* (): AsyncGenerator<string> {
        while (!done || queue.length > 0) {
          while (queue.length > 0) {
            yield queue.shift()!;
          }
          if (!done) await wait();
        }
        // Ensure pipeline errors are awaited
        await pipeline;
      };

      return reply
        .header('Cache-Control', 'no-cache, no-transform')
        .header('X-Accel-Buffering', 'no')
        .type('text/event-stream; charset=utf-8')
        .send(Readable.from(frames()));
    },
  );

  // ── POST /api/stories/extract/quest/:questId/regenerate ────────────
  // Regenerate a single quest entry without rerunning the full pipeline.
  app.post(
    '/api/stories/extract/quest/:questId/regenerate',
    {
      schema: {
        params: {
          type: 'object',
          properties: {
            questId: { type: 'string' },
          },
          required: ['questId'],
        },
        body: {
          type: 'object',
          properties: {
            quest_log: { type: 'array' },
            outline: { type: 'object' },
            cast: { type: 'object' },
          },
          required: ['quest_log', 'outline', 'cast'],
          additionalProperties: false,
        },
      },
    },
    async (request, reply) => {
      const { questId } = request.params as { questId: string };
      const body = request.body as {
        quest_log: QuestEntry[];
        outline: OutlineResult;
        cast: CastResult;
      } | undefined;

      if (!body) {
        return reply.code(400).send({
          error: { code: 'invalid_body', message: 'Request body is required' },
        });
      }

      try {
        const regenerated = await regenerateQuest(
          adapter,
          questId,
          body.quest_log,
          body.outline,
          body.cast,
        );
        return reply.send({ quest: regenerated });
      } catch (err) {
        if (err instanceof Error && err.message.includes('not found')) {
          return reply.code(404).send({
            error: { code: 'quest_not_found', message: err.message },
          });
        }
        app.log.error({ err }, 'quest regeneration failed');
        return reply.code(502).send({
          error: { code: 'provider', message: 'Quest regeneration failed' },
        });
      }
    },
  );
}

/** Encode one SSE event frame (`event:`/`data:` lines, blank-line terminated). */
function sseFrame(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

/** Normalize a mid-stream failure into a stable {code, message} envelope. */
function streamError(err: unknown): { code: string; message: string } {
  if (err instanceof LmError) {
    return { code: err.code, message: err.message };
  }
  if (err instanceof Error) {
    return { code: 'internal', message: err.message };
  }
  return { code: 'internal', message: 'Internal server error' };
}
