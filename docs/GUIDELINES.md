# Technology Stack & Development Guidelines

## Technology Choices

| Concern | Choice | Rationale |
|---|---|---|
| Extension platform | Chrome Manifest V3 | Current standard; required for Chrome Web Store |
| Extension background | Service Worker | Required by MV3; no persistent background pages |
| Transport | WebSocket (ws npm package) | Bi-directional, low-latency, supported in Node.js and service workers |
| Protocol | JSON-RPC 2.0 | Simple, well-specified, easy to implement on both ends |
| CLI runtime | Node.js ≥ 18 | Native `fetch`, `crypto.randomUUID()`, ESM support |
| Module format | ESM (`"type": "module"`) | Modern, avoids CommonJS interop issues |
| CLI argument parsing | `yargs` | Mature, good `--help` generation, subcommand support |
| UUID generation | `crypto.randomUUID()` | Built-in to Node.js 18+; no extra dependency |
| Testing | Node.js `node:test` + `assert` | Built-in; no test framework dependency for unit tests |
| Integration testing | Puppeteer (Chromium) | Controls real browser; can load unpacked extensions |

## Project Structure Rules

- **Monorepo, no build step** — both packages are plain ES modules. No TypeScript, no Babel, no bundler.
- **No shared code between packages** — the extension runs in a sandboxed service worker; it cannot use Node.js modules. Keep them fully independent.
- **Extension code must be self-contained** — no npm dependencies in `packages/extension/`. All code is vanilla JS.
- **CLI dependencies** must be listed in `packages/cli/package.json`, not the root.

## Code Style

- **No semicolons** — enforce consistent ASI-based style.
- **2-space indentation**.
- **Single quotes** for strings everywhere.
- **Trailing commas** in multi-line objects and arrays.
- **`const` by default**, `let` only when reassignment is needed; never `var`.
- **Arrow functions** for callbacks and short utilities; named `function` declarations for top-level exports and handlers.
- **No default exports** — use named exports for clarity.
- **Errors as objects** — never throw raw strings. Use `new Error(message)` or structured `{ code, message }` objects for JSON-RPC errors.

## Error Handling

- All async functions must be wrapped in `try/catch` at boundaries (CLI command handlers, WebSocket message handlers).
- JSON-RPC errors use standard codes plus domain-specific codes in the `-32000` to `-32099` range:

| Code | Constant | Meaning |
|---|---|---|
| `-32700` | `PARSE_ERROR` | Invalid JSON received |
| `-32600` | `INVALID_REQUEST` | Not a valid JSON-RPC 2.0 object |
| `-32601` | `METHOD_NOT_FOUND` | Unknown method |
| `-32602` | `INVALID_PARAMS` | Missing or wrong parameters |
| `-32000` | `TAB_NOT_FOUND` | Referenced tab ID does not exist |
| `-32001` | `ELEMENT_NOT_FOUND` | CSS selector matched no elements |
| `-32002` | `EXEC_ERROR` | JavaScript execution threw an exception |
| `-32003` | `DEBUGGER_ATTACH_FAILED` | Could not attach chrome.debugger |

- CLI exits with code `0` on success, `1` on error.
- In pipe mode, errors are written as JSON lines — the process does NOT exit on per-line errors; it continues processing.

## Security Rules

- The relay MUST bind to `127.0.0.1` only. Never `0.0.0.0`.
- Token files MUST be created with mode `0600`.
- The extension MUST NOT forward any request until the handshake token has been validated.
- Never log or print the session token anywhere other than the initial `chrome-bridge start` output.

## Extension-Specific Rules

- Use `chrome.storage.local` (not `sync`) for the session token — it is device-local and must not sync across accounts.
- Wrap all `chrome.*` API calls in `try/catch` — many throw if the tab has been closed or navigated away.
- Always check that a tab is still valid before executing scripts (`chrome.tabs.get(tabId)`).
- `chrome.debugger` must be detached when the bridge session ends or the tab is closed.
- Popup UI must work without internet access — no CDN resources.

## CLI / SDK Rules

- All public SDK methods MUST return a Promise.
- SDK must not start the relay server on import — call `bridge.connect()` explicitly.
- TTY detection: `process.stdout.isTTY` for output format; `process.stdin.isTTY` for pipe mode detection.
- `--pipe` flag overrides TTY detection for stdin.

## Testing Rules

- Unit tests live in `tests/unit/`.
- Integration tests live in `tests/integration/`.
- Tests use only Node.js built-in `node:test` and `node:assert`.
- Integration tests may use Puppeteer and must be skipped gracefully if Chromium is not available.
- Each unit test file covers exactly one source module.
- Test file naming: `<module-name>.test.js`.

## Git Conventions

- Branch names: `feat/<feature>`, `fix/<issue>`, `chore/<task>`.
- Commit messages: imperative mood, 72-char subject line, blank line before body if needed.
- Never commit `~/.chrome-cli-bridge.token` or any secrets.
- Add `.chrome-cli-bridge.token` to `.gitignore`.
