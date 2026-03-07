# Privacy Policy — chrome-cli-bridge

**Last updated:** March 2026

---

## Overview

`chrome-cli-bridge` is a developer tool that bridges your local terminal (CLI tools, AI agents, scripts) to a Chrome tab you already have open. **All communication is local — no data is ever sent to any remote server, third party, or external service.**

---

## Data Access and Use

### What the extension accesses

The extension accesses data in your browser **only when you explicitly invoke a command** from your local terminal:

| Data | When accessed | Why |
|---|---|---|
| Tab list (titles, URLs, IDs) | On `chrome-bridge tabs` | To let you choose which tab to interact with |
| Page DOM / HTML | On `chrome-bridge query`, `snapshot` | To read page content on request |
| JavaScript execution results | On `chrome-bridge exec`, `inject` | To run code you supply in the selected tab |
| Console logs | On `chrome-bridge logs` | To expose runtime errors/warnings to your terminal |
| Network requests | On `chrome-bridge logs --network` | To expose HTTP traffic to your terminal |
| Screenshots | On `chrome-bridge screenshot` | To capture the visible viewport on request |
| localStorage / sessionStorage | On `chrome-bridge storage` | To read/write storage on request |
| Cookies | On `chrome-bridge storage --type cookies` | To read cookies for the selected tab's origin on request |
| Performance metrics, heap, coverage | On `chrome-bridge devtools *` | To expose DevTools data to your terminal on request |

### What the extension does NOT do

- ❌ Does **not** collect, store, or transmit any data to any server
- ❌ Does **not** run in the background without your knowledge — the bridge is only active while you have `chrome-bridge start` running in your terminal
- ❌ Does **not** access any tab you haven't explicitly selected
- ❌ Does **not** modify any page content unless you explicitly run `exec`, `inject`, `type`, `click`, or `trigger` commands
- ❌ Does **not** track browsing history or behavior

---

## Data Transmission

All data flows **exclusively between your browser and your own machine** over a local WebSocket connection (`ws://127.0.0.1:9876`). No data leaves your computer.

A **UUID session token** is generated each time you start the relay and is stored in `~/.chrome-cli-bridge.token` (file permissions `0600`). This token is used solely to prevent other processes on your local machine from connecting to the relay.

---

## Permissions Justification

| Chrome permission | Reason |
|---|---|
| `tabs` | List open tabs and identify which tab is selected for bridging |
| `scripting` | Execute JavaScript in the selected tab on user request |
| `debugger` | Capture network logs, performance metrics, heap snapshots, coverage data, and simulate keyboard/mouse input — only when explicitly requested |
| `storage` | Persist the session token and relay port between popup opens |
| `alarms` | Keep the service worker alive during active bridge sessions |
| `cookies` | Read cookies for the selected tab's origin when `storage --type cookies` is invoked |
| `<all_urls>` host permission | Required by `chrome.scripting.executeScript` to inject scripts into any user-selected tab |

---

## Children's Privacy

This tool is intended for software developers. It is not directed at children under the age of 13 and does not knowingly collect any information from children.

---

## Changes to This Policy

If this policy changes, the updated version will be committed to this repository and the "Last updated" date above will be revised.

---

## Contact

Nestor Mata — [nestor.mata@gmail.com](mailto:nestor.mata@gmail.com)  
Repository: [https://github.com/nestormata/chrome-bridge](https://github.com/nestormata/chrome-bridge)
