/**
 * Story card CRUD routes — Phase 4 foundation.
 *
 *   GET    /api/stories            list all story cards
 *   GET    /api/stories/:id        get one story card
 *   POST   /api/stories            create a story card
 *   PATCH  /api/stories/:id        update a story card (partial patch)
 *   DELETE /api/stories/:id        delete a story card
 */
import type { FastifyInstance } from 'fastify';
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
  UpdateStoryCardInput,
} from '../models/story.js';
import { deleteEntityDir } from '../storage.js';

export async function storyRoutes(app: FastifyInstance): Promise<void> {
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
}
