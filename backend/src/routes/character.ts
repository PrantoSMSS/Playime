/**
 * Character card CRUD routes — Phase 2 foundation.
 *
 *   GET    /api/cards            list all cards
 *   GET    /api/cards/:id        get one card
 *   POST   /api/cards            create a card
 *   PATCH  /api/cards/:id        update a card (partial patch)
 *   DELETE /api/cards/:id        delete a card
 */
import type { FastifyInstance, FastifyReply } from 'fastify';
import {
  createCharacterCard,
  deleteCharacterCard,
  getCharacterCard,
  listCharacterCards,
  updateCharacterCard,
} from '../models/character.js';
import type {
  CreateCharacterCardInput,
  UpdateCharacterCardInput,
} from '../models/character.js';

export async function characterRoutes(app: FastifyInstance): Promise<void> {
  // ── GET /api/cards ───────────────────────────────────────────────────
  app.get('/api/cards', async (_request, reply) => {
    return reply.send(listCharacterCards());
  });

  // ── GET /api/cards/:id ───────────────────────────────────────────────
  app.get(
    '/api/cards/:id',
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
      const card = getCharacterCard(id);
      if (!card) {
        return reply.code(404).send({
          error: { code: 'card_not_found', message: `Card ${id} not found` },
        });
      }
      return reply.send(card);
    },
  );

  // ── POST /api/cards ──────────────────────────────────────────────────
  app.post(
    '/api/cards',
    {
      schema: {
        body: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            avatar: { type: 'string' },
            tagline: { type: 'string' },
            personality: { type: 'string' },
            speech_style: { type: 'string' },
            likes_and_dislikes: { type: 'string' },
            scenario: { type: 'string' },
            first_message: { type: 'string' },
            relationship_state: { type: 'object' },
            length_guidance: { type: 'string' },
            alternate_greetings: { type: 'array', items: { type: 'string' } },
            mes_example: { type: 'string' },
            system_prompt: { type: 'string' },
            post_history_instructions: { type: 'string' },
            creator: { type: 'string' },
            creator_notes: { type: 'string' },
            character_version: { type: 'string' },
            world_info: { type: 'array' },
            extensions: { type: 'object' },
            cover_image: { type: 'string' },
            creator_name: { type: 'string' },
            tags: { type: 'array', items: { type: 'string' } },
            description: { type: 'string' },
            prologue_preview: { type: 'string' },
            stats: { type: 'object' },
          },
          required: ['name'],
          additionalProperties: false,
        },
      },
    },
    async (request, reply) => {
      const body = request.body as CreateCharacterCardInput | undefined;
      if (!body) {
        return reply.code(400).send({
          error: { code: 'invalid_body', message: 'Request body is required' },
        });
      }
      const card = createCharacterCard(body);
      return reply.code(201).send(card);
    },
  );

  // ── PATCH /api/cards/:id ─────────────────────────────────────────────
  app.patch(
    '/api/cards/:id',
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
            name: { type: 'string' },
            avatar: { type: ['string', 'null'] },
            tagline: { type: 'string' },
            personality: { type: 'string' },
            speech_style: { type: 'string' },
            likes_and_dislikes: { type: 'string' },
            scenario: { type: 'string' },
            first_message: { type: ['string', 'null'] },
            relationship_state: { type: 'object' },
            length_guidance: { type: ['string', 'null'] },
            alternate_greetings: { type: 'array', items: { type: 'string' } },
            mes_example: { type: ['string', 'null'] },
            system_prompt: { type: ['string', 'null'] },
            post_history_instructions: { type: ['string', 'null'] },
            creator: { type: ['string', 'null'] },
            creator_notes: { type: ['string', 'null'] },
            character_version: { type: ['string', 'null'] },
            world_info: { type: 'array' },
            extensions: { type: 'object' },
            cover_image: { type: ['string', 'null'] },
            creator_name: { type: ['string', 'null'] },
            tags: { type: 'array', items: { type: 'string' } },
            description: { type: ['string', 'null'] },
            prologue_preview: { type: ['string', 'null'] },
            stats: { type: 'object' },
          },
          additionalProperties: false,
        },
      },
    },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const body = request.body as UpdateCharacterCardInput | undefined;
      if (!body) {
        return reply.code(400).send({
          error: { code: 'invalid_body', message: 'Request body is required' },
        });
      }
      const card = updateCharacterCard(id, body);
      if (!card) {
        return reply.code(404).send({
          error: { code: 'card_not_found', message: `Card ${id} not found` },
        });
      }
      return reply.send(card);
    },
  );

  // ── DELETE /api/cards/:id ────────────────────────────────────────────
  app.delete(
    '/api/cards/:id',
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
      const deleted = deleteCharacterCard(id);
      if (!deleted) {
        return reply.code(404).send({
          error: { code: 'card_not_found', message: `Card ${id} not found` },
        });
      }
      return reply.code(204).send();
    },
  );
}
