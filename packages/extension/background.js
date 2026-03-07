// Service worker for chrome-cli-bridge extension
// Connects to the local relay server and handles JSON-RPC commands

const RELAY_DEFAULT_PORT = 9876
const KEEPALIVE_ALARM = 'chrome-cli-bridge-keepalive'
const RECONNECT_BASE_MS = 500
const RECONNECT_MAX_MS = 30000

let ws = null
let selectedTabId = null
let consoleLogs = []
let networkRequests = []
let debuggerAttached = false
let reconnectAttempt = 0
let port = RELAY_DEFAULT_PORT

// ── Keepalive via alarms (prevents SW suspension) ──────────────────────────

chrome.alarms.create(KEEPALIVE_ALARM, { periodInMinutes: 0.4 }) // ~25s
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === KEEPALIVE_ALARM) ensureConnected()
})

// ── Connection management ───────────────────────────────────────────────────

async function ensureConnected() {
  if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) return
  await connect()
}

async function connect() {
  const { relayPort, relayToken } = await chrome.storage.local.get(['relayPort', 'relayToken'])
  if (!relayToken) return // not configured yet

  port = relayPort || RELAY_DEFAULT_PORT

  ws = new WebSocket(`ws://127.0.0.1:${port}`)

  ws.addEventListener('open', () => {
    reconnectAttempt = 0
    // Send handshake immediately
    send({ jsonrpc: '2.0', method: 'handshake', params: { token: relayToken }, id: 0 })
  })

  ws.addEventListener('message', (event) => {
    let msg
    try { msg = JSON.parse(event.data) } catch { return }
    handleMessage(msg)
  })

  ws.addEventListener('close', () => {
    ws = null
    scheduleReconnect()
  })

  ws.addEventListener('error', () => {
    // close event will follow; handled there
  })
}

function scheduleReconnect() {
  const delay = Math.min(RECONNECT_BASE_MS * 2 ** reconnectAttempt, RECONNECT_MAX_MS)
  reconnectAttempt++
  setTimeout(connect, delay)
}

function send(obj) {
  if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify(obj))
}

function reply(id, result) {
  send({ jsonrpc: '2.0', result, id })
}

function replyError(id, code, message, data) {
  send({ jsonrpc: '2.0', error: { code, message, ...(data && { data }) }, id })
}

function emit(method, params) {
  send({ jsonrpc: '2.0', method, params })
}

// ── Incoming message dispatcher ─────────────────────────────────────────────

async function handleMessage(msg) {
  if (!msg.method || msg.id === undefined) return // ignore events/acks we don't handle
  if (msg.method === 'handshake') return // ack; nothing to do

  const { method, params, id } = msg

  try {
    switch (method) {
      case 'tabs.list':         return reply(id, await tabsList())
      case 'tabs.select':       return reply(id, await tabsSelect(params))
      case 'page.query':        return reply(id, await pageQuery(params))
      case 'page.exec':         return reply(id, await pageExec(params))
      case 'page.logs':         return reply(id, pageLogs(params))
      case 'page.network':      return reply(id, pageNetwork())
      case 'page.trigger':      return reply(id, await pageTrigger(params))
      case 'page.screenshot':   return reply(id, await pageScreenshot())
      case 'page.navigate':     return reply(id, await pageNavigate(params))
      case 'page.storage':      return reply(id, await pageStorage(params))
      case 'page.wait':         return reply(id, await pageWait(params))
      case 'page.inject':       return reply(id, await pageInject(params))
      case 'page.snapshot':     return reply(id, await pageSnapshot(params))
      case 'page.type':         return reply(id, await pageType(params))
      case 'page.click':        return reply(id, await pageClick(params))
      case 'page.hover':        return reply(id, await pageHover(params))
      case 'devtools.performance': return reply(id, await devtoolsPerformance())
      case 'devtools.memory':   return reply(id, await devtoolsMemory(params))
      case 'devtools.coverage': return reply(id, await devtoolsCoverage(params))
      default:
        replyError(id, -32601, 'Method not found')
    }
  } catch (err) {
    replyError(id, err.code ?? -32000, err.message, err.data)
  }
}

// ── Tab management ──────────────────────────────────────────────────────────

async function tabsList() {
  const windows = await chrome.windows.getAll({ populate: true })
  return windows.flatMap((win) =>
    win.tabs.map((t) => ({
      id: t.id,
      windowId: t.windowId,
      title: t.title,
      url: t.url,
      active: t.active,
      status: t.status,
    }))
  )
}

async function tabsSelect({ tabId }) {
  if (tabId === 'active') {
    const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true })
    if (!tab) throw Object.assign(new Error('TAB_NOT_FOUND'), { code: -32000 })
    selectedTabId = tab.id
  } else {
    try {
      await chrome.tabs.get(tabId)
      selectedTabId = tabId
    } catch {
      throw Object.assign(new Error('TAB_NOT_FOUND'), { code: -32000 })
    }
  }
  await attachConsoleInterceptor()
  return { selectedTabId }
}

// Emit navigation events for the selected tab
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (tabId === selectedTabId && changeInfo.url) {
    emit('tab:navigated', { tabId, url: changeInfo.url })
  }
})

// ── Console log capture ─────────────────────────────────────────────────────

async function attachConsoleInterceptor() {
  if (!selectedTabId) return
  try {
    await chrome.scripting.executeScript({
      target: { tabId: selectedTabId },
      world: 'MAIN',
      func: () => {
        if (window.__chromeCLIBridgeLogsAttached) return
        window.__chromeCLIBridgeLogsAttached = true
        window.__chromeCLIBridgeLogs = []
        const levels = ['log', 'warn', 'error', 'info', 'debug']
        for (const level of levels) {
          const orig = console[level].bind(console)
          console[level] = (...args) => {
            window.__chromeCLIBridgeLogs.push({
              level,
              message: args.map((a) => (typeof a === 'object' ? JSON.stringify(a) : String(a))).join(' '),
              timestamp: Date.now(),
            })
            orig(...args)
          }
        }
      },
    })
  } catch { /* tab may not be scriptable */ }
}

function pageLogs({ level } = {}) {
  const logs = [...consoleLogs]
  if (level) return logs.filter((e) => e.level === level)
  return logs
}

// Periodically collect logs from the page into the SW buffer
async function collectLogs() {
  if (!selectedTabId) return
  try {
    const [{ result }] = await chrome.scripting.executeScript({
      target: { tabId: selectedTabId },
      world: 'MAIN',
      func: () => {
        const logs = window.__chromeCLIBridgeLogs ?? []
        window.__chromeCLIBridgeLogs = []
        return logs
      },
    })
    if (result?.length) {
      const newLogs = result
      consoleLogs.push(...newLogs)
      // Keep buffer bounded
      if (consoleLogs.length > 1000) consoleLogs = consoleLogs.slice(-1000)
      // Push real-time events to relay (stream.log = new canonical name, page:log = legacy)
      newLogs.forEach((entry) => {
        emit('stream.log', entry)
        emit('page:log', entry)
      })
    }
  } catch { /* ignore */ }
}

setInterval(collectLogs, 500)

// ── Network capture via chrome.debugger ────────────────────────────────────

async function ensureDebuggerAttached() {
  if (debuggerAttached || !selectedTabId) return
  try {
    await chrome.debugger.attach({ tabId: selectedTabId }, '1.3')
    await chrome.debugger.sendCommand({ tabId: selectedTabId }, 'Network.enable', {})
    debuggerAttached = true
  } catch (err) {
    throw Object.assign(new Error('DEBUGGER_ATTACH_FAILED'), { code: -32003, data: err.message })
  }
}

chrome.debugger.onEvent.addListener((_source, method, params) => {
  if (method === 'Network.responseReceived') {
    networkRequests.push({
      requestId: params.requestId,
      url: params.response.url,
      method: params.response.headers?.['x-original-method'] ?? '?',
      status: params.response.status,
      duration: null,
      timestamp: Date.now(),
    })
    if (networkRequests.length > 500) networkRequests = networkRequests.slice(-500)
  }
})

chrome.debugger.onDetach.addListener(() => { debuggerAttached = false })

function pageNetwork() {
  return [...networkRequests]
}

// ── Page interaction ────────────────────────────────────────────────────────

async function pageQuery({ selector, full } = {}) {
  if (!selectedTabId) throw Object.assign(new Error('TAB_NOT_FOUND'), { code: -32000 })

  if (full || !selector) {
    const [{ result }] = await chrome.scripting.executeScript({
      target: { tabId: selectedTabId },
      world: 'MAIN',
      func: () => document.documentElement.outerHTML,
    })
    return { html: result }
  }

  const [{ result }] = await chrome.scripting.executeScript({
    target: { tabId: selectedTabId },
    world: 'MAIN',
    func: (sel) => {
      const MAX = 5000
      return Array.from(document.querySelectorAll(sel)).map((el) => ({
        tag: el.tagName.toLowerCase(),
        id: el.id || null,
        classes: Array.from(el.classList),
        textContent: el.textContent?.trim().slice(0, 500),
        outerHTML: el.outerHTML.slice(0, MAX),
        attributes: Object.fromEntries(Array.from(el.attributes).map((a) => [a.name, a.value])),
      }))
    },
    args: [selector],
  })
  return result ?? []
}

async function pageExec({ code } = {}) {
  if (!selectedTabId) throw Object.assign(new Error('TAB_NOT_FOUND'), { code: -32000 })
  if (!code) throw Object.assign(new Error('INVALID_PARAMS: code is required'), { code: -32602 })

  const [{ result, exceptionInfo }] = await chrome.scripting.executeScript({
    target: { tabId: selectedTabId },
    world: 'MAIN',
    func: async (src) => {
      try {
        // eslint-disable-next-line no-eval
        const val = await eval(`(async()=>{ return (${src}) })()`)
        return { result: val }
      } catch (e) {
        return { error: e.message, stack: e.stack }
      }
    },
    args: [code],
  })

  if (exceptionInfo) {
    throw Object.assign(new Error(exceptionInfo.exception?.description ?? 'Script error'), { code: -32002 })
  }
  if (result?.error) {
    throw Object.assign(new Error(result.error), { code: -32002, data: result.stack })
  }
  return { result: result?.result }
}

async function pageTrigger({ selector, event: eventType } = {}) {
  if (!selectedTabId) throw Object.assign(new Error('TAB_NOT_FOUND'), { code: -32000 })
  if (!selector || !eventType) throw Object.assign(new Error('INVALID_PARAMS'), { code: -32602 })

  const [{ result }] = await chrome.scripting.executeScript({
    target: { tabId: selectedTabId },
    world: 'MAIN',
    func: (sel, evtType) => {
      const el = document.querySelector(sel)
      if (!el) return { error: 'ELEMENT_NOT_FOUND' }
      const EventClass = ['click', 'mousedown', 'mouseup', 'mouseover'].includes(evtType)
        ? MouseEvent
        : Event
      el.dispatchEvent(new EventClass(evtType, { bubbles: true, cancelable: true }))
      return { dispatched: true, selector: sel }
    },
    args: [selector, eventType],
  })

  if (result?.error === 'ELEMENT_NOT_FOUND') {
    throw Object.assign(new Error('ELEMENT_NOT_FOUND'), { code: -32001 })
  }
  return result
}

// ── New page interaction handlers ───────────────────────────────────────────

async function pageScreenshot() {
  if (!selectedTabId) throw Object.assign(new Error('TAB_NOT_FOUND'), { code: -32000 })

  // captureVisibleTab only works on the active tab in the focused window
  const tab = await chrome.tabs.get(selectedTabId)
  if (!tab.active) throw Object.assign(new Error('tab_not_active: the selected tab must be the active foreground tab'), { code: -32000 })

  const dataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, { format: 'png' })
  return { dataUrl }
}

async function pageNavigate({ url, timeoutMs = 30000 } = {}) {
  if (!selectedTabId) throw Object.assign(new Error('TAB_NOT_FOUND'), { code: -32000 })
  if (!url) throw Object.assign(new Error('INVALID_PARAMS: url is required'), { code: -32602 })

  await chrome.tabs.update(selectedTabId, { url })

  // Poll until status === 'complete' or timeout
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 300))
    const tab = await chrome.tabs.get(selectedTabId)
    if (tab.status === 'complete') {
      // Re-attach debugger on the new page if it was attached before
      if (debuggerAttached) {
        debuggerAttached = false
        await ensureDebuggerAttached().catch(() => {})
      }
      return { url: tab.url, status: 'complete' }
    }
  }
  throw Object.assign(new Error('navigation_timeout'), { code: -32000 })
}

async function pageStorage({ type, key, set } = {}) {
  if (!selectedTabId) throw Object.assign(new Error('TAB_NOT_FOUND'), { code: -32000 })
  if (!type) throw Object.assign(new Error('INVALID_PARAMS: type is required'), { code: -32602 })

  if (type === 'cookies') {
    const tab = await chrome.tabs.get(selectedTabId)
    return chrome.cookies.getAll({ url: tab.url })
  }

  const storageKey = type === 'local' ? 'localStorage' : 'sessionStorage'

  if (set !== undefined && key) {
    await chrome.scripting.executeScript({
      target: { tabId: selectedTabId },
      world: 'MAIN',
      func: (sk, k, v) => window[sk].setItem(k, v),
      args: [storageKey, key, set],
    })
    return { ok: true }
  }

  const [{ result }] = await chrome.scripting.executeScript({
    target: { tabId: selectedTabId },
    world: 'MAIN',
    func: (sk, k) => {
      const store = window[sk]
      if (k) return { key: k, value: store.getItem(k) }
      const entries = {}
      for (let i = 0; i < store.length; i++) {
        const name = store.key(i)
        entries[name] = store.getItem(name)
      }
      return entries
    },
    args: [storageKey, key ?? null],
  })
  return result
}

async function pageWait({ selector, timeout = 5000 } = {}) {
  if (!selectedTabId) throw Object.assign(new Error('TAB_NOT_FOUND'), { code: -32000 })
  if (!selector) throw Object.assign(new Error('INVALID_PARAMS: selector is required'), { code: -32602 })

  const start = Date.now()
  const deadline = start + timeout

  while (Date.now() < deadline) {
    const [{ result }] = await chrome.scripting.executeScript({
      target: { tabId: selectedTabId },
      world: 'MAIN',
      func: (sel) => !!document.querySelector(sel),
      args: [selector],
    })
    if (result) return { found: true, selector, elapsed: Date.now() - start }
    await new Promise((r) => setTimeout(r, 100))
  }

  return { found: false, selector, elapsed: Date.now() - start }
}

async function pageInject({ code } = {}) {
  if (!selectedTabId) throw Object.assign(new Error('TAB_NOT_FOUND'), { code: -32000 })
  if (!code) throw Object.assign(new Error('INVALID_PARAMS: code is required'), { code: -32602 })

  const [{ result, exceptionInfo }] = await chrome.scripting.executeScript({
    target: { tabId: selectedTabId },
    world: 'MAIN',
    func: (src) => {
      try {
        // eslint-disable-next-line no-new-func
        const fn = new Function(src)
        const val = fn()
        return { ok: true, result: val }
      } catch (e) {
        return { error: 'script_error', message: e.message }
      }
    },
    args: [code],
  })

  if (exceptionInfo) throw Object.assign(new Error(exceptionInfo.exception?.description ?? 'Script error'), { code: -32002 })
  if (result?.error) throw Object.assign(new Error(result.message), { code: -32002 })
  return { ok: true, ...(result?.result !== undefined && { result: result.result }) }
}

async function pageSnapshot({ styles = false } = {}) {
  if (!selectedTabId) throw Object.assign(new Error('TAB_NOT_FOUND'), { code: -32000 })

  const [{ result }] = await chrome.scripting.executeScript({
    target: { tabId: selectedTabId },
    world: 'MAIN',
    func: (includeStyles) => {
      if (includeStyles) {
        for (const el of document.querySelectorAll('*')) {
          const cs = window.getComputedStyle(el)
          el.setAttribute('data-computed-style', cs.cssText)
        }
      }
      return document.documentElement.outerHTML
    },
    args: [styles],
  })

  const MAX = 5 * 1024 * 1024
  if (result.length > MAX) {
    return { html: result.slice(0, MAX), truncated: true }
  }
  return { html: result }
}

async function pageType({ selector, text } = {}) {
  if (!selectedTabId) throw Object.assign(new Error('TAB_NOT_FOUND'), { code: -32000 })
  if (!selector || !text) throw Object.assign(new Error('INVALID_PARAMS'), { code: -32602 })

  await ensureDebuggerAttached()

  // Focus the element first
  const [{ result: coords }] = await chrome.scripting.executeScript({
    target: { tabId: selectedTabId },
    world: 'MAIN',
    func: (sel) => {
      const el = document.querySelector(sel)
      if (!el) return null
      el.focus()
      const r = el.getBoundingClientRect()
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 }
    },
    args: [selector],
  })

  if (!coords) throw Object.assign(new Error('selector_not_found'), { code: -32001 })

  for (const char of text) {
    await chrome.debugger.sendCommand({ tabId: selectedTabId }, 'Input.dispatchKeyEvent', { type: 'keyDown', text: char, unmodifiedText: char, key: char })
    await chrome.debugger.sendCommand({ tabId: selectedTabId }, 'Input.dispatchKeyEvent', { type: 'char', text: char, unmodifiedText: char, key: char })
    await chrome.debugger.sendCommand({ tabId: selectedTabId }, 'Input.dispatchKeyEvent', { type: 'keyUp', text: char, unmodifiedText: char, key: char })
  }

  return { ok: true }
}

async function pageClick({ selector } = {}) {
  if (!selectedTabId) throw Object.assign(new Error('TAB_NOT_FOUND'), { code: -32000 })
  if (!selector) throw Object.assign(new Error('INVALID_PARAMS: selector is required'), { code: -32602 })

  await ensureDebuggerAttached()

  const [{ result: coords }] = await chrome.scripting.executeScript({
    target: { tabId: selectedTabId },
    world: 'MAIN',
    func: (sel) => {
      const el = document.querySelector(sel)
      if (!el) return { error: 'selector_not_found' }
      const style = window.getComputedStyle(el)
      if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') {
        return { error: 'element_not_visible' }
      }
      const r = el.getBoundingClientRect()
      return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) }
    },
    args: [selector],
  })

  if (coords?.error === 'selector_not_found') throw Object.assign(new Error('selector_not_found'), { code: -32001 })
  if (coords?.error === 'element_not_visible') throw Object.assign(new Error('element_not_visible'), { code: -32001 })

  const { x, y } = coords
  await chrome.debugger.sendCommand({ tabId: selectedTabId }, 'Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 })
  await chrome.debugger.sendCommand({ tabId: selectedTabId }, 'Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 })
  return { ok: true }
}

async function pageHover({ selector } = {}) {
  if (!selectedTabId) throw Object.assign(new Error('TAB_NOT_FOUND'), { code: -32000 })
  if (!selector) throw Object.assign(new Error('INVALID_PARAMS: selector is required'), { code: -32602 })

  await ensureDebuggerAttached()

  const [{ result: coords }] = await chrome.scripting.executeScript({
    target: { tabId: selectedTabId },
    world: 'MAIN',
    func: (sel) => {
      const el = document.querySelector(sel)
      if (!el) return null
      const r = el.getBoundingClientRect()
      return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) }
    },
    args: [selector],
  })

  if (!coords) throw Object.assign(new Error('selector_not_found'), { code: -32001 })

  await chrome.debugger.sendCommand({ tabId: selectedTabId }, 'Input.dispatchMouseEvent', { type: 'mouseMoved', x: coords.x, y: coords.y })
  return { ok: true }
}

// ── DevTools handlers ────────────────────────────────────────────────────────

async function devtoolsPerformance() {
  await ensureDebuggerAttached()
  await chrome.debugger.sendCommand({ tabId: selectedTabId }, 'Performance.enable', {})
  const { metrics } = await chrome.debugger.sendCommand({ tabId: selectedTabId }, 'Performance.getMetrics', {})
  const result = {}
  for (const { name, value } of metrics) result[name] = value
  return result
}

async function devtoolsMemory({ output } = {}) {
  await ensureDebuggerAttached()

  const chunks = []
  const chunkHandler = (_source, method, params) => {
    if (method === 'HeapProfiler.addHeapSnapshotChunk') chunks.push(params.chunk)
  }

  chrome.debugger.onEvent.addListener(chunkHandler)
  await chrome.debugger.sendCommand({ tabId: selectedTabId }, 'HeapProfiler.takeHeapSnapshot', { reportProgress: false })
  chrome.debugger.onEvent.removeListener(chunkHandler)

  const snapshotData = chunks.join('')
  const filePath = output || `./heap-${Date.now()}.heapsnapshot`

  // Relay receives the data and writes the file on the CLI side via a special result field
  return { saved: filePath, bytes: snapshotData.length, data: snapshotData }
}

async function devtoolsCoverage({ duration = 5000 } = {}) {
  await ensureDebuggerAttached()
  await chrome.debugger.sendCommand({ tabId: selectedTabId }, 'Profiler.enable', {})
  await chrome.debugger.sendCommand({ tabId: selectedTabId }, 'Profiler.startPreciseCoverage', { callCount: false, detailed: true })
  await new Promise((r) => setTimeout(r, duration))
  const { result } = await chrome.debugger.sendCommand({ tabId: selectedTabId }, 'Profiler.takePreciseCoverage', {})
  await chrome.debugger.sendCommand({ tabId: selectedTabId }, 'Profiler.stopPreciseCoverage', {})
  return result
}

// ── Boot ────────────────────────────────────────────────────────────────────

// Allow popup to trigger a fresh connection after token is saved
chrome.runtime.onMessage.addListener((msg) => {
  if (msg?.type === 'reconnect') {
    if (ws) { ws.close(); ws = null }
    connect()
  }
})

connect()
