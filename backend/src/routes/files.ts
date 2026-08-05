// backend/src/routes/files.ts
import type { FastifyInstance } from 'fastify';
import { join } from 'node:path';
import { accessSync, createReadStream, createWriteStream, statSync } from 'node:fs';
import { pipeline } from 'node:stream/promises';
import { ENTITY_TYPES, type EntityType, ensureEntityDir, getEntityPath } from '../storage.js';

const ENTITIES_DIR = join(import.meta.dirname, '../../data/entities');

/** Map common file extensions to MIME types. */
const MIME_TYPES: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  svg: 'image/svg+xml',
  json: 'application/json',
};

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

    // Determine MIME type from extension
    const ext = filename.split('.').pop()?.toLowerCase() ?? '';
    const contentType = MIME_TYPES[ext] ?? 'application/octet-stream';

    // Stream the file
    const stat = statSync(filePath);
    reply.header('content-type', contentType);
    reply.header('content-length', stat.size);
    const stream = createReadStream(filePath);
    await pipeline(stream, reply.raw);
  });

  /**
   * POST /api/upload/:type/:id
   * Upload file to entity folder
   */
  app.post<{
    Params: { type: string; id: string };
    Body: { file: any };
  }>('/api/upload/:type/:id', async (request, reply) => {
    const { type, id } = request.params;

    if (!ENTITY_TYPES.includes(type as EntityType)) {
      return reply.code(400).send({
        error: { code: 'invalid_type', message: 'Invalid entity type' },
      });
    }

    const data = await request.file();
    if (!data) {
      return reply.code(400).send({
        error: { code: 'no_file', message: 'No file uploaded' },
      });
    }

    const entityDir = ensureEntityDir(type as EntityType, id);
    const ext = data.filename.split('.').pop() || 'png';
    const filename = `avatar.${ext}`;
    const filePath = join(entityDir, filename);

    const writeStream = createWriteStream(filePath);
    await pipeline(data.file, writeStream);

    const relativePath = `${type}/${id}/${filename}`;

    return { filename, path: relativePath };
  });
}
