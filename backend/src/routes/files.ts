// backend/src/routes/files.ts
import type { FastifyInstance } from 'fastify';
import { join } from 'node:path';
import { accessSync } from 'node:fs';
import { ENTITY_TYPES, type EntityType, getEntityPath } from '../storage.js';

const ENTITIES_DIR = join(import.meta.dirname, '../../data/entities');

export default async function filesRoutes(app: FastifyInstance): Promise<void> {
  /**
   * GET /api/files/:type/:id/:filename
   * Serve entity files (avatars, gallery images, etc.)
   */
  app.get<{
    Params: { type: string; id: string; filename: string; '*': string };
  }>('/api/files/:type/:id/:filename/*', async (request, reply) => {
    const { type, id } = request.params;
    const filename = request.params.filename + (request.params['*'] ? '/' + request.params['*'] : '');

    // Validate entity type
    if (!ENTITY_TYPES.includes(type as EntityType)) {
      return reply.code(404).send({
        error: { code: 'not_found', message: 'Invalid entity type' },
      });
    }

    const filePath = getEntityPath(type as EntityType, id, filename);
    if (!filePath) {
      return reply.code(403).send({
        error: { code: 'forbidden', message: 'Invalid path' },
      });
    }

    // Check file exists
    try {
      accessSync(filePath);
    } catch {
      return reply.code(404).send({
        error: { code: 'not_found', message: 'File not found' },
      });
    }

    return reply.sendFile(filename, join(ENTITIES_DIR, type, id));
  });
}
