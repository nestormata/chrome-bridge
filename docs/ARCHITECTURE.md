# Architecture

## Overview

`chrome-cli-bridge` is a two-package monorepo:

```
chrome-cli-bridge/
├── packages/
│   ├── extension/          # Chrome Manifest V3 extension
│   └── cli/                # Node.js relay server + CLI + SDK
├── tests/                  # Integration & unit tests
└── docs/                   # Architecture and guidelines
```

## System Components

```
┌────────────────────────────────────────────────────────────────┐
│  Chrome Browser                                                │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  Extension Service Worker (background.js)                │  │
│  │  ┌─────────────┐  chrome.scripting  ┌─────────────────┐  │  │
│  │  │  WS Client  │ ◄────────────────► │  Tab / Page     │  │  │
│  │  │  (JSON-RPC) │  chrome.debugger   │  (live content) │  │  │
│  │  └──────┬──────┘  chrome.tabs       └─────────────────┘  │  │
│  └─────────│────────────────────────────────────────────────┘  │
└────────────│────────────────────────────────────────────────────┘
             │  WebSocket  ws://localhost:9876
             │  JSON-RPC 2.0 + session token
┌────────────▼────────────────────────────────────────────────────┐
│  CLI Relay Server  (packages/cli/src/relay.js)                  │
│  ┌─────────────┐   ┌─────────────────────────────────────────┐  │
│  │  WS Server  │   │  JSON-RPC Router                        │  │
│  │  :9876      │   │  method → handler → response            │  │
│  │             │   │  push events → all CLI clients          │  │
│  └──────┬──────┘   └─────────────────────────────────────────┘  │
└─────────│───────────────────────────────────────────────────────┘
          │  stdin/stdout  OR  in-process SDK call
┌─────────▼───────────────────────────────────────────────────────┐
│  CLI / SDK Consumer                                             │
│  chrome-bridge exec --code "..."                                │
│  echo '{"command":"query","selector":"h1"}' | chrome-bridge     │
│  import { ChromeBridge } from 'chrome-cli-bridge'              │
└─────────────────────────────────────────────────────────────────┘
```

## Data Flow

1. **Consumer** invokes a command (CLI subcommand, stdin NDJSON, or SDK call).
2. **Relay** wraps the request as a JSON-RPC 2.0 message and sends it over the WebSocket to the extension.
3. **Extension service worker** receives the message, executes the appropriate Chrome API call (`chrome.scripting`, `chrome.tabs`, `chrome.debugger`, `chrome.cookies`), and sends the JSON-RPC response back.
4. **Relay** unwraps the response and writes it to stdout (JSON in pipe mode, human-readable in TTY) or resolves the SDK promise.
5. **Push events** (e.g. `stream.log`) sent by the extension with no `id` are forwarded by the relay to **all connected CLI clients** simultaneously.

## Graceful Shutdown

The relay tracks all connected WebSocket sockets (both extension and CLI clients) by role. On `stop()` — triggered by `chrome-bridge stop`, `SIGTERM`, or `SIGINT` (Ctrl+C) — the relay:

1. Clears the keepalive interval.
2. Calls `ws.terminate()` on **every socket** in `wss.clients` (not just the extension).
3. Calls `wss.close()`, which now returns immediately since all connections are already terminated.

This ensures `SIGINT` always exits within 500 ms regardless of how many CLI clients are connected.

## Push Event Forwarding (stream.log)

The extension can push real-time notifications to the relay at any time (JSON-RPC messages with no `id`). The relay forwards these to all authenticated CLI WebSocket clients so that `RelayClient.on('stream.log', handler)` and `bridge.streamLogs(handler)` work correctly.

```
Extension → ws.send({ method: 'stream.log', params: {...} })
                    ↓
          relay.#onConnection  isEvent(msg) === true
                    ↓
    for each cliWs in #cliClients → cliWs.send(raw)
                    ↓
  RelayClient.#onMessage → eventHandlers.get('stream.log') → handler(params)
```

## Package responsibilities

### `packages/extension/`

| File | Responsibility |
|---|---|
| `manifest.json` | MV3 manifest, permissions (`tabs`, `scripting`, `debugger`, `storage`, `alarms`, `cookies`), service worker |
| `background.js` | Service worker: WS client, JSON-RPC handler, Chrome API calls, keepalive, push event emission |
| `popup/popup.html` | Token input UI |
| `popup/popup.js` | Saves token to `chrome.storage.local` |

### `packages/cli/`

| File | Responsibility |
|---|---|
| `src/relay.js` | WebSocket server, token validation, JSON-RPC routing, push event forwarding, graceful shutdown |
| `src/rpc.js` | JSON-RPC 2.0 helpers (request/response/error builders) |
| `src/token.js` | UUID generation, token file read/write |
| `src/output.js` | TTY vs pipe output formatting |
| `src/commands/*.js` | One file per CLI subcommand |
| `src/index.js` | `ChromeBridge` SDK class export |
| `bin/chrome-bridge.js` | CLI entry point |

## Extension RPC Methods

| Method | Direction | Description |
|---|---|---|
| `tabs.list` | relay → ext | List all open windows and tabs |
| `tabs.select` | relay → ext | Set the selected tab for subsequent commands |
| `page.query` | relay → ext | Query DOM elements by CSS selector |
| `page.exec` | relay → ext | Execute JavaScript in the tab |
| `page.logs` | relay → ext | Return buffered console logs snapshot |
| `page.network` | relay → ext | Return captured network requests |
| `page.trigger` | relay → ext | Dispatch a DOM event on an element |
| `page.screenshot` | relay → ext | Capture tab as PNG via `captureVisibleTab` |
| `page.navigate` | relay → ext | Navigate tab to URL, await `status=complete` |
| `page.storage` | relay → ext | Read/write localStorage, sessionStorage, cookies |
| `page.wait` | relay → ext | Poll DOM until CSS selector appears |
| `page.inject` | relay → ext | Execute a JS string via `scripting.executeScript` |
| `page.snapshot` | relay → ext | Return full `outerHTML` (truncated at 5 MB) |
| `page.type` | relay → ext | Dispatch `Input.dispatchKeyEvent` per character |
| `page.click` | relay → ext | Dispatch `Input.dispatchMouseEvent` click |
| `page.hover` | relay → ext | Dispatch `Input.dispatchMouseEvent` move |
| `devtools.performance` | relay → ext | Collect `Performance.getMetrics` |
| `devtools.memory` | relay → ext | Stream `HeapProfiler.takeHeapSnapshot` chunks |
| `devtools.coverage` | relay → ext | `Profiler` precise coverage for a duration |
| `stream.log` | ext → relay | Push: new console log entry (real-time) |
| `tab:navigated` | ext → relay | Push: tab URL changed |

## Security Model

- Relay binds to `127.0.0.1` only — never `0.0.0.0`.
- Session token (UUID v4) written to `~/.chrome-cli-bridge.token` (mode `0600`).
- Extension reads token from `chrome.storage.local` (set via popup).
- Token sent in handshake; relay rejects with WS close code `4001` if invalid or not received within 5 s.
- `chrome.debugger` attachment (for network logs, DevTools data, and input simulation) requires explicit use and shows Chrome's "DevTools connected" banner.

## Extension ↔ Relay Protocol

All messages are JSON-RPC 2.0 objects over a single WebSocket connection.

**Handshake** (first message from extension → relay):
```json
{ "jsonrpc": "2.0", "method": "handshake", "params": { "token": "<uuid>" }, "id": 0 }
```

**Request** (relay → extension):
```json
{ "jsonrpc": "2.0", "method": "tabs.list", "params": {}, "id": 1 }
```

**Response** (extension → relay):
```json
{ "jsonrpc": "2.0", "result": [...], "id": 1 }
```

**Error** (extension → relay):
```json
{ "jsonrpc": "2.0", "error": { "code": -32000, "message": "TAB_NOT_FOUND" }, "id": 1 }
```

**Push event / notification** (extension → relay, no `id`):
```json
{ "jsonrpc": "2.0", "method": "stream.log", "params": { "level": "log", "text": "hello", "timestamp": 1234567890 } }
```

Push events with no `id` are forwarded by the relay to all connected CLI WebSocket clients verbatim.

## Keepalive

The relay sends a WebSocket `ping` frame every 20 seconds while a session is active. The extension service worker uses `chrome.alarms` (fires every 25 seconds) to stay alive. Both mechanisms together prevent service worker suspension during active bridge sessions.


`chrome-cli-bridge` is a two-package monorepo:

```
chrome-cli-bridge/
├── packages/
│   ├── extension/          # Chrome Manifest V3 extension
│   └── cli/                # Node.js relay server + CLI + SDK
├── tests/                  # Integration & unit tests
└── docs/                   # Architecture and guidelines
```

## System Components

```
┌────────────────────────────────────────────────────────────────┐
│  Chrome Browser                                                │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  Extension Service Worker (background.js)                │  │
│  │  ┌─────────────┐  chrome.scripting  ┌─────────────────┐  │  │
│  │  │  WS Client  │ ◄────────────────► │  Tab / Page     │  │  │
│  │  │  (JSON-RPC) │  chrome.debugger   │  (live content) │  │  │
│  │  └──────┬──────┘  chrome.tabs       └─────────────────┘  │  │
│  └─────────│────────────────────────────────────────────────┘  │
└────────────│────────────────────────────────────────────────────┘
             │  WebSocket  ws://localhost:9876
             │  JSON-RPC 2.0 + session token
┌────────────▼────────────────────────────────────────────────────┐
│  CLI Relay Server  (packages/cli/src/relay.js)                  │
│  ┌─────────────┐   ┌─────────────────────────────────────────┐  │
│  │  WS Server  │   │  JSON-RPC Router                        │  │
│  │  :9876      │   │  method → handler → response            │  │
│  └──────┬──────┘   └─────────────────────────────────────────┘  │
└─────────│───────────────────────────────────────────────────────┘
          │  stdin/stdout  OR  in-process SDK call
┌─────────▼───────────────────────────────────────────────────────┐
│  CLI / SDK Consumer                                             │
│  chrome-bridge exec --code "..."                                │
│  echo '{"command":"query","selector":"h1"}' | chrome-bridge     │
│  import { ChromeBridge } from 'chrome-cli-bridge'              │
└─────────────────────────────────────────────────────────────────┘
```

## Data Flow

1. **Consumer** invokes a command (CLI subcommand, stdin NDJSON, or SDK call).
2. **Relay** wraps the request as a JSON-RPC 2.0 message and sends it over the WebSocket to the extension.
3. **Extension service worker** receives the message, executes the appropriate Chrome API call (`chrome.scripting`, `chrome.tabs`, `chrome.debugger`), and sends the JSON-RPC response back.
4. **Relay** unwraps the response and writes it to stdout (JSON in pipe mode, human-readable in TTY) or resolves the SDK promise.

## Package responsibilities

### `packages/extension/`

| File | Responsibility |
|---|---|
| `manifest.json` | MV3 manifest, permissions, service worker registration |
| `background.js` | Service worker: WS client, JSON-RPC handler, Chrome API calls, keepalive |
| `popup/popup.html` | Token input UI |
| `popup/popup.js` | Saves token to `chrome.storage.local` |

### `packages/cli/`

| File | Responsibility |
|---|---|
| `src/relay.js` | WebSocket server, token validation, JSON-RPC routing |
| `src/rpc.js` | JSON-RPC 2.0 helpers (request/response/error builders) |
| `src/token.js` | UUID generation, token file read/write |
| `src/output.js` | TTY vs pipe output formatting |
| `src/commands/*.js` | One file per CLI subcommand |
| `src/index.js` | `ChromeBridge` SDK class export |
| `bin/chrome-bridge.js` | CLI entry point |

## Security Model

- Relay binds to `127.0.0.1` only — never `0.0.0.0`.
- Session token (UUID v4) written to `~/.chrome-cli-bridge.token` (mode `0600`).
- Extension reads token from `chrome.storage.local` (set via popup).
- Token sent in handshake; relay rejects with WS close code `4001` if invalid or not received within 5 s.
- `chrome.debugger` attachment (for network logs) requires explicit user action and shows Chrome's "DevTools connected" banner.

## Extension ↔ Relay Protocol

All messages are JSON-RPC 2.0 objects over a single WebSocket connection.

**Handshake** (first message from extension → relay):
```json
{ "jsonrpc": "2.0", "method": "handshake", "params": { "token": "<uuid>" }, "id": 0 }
```

**Request** (relay → extension):
```json
{ "jsonrpc": "2.0", "method": "tabs.list", "params": {}, "id": 1 }
```

**Response** (extension → relay):
```json
{ "jsonrpc": "2.0", "result": [...], "id": 1 }
```

**Error** (extension → relay):
```json
{ "jsonrpc": "2.0", "error": { "code": -32000, "message": "TAB_NOT_FOUND" }, "id": 1 }
```

**Event / push** (extension → relay, no id):
```json
{ "jsonrpc": "2.0", "method": "tab:navigated", "params": { "tabId": 42, "url": "https://..." } }
```

## Keepalive

The relay sends a WebSocket `ping` frame every 20 seconds while a session is active. The extension service worker uses `chrome.alarms` (fires every 25 seconds) to stay alive. Both mechanisms together prevent service worker suspension during active bridge sessions.
