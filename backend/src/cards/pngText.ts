/**
 * PNG tEXt chunk reader/writer — extracts and embeds character card data in PNG images.
 *
 * SillyTavern stores character JSON as base64-encoded text in `tEXt` chunks:
 *   - `chara` keyword → V2 spec JSON (base64-encoded)
 *   - `ccv3` keyword → V3 spec JSON (base64-encoded, takes precedence)
 *
 * Pure Node.js, no npm dependencies. Handles the binary PNG chunk format:
 *   [4-byte length][4-byte type][data...][4-byte CRC32]
 */

/** Parsed tEXt chunk with its keyword and decoded text. */
export interface PngTextChunk {
  keyword: string;
  text: string;
}

// ── CRC32 lookup table (PNG uses CRC32 for chunk integrity) ────────────

const CRC_TABLE: number[] = (() => {
  const table: number[] = new Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c;
  }
  return table;
})();

function crc32(buf: Buffer, start: number, length: number): number {
  let crc = 0xffffffff;
  for (let i = start; i < start + length; i++) {
    const idx = (crc ^ (buf[i] ?? 0)) & 0xff;
    crc = (CRC_TABLE[idx] ?? 0) ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

// ── PNG constants ──────────────────────────────────────────────────────

const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const CHUNK_TYPE_TEXT = 0x74455874; // 'tEXt' as big-endian uint32

// ── Public API ─────────────────────────────────────────────────────────

/**
 * Extract all tEXt chunks from a PNG buffer.
 * Returns keyword/text pairs for every tEXt chunk found.
 */
export function readPngTextChunks(image: Buffer): PngTextChunk[] {
  if (image.length < 8) {
    throw new Error('PNG too short — missing signature');
  }

  // Validate PNG signature
  for (let i = 0; i < 8; i++) {
    if (image[i] !== PNG_SIGNATURE[i]) {
      throw new Error('Not a valid PNG file');
    }
  }

  const chunks: PngTextChunk[] = [];
  let offset = 8; // skip signature

  while (offset + 8 <= image.length) {
    // Read chunk header: [4-byte length][4-byte type]
    const dataLength = image.readUInt32BE(offset);
    const chunkType = image.readUInt32BE(offset + 4);

    // Bounds check — need type (4) + data (N) + CRC (4)
    if (offset + 12 + dataLength > image.length) {
      break;
    }

    if (chunkType === CHUNK_TYPE_TEXT) {
      // CRC covers type + data (bytes 4 through 4+4+dataLength)
      const expectedCrc = image.readUInt32BE(offset + 8 + dataLength);
      const actualCrc = crc32(image, offset + 4, 4 + dataLength);
      if (expectedCrc !== actualCrc) {
        throw new Error(`CRC mismatch in tEXt chunk at offset ${offset}`);
      }

      // tEXt data = keyword (null-terminated) + text
      const dataStart = offset + 8;
      const nullIndex = image.indexOf(0, dataStart);
      if (nullIndex === -1 || nullIndex >= dataStart + dataLength) {
        throw new Error(`Malformed tEXt chunk at offset ${offset} — no null separator`);
      }

      const keyword = image.toString('ascii', dataStart, nullIndex);
      const text = image.toString('ascii', nullIndex + 1, dataStart + dataLength);
      chunks.push({ keyword, text });
    }

    // Advance: 4 (length) + 4 (type) + dataLength + 4 (CRC)
    offset += 12 + dataLength;
  }

  return chunks;
}

/**
 * Extract character card JSON from a PNG buffer.
 * Prefers `ccv3` (V3) over `chara` (V2), matching SillyTavern/RisuAI behavior.
 * Returns the raw JSON string, or null if no character data found.
 */
export function extractCardJsonFromPng(image: Buffer): string | null {
  const chunks = readPngTextChunks(image);

  // V3 takes precedence
  const v3 = chunks.find((c) => c.keyword.toLowerCase() === 'ccv3');
  if (v3) {
    return Buffer.from(v3.text, 'base64').toString('utf-8');
  }

  // Fall back to V2
  const v2 = chunks.find((c) => c.keyword.toLowerCase() === 'chara');
  if (v2) {
    return Buffer.from(v2.text, 'base64').toString('utf-8');
  }

  return null;
}

// ── PNG tEXt chunk writer ─────────────────────────────────────────────

/**
 * Create a tEXt chunk buffer for embedding in a PNG.
 * Format: [4-byte length][4-byte type][keyword\0text][4-byte CRC32]
 */
function createTextChunk(keyword: string, text: string): Buffer {
  const keywordBuf = Buffer.from(keyword, 'ascii');
  const textBuf = Buffer.from(text, 'ascii');
  const dataLength = keywordBuf.length + 1 + textBuf.length; // +1 for null separator

  const chunk = Buffer.alloc(12 + dataLength);
  chunk.writeUInt32BE(dataLength, 0);           // length
  chunk.writeUInt32BE(CHUNK_TYPE_TEXT, 4);       // type: 'tEXt'
  keywordBuf.copy(chunk, 8);                     // keyword
  chunk[8 + keywordBuf.length] = 0;              // null separator
  textBuf.copy(chunk, 8 + keywordBuf.length + 1); // text

  // CRC32 covers type + data (bytes 4 through 4+4+dataLength)
  const crcValue = crc32(chunk, 4, 4 + dataLength);
  chunk.writeUInt32BE(crcValue, 8 + dataLength);

  return chunk;
}

/**
 * Embed tEXt chunks into a PNG buffer, inserting them before the IEND chunk.
 * Returns a new PNG buffer with the chunks added.
 */
export function embedTextChunks(image: Buffer, chunks: PngTextChunk[]): Buffer {
  if (image.length < 8) {
    throw new Error('PNG too short — missing signature');
  }

  // Validate PNG signature
  for (let i = 0; i < 8; i++) {
    if (image[i] !== PNG_SIGNATURE[i]) {
      throw new Error('Not a valid PNG file');
    }
  }

  // Find the IEND chunk (last chunk in PNG)
  let iendOffset = -1;
  let offset = 8;
  while (offset + 8 <= image.length) {
    const chunkType = image.readUInt32BE(offset + 4);
    const dataLength = image.readUInt32BE(offset);

    // IEND has type 0x49454E44 and length 0
    if (chunkType === 0x49454E44) {
      iendOffset = offset;
      break;
    }

    offset += 12 + dataLength;
  }

  if (iendOffset === -1) {
    throw new Error('PNG missing IEND chunk');
  }

  // Build new chunks to insert
  const newChunks: Buffer[] = [];
  for (const chunk of chunks) {
    newChunks.push(createTextChunk(chunk.keyword, chunk.text));
  }

  // Concatenate: signature + everything before IEND + new chunks + IEND
  const beforeIend = image.subarray(0, iendOffset);
  const iendChunk = image.subarray(iendOffset);
  const totalLength = beforeIend.length + newChunks.reduce((sum, c) => sum + c.length, 0) + iendChunk.length;

  const result = Buffer.alloc(totalLength);
  let pos = 0;
  beforeIend.copy(result, pos);
  pos += beforeIend.length;
  for (const chunk of newChunks) {
    chunk.copy(result, pos);
    pos += chunk.length;
  }
  iendChunk.copy(result, pos);

  return result;
}
