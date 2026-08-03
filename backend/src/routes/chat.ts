/**
 * Chat HTTP routes — Phase 1 core loop (checklist item 2).
 *
 *   POST /api/sessions               create a session
 *   POST /api/sessions/:id/messages  send a message, get the in-context reply
 *
 * Non-streaming for now; SSE lands in checklist item 6.
 */
import type { FastifyInstance, FastifyReply } from 'fastify';
import { createAdapter } from '../adapters/factory.js';
import { LmError } from '../adapters/types.js';
import type { LmErrorCode } from '../adapters/types.js';
import { ChatError, createSession, sendMessage } from '../chat.js';
import type { SessionClass } from '../models/session.js';

export async function chatRoutes(app: FastifyInstance): Promise<void> {
  // One shared adapter for the server's lifetime; disposed on shutdown.
  const adapter = createAdapter({ id: 'opencode' });
  app.addHook('onClose', async () => {
    await adapter.dispose();
  });

  app.post(
    '/api/sessions',
    {
      schema: {
        body: {
          type: 'object',
          properties: {
            class: { type: 'string', enum: ['character', 'story'] },
          },
          additionalProperties: false,
        },
      },
    },
    async (request, reply) => {
      const body = request.body as { class?: SessionClass } | undefined;
      const session =
        body?.class === undefined ? createSession() : createSession({ class: body.class });
      return reply.code(201).send(session);
    },
  );

  app.post(
    '/api/sessions/:id/messages',
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
            content: { type: 'string' },
            ooc: { type: 'boolean' },
          },
          required: ['content'],
          additionalProperties: false,
        },
      },
    },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const body = request.body as { content?: string; ooc?: boolean } | undefined;

      try {
        const input =
          body?.ooc === undefined
            ? { sessionId: id, content: body?.content ?? '' }
            : { sessionId: id, content: body?.content ?? '', ooc: body.ooc };
        const result = await sendMessage(adapter, input);
        return reply.code(201).send(result);
      } catch (err) {
        return handleError(app, reply, err);
      }
    },
  );
}

function handleError(app: FastifyInstance, reply: FastifyReply, err: unknown): FastifyReply {
  if (err instanceof ChatError) {
    return reply.code(err.status).send({ error: { code: err.code, message: err.message } });
  }
  if (err instanceof LmError) {
    return reply
      .code(lmErrorStatus(err.code))
      .send({ error: { code: err.code, message: err.message } });
  }
  app.log.error(err);
  return reply.code(500).send({ error: { code: 'internal', message: 'Internal server error' } });
}

function lmErrorStatus(code: LmErrorCode): number {
  switch (code) {
    case 'provider':
      return 502;
    case 'timeout':
      return 504;
    case 'cancelled':
      return 499;
    case 'context':
      return 413;
    case 'not-implemented':
      return 501;
    case 'config':
      return 500;
  }
}
