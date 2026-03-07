# chrome-cli-bridge

A Chrome extension + CLI tool that lets any terminal command — including AI coding assistants like Copilot CLI or Claude Code — connect to a live browser tab and interact with it in real time.

Query the DOM, run JavaScript, read console and network logs, trigger events, navigate pages, take screenshots, simulate input, and more — all from the shell. Works on pages that require authentication or have anti-bot protections that defeat headless browsers and `curl`.

---

## Why

Headless tools and `curl` can't handle:
- Sites with complex authentication flows (OAuth, SSO, MFA)
- Anti-bot / anti-AI detection (Cloudflare Turnstile, CAPTCHA, fingerprinting)
- Dynamic SPAs where content is rendered client-side after login

`chrome-cli-bridge` bridges the gap: it connects to a **real Chrome tab you already have open** — bypassing all of that — and exposes it to any CLI tool.

---

## How it works

```
┌─────────────────────┐        WebSocket        ┌──────────────────────┐
│   Chrome Extension  │ ◄──────────────────────► │  Local Relay Server  │
│  (Manifest V3 SW)   │    JSON-RPC 2.0 +         │  (chrome-bridge CLI) │
│                     │    session token           │                      │
└─────────────────────┘                           └──────────┬───────────┘
                                                             │
                                                    stdin / stdout / SDK
                                                             │
                                              ┌──────────────▼───────────────┐
                                              │  Your CLI tool / AI Agent    │
                                              │  (Copilot CLI, Claude Code,  │
                                              │   shell scripts, Node.js…)   │
                                              └──────────────────────────────┘
```

1. You start the relay: `chrome-bridge start`
2. The extension (loaded in Chrome) connects to the relay over localhost WebSocket
3. Your CLI tool sends commands → relay forwards to extension → extension acts on the tab → results come back as JSON

All traffic stays on localhost. A one-time session token prevents other local processes from connecting.

---

## Installation

### 1. Install the CLI

```sh
npm install -g chrome-cli-bridge
```

### 2. Load the Chrome extension

Install the companion extension using either method:

**Option A — Chrome Web Store (recommended)**

Install directly — no Developer mode required:
[chrome-cli-bridge on the Chrome Web Store](https://chrome.google.com/webstore/detail/chrome-cli-bridge)

**Option B — Load from source (for contributors / offline)**

1. Open `chrome://extensions` in Chrome
2. Enable **Developer mode** (top-right toggle)
3. Click **Load unpacked** and select the `packages/extension/` directory
4. The `chrome-cli-bridge` icon will appear in your toolbar

### 3. Start the relay and connect the extension

```sh
chrome-bridge start
# Relay started on ws://localhost:9876
# Session token: a1b2c3d4-... (saved to ~/.chrome-cli-bridge.token)
```

Click the extension icon in Chrome, paste the session token, and click **Connect**. The extension is now bridged.

---

## Usage

### List open tabs

```sh
chrome-bridge tabs
```

```json
[
  { "id": 42, "windowId": 1, "title": "GitHub", "url": "https://github.com", "active": true, "status": "complete" },
  { "id": 43, "windowId": 1, "title": "Inbox", "url": "https://mail.google.com", "active": false, "status": "complete" }
]
```

### Select a tab

```sh
chrome-bridge tabs --select 42
chrome-bridge tabs --select active
```

### Query the DOM

```sh
chrome-bridge query --selector "h1"
chrome-bridge query --html
```

### Execute JavaScript

```sh
chrome-bridge exec --code "document.title"
chrome-bridge exec --code "fetch('/api/me').then(r => r.json())"
```

### Navigate to a URL

```sh
chrome-bridge navigate --url https://example.com
# {"url":"https://example.com","status":"complete"}
```

### Take a screenshot

```sh
# Print base64 PNG
chrome-bridge screenshot

# Save to file
chrome-bridge screenshot --output ./shot.png
# {"saved":"./shot.png"}
```

> **Note:** The selected tab must be the active foreground tab for `captureVisibleTab` to work.

### Read and write browser storage

```sh
# Read all localStorage
chrome-bridge storage --type local

# Read a specific key
chrome-bridge storage --type local --key myKey

# Write a value
chrome-bridge storage --type local --key myKey --set "hello"

# Read all cookies for the tab's origin
chrome-bridge storage --type cookies

# Read sessionStorage
chrome-bridge storage --type session
```

### Wait for an element

```sh
# Wait up to 5 s (default) for #app to appear
chrome-bridge wait --selector "#app"

# Custom timeout
chrome-bridge wait --selector ".loaded" --timeout 10000

# Returns exit code 1 if element never appears
```

### Read console logs

```sh
# Buffered snapshot
chrome-bridge logs

# Filter by level
chrome-bridge logs --level error

# Stream in real time via push events (Ctrl+C to stop)
chrome-bridge logs --watch

# Legacy alias
chrome-bridge logs --follow
```

### Read network requests

> **Note:** Attaches Chrome DevTools. Chrome shows a "DevTools connected" banner.

```sh
chrome-bridge logs --network
```

### Trigger DOM events

```sh
chrome-bridge trigger --selector "#submit-btn" --event click
```

### Inject a JavaScript file

```sh
chrome-bridge inject --file ./my-script.js
# {"ok":true}
```

### Simulate keyboard input

```sh
chrome-bridge type --selector "#search" --text "hello world"
```

### Simulate mouse click / hover

```sh
chrome-bridge click --selector "button#submit"
chrome-bridge hover --selector ".tooltip-trigger"
```

### Get full page HTML snapshot

```sh
chrome-bridge snapshot

# Include computed styles inline
chrome-bridge snapshot --styles
```

### Interactive JavaScript REPL

```sh
chrome-bridge repl
# chrome-bridge REPL — JavaScript in the selected tab
# > document.title
# "My Page Title"
# > 2 + 2
# 4
```

### DevTools data

```sh
# Runtime performance metrics
chrome-bridge devtools performance

# Heap memory snapshot (saved to file)
chrome-bridge devtools memory --output ./snap.heapsnapshot

# JavaScript code coverage (5 s window)
chrome-bridge devtools coverage --duration 5000
```

---

## Pipeline / stdin mode

`chrome-bridge` is designed to be composed in shell pipelines.

**Output is always JSON** when stdout is not a TTY:

```sh
chrome-bridge tabs | jq '.[0].id'
chrome-bridge exec --code "document.title" | jq -r '.result'
```

**Input via stdin (NDJSON):** When stdin is not a TTY, `chrome-bridge` reads newline-delimited JSON commands and writes one JSON result per line:

```sh
echo '{"command":"exec","code":"document.title"}' | chrome-bridge
# {"result":"GitHub"}
```

Force pipe mode:

```sh
chrome-bridge --pipe < commands.ndjson
```

**Supported NDJSON commands:** `tabs`, `select`, `exec`, `query`, `logs`, `network`, `trigger`, `screenshot`, `navigate`, `storage`, `wait`, `inject`, `snapshot`, `type`, `click`, `hover`.

---

## Node.js SDK

```js
import { ChromeBridge } from 'chrome-cli-bridge';

const bridge = new ChromeBridge();
await bridge.connect();

const tabs = await bridge.tabs();
await bridge.selectTab(tabs[0].id);

// Existing commands
const title  = await bridge.exec({ code: 'document.title' });
const elems  = await bridge.query({ selector: 'h1' });
const logs   = await bridge.logs({ level: 'error' });
const net    = await bridge.network();
await bridge.trigger({ selector: '#btn', event: 'click' });

// New commands
await bridge.navigate({ url: 'https://example.com' });
const shot   = await bridge.screenshot();            // { dataUrl: 'data:image/png;...' }
const store  = await bridge.storage({ type: 'local' });
const found  = await bridge.wait({ selector: '#app', timeout: 5000 });
await bridge.inject({ file: './script.js' });        // from CLI handler; SDK takes { code }
const snap   = await bridge.snapshot();              // { html: '...' }
await bridge.type({ selector: '#q', text: 'hello' });
await bridge.click({ selector: 'button' });
await bridge.hover({ selector: '.menu-item' });

// Real-time log streaming
const unsub = bridge.streamLogs((entry) => console.log(entry));
// ... later:
unsub();

// DevTools
const perf  = await bridge.devtools.performance();
const mem   = await bridge.devtools.memory({ output: './snap.heapsnapshot' });
const cov   = await bridge.devtools.coverage({ duration: 3000 });

await bridge.disconnect();
```

---

## Security

- The relay server **only listens on localhost** — no external network exposure.
- A **UUID v4 session token** is generated on every `chrome-bridge start` and saved to `~/.chrome-cli-bridge.token` (permissions `0600`). The extension must present this token or the connection is rejected.
- Network log access (via `chrome.debugger`) requires explicit use of `--network` and shows a visible Chrome banner to the user.

---

## Architecture

| Component | Tech | Role |
|---|---|---|
| `packages/extension/` | Chrome MV3 + Service Worker | Acts in the browser, executes DOM/JS/log commands |
| `packages/cli/` | Node.js | Relay server, CLI binary, Node.js SDK |
| Transport | WebSocket + JSON-RPC 2.0 | Bi-directional message passing + push events |
| Auth | UUID v4 token | Prevents unauthorized local connections |

See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) for full architecture details.

---

## Commands reference

| Command | Description |
|---|---|
| `chrome-bridge start` | Start the relay server |
| `chrome-bridge stop` | Stop the relay server |
| `chrome-bridge status` | Check if relay is running and extension is connected |
| `chrome-bridge tabs` | List all open tabs |
| `chrome-bridge tabs --select <id\|active>` | Set the active tab for the session |
| `chrome-bridge query --selector <css>` | Query DOM elements by CSS selector |
| `chrome-bridge query --html` | Get full page HTML |
| `chrome-bridge exec --code <js>` | Execute JavaScript in the tab |
| `chrome-bridge navigate --url <url>` | Navigate the tab to a URL and await load |
| `chrome-bridge screenshot [--output <file>]` | Capture a PNG screenshot |
| `chrome-bridge storage --type <local\|session\|cookies>` | Read browser storage |
| `chrome-bridge storage --type local --key <k> --set <v>` | Write to localStorage |
| `chrome-bridge wait --selector <css> [--timeout <ms>]` | Wait for element to appear |
| `chrome-bridge logs` | Read buffered console logs |
| `chrome-bridge logs --watch` | Stream console logs in real time |
| `chrome-bridge logs --level <level>` | Filter logs by level |
| `chrome-bridge logs --network` | Read network request/response log |
| `chrome-bridge trigger --selector <css> --event <type>` | Dispatch a DOM event |
| `chrome-bridge inject --file <path>` | Inject a local JS file into the tab |
| `chrome-bridge type --selector <css> --text <text>` | Simulate keyboard typing |
| `chrome-bridge click --selector <css>` | Simulate a mouse click |
| `chrome-bridge hover --selector <css>` | Simulate a mouse hover |
| `chrome-bridge snapshot [--styles]` | Get full page HTML snapshot |
| `chrome-bridge repl` | Start an interactive JavaScript REPL |
| `chrome-bridge devtools performance` | Collect runtime performance metrics |
| `chrome-bridge devtools memory [--output <file>]` | Take a heap snapshot |
| `chrome-bridge devtools coverage [--duration <ms>]` | Capture JS coverage data |

---

## Known limitations

- **Chrome only** (v1) — Firefox/Chromium support planned.
- `screenshot` only captures the visible viewport of the **active foreground tab**.
- Network log access attaches the Chrome Debugger, which displays a warning banner in the browser. This is a Chrome restriction and cannot be suppressed.
- `chrome.scripting.executeScript` requires host permissions for the tab's URL; the extension uses `<all_urls>` in development mode.
- The extension service worker may be suspended by Chrome when idle. An active bridge session keeps it alive via keepalive pings every 20 seconds.


---

## Why

Headless tools and `curl` can't handle:
- Sites with complex authentication flows (OAuth, SSO, MFA)
- Anti-bot / anti-AI detection (Cloudflare Turnstile, CAPTCHA, fingerprinting)
- Dynamic SPAs where content is rendered client-side after login

`chrome-cli-bridge` bridges the gap: it connects to a **real Chrome tab you already have open** — bypassing all of that — and exposes it to any CLI tool.

---

## How it works

```
┌─────────────────────┐        WebSocket        ┌──────────────────────┐
│   Chrome Extension  │ ◄──────────────────────► │  Local Relay Server  │
│  (Manifest V3 SW)   │    JSON-RPC 2.0 +         │  (chrome-bridge CLI) │
│                     │    session token           │                      │
└─────────────────────┘                           └──────────┬───────────┘
                                                             │
                                                    stdin / stdout / SDK
                                                             │
                                              ┌──────────────▼───────────────┐
                                              │  Your CLI tool / AI Agent    │
                                              │  (Copilot CLI, Claude Code,  │
                                              │   shell scripts, Node.js…)   │
                                              └──────────────────────────────┘
```

1. You start the relay: `chrome-bridge start`
2. The extension (loaded in Chrome) connects to the relay over localhost WebSocket
3. Your CLI tool sends commands → relay forwards to extension → extension acts on the tab → results come back as JSON

All traffic stays on localhost. A one-time session token prevents other local processes from connecting.

---

## Installation

### 1. Install the CLI

```sh
npm install -g chrome-cli-bridge
```

### 2. Load the Chrome extension

Install the companion extension using either method:

**Option A — Chrome Web Store (recommended)**

Install directly — no Developer mode required:
[chrome-cli-bridge on the Chrome Web Store](https://chrome.google.com/webstore/detail/chrome-cli-bridge)

**Option B — Load from source (for contributors / offline)**

1. Open `chrome://extensions` in Chrome
2. Enable **Developer mode** (top-right toggle)
3. Click **Load unpacked** and select the `packages/extension/` directory
4. The `chrome-cli-bridge` icon will appear in your toolbar

### 3. Start the relay and connect the extension

```sh
chrome-bridge start
# Relay started on ws://localhost:9876
# Session token: a1b2c3d4-... (saved to ~/.chrome-cli-bridge.token)
```

Click the extension icon in Chrome, paste the session token, and click **Connect**. The extension is now bridged.

---

## Usage

### List open tabs

```sh
chrome-bridge tabs
```

```json
[
  { "id": 42, "windowId": 1, "title": "GitHub", "url": "https://github.com", "active": true, "status": "complete" },
  { "id": 43, "windowId": 1, "title": "Inbox", "url": "https://mail.google.com", "active": false, "status": "complete" }
]
```

### Select a tab

```sh
# By tab ID
chrome-bridge tabs --select 42

# Or select whatever tab is currently in focus
chrome-bridge tabs --select active
```

### Query the DOM

```sh
chrome-bridge query --selector "h1"
chrome-bridge query --selector ".error-message"

# Full HTML snapshot of the page
chrome-bridge query --html
```

### Execute JavaScript

```sh
chrome-bridge exec --code "document.title"
chrome-bridge exec --code "window.location.href"
chrome-bridge exec --code "document.querySelector('#price').textContent"

# Async code is awaited automatically
chrome-bridge exec --code "fetch('/api/me').then(r => r.json())"
```

### Read console logs

```sh
# All buffered logs since session attached
chrome-bridge logs

# Filter by level
chrome-bridge logs --level error

# Stream in real time (Ctrl+C to stop)
chrome-bridge logs --follow
```

### Read network requests

> **Note:** This attaches Chrome DevTools to the tab. Chrome will show a "DevTools connected" banner — this is expected.

```sh
chrome-bridge logs --network
```

### Trigger DOM events

```sh
chrome-bridge trigger --selector "#submit-btn" --event click
chrome-bridge trigger --selector "input[name=email]" --event input
```

---

## Pipeline / stdin mode

`chrome-bridge` is designed to be composed in shell pipelines.

**Output is always JSON** when stdout is not a TTY, so you can pipe to `jq` or any other tool:

```sh
chrome-bridge tabs | jq '.[0].id'
chrome-bridge exec --code "document.title" | jq -r '.result'
```

**Input via stdin:** When stdin is not a TTY, `chrome-bridge` reads **newline-delimited JSON (NDJSON)** commands and writes one JSON result per line. This lets any tool drive it without spawning a subprocess per command:

```sh
echo '{"command":"exec","code":"document.title"}' | chrome-bridge
# {"result":"GitHub"}

cat commands.ndjson | chrome-bridge
# {"result":"GitHub"}
# {"result":"[object HTMLHeadingElement]"}
```

Force pipe mode explicitly (useful inside editor terminals or CI):

```sh
chrome-bridge --pipe < commands.ndjson
```

**NDJSON command format:**

```json
{ "command": "exec",    "code": "document.title" }
{ "command": "query",   "selector": "h1" }
{ "command": "logs",    "level": "error" }
{ "command": "trigger", "selector": "#btn", "event": "click" }
{ "command": "tabs" }
```

---

## Node.js SDK

```js
import { ChromeBridge } from 'chrome-cli-bridge';

const bridge = new ChromeBridge();
await bridge.connect();

const tabs = await bridge.tabs();
await bridge.selectTab(tabs[0].id);

const title = await bridge.exec({ code: 'document.title' });
console.log(title.result);

const elements = await bridge.query({ selector: 'h1' });
const logs = await bridge.logs({ level: 'error' });

await bridge.trigger({ selector: '#submit', event: 'click' });
await bridge.disconnect();
```

---

## Security

- The relay server **only listens on localhost** — no external network exposure.
- A **UUID v4 session token** is generated on every `chrome-bridge start` and saved to `~/.chrome-cli-bridge.token` (permissions `0600`). The extension must present this token or the connection is rejected.
- Network log access (via `chrome.debugger`) requires explicit use of `--network` and shows a visible Chrome banner to the user.

---

## Architecture

| Component | Tech | Role |
|---|---|---|
| `packages/extension/` | Chrome MV3 + Service Worker | Acts in the browser, executes DOM/JS/log commands |
| `packages/cli/` | Node.js | Relay server, CLI binary, Node.js SDK |
| Transport | WebSocket + JSON-RPC 2.0 | Bi-directional message passing |
| Auth | UUID v4 token | Prevents unauthorized local connections |

See [`openspec/changes/chrome-cli-bridge/design.md`](openspec/changes/chrome-cli-bridge/design.md) for full architecture decisions.

---

## Commands reference

| Command | Description |
|---|---|
| `chrome-bridge start` | Start the relay server |
| `chrome-bridge stop` | Stop the relay server |
| `chrome-bridge status` | Check if relay is running and extension is connected |
| `chrome-bridge tabs` | List all open tabs |
| `chrome-bridge tabs --select <id\|active>` | Set the active tab for the session |
| `chrome-bridge query --selector <css>` | Query DOM elements by CSS selector |
| `chrome-bridge query --html` | Get full page HTML |
| `chrome-bridge exec --code <js>` | Execute JavaScript in the tab |
| `chrome-bridge logs` | Read buffered console logs |
| `chrome-bridge logs --follow` | Stream console logs in real time |
| `chrome-bridge logs --level <level>` | Filter logs by level (log/warn/error/info/debug) |
| `chrome-bridge logs --network` | Read network request/response log |
| `chrome-bridge trigger --selector <css> --event <type>` | Dispatch a DOM event on an element |

---

## Known limitations

- **Chrome only** (v1) — Firefox/Chromium support planned.
- Network log access attaches the Chrome Debugger, which displays a warning banner in the browser. This is a Chrome restriction and cannot be suppressed.
- `chrome.scripting.executeScript` requires host permissions for the tab's URL; the extension uses `<all_urls>` in development mode.
- The extension service worker may be suspended by Chrome when idle. An active bridge session keeps it alive via keepalive pings every 20 seconds.
