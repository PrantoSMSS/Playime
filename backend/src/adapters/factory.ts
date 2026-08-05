/**
 * Adapter factory — the single way business code obtains an LmAdapter.
 *
 * Routes construct an adapter from a discriminated `AdapterConfig` (see
 * types.ts) and never import a provider class directly (CLAUDE.md: "never
 * call a provider's SDK directly from route/business logic"). New providers
 * (ollama, openai-compatible, ...) register a case here.
 */
import { OpenCodeAdapter } from './opencode.js';
import { LmError } from './types.js';
import type { AdapterConfig } from './types.js';
import type { LmAdapter } from './index.js';

export function createAdapter(config: AdapterConfig): LmAdapter {
  switch (config.id) {
    case 'opencode':
      return new OpenCodeAdapter(config);
    default: {
      const id = (config as { id?: string }).id ?? 'unknown';
      throw new LmError('not-implemented', `adapter '${id}' not implemented`);
    }
  }
}
