// backend/src/routes/files.ts
import type { FastifyInstance } from 'fastify';
import { join } from 'node:path';
import { accessSync, createReadStream, statSync, writeFileSync } from 'node:fs';
import { pipeline } from 'node:stream/promises';
import sharp from 'sharp';
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

const MAX_UPLOAD_SIZE = 10 * 1024 * 1024; // 10MB
const MAX_DIMENSION = 2048;
const ALLOWED_MIME_PREFIXES = ['image/png', 'image/jpeg', 'image/webp', 'image/avif', 'image/gif'];

export default async function filesRoutes(app: FastifyInstance): Promise<void> {
  /**
   * GET /api/files/:type/:id/:filename
   * Serve entity files (avatars, gallery images, etc.)
   */
  app.get<{
    Params: { type: string; id: string; filename: string };
  }>('/api/files/:type/:id/:filename', async (request, reply) => {
    const { type, id, filename } = request.params;

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
   * Upload file to entity folder — validates MIME, checks size, converts to PNG via sharp.
   */
  app.post<{
    Params: { type: string; id: string };
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

    // Validate MIME type
    const mimetype = data.mimetype;
    if (!ALLOWED_MIME_PREFIXES.some((prefix) => mimetype.startsWith(prefix))) {
      return reply.code(400).send({
        error: { code: 'invalid_mime', message: 'Only image files are accepted' },
      });
    }

    // Collect file buffer and check size (check both during streaming and after)
    const chunks: Buffer[] = [];
    let totalSize = 0;
    for await (const chunk of data.file) {
      totalSize += chunk.length;
      if (totalSize > MAX_UPLOAD_SIZE) {
        return reply.code(400).send({
          error: { code: 'file_too_large', message: 'Image must be under 10MB' },
        });
      }
      chunks.push(chunk);
    }
    const inputBuffer = Buffer.concat(chunks);

    // Belt-and-suspenders: check after collection too (some multipart
    // implementations buffer the entire payload before streaming).
    // Also check data.file.truncated — busboy's fileSize limit truncates the
    // stream to exactly MAX_UPLOAD_SIZE, so the > check alone misses it.
    if (inputBuffer.length > MAX_UPLOAD_SIZE || data.file.truncated) {
      return reply.code(400).send({
        error: { code: 'file_too_large', message: 'Image must be under 10MB' },
      });
    }

    // Decode with sharp (validates not corrupted), resize if needed, convert to PNG
    let outputBuffer: Buffer;
    try {
      const image = sharp(inputBuffer);
      const metadata = await image.metadata();

      // Resize if either dimension exceeds max (preserve aspect ratio)
      if (
        metadata.width && metadata.width > MAX_DIMENSION ||
        metadata.height && metadata.height > MAX_DIMENSION
      ) {
        image.resize({
          width: metadata.width && metadata.width > MAX_DIMENSION ? MAX_DIMENSION : undefined,
          height: metadata.height && metadata.height > MAX_DIMENSION ? MAX_DIMENSION : undefined,
          fit: 'inside',
          withoutEnlargement: true,
        });
      }

      outputBuffer = await image.png().toBuffer();
    } catch {
      return reply.code(400).send({
        error: { code: 'corrupt_image', message: 'File is not a valid image' },
      });
    }

    // Save to entity directory
    const entityDir = ensureEntityDir(type as EntityType, id);
    const filePath = join(entityDir, 'avatar.png');
    writeFileSync(filePath, outputBuffer);

    const relativePath = `${type}/${id}/avatar.png`;
    return { filename: 'avatar.png', path: relativePath };
  });
}
