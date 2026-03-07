# chrome-cli-bridge

> Connect any CLI tool or AI agent to a **live Chrome tab** — bypass auth walls, anti-bot detection, and SPAs that defeat headless browsers.

```sh
npm install -g chrome-cli-bridge
```

---

## What it does

Headless browsers and `curl` can't handle pages protected by:

- OAuth / SSO / MFA login flows
- Cloudflare Turnstile, CAPTCHA, fingerprinting
- Client-side rendered SPAs that only show data after login

`chrome-cli-bridge` connects to a **real Chrome tab you already have open** and exposes it to any terminal tool — AI coding assistants, shell scripts, Node.js SDKs, pipelines. All traffic stays on localhost.

```
┌──────────────────────┐   WebSocket + JSON-RPC   ┌─────────────────────┐
│   Chrome Extension   │ ◄───────────────────────► │  Local Relay Server │
│  (your live tab)     │      session token         │  chrome-bridge CLI  │
└──────────────────────┘                           └──────────┬──────────┘
                                                              │
                                               ┌─────────────▼────────────┐
                                               │  Copilot CLI · Claude     │
                                               │  Code · shell scripts ·  │
                                               │  Node.js SDK · pipelines │
                                               └──────────────────────────┘
```

---

## Installation

### 1 — Install the CLI

```sh
npm install -g chrome-cli-bridge
```

Requires **Node.js ≥ 18**.

### 2 — Load the Chrome extension

The companion extension is what actually acts in the browser. Install it using either method:

**Option A — Chrome Web Store (recommended)**

Install directly from the store — no Developer mode required:
[chrome-cli-bridge on the Chrome Web Store](https://chrome.google.com/webstore/detail/chrome-cli-bridge)

**Option B — Load from source (for contributors / offline)**

1. Download the extension from the [GitHub releases page](https://github.com/nestormata/chrome-bridge/releases)
2. Open **chrome://extensions** in Chrome
3. Enable **Developer mode** (top-right toggle)
4. Click **Load unpacked** → select the `extension/` folder

### 3 — Start the relay and connect

```sh
chrome-bridge start
# ✔ Relay started on ws://localhost:9876
# ✔ Session token: a1b2c3d4-… (saved to ~/.chrome-cli-bridge.token)
```

Click the extension icon in Chrome, paste the token, click **Connect**. The bridge is live.

---

## Commands

### Navigation & tabs

```sh
chrome-bridge tabs                          # list all open tabs
chrome-bridge tabs --select 42             # select tab by ID
chrome-bridge tabs --select active         # select the focused tab

chrome-bridge navigate --url https://example.com   # navigate and await load
```

### Inspect the page

```sh
chrome-bridge query --selector "h1"        # query DOM elements
chrome-bridge query --html                 # full page HTML

chrome-bridge snapshot                     # full outerHTML snapshot
chrome-bridge snapshot --styles            # with inline computed styles

chrome-bridge exec --code "document.title"
chrome-bridge exec --code "fetch('/api/me').then(r => r.json())"
```

### Screenshot

```sh
chrome-bridge screenshot                   # prints base64 PNG
chrome-bridge screenshot --output shot.png # saves to file
```

### Storage

```sh
chrome-bridge storage --type local                    # read all localStorage
chrome-bridge storage --type local --key token        # read one key
chrome-bridge storage --type local --key x --set val  # write a key
chrome-bridge storage --type session                  # sessionStorage
chrome-bridge storage --type cookies                  # cookies for tab origin
```

### Wait for elements

```sh
chrome-bridge wait --selector "#app"              # wait up to 5 s
chrome-bridge wait --selector ".loaded" --timeout 10000
# exits with code 1 on timeout
```

### Logs & network

```sh
chrome-bridge logs                         # buffered console logs
chrome-bridge logs --level error           # filter by level
chrome-bridge logs --watch                 # stream in real time (Ctrl+C stops)
chrome-bridge logs --network               # captured HTTP requests
```

### Interact with the page

```sh
chrome-bridge trigger --selector "#btn" --event click   # dispatch DOM event
chrome-bridge type   --selector "#search" --text "hello world"
chrome-bridge click  --selector "button.submit"
chrome-bridge hover  --selector ".dropdown-trigger"
chrome-bridge inject --file ./patch.js     # inject a local JS file
```

### Interactive REPL

```sh
chrome-bridge repl
# chrome-bridge REPL — JavaScript in the selected tab
# > document.title
# "My Page"
# > document.querySelectorAll('a').length
# 42
```

### DevTools data

```sh
chrome-bridge devtools performance                     # runtime metrics
chrome-bridge devtools memory --output snap.heapsnapshot
chrome-bridge devtools coverage --duration 5000        # JS coverage, 5 s
```

---

## Pipeline / stdin mode

Output is always JSON when stdout is not a TTY — pipe freely:

```sh
chrome-bridge tabs | jq '.[0].id'
chrome-bridge exec --code "document.title" | jq -r '.result'
```

**NDJSON batch mode** — send one command per line, get one result per line:

```sh
echo '{"command":"exec","code":"document.title"}' | chrome-bridge

cat <<EOF | chrome-bridge
{"command":"navigate","url":"https://example.com"}
{"command":"wait","selector":"#content"}
{"command":"snapshot"}
EOF
```

Force pipe mode in environments that look like a TTY:

```sh
chrome-bridge --pipe < commands.ndjson
```

---

## Node.js SDK

```js
import { ChromeBridge } from 'chrome-cli-bridge';

const bridge = new ChromeBridge();
await bridge.connect();

const tabs = await bridge.tabs();
await bridge.selectTab(tabs[0].id);

// Navigate & inspect
await bridge.navigate({ url: 'https://example.com' });
await bridge.wait({ selector: '#app', timeout: 8000 });
const snap = await bridge.snapshot();

// Execute JS
const { result } = await bridge.exec({ code: 'document.title' });

// Interact
await bridge.type({ selector: '#q', text: 'search term' });
await bridge.click({ selector: 'button[type=submit]' });

// Screenshot
const { dataUrl } = await bridge.screenshot();

// Storage
const store = await bridge.storage({ type: 'local' });
const cookies = await bridge.storage({ type: 'cookies' });

// Real-time logs
const unsub = bridge.streamLogs((entry) => console.log(entry));
// ... later:
unsub();

// DevTools
const metrics = await bridge.devtools.performance();

await bridge.disconnect();
```

---

## Usage with AI coding assistants

`chrome-cli-bridge` is designed to be a tool layer for AI agents working in the terminal.

> **📄 `SKILLS.md`** — The repo includes a ready-to-use [`SKILLS.md`](https://github.com/nestormata/chrome-bridge/blob/main/SKILLS.md) file with copy-paste instructions for setting up chrome-cli-bridge with GitHub Copilot CLI, Claude Code, Cursor, Aider, Cline, Continue.dev, and any tool that accepts a system prompt.

### GitHub Copilot CLI

Add to `.github/copilot-instructions.md`:
```
You have access to a live Chrome tab via chrome-cli-bridge.
Use `chrome-bridge <command>` to read the DOM, run JavaScript,
capture screenshots, navigate, or interact with the page.
All output is JSON. Relay must be running: chrome-bridge start.
```

Example session:
```
you> read the current page title from my browser
copilot> chrome-bridge exec --code "document.title"
{"result":"Checkout — My Store"}
```

### Claude Code

Add to `CLAUDE.md` in your project root:
```
You have access to a live Chrome tab via chrome-cli-bridge.
Use `chrome-bridge exec --code "<js>"` to read or manipulate the page.
Use `chrome-bridge navigate` then `chrome-bridge wait` before reading content.
All output is JSON. Relay must be running: chrome-bridge start.
```

### Cursor

Add to `.cursorrules`:
```
You can interact with a live Chrome tab using chrome-bridge commands.
All output is JSON. Relay must be running: chrome-bridge start.
```

### Aider

```sh
aider --read SKILLS.md
```

### Shell script automation

```sh
#!/bin/bash
# Scrape a page that requires login (you're already logged in via Chrome)

chrome-bridge navigate --url "https://myapp.com/dashboard"
chrome-bridge wait --selector "#data-table"

DATA=$(chrome-bridge exec --code "
  [...document.querySelectorAll('#data-table tr')]
    .slice(1)
    .map(r => r.cells[0].textContent + ',' + r.cells[1].textContent)
    .join('\n')
")

echo "$DATA" | jq -r '.result' > output.csv
```

### Automated testing of authenticated pages

```js
import { ChromeBridge } from 'chrome-cli-bridge';

// You're already logged in — no need to re-auth in the test
const bridge = new ChromeBridge();
await bridge.connect();

await bridge.navigate({ url: 'https://app.example.com/orders' });
await bridge.wait({ selector: '.order-list' });

const count = await bridge.exec({ code: 'document.querySelectorAll(".order-row").length' });
console.assert(count.result > 0, 'Expected orders to be visible');

const shot = await bridge.screenshot({ output: 'test-screenshot.png' });
```

---

## Security

- Relay **only listens on `127.0.0.1`** — zero external exposure
- **UUID v4 session token** rotated on every `chrome-bridge start`, stored at `~/.chrome-cli-bridge.token` (mode `0600`)
- Extension rejects connections without a valid token (WS close code `4001`)
- Network / DevTools access requires explicit commands and shows Chrome's "DevTools connected" banner — nothing is captured passively

---

## License

MIT © [Nestor Mata](https://github.com/nestormata)
