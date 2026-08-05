/**
 * Character card CRUD routes — Phase 2 foundation.
 *
 *   GET    /api/cards            list all cards
 *   GET    /api/cards/:id        get one card
 *   POST   /api/cards            create a card
 *   POST   /api/cards/import     import from PNG (base64) or JSON card
 *   POST   /api/cards/parse      parse PNG/JSON without creating a card
 *   PATCH  /api/cards/:id        update a card (partial patch)
 *   DELETE /api/cards/:id        delete a card
 */
import type { FastifyInstance } from 'fastify';
import {
  createCharacterCard,
  deleteCharacterCard,
  getCharacterCard,
  listCharacterCards,
  updateCharacterCard,
} from '../models/character.js';
import type {
  CharacterCard,
  CreateCharacterCardInput,
  UpdateCharacterCardInput,
} from '../models/character.js';
import { extractCardJsonFromPng, embedTextChunks } from '../cards/pngText.js';
import { parseSillyTavernCard, saveAvatarLocally } from '../cards/sillytavern.js';
import { deleteEntityDir } from '../storage.js';

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
            avatars: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  id: { type: 'string' },
                  name: { type: 'string' },
                  image: { type: 'string' },
                },
                required: ['id', 'image'],
                additionalProperties: false,
              },
            },
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

  // ── POST /api/cards/import ──────────────────────────────────────────
  // Accepts: { "data": "<base64 PNG>" } or { "data": "<base64 JSON string>" }
  // or the card JSON object directly as the body.
  app.post(
    '/api/cards/import',
    {
      schema: {
        body: {
          type: 'object',
          additionalProperties: true,
        },
      },
    },
    async (request, reply) => {
      const body = request.body as Record<string, unknown> | undefined;
      if (!body) {
        return reply.code(400).send({
          error: { code: 'invalid_body', message: 'Request body is required' },
        });
      }

      let rawJson: Record<string, unknown> | null = null;

      // Case 1: body has a `data` field — could be base64 PNG or base64 JSON
      if (typeof body['data'] === 'string') {
        const decoded = Buffer.from(body['data'] as string, 'base64');

        // Check PNG signature (first 8 bytes: 0x89 0x50 0x4E 0x47 ...)
        const isPng =
          decoded.length > 8 &&
          decoded[0] === 0x89 &&
          decoded[1] === 0x50 &&
          decoded[2] === 0x4e &&
          decoded[3] === 0x47;

        if (isPng) {
          const jsonStr = extractCardJsonFromPng(decoded);
          if (!jsonStr) {
            return reply.code(400).send({
              error: {
                code: 'no_card_data',
                message: 'PNG does not contain a character card (no chara/ccv3 tEXt chunk)',
              },
            });
          }
          try {
            rawJson = JSON.parse(jsonStr) as Record<string, unknown>;
          } catch {
            return reply.code(400).send({
              error: { code: 'invalid_json', message: 'Embedded card data is not valid JSON' },
            });
          }
        } else {
          // Try parsing the decoded bytes as JSON directly
          try {
            const str = decoded.toString('utf-8');
            rawJson = JSON.parse(str) as Record<string, unknown>;
          } catch {
            return reply.code(400).send({
              error: {
                code: 'invalid_data',
                message: 'Data is neither a valid PNG nor valid JSON',
              },
            });
          }
        }
      }
      // Case 2: body IS the card JSON (no wrapping)
      else if (typeof body['spec'] === 'string' || typeof body['name'] === 'string' || typeof body['char_name'] === 'string') {
        rawJson = body;
      } else {
        return reply.code(400).send({
          error: {
            code: 'invalid_body',
            message: 'Expected { "data": "<base64>" } or a card JSON object with spec/name fields',
          },
        });
      }

      // Normalize onto CharacterCard shape
      let card: Partial<CreateCharacterCardInput>;
      try {
        card = parseSillyTavernCard(rawJson!) as Partial<CreateCharacterCardInput>;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return reply.code(400).send({
          error: { code: 'parse_error', message: msg },
        });
      }

      if (!card.name) {
        return reply.code(400).send({
          error: { code: 'missing_name', message: 'Card has no name field' },
        });
      }

      const created = createCharacterCard(card as CreateCharacterCardInput);

      // Save avatar locally and update avatar_file
      const avatarFile = await saveAvatarLocally(created.id, card.avatar ?? null);
      if (avatarFile) {
        updateCharacterCard(created.id, { avatar_file: avatarFile });
      }
      return reply.code(201).send(created);
    },
  );

  // ── POST /api/cards/parse ────────────────────────────────────────────
  // Parse PNG or JSON card data WITHOUT creating a card.
  // Returns the parsed card data for use in the CharacterFormModal.
  app.post(
    '/api/cards/parse',
    {
      schema: {
        body: {
          type: 'object',
          additionalProperties: true,
        },
      },
    },
    async (request, reply) => {
      const body = request.body as Record<string, unknown> | undefined;
      if (!body) {
        return reply.code(400).send({
          error: { code: 'invalid_body', message: 'Request body is required' },
        });
      }

      let rawJson: Record<string, unknown> | null = null;
      let avatarDataUri: string | null = null;

      // Case 1: body has a `data` field — could be base64 PNG or base64 JSON
      if (typeof body['data'] === 'string') {
        const decoded = Buffer.from(body['data'] as string, 'base64');

        // Check PNG signature
        const isPng =
          decoded.length > 8 &&
          decoded[0] === 0x89 &&
          decoded[1] === 0x50 &&
          decoded[2] === 0x4e &&
          decoded[3] === 0x47;

        if (isPng) {
          const jsonStr = extractCardJsonFromPng(decoded);
          if (!jsonStr) {
            return reply.code(400).send({
              error: {
                code: 'no_card_data',
                message: 'PNG does not contain a character card (no chara/ccv3 tEXt chunk)',
              },
            });
          }
          try {
            rawJson = JSON.parse(jsonStr) as Record<string, unknown>;
          } catch {
            return reply.code(400).send({
              error: { code: 'invalid_json', message: 'Embedded card data is not valid JSON' },
            });
          }
          // Use the PNG itself as the avatar
          avatarDataUri = `data:image/png;base64,${body['data']}`;
        } else {
          // Try parsing the decoded bytes as JSON directly
          try {
            const str = decoded.toString('utf-8');
            rawJson = JSON.parse(str) as Record<string, unknown>;
          } catch {
            return reply.code(400).send({
              error: {
                code: 'invalid_data',
                message: 'Data is neither a valid PNG nor valid JSON',
              },
            });
          }
        }
      }
      // Case 2: body IS the card JSON (no wrapping)
      else if (typeof body['spec'] === 'string' || typeof body['name'] === 'string' || typeof body['char_name'] === 'string') {
        rawJson = body;
      } else {
        return reply.code(400).send({
          error: {
            code: 'invalid_body',
            message: 'Expected { "data": "<base64>" } or a card JSON object with spec/name fields',
          },
        });
      }

      // Normalize onto CharacterCard shape
      let card: Partial<CreateCharacterCardInput>;
      try {
        card = parseSillyTavernCard(rawJson!) as Partial<CreateCharacterCardInput>;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return reply.code(400).send({
          error: { code: 'parse_error', message: msg },
        });
      }

      // If we have a PNG avatar, override the parsed avatar
      if (avatarDataUri) {
        card.avatar = avatarDataUri;
        card.avatars = [{ id: 'default', name: 'Default', image: avatarDataUri }];
      }

      // Return parsed data WITHOUT creating a card
      return reply.send(card);
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
            avatars: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  id: { type: 'string' },
                  name: { type: 'string' },
                  image: { type: 'string' },
                },
                required: ['id', 'image'],
                additionalProperties: false,
              },
            },
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
            default_persona: { type: ['object', 'null'] },
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

  // ── Export helpers ───────────────────────────────────────────────────

  /**
   * Convert a Playime CharacterCard to SillyTavern V2 format.
   * Spec: { spec: 'chara_card_v2', spec_version: '2.0', data: { ... } }
   */
  function cardToV2Json(card: CharacterCard): Record<string, unknown> {
    // Build character_book entries from world_info
    const character_book = card.world_info.length > 0 ? {
      name: `${card.name}'s World`,
      entries: card.world_info.map((entry, i) => ({
        uid: i,
        key: entry.keys,
        keysecondary: entry.secondary_keys ?? [],
        selective: entry.selective ?? false,
        selectiveLogic: entry.selective_logic === 'NOT' ? 1 : 0,
        constant: entry.constant ?? false,
        content: entry.content,
        insertion_order: entry.insertion_order,
        position: entry.position === 'after_char' ? 1 : 0,
        case_sensitive: entry.case_sensitive ?? false,
        enabled: entry.enabled,
      })),
    } : undefined;

    return {
      spec: 'chara_card_v2',
      spec_version: '2.0',
      data: {
        name: card.name,
        description: card.description ?? card.tagline ?? '',
        personality: card.personality,
        scenario: card.scenario,
        first_mes: card.first_message ?? '',
        mes_example: card.mes_example ?? '',
        creator_notes: card.creator_notes ?? card.creator ?? '',
        system_prompt: card.system_prompt ?? '',
        post_history_instructions: card.post_history_instructions ?? '',
        alternate_greetings: card.alternate_greetings,
        character_book,
        tags: card.tags,
        creator: card.creator ?? card.creator_name ?? '',
        character_version: card.character_version ?? '',
        extensions: card.extensions,
      },
    };
  }

  // ── GET /api/cards/:id/export.json ──────────────────────────────────
  app.get(
    '/api/cards/:id/export.json',
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
      const v2Json = cardToV2Json(card);
      return reply
        .header('Content-Type', 'application/json')
        .header('Content-Disposition', `attachment; filename="${card.name}.json"`)
        .send(v2Json);
    },
  );

  // ── GET /api/cards/:id/export.png ───────────────────────────────────
  // Export character card as PNG with embedded tEXt chunk (SillyTavern-compatible).
  app.get(
    '/api/cards/:id/export.png',
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

      // Get the avatar image — first from avatars array, or card default
      const avatarUrl = card.avatars[0]?.image ?? card.avatar ?? card.cover_image;
      if (!avatarUrl) {
        return reply.code(400).send({
          error: { code: 'no_avatar', message: 'Card has no avatar image to embed' },
        });
      }

      // Fetch the avatar image
      let imageBuffer: Buffer;
      try {
        if (avatarUrl.startsWith('data:')) {
          // Data URI — extract base64 portion
          const base64 = avatarUrl.split(',')[1] ?? '';
          imageBuffer = Buffer.from(base64, 'base64');
        } else {
          // URL — fetch it
          const resp = await fetch(avatarUrl);
          if (!resp.ok) throw new Error(`Failed to fetch avatar: ${resp.status}`);
          const arrayBuf = await resp.arrayBuffer();
          imageBuffer = Buffer.from(arrayBuf);
        }
      } catch (err) {
        return reply.code(500).send({
          error: { code: 'avatar_fetch_failed', message: `Failed to fetch avatar: ${err instanceof Error ? err.message : 'unknown error'}` },
        });
      }

      // Check if the image is PNG (PNG signature: 137 80 78 71)
      const isPng = imageBuffer.length >= 4
        && imageBuffer[0] === 137
        && imageBuffer[1] === 0x50 // 'P'
        && imageBuffer[2] === 0x4E // 'N'
        && imageBuffer[3] === 0x47; // 'G'

      if (!isPng) {
        return reply.code(400).send({
          error: {
            code: 'avatar_not_png',
            message: 'Avatar must be a PNG image for PNG export. Use JSON export for JPEG/other formats.',
          },
        });
      }

      // Embed V2 JSON as base64-encoded tEXt chunk
      const v2Json = cardToV2Json(card);
      const v2Base64 = Buffer.from(JSON.stringify(v2Json), 'utf-8').toString('base64');

      let pngWithCard: Buffer;
      try {
        pngWithCard = embedTextChunks(imageBuffer, [{ keyword: 'chara', text: v2Base64 }]);
      } catch (err) {
        return reply.code(500).send({
          error: { code: 'png_embedding_failed', message: `Failed to embed card data: ${err instanceof Error ? err.message : 'unknown error'}` },
        });
      }

      return reply
        .header('Content-Type', 'image/png')
        .header('Content-Disposition', `attachment; filename="${card.name}.png"`)
        .send(pngWithCard);
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
      deleteEntityDir('characters', id);
      return reply.code(204).send();
    },
  );
}
