/**
 * opencode adapter — first LM provider implementation.
 *
 * Talks to `opencode serve`'s HTTP API (docs/PLAYIME_ROADMAP.md §5).
 * Verified against the running server on 127.0.0.1:4096:
 *   - POST /api/session                       create session → ses_…
 *   - POST /api/session/{id}/prompt           send prompt → msg_… + admittedSeq
 *                                              (fire-and-confirm, async)
 *   - GET  /api/session/{id}/event            SSE stream of session events
 *   - POST /api/session/{id}/model            optional model override (204)
 *
 * FLOW (why streaming is mandatory): the /prompt call returns immediately;
 * the assistant reply arrives later over the /event stream. `generate()`
 * therefore collects the same stream that `stream()` exposes. Both only
 * surface FINAL TEXT — `session.next.reasoning.*` and tool/step bookkeeping
 * are dropped (see decisions log: never surface model reasoning).
 *
 * The adapter stores NO state in opencode's session history beyond the
 * prompt message; Playime owns all memory/state (AGENTS.md).
 */
import { renderOpencodePrompt } from '../prompt.js';
import type {
  GenerateOptions,
  GenerateRequest,
  GenerateResult,
  OpenCodeAdapterConfig,
  StreamChunk,
  TokenUsage,
} from './types.js';
import { LmError } from './types.js';

interface OpenCodeEvent {
  type: string;
  id: string;
  data?: Record<string, unknown>;
}

/** Minimal subset of the opencode SSE payload we consume. */
interface SessionPromptResponse {
  data: { id: string; sessionID: string; admittedSeq: number };
}

interface SessionCreateResponse {
  data: { id: string };
}

/** A session for main turns + one for small-model bookkeeping calls. */
export interface OpenCodeSessions {
  main: string;
  small?: string;
}

/** Config keys read from the environment (see docs/PLAYIME_ROADMAP.md §5). */
const DEFAULT_OPCODE_BASE_URL = 'http://127.0.0.1:4096';

export class OpenCodeAdapter {
  readonly id = 'opencode';

  private readonly baseUrl: string;
  private readonly defaultModel: string;
  private readonly smallModel: string | undefined;
  private readonly serverPassword: string | undefined;
  private readonly authHeader: string | undefined;
  private sessions = new Map<string, string>();
  private smallSessions = new Map<string, string>();

  constructor(config: OpenCodeAdapterConfig = { id: 'opencode' }) {
    this.baseUrl = config.baseUrl ?? process.env.OPENCODE_BASE_URL ?? DEFAULT_OPCODE_BASE_URL;
    this.defaultModel =
      config.defaultModel ?? process.env.OPENCODE_MODEL ?? 'deepseek-v4-flash-free';
    this.smallModel = config.smallModel ?? process.env.OPENCODE_SMALL_MODEL;
    this.serverPassword = config.serverPassword ?? process.env.OPENCODE_SERVER_PASSWORD;
    this.authHeader = this.serverPassword ? `Bearer ${this.serverPassword}` : undefined;
  }

  /** One complete response; resolves when the reply is fully received. */
  async generate(
    request: GenerateRequest,
    options?: GenerateOptions,
  ): Promise<GenerateResult> {
    let text = '';
    let usage: TokenUsage | undefined;

    for await (const chunk of this.stream(request, options)) {
      if (chunk.type === 'text') text += chunk.text;
      else if (chunk.type === 'usage') usage = chunk.usage;
    }

    if (!text) {
      throw new LmError('provider', 'opencode returned no text for the prompt');
    }
    return usage ? { text, usage } : { text };
  }

  /** Token-by-token text deltas of the response. */
  async *stream(
    request: GenerateRequest,
    options?: GenerateOptions,
  ): AsyncGenerator<StreamChunk> {
    const sessionId = await this.sessionFor(options);
    if (options?.model) await this.setModel(sessionId, options.model);

    const rendered = renderOpencodePrompt(request.system, request.messages);
    const admittedSeq = await this.sendPrompt(sessionId, rendered, options?.signal);

    // Yield text deltas as they arrive; emit usage once; then done.
    for await (const event of this.readEvents(sessionId, admittedSeq, options?.signal)) {
      if (event.type === 'session.next.text.delta' && typeof event.data?.delta === 'string') {
        if (event.data.delta.length > 0) yield { type: 'text', text: event.data.delta };
      } else if (
        event.type === 'session.next.text.ended' &&
        typeof event.data?.text === 'string'
      ) {
        if (event.data.text.length > 0) yield { type: 'text', text: event.data.text };
      } else if (event.type === 'session.next.step.ended') {
        const usage = this.usageFromEvent(event);
        if (usage) yield { type: 'usage', usage };
        yield { type: 'done' };
        return;
      }
    }
  }

  /** Create an opencode session in the Playime project directory. */
  async createSession(directory?: string): Promise<string> {
    const location = directory ?? process.env.OPENCODE_DIRECTORY ?? process.cwd();
    const res = await fetch(`${this.baseUrl}/api/session`, {
      method: 'POST',
      headers: this.headers('application/json'),
      body: JSON.stringify({ location: { directory: location } }),
      signal: AbortSignal.timeout(15_000),
    });

    if (!res.ok) {
      const body = await res.text();
      throw new LmError(
        'provider',
        `opencode session create failed (${res.status}): ${body.slice(0, 300)}`,
      );
    }

    const parsed = (await res.json()) as SessionCreateResponse;
    return parsed.data.id;
  }

  /** Delete an opencode session to release provider context. Best-effort. */
  async destroySession(sessionId: string): Promise<void> {
    const res = await fetch(`${this.baseUrl}/api/session/${sessionId}`, {
      method: 'DELETE',
      headers: this.headers(),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) {
      // Non-fatal cleanup — log and move on.
      const body = await res.text();
      process.emitWarning(
        `opencode session delete ${sessionId} returned ${res.status}: ${body.slice(0, 200)}`,
      );
    }
  }

  /** Release all tracked opencode sessions. */
  async dispose(): Promise<void> {
    const all = [...this.sessions.values(), ...this.smallSessions.values()];
    await Promise.allSettled(all.map((id) => this.destroySession(id)));
    this.sessions.clear();
    this.smallSessions.clear();
  }

  // ---------------------------------------------------------------------

  /** Get a session for a model tier, caching per adapter. */
  private async sessionFor(options?: GenerateOptions): Promise<string> {
    const isSmall = this.isSmallModel(options?.model);
    const cache = isSmall ? this.smallSessions : this.sessions;
    if (cache.size > 0) {
      // Single user for v1; reuse the first cached session of this tier.
      return cache.values().next().value as string;
    }
    const id = await this.createSession();
    cache.set(id, id);
    return id;
  }

  /** True when the requested model is the configured small model (bookkeeping). */
  private isSmallModel(model: string | undefined): boolean {
    if (this.smallModel === undefined) return false;
    return (
      model === this.smallModel ||
      (model === undefined && this.defaultModel === this.smallModel)
    );
  }

  /** Set the model for a session (204 on success). */
  private async setModel(sessionId: string, model: string): Promise<void> {
    const res = await fetch(`${this.baseUrl}/api/session/${sessionId}/model`, {
      method: 'POST',
      headers: this.headers('application/json'),
      body: JSON.stringify({ model: { id: model, providerID: 'opencode' } }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) {
      const body = await res.text();
      throw new LmError(
        'provider',
        `opencode setModel(${model}) failed (${res.status}): ${body.slice(0, 300)}`,
      );
    }
  }

  /** POST the prompt; returns the admittedSeq used as the SSE cursor. */
  private async sendPrompt(
    sessionId: string,
    promptText: string,
    signal?: AbortSignal,
  ): Promise<number> {
    const res = await fetch(`${this.baseUrl}/api/session/${sessionId}/prompt`, {
      method: 'POST',
      headers: this.headers('application/json'),
      body: JSON.stringify({ prompt: { text: promptText } }),
      signal: signal ?? AbortSignal.timeout(20_000),
    });

    if (!res.ok) {
      const body = await res.text();
      throw new LmError(
        'provider',
        `opencode prompt send failed (${res.status}): ${body.slice(0, 300)}`,
      );
    }

    const parsed = (await res.json()) as SessionPromptResponse;
    if (typeof parsed.data?.admittedSeq !== 'number') {
      throw new LmError('provider', 'opencode prompt response missing admittedSeq');
    }
    return parsed.data.admittedSeq;
  }

  /** Read the /event SSE stream, filtered to the given admission cursor. */
  private async *readEvents(
    sessionId: string,
    after: number,
    signal?: AbortSignal,
  ): AsyncGenerator<OpenCodeEvent> {
    const url = `${this.baseUrl}/api/session/${sessionId}/event?after=${after}`;
    const ctrl = new AbortController();
    const onAbort = () => ctrl.abort();
    signal?.addEventListener('abort', onAbort, { once: true });
    const timeout = setTimeout(() => ctrl.abort(), 120_000);

    try {
      const res = await fetch(url, {
        headers: this.headers(),
        signal: ctrl.signal,
      });

      if (!res.ok) {
        const body = await res.text();
        throw new LmError(
          'provider',
          `opencode event stream failed (${res.status}): ${body.slice(0, 300)}`,
        );
      }
      if (!res.body) throw new LmError('provider', 'opencode event stream returned no body');

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      try {
        while (true) {
          if (ctrl.signal.aborted) {
            throw new LmError('cancelled', 'opencode event stream cancelled');
          }
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });

          let idx: number;
          while ((idx = buffer.indexOf('\n\n')) !== -1) {
            const raw = buffer.slice(0, idx);
            buffer = buffer.slice(idx + 2);
            const data = parseSseData(raw);
            if (data) {
              const event = JSON.parse(data) as OpenCodeEvent;
              if (event.type?.startsWith('session.next.') || event.type?.startsWith('message.updated')) {
                yield event;
              }
            }
          }
        }
      } finally {
        reader.releaseLock();
      }
    } finally {
      clearTimeout(timeout);
      signal?.removeEventListener('abort', onAbort);
    }
  }

  /** Extract token usage from a step.ended event (if present). */
  private usageFromEvent(event: OpenCodeEvent): TokenUsage | undefined {
    const tokens = event.data?.tokens as
      | { input?: number; output?: number; reasoning?: number }
      | undefined;
    if (!tokens) return undefined;
    const input = tokens.input ?? 0;
    const output = tokens.output ?? 0;
    return { input, output, ...(tokens.reasoning !== undefined ? { reasoning: tokens.reasoning } : {}) };
  }

  private headers(contentType?: string): Record<string, string> {
    const h: Record<string, string> = {
      Accept: 'text/event-stream',
    };
    if (contentType) h['Content-Type'] = contentType;
    if (this.authHeader) h.Authorization = this.authHeader;
    return h;
  }
}

/** Parse one SSE event (multiline `data:` payloads joined). */
function parseSseData(raw: string): string | null {
  const lines = raw.split(/\r?\n/);
  const dataLines: string[] = [];
  for (const line of lines) {
    if (line.startsWith('data:')) dataLines.push(line.slice(5).trimStart());
  }
  return dataLines.length > 0 ? dataLines.join('\n') : null;
}

