/**
 * Persona CRUD routes — user identity management.
 *
 *   GET    /api/personas            list all personas
 *   GET    /api/personas/:id        get one persona
 *   POST   /api/personas            create a persona
 *   PATCH  /api/personas/:id        update a persona (partial patch)
 *   DELETE /api/personas/:id        delete a persona
 */
import type { FastifyInstance } from 'fastify';
import {
  createPersona,
  deletePersona,
  getPersona,
  listPersonas,
  updatePersona,
  DEFAULT_PERSONA,
  DEFAULT_PERSONA_ID,
} from '../models/persona.js';
import type { CreatePersonaInput, UpdatePersonaInput } from '../models/persona.js';
import { deleteEntityDir } from '../storage.js';

export async function personaRoutes(app: FastifyInstance): Promise<void> {
  // ── GET /api/personas ────────────────────────────────────────────────
  app.get('/api/personas', async (_request, reply) => {
    return reply.send([DEFAULT_PERSONA, ...listPersonas()]);
  });

  // ── GET /api/personas/:id ────────────────────────────────────────────
  app.get(
    '/api/personas/:id',
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
      if (id === DEFAULT_PERSONA_ID) {
        return reply.send(DEFAULT_PERSONA);
      }
      const persona = getPersona(id);
      if (!persona) {
        return reply.code(404).send({
          error: { code: 'persona_not_found', message: `Persona ${id} not found` },
        });
      }
      return reply.send(persona);
    },
  );

  // ── POST /api/personas ───────────────────────────────────────────────
  app.post(
    '/api/personas',
    {
      schema: {
        body: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            avatar: { type: 'string' },
            avatar_file: { type: ['string', 'null'] },
            description: { type: 'string' },
            appearance: { type: 'string' },
            personality: { type: 'string' },
            pronouns: { type: 'string' },
          },
          required: ['name'],
          additionalProperties: false,
        },
      },
    },
    async (request, reply) => {
      const body = request.body as CreatePersonaInput | undefined;
      if (!body) {
        return reply.code(400).send({
          error: { code: 'invalid_body', message: 'Request body is required' },
        });
      }
      try {
        const persona = createPersona(body);
        return reply.code(201).send(persona);
      } catch (err) {
        return reply.code(500).send({
          error: {
            code: 'create_failed',
            message: `Failed to create persona: ${err instanceof Error ? err.message : 'unknown error'}`,
          },
        });
      }
    },
  );

  // ── PATCH /api/personas/:id ──────────────────────────────────────────
  app.patch(
    '/api/personas/:id',
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
            avatar_file: { type: ['string', 'null'] },
            description: { type: 'string' },
            appearance: { type: 'string' },
            personality: { type: 'string' },
            pronouns: { type: 'string' },
          },
          additionalProperties: false,
        },
      },
    },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      if (id === DEFAULT_PERSONA_ID) {
        return reply.code(403).send({
          error: { code: 'default_persona_immutable', message: 'The default persona cannot be modified' },
        });
      }
      const body = request.body as UpdatePersonaInput | undefined;
      if (!body) {
        return reply.code(400).send({
          error: { code: 'invalid_body', message: 'Request body is required' },
        });
      }
      try {
        const persona = updatePersona(id, body);
        if (!persona) {
          return reply.code(404).send({
            error: { code: 'persona_not_found', message: `Persona ${id} not found` },
          });
        }
        return reply.send(persona);
      } catch (err) {
        return reply.code(500).send({
          error: {
            code: 'update_failed',
            message: `Failed to update persona: ${err instanceof Error ? err.message : 'unknown error'}`,
          },
        });
      }
    },
  );

  // ── DELETE /api/personas/:id ─────────────────────────────────────────
  app.delete(
    '/api/personas/:id',
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

      if (id === DEFAULT_PERSONA_ID) {
        return reply.code(403).send({
          error: { code: 'default_persona_immutable', message: 'The default persona cannot be deleted' },
        });
      }

      try {
        const deleted = deletePersona(id);
        if (!deleted) {
          return reply.code(404).send({
            error: { code: 'persona_not_found', message: `Persona ${id} not found` },
          });
        }
        deleteEntityDir('personas', id);
        return reply.code(204).send();
      } catch (err) {
        return reply.code(500).send({
          error: {
            code: 'delete_failed',
            message: `Failed to delete persona: ${err instanceof Error ? err.message : 'unknown error'}`,
          },
        });
      }
    },
  );
}
