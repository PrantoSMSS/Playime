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
} from '../models/persona.js';
import type { CreatePersonaInput, UpdatePersonaInput } from '../models/persona.js';

export async function personaRoutes(app: FastifyInstance): Promise<void> {
  // ── GET /api/personas ────────────────────────────────────────────────
  app.get('/api/personas', async (_request, reply) => {
    return reply.send(listPersonas());
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
      const persona = createPersona(body);
      return reply.code(201).send(persona);
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
      const body = request.body as UpdatePersonaInput | undefined;
      if (!body) {
        return reply.code(400).send({
          error: { code: 'invalid_body', message: 'Request body is required' },
        });
      }
      const persona = updatePersona(id, body);
      if (!persona) {
        return reply.code(404).send({
          error: { code: 'persona_not_found', message: `Persona ${id} not found` },
        });
      }
      return reply.send(persona);
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
      const deleted = deletePersona(id);
      if (!deleted) {
        return reply.code(404).send({
          error: { code: 'persona_not_found', message: `Persona ${id} not found` },
        });
      }
      return reply.code(204).send();
    },
  );
}
