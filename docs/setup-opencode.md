# Setup — opencode serve (Playime's LM backend)

One page to rebuild the environment from scratch. Playime talks to a headless
`opencode serve` over HTTP — the only LM provider wired up in Phase 0.

## 1. Install

```bash
npm install -g opencode-ai      # binary: opencode   (tested on 1.18.11)
opencode --version              # confirm
```

## 2. Run the server

```bash
opencode serve --port 4096 --hostname 127.0.0.1 --print-logs
```

- Keep this terminal open (or run it as a background task). The server is
  stateless from Playime's view — it just turns prompts into text.
- Bind only to `127.0.0.1` for local use. Add `--mdns` if you need it
  discoverable on the LAN.
- `--pure` skips external plugins (useful if a plugin is crashing startup).

**Secure it** (recommended even locally — the default is an unsecured server):

```bash
export OPENCODE_SERVER_PASSWORD='your-secret'
opencode serve --port 4096
```

## 3. Verify

```bash
curl http://127.0.0.1:4096/global/health
# → {"healthy":true,"version":"1.18.11"}

curl http://127.0.0.1:4096/doc > openapi.json    # OpenAPI 3.1 spec, 162 paths
```

Quick round-trip (two API families exist; use the modern `/api/session/*`):

```bash
SID=$(curl -s -X POST http://127.0.0.1:4096/api/session \
  -H 'Content-Type: application/json' \
  -d '{"location":{"directory":"/path/to/your/project"}}' \
  | python -c "import json,sys;print(json.load(sys.stdin)['data']['id'])")

curl -s -X POST "http://127.0.0.1:4096/api/session/$SID/prompt" \
  -H 'Content-Type: application/json' \
  -d '{"prompt":{"text":"Reply with exactly: OK"}}'
# → {"data":{"id":"msg_…","admittedSeq":1,…}}   (fire-and-confirm)

# Reply arrives on the SSE /event stream, not in the /prompt response:
curl -N "http://127.0.0.1:4096/api/session/$SID/event"
# → session.next.reasoning.*  (ignore)
# → session.next.text.ended   { "text": "OK" }   ← the reply
# → session.next.step.ended   (carries token usage)
```

Key facts for building against this API:

- `POST /api/session` → `ses_…`. `POST /api/session/{id}/prompt` → `msg_…` +
  `admittedSeq`, returns **immediately**; the reply is async.
- `GET /api/session/{id}/event` is SSE. Pass `?after=<admittedSeq>` as an
  integer cursor to resume from a known point.
- `POST /api/session/{id}/model` `{"model":{"id":"…","providerID":"opencode"}}`
  → 204, swaps the model mid-session.
- `GET /api/session/{id}/history` persists the event log.

## 4. Point Playime at it

The adapter (`backend/src/adapters/opencode.ts`) reads these env vars
(defaults in parentheses):

| Var | Default | Purpose |
|---|---|---|
| `OPENCODE_BASE_URL` | `http://127.0.0.1:4096` | server base |
| `OPENCODE_MODEL` | `deepseek-v4-flash-free` | main generation model |
| `OPENCODE_SMALL_MODEL` | — | cheap model for summarize/state calls |
| `OPENCODE_SERVER_PASSWORD` | — | auth if you secured the server |

Run the end-to-end streaming check from `backend/`:

```bash
cd backend && npm run smoke:opencode
# → streams a reply, prints usage + done, "STREAMING VERIFICATION PASSED"
```

## Troubleshooting

- **`ServeError` / "Unexpected error" on startup** → the port is already
  bound (another `opencode serve` is running). Don't launch a second one on
  4096 — find and use the existing listener, or run on another port.
- **No `session.next.text.delta` events** → normal. Some models (e.g.
  `deepseek-v4-flash-free`) emit the full reply in a single `text.ended`
  event; the adapter handles both shapes.
- **401 on requests** → the server was started with a password but you
  didn't set `OPENCODE_SERVER_PASSWORD` (or set a different one).
- **Config file** lives at `~/.config/opencode/opencode.jsonc` — the sample
  on this machine only sets `$schema`; providers/models are configured
  through the opencode UI or `opencode auth login`.
