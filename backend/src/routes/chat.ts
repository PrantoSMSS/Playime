/**
 * Chat HTTP routes — Phase 1 core loop (checklist items 2 + 6).
 *
 *   POST /api/sessions                       create a session
 *   POST /api/sessions/:id/messages          send a message, get the reply
 *   POST /api/sessions/:id/messages/stream   send a message, stream the reply
 *                                            as SSE (checklist item 6)
 */
import { Readable } from 'node:stream';
import type { FastifyInstance, FastifyReply } from 'fastify';
import { createAdapter } from '../adapters/factory.js';
import { LmError } from '../adapters/types.js';
import type { LmErrorCode } from '../adapters/types.js';
import {
  ChatError,
  createSession,
  persistAssistantReply,
  prepareTurn,
  sendMessage,
} from '../chat.js';
import { getCharacterCard, resolveAvatar, resolveStartingScenario } from '../models/character.js';
import type { AvatarOption, StartingScenario } from '../models/character.js';
import { getPersona } from '../models/persona.js';
import type { Persona } from '../models/persona.js';
import { listSessions, listTurns, getSession, insertMessage, nextMessageSeq, deleteSession as deleteSessionModel, deleteMessages as deleteMessagesModel } from '../models/session.js';
import type { SessionClass } from '../models/session.js';

export async function chatRoutes(app: FastifyInstance): Promise<void> {
  // One shared adapter for the server's lifetime; disposed on shutdown.
  const adapter = createAdapter({ id: 'opencode' });
  app.addHook('onClose', async () => {
    await adapter.dispose();
  });

  // ── GET /api/sessions ─────────────────────────────────────────────────
  // List all sessions, newest first.
  app.get('/api/sessions', async (_request, reply) => {
    const sessions = listSessions();
    return reply.send(sessions);
  });

  // ── GET /api/sessions/:id/messages ────────────────────────────────────
  // List all visible messages for a session.
  app.get(
    '/api/sessions/:id/messages',
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
      const session = getSession(id);
      if (!session) {
        return reply.code(404).send({
          error: { code: 'session_not_found', message: `Session ${id} not found` },
        });
      }
      const messages = listTurns(id);
      return reply.send(messages);
    },
  );

  // ── DELETE /api/sessions/:id ──────────────────────────────────────────
  // Delete a session and its messages (cascade via FK).
  app.delete(
    '/api/sessions/:id',
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
      const session = getSession(id);
      if (!session) {
        return reply.code(404).send({
          error: { code: 'session_not_found', message: `Session ${id} not found` },
        });
      }
      deleteSessionModel(id);
      return reply.code(204).send();
    },
  );

  // ── DELETE /api/sessions/:id/messages ─────────────────────────────────
  // Delete all messages for a session (used for reset).
  app.delete(
    '/api/sessions/:id/messages',
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
      const session = getSession(id);
      if (!session) {
        return reply.code(404).send({
          error: { code: 'session_not_found', message: `Session ${id} not found` },
        });
      }
      deleteMessagesModel(id);
      return reply.code(204).send();
    },
  );

  app.post(
    '/api/sessions',
    {
      schema: {
        body: {
          type: 'object',
          properties: {
            class: { type: 'string', enum: ['character', 'story'] },
            card_id: { type: 'string' },
            avatar_selection: { type: 'string' },
            starting_scenario_id: { type: 'string' },
            persona_id: { type: 'string' },
            persona_source: { type: 'string', enum: ['default', 'custom'] },
            player_name: { type: 'string' },
          },
          additionalProperties: false,
        },
      },
    },
    async (request, reply) => {
      const body = request.body as {
        class?: SessionClass;
        card_id?: string;
        avatar_selection?: string;
        starting_scenario_id?: string;
        persona_id?: string;
        persona_source?: 'default' | 'custom';
        player_name?: string;
      } | undefined;

      // If a card_id is provided, resolve and validate scenario selection
      let scenarioSnapshot: StartingScenario | undefined;
      let card: ReturnType<typeof getCharacterCard> | undefined;

      if (body?.card_id) {
        card = getCharacterCard(body.card_id);
        if (!card) {
          return reply.code(404).send({
            error: { code: 'card_not_found', message: `Card ${body.card_id} not found` },
          });
        }

        // Validate starting_scenario_id if provided
        if (body.starting_scenario_id) {
          const scenario = resolveStartingScenario(card, body.starting_scenario_id);
          if (!scenario) {
            return reply.code(400).send({
              error: {
                code: 'invalid_scenario',
                message: `Starting scenario "${body.starting_scenario_id}" not found on card ${body.card_id}`,
              },
            });
          }
          scenarioSnapshot = scenario;
        }
      }

      // Resolve persona based on persona_source
      let personaSnapshot: Persona | undefined;
      let personaSource: string | undefined;

      if (body?.persona_source === 'default') {
        // Default persona: resolve from card's default_persona + player_name
        personaSource = 'default';
        if (!body.player_name || body.player_name.trim().length === 0) {
          return reply.code(400).send({
            error: {
              code: 'missing_player_name',
              message: 'player_name is required when persona_source is "default"',
            },
          });
        }
        if (!card?.default_persona) {
          return reply.code(400).send({
            error: {
              code: 'no_default_persona',
              message: 'Character does not define a default persona',
            },
          });
        }
        // Resolve: merge card default_persona with player-provided name
        const dp = card!.default_persona!;
        personaSnapshot = {
          id: `default_${card!.id}`,
          name: body.player_name.trim(),
          avatar: null,
          description: dp.role ?? '',
          appearance: dp.appearance ?? '',
          personality: dp.personality ?? '',
          pronouns: dp.pronouns ?? '',
          created_at: 0,
          updated_at: 0,
        };
      } else if (body?.persona_source === 'custom') {
        // Custom persona: load from persona library
        personaSource = 'custom';
        if (!body.persona_id) {
          return reply.code(400).send({
            error: {
              code: 'missing_persona_id',
              message: 'persona_id is required when persona_source is "custom"',
            },
          });
        }
        const persona = getPersona(body.persona_id);
        if (!persona) {
          return reply.code(400).send({
            error: {
              code: 'invalid_persona',
              message: `Persona "${body.persona_id}" not found`,
            },
          });
        }
        personaSnapshot = persona;
      } else if (body?.persona_id) {
        // Legacy path: persona_id without persona_source (backward compat)
        const persona = getPersona(body.persona_id);
        if (persona) {
          personaSnapshot = persona;
          personaSource = 'custom';
        }
      }

      const session = createSession({
        class: body?.class,
        character_card_id: body?.card_id,
        starting_scenario_id: body?.starting_scenario_id,
        starting_scenario_snapshot: scenarioSnapshot,
        persona_id: body?.persona_id,
        persona_snapshot: personaSnapshot,
        persona_source: personaSource,
      });

      // Persist the character's first message so it survives page reloads.
      if (card) {
        const firstMessage = scenarioSnapshot?.first_message ?? card.first_message;
        if (firstMessage) {
          insertMessage({
            session_id: session.id,
            seq: nextMessageSeq(session.id),
            role: 'assistant',
            content: firstMessage,
          });
        }
      }

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

  // SSE streaming variant of the same call (checklist item 6). Frames:
  //   event: delta  data: {"text":"…"}        one per adapter text chunk
  //   event: done   data: {user_message, message}   stored rows (reply persisted here)
  //   event: error  data: {code, message}     mid-stream failure
  app.post(
    '/api/sessions/:id/messages/stream',
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

      // Validate + persist the user turn BEFORE committing to a 200 stream, so
      // 404/400 still come back as JSON.
      const input =
        body?.ooc === undefined
          ? { sessionId: id, content: body?.content ?? '' }
          : { sessionId: id, content: body?.content ?? '', ooc: body.ooc };
      const handle = prepareTurn(input);

      // Client disconnect cancels the adapter stream; the generator catches the
      // abort and the socket write becomes a harmless no-op. The signal must be
      // the RESPONSE's close: the request's own 'close' fires as soon as its
      // body is consumed (stream autoDestroy), which would abort immediately.
      // `writableEnded` distinguishes "client vanished" from "we finished".
      const ctrl = new AbortController();
      reply.raw.once('close', () => {
        if (!reply.raw.writableEnded) ctrl.abort();
      });

      const frames = async function* (): AsyncGenerator<string> {
        let text = '';
        try {
          for await (const chunk of adapter.stream(handle.request, { signal: ctrl.signal })) {
            if (chunk.type === 'text' && chunk.text.length > 0) {
              text += chunk.text;
              yield sseFrame('delta', { text: chunk.text });
            }
          }
          if (text.trim().length === 0) {
            throw new LmError('provider', 'model returned no text for the prompt');
          }
          // Persist once the reply is complete; done carries the stored rows so
          // the UI can swap its optimistic turns for real ids.
          const replyMsg = persistAssistantReply(id, text);
          yield sseFrame('done', { user_message: handle.userMessage, message: replyMsg });
        } catch (err) {
          app.log.error({ err }, 'chat stream failed mid-response');
          yield sseFrame('error', streamError(err));
        }
      };

      return reply
        .header('Cache-Control', 'no-cache, no-transform')
        .header('X-Accel-Buffering', 'no')
        .type('text/event-stream; charset=utf-8')
        .send(Readable.from(frames()));
    },
  );
}

/** Encode one SSE event frame (`event:`/`data:` lines, blank-line terminated). */
function sseFrame(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

/** Normalize a mid-stream failure into a stable {code, message} envelope. */
function streamError(err: unknown): { code: string; message: string } {
  if (err instanceof ChatError || err instanceof LmError) {
    return { code: err.code, message: err.message };
  }
  return { code: 'internal', message: 'Internal server error' };
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