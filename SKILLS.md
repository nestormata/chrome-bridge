# chrome-cli-bridge — AI Skills File

This file teaches AI coding assistants (GitHub Copilot CLI, Claude Code, Cursor, Aider, and others) how to use `chrome-cli-bridge` to interact with a live Chrome tab from the terminal.

---

## What is chrome-cli-bridge?

`chrome-cli-bridge` bridges your terminal to a real Chrome tab you already have open. It bypasses authentication walls, anti-bot protections, and SPAs that defeat headless browsers.

**The relay must be running before any commands work:**
```sh
chrome-bridge start
```
Then connect via the Chrome extension popup (paste the displayed token).

---

## Quick reference for AI agents

### Read the page
```sh
chrome-bridge exec --code "document.title"
chrome-bridge exec --code "document.querySelector('h1').textContent"
chrome-bridge exec --code "[...document.querySelectorAll('a')].map(a=>a.href)"
chrome-bridge query --selector ".price"
chrome-bridge snapshot          # full page HTML
```

### Navigate
```sh
chrome-bridge navigate --url https://example.com
chrome-bridge wait --selector "#content" --timeout 8000
```

### Interact
```sh
chrome-bridge type   --selector "#search" --text "query"
chrome-bridge click  --selector "button[type=submit]"
chrome-bridge hover  --selector ".dropdown"
chrome-bridge trigger --selector "#form" --event submit
```

### Screenshot
```sh
chrome-bridge screenshot --output /tmp/shot.png
```

### Storage & cookies
```sh
chrome-bridge storage --type local
chrome-bridge storage --type cookies
chrome-bridge storage --type local --key token --set value
```

### Logs & network
```sh
chrome-bridge logs --level error
chrome-bridge logs --network
chrome-bridge logs --watch      # stream in real time
```

### Run arbitrary JS (async supported)
```sh
chrome-bridge exec --code "fetch('/api/me').then(r=>r.json())"
chrome-bridge inject --file ./patch.js
```

### REPL (interactive)
```sh
chrome-bridge repl
```

### Batch mode (NDJSON via stdin)
```sh
echo '{"command":"exec","code":"document.title"}' | chrome-bridge
cat commands.ndjson | chrome-bridge
```

---

## How to use this file with each AI tool

### GitHub Copilot CLI

Copilot CLI reads `.github/copilot-instructions.md` if present. Copy or symlink this section:

```sh
cp SKILLS.md .github/copilot-instructions.md
```

Or add a reference in `.github/copilot-instructions.md`:
```markdown
You have access to a live Chrome tab via chrome-cli-bridge.
See SKILLS.md for the full command reference.
Use `chrome-bridge <command>` whenever you need to read the DOM,
run JavaScript, navigate, screenshot, or interact with the browser.
All output is JSON. The relay must be running (`chrome-bridge start`).
```

### Claude Code (claude.ai / Claude CLI)

Claude Code reads `CLAUDE.md` in the project root. Add or create it:

```sh
cat >> CLAUDE.md << 'EOF'

## Browser automation — chrome-cli-bridge

You have access to a live Chrome tab via chrome-cli-bridge.
See SKILLS.md for the full command reference.

Key rules:
- Use `chrome-bridge exec --code "<js>"` to read or manipulate the page
- Use `chrome-bridge navigate --url <url>` then `chrome-bridge wait --selector <css>` before reading content
- Use `chrome-bridge snapshot` for full HTML when you need to understand page structure
- Use `chrome-bridge screenshot --output /tmp/shot.png` to visually verify the page
- All output is JSON — pipe to `jq` for extraction
- The relay must already be running (`chrome-bridge start`)
EOF
```

### Cursor

Cursor reads `.cursorrules` in the project root:

```sh
cat >> .cursorrules << 'EOF'

## Browser access via chrome-cli-bridge
You can interact with a live Chrome tab using `chrome-bridge` commands.
See SKILLS.md for the complete reference.
Use chrome-bridge to read DOM content, run JavaScript, navigate pages,
take screenshots, and simulate user interactions.
All output is JSON. Relay must be running: `chrome-bridge start`.
EOF
```

### Aider

Pass this file as context at startup:

```sh
aider --read SKILLS.md
```

Or add to your `.aider.conf.yml`:
```yaml
read:
  - SKILLS.md
```

### Continue.dev (VS Code / JetBrains)

Add to your `~/.continue/config.json` under `systemMessage` or `contextProviders`:
```json
{
  "systemMessage": "You have access to a live Chrome tab via chrome-cli-bridge. See the SKILLS.md file in the project root for the full command reference. Use chrome-bridge commands to interact with the browser when needed."
}
```

### Cline / RooCode (VS Code)

Add to `.clinerules` in the project root:
```
You have access to a live Chrome tab via chrome-cli-bridge.
See SKILLS.md for the command reference.
Use chrome-bridge to read DOM, execute JS, navigate, screenshot, or interact with the page.
All output is JSON. Relay must be running: chrome-bridge start.
```

### Generic system prompt (any tool)

If your AI tool accepts a custom system prompt, add:

```
You have access to a live Chrome tab via the chrome-cli-bridge tool.
Available commands:
- chrome-bridge exec --code "<js>"          Run JavaScript in the tab
- chrome-bridge navigate --url <url>        Navigate to a URL
- chrome-bridge wait --selector <css>       Wait for element to appear
- chrome-bridge query --selector <css>      Query DOM elements
- chrome-bridge snapshot                    Get full page HTML
- chrome-bridge screenshot --output <file>  Take a screenshot
- chrome-bridge type --selector <s> --text <t>  Type text into element
- chrome-bridge click --selector <css>      Click an element
- chrome-bridge logs --level error          Read console logs
- chrome-bridge storage --type local        Read localStorage
- chrome-bridge storage --type cookies      Read cookies
All output is JSON. The relay must be running: chrome-bridge start.
```

---

## Tips for AI agents

1. **Always navigate + wait before reading** — pages may not be fully loaded:
   ```sh
   chrome-bridge navigate --url https://site.com/data
   chrome-bridge wait --selector ".data-table"
   chrome-bridge exec --code "[...document.querySelectorAll('.row')].map(r=>r.textContent)"
   ```

2. **Use `snapshot` to understand structure** before writing selectors:
   ```sh
   chrome-bridge snapshot | head -c 5000
   ```

3. **Pipe to `jq` for clean extraction:**
   ```sh
   chrome-bridge exec --code "document.title" | jq -r '.result'
   ```

4. **Batch multiple reads in one pass** using NDJSON:
   ```sh
   printf '{"command":"exec","code":"document.title"}\n{"command":"exec","code":"location.href"}\n' | chrome-bridge
   ```

5. **The extension only works on the selected tab.** If commands fail, check:
   ```sh
   chrome-bridge tabs          # see all tabs
   chrome-bridge tabs --select active   # re-select the active tab
   ```

---

## Node.js SDK (for scripts and tests)

```js
import { ChromeBridge } from 'chrome-cli-bridge';

const bridge = new ChromeBridge();
await bridge.connect();
await bridge.navigate({ url: 'https://example.com' });
await bridge.wait({ selector: '#app' });
const { result } = await bridge.exec({ code: 'document.title' });
await bridge.screenshot({ output: '/tmp/shot.png' });
await bridge.disconnect();
```

---

## More information

- npm: https://www.npmjs.com/package/chrome-cli-bridge
- Source: https://github.com/nestormata/chrome-bridge
- Architecture: docs/ARCHITECTURE.md
