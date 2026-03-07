/**
 * Integration tests for all new bridge-enhancements commands.
 *
 * Uses a mock WebSocket extension client — no real Chrome needed.
 * Each test spins up its own relay on a unique port.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { PassThrough } from 'node:stream'
import { WebSocket } from 'ws'
import { Relay } from '../../packages/cli/src/relay.js'
import { RelayClient } from '../../packages/cli/src/client.js'
import { ChromeBridge } from '../../packages/cli/src/index.js'

const BASE_PORT = 39876

// ── Mock extension factory ──────────────────────────────────────────────────
// Connects to the relay as the extension role and dispatches method calls.

async function startMockExtension(port, token, handlers = {}) {
  const ws = new WebSocket(`ws://127.0.0.1:${port}`)

  await new Promise((resolve, reject) => {
    ws.once('error', reject)
    ws.once('open', () => {
      ws.off('error', reject)
      ws.send(JSON.stringify({ jsonrpc: '2.0', method: 'handshake', params: { token, role: 'extension' }, id: 0 }))
    })
    ws.on('message', (data) => {
      const msg = JSON.parse(data.toString())
      if (msg.id === 0 && msg.result?.status === 'ok') { resolve(); return }

      const { method, params, id } = msg
      const handler = handlers[method]
      if (handler) {
        // Use .then() on a resolved Promise so synchronous throws become rejections
        Promise.resolve().then(() => handler(params)).then(
          (result) => ws.send(JSON.stringify({ jsonrpc: '2.0', result, id })),
          (err)    => ws.send(JSON.stringify({ jsonrpc: '2.0', error: { code: err.code ?? -32000, message: err.message }, id }))
        )
      } else {
        ws.send(JSON.stringify({ jsonrpc: '2.0', error: { code: -32601, message: 'Method not found' }, id }))
      }
    })
  })

  // Helper: push a notification to relay (event, no id)
  ws.push = (method, params) => ws.send(JSON.stringify({ jsonrpc: '2.0', method, params }))

  return ws
}

async function setup(portOffset, handlers = {}) {
  const port = BASE_PORT + portOffset
  const relay = new Relay(port)
  const token = await relay.start()
  const ext = await startMockExtension(port, token, handlers)
  const client = new RelayClient(port, token)
  await client.connect()
  return { relay, ext, client, token, port,
    teardown: async () => { client.close(); ext.terminate(); await relay.stop() } }
}

// ── 2. Page Screenshot ───────────────────────────────────────────────────────

test('page.screenshot returns dataUrl', async () => {
  const { teardown, client } = await setup(0, {
    'page.screenshot': () => ({ dataUrl: 'data:image/png;base64,abc123' }),
  })
  const result = await client.call('page.screenshot', {})
  assert.ok(result.dataUrl.startsWith('data:image/png;base64,'), 'dataUrl should be a PNG data URI')
  await teardown()
})

test('page.screenshot error when tab not active', async () => {
  const { teardown, client } = await setup(1, {
    'page.screenshot': () => { throw Object.assign(new Error('tab_not_active'), { code: -32000 }) },
  })
  await assert.rejects(() => client.call('page.screenshot', {}), /tab_not_active/)
  await teardown()
})

// ── 3. Page Navigate ─────────────────────────────────────────────────────────

test('page.navigate returns url and complete status', async () => {
  const { teardown, client } = await setup(2, {
    'page.navigate': ({ url }) => ({ url, status: 'complete' }),
  })
  const result = await client.call('page.navigate', { url: 'https://example.com' })
  assert.equal(result.url, 'https://example.com')
  assert.equal(result.status, 'complete')
  await teardown()
})

test('page.navigate timeout returns navigation_timeout error', async () => {
  const { teardown, client } = await setup(3, {
    'page.navigate': () => { throw Object.assign(new Error('navigation_timeout'), { code: -32000 }) },
  })
  await assert.rejects(() => client.call('page.navigate', { url: 'https://slow.example.com' }), /navigation_timeout/)
  await teardown()
})

// ── 4. Page Storage ──────────────────────────────────────────────────────────

test('page.storage type=local returns key-value object', async () => {
  const { teardown, client } = await setup(4, {
    'page.storage': ({ type }) => {
      if (type === 'local') return { myKey: 'myValue', other: '42' }
      return {}
    },
  })
  const result = await client.call('page.storage', { type: 'local' })
  assert.deepEqual(result, { myKey: 'myValue', other: '42' })
  await teardown()
})

test('page.storage type=local with set writes entry', async () => {
  let stored = null
  const { teardown, client } = await setup(5, {
    'page.storage': ({ type, key, set }) => {
      if (type === 'local' && key && set !== undefined) { stored = { key, value: set }; return { ok: true } }
      return {}
    },
  })
  const result = await client.call('page.storage', { type: 'local', key: 'myKey', set: 'myValue' })
  assert.deepEqual(result, { ok: true })
  assert.deepEqual(stored, { key: 'myKey', value: 'myValue' })
  await teardown()
})

test('page.storage type=cookies returns array', async () => {
  const { teardown, client } = await setup(6, {
    'page.storage': ({ type }) => {
      if (type === 'cookies') return [{ name: 'session', value: 'tok123' }]
      return []
    },
  })
  const result = await client.call('page.storage', { type: 'cookies' })
  assert.ok(Array.isArray(result))
  assert.equal(result[0].name, 'session')
  await teardown()
})

// ── 5. Page Wait ─────────────────────────────────────────────────────────────

test('page.wait resolves immediately when selector already in DOM', async () => {
  const { teardown, client } = await setup(7, {
    'page.wait': ({ selector }) => ({ found: true, selector, elapsed: 0 }),
  })
  const result = await client.call('page.wait', { selector: '#app' })
  assert.equal(result.found, true)
  assert.equal(result.elapsed, 0)
  await teardown()
})

test('page.wait resolves with found=false on timeout', async () => {
  const { teardown, client } = await setup(8, {
    'page.wait': ({ selector }) => ({ found: false, selector, elapsed: 5000 }),
  })
  const result = await client.call('page.wait', { selector: '.missing' })
  assert.equal(result.found, false)
  await teardown()
})

// ── 6. Stream Logs ───────────────────────────────────────────────────────────

test('relay delivers stream.log event to subscribed client', async () => {
  const { teardown, client, ext } = await setup(9, {})

  const received = await new Promise((resolve) => {
    client.on('stream.log', (params) => resolve(params))
    // Extension pushes a stream.log notification after a short delay
    setTimeout(() => ext.push('stream.log', { level: 'log', text: 'hello world', timestamp: Date.now() }), 50)
  })

  assert.equal(received.level, 'log')
  assert.equal(received.text, 'hello world')
  assert.ok(typeof received.timestamp === 'number')
  await teardown()
})

test('stream.log unsubscribe stops handler from receiving events', async () => {
  const { teardown, client, ext } = await setup(10, {})

  let count = 0
  const unsub = client.on('stream.log', () => { count++ })

  // Push one event, then unsub, then push another
  await new Promise((resolve) => {
    client.on('stream.log', resolve)
    ext.push('stream.log', { level: 'log', text: 'first', timestamp: Date.now() })
  })
  unsub()
  ext.push('stream.log', { level: 'log', text: 'second', timestamp: Date.now() })
  await new Promise((r) => setTimeout(r, 100))
  assert.equal(count, 1, 'Handler should have been called exactly once before unsubscribe')
  await teardown()
})

// ── 7. Script Injection ──────────────────────────────────────────────────────

test('page.inject with valid code returns ok:true', async () => {
  const { teardown, client } = await setup(11, {
    'page.inject': () => ({ ok: true }),
  })
  const result = await client.call('page.inject', { code: 'window.__injected = true' })
  assert.deepEqual(result, { ok: true })
  await teardown()
})

test('page.inject with script that throws returns script_error', async () => {
  const { teardown, client } = await setup(12, {
    'page.inject': () => { throw Object.assign(new Error('ReferenceError: undeclaredVar is not defined'), { code: -32002 }) },
  })
  await assert.rejects(() => client.call('page.inject', { code: 'undeclaredVar()' }), /ReferenceError/)
  await teardown()
})

// ── 8. Page Snapshot ─────────────────────────────────────────────────────────

test('page.snapshot returns html string', async () => {
  const { teardown, client } = await setup(13, {
    'page.snapshot': () => ({ html: '<html><head></head><body><h1>Hello</h1></body></html>' }),
  })
  const result = await client.call('page.snapshot', {})
  assert.ok(result.html.includes('<html>'))
  assert.ok(result.html.includes('<h1>Hello</h1>'))
  await teardown()
})

test('page.snapshot with oversized html includes truncated:true', async () => {
  const bigHtml = '<html>' + 'x'.repeat(5 * 1024 * 1024 + 1) + '</html>'
  const { teardown, client } = await setup(14, {
    'page.snapshot': () => ({ html: bigHtml.slice(0, 5 * 1024 * 1024), truncated: true }),
  })
  const result = await client.call('page.snapshot', {})
  assert.equal(result.truncated, true)
  await teardown()
})

// ── 9. Keyboard & Mouse ──────────────────────────────────────────────────────

test('page.type dispatches key events and returns ok:true', async () => {
  const { teardown, client } = await setup(15, {
    'page.type': () => ({ ok: true }),
  })
  const result = await client.call('page.type', { selector: '#search', text: 'hello' })
  assert.deepEqual(result, { ok: true })
  await teardown()
})

test('page.type with missing selector returns selector_not_found', async () => {
  const { teardown, client } = await setup(16, {
    'page.type': () => { throw Object.assign(new Error('selector_not_found'), { code: -32001 }) },
  })
  await assert.rejects(() => client.call('page.type', { selector: '#missing', text: 'hi' }), /selector_not_found/)
  await teardown()
})

test('page.click dispatches mouse events and returns ok:true', async () => {
  const { teardown, client } = await setup(17, {
    'page.click': () => ({ ok: true }),
  })
  const result = await client.call('page.click', { selector: 'button#submit' })
  assert.deepEqual(result, { ok: true })
  await teardown()
})

test('page.click on hidden element returns element_not_visible', async () => {
  const { teardown, client } = await setup(18, {
    'page.click': () => { throw Object.assign(new Error('element_not_visible'), { code: -32001 }) },
  })
  await assert.rejects(() => client.call('page.click', { selector: '.hidden' }), /element_not_visible/)
  await teardown()
})

// ── 11. DevTools ─────────────────────────────────────────────────────────────

test('devtools.performance returns metrics object', async () => {
  const { teardown, client } = await setup(19, {
    'devtools.performance': () => ({ TaskDuration: 0.42, JSHeapUsedSize: 10240, LayoutCount: 3 }),
  })
  const result = await client.call('devtools.performance', {})
  assert.ok('TaskDuration' in result, 'Should have TaskDuration metric')
  assert.ok('JSHeapUsedSize' in result, 'Should have JSHeapUsedSize metric')
  await teardown()
})

test('devtools.memory returns saved path and bytes', async () => {
  const { teardown, client } = await setup(20, {
    'devtools.memory': ({ output }) => ({ saved: output || './heap-test.heapsnapshot', bytes: 2048 }),
  })
  const result = await client.call('devtools.memory', { output: './snap.heapsnapshot' })
  assert.equal(result.saved, './snap.heapsnapshot')
  assert.ok(typeof result.bytes === 'number')
  await teardown()
})

test('devtools.coverage returns array of coverage ranges', async () => {
  const { teardown, client } = await setup(21, {
    'devtools.coverage': () => ([{ scriptId: '1', url: 'https://example.com/app.js', functions: [] }]),
  })
  const result = await client.call('devtools.coverage', { duration: 100 })
  assert.ok(Array.isArray(result))
  assert.equal(result[0].scriptId, '1')
  await teardown()
})

// ── REPL module ───────────────────────────────────────────────────────────────

test('runRepl evaluates expression and writes result', async () => {
  const { runRepl } = await import('../../packages/cli/src/commands/repl.js')
  const input  = new PassThrough()
  const output = new PassThrough()

  const chunks = []
  output.on('data', (c) => chunks.push(c.toString()))

  const mockClient = {
    call: async (method, { code }) => {
      if (method === 'page.exec') return { result: eval(code) } // eslint-disable-line no-eval
      throw new Error('unexpected')
    },
  }

  const done = runRepl(input, output, mockClient)
  input.write('2 + 2\n')
  input.end()
  await done

  const out = chunks.join('')
  assert.ok(out.includes('4'), `Expected "4" in REPL output, got: ${out}`)
})

test('runRepl handles script errors without crashing', async () => {
  const { runRepl } = await import('../../packages/cli/src/commands/repl.js')
  const input  = new PassThrough()
  const output = new PassThrough()

  const chunks = []
  output.on('data', (c) => chunks.push(c.toString()))

  const mockClient = {
    call: async () => { throw new Error('ReferenceError: x is not defined') },
  }

  const done = runRepl(input, output, mockClient)
  input.write('undeclaredVar\n')
  input.write('1 + 1\n')
  input.end()
  await done

  const out = chunks.join('')
  assert.ok(out.includes('Error:'), `Expected "Error:" prefix, got: ${out}`)
})

test('runRepl exits cleanly on stdin EOF', async () => {
  const { runRepl } = await import('../../packages/cli/src/commands/repl.js')
  const input  = new PassThrough()
  const output = new PassThrough()
  const mockClient = { call: async () => ({ result: null }) }

  const done = runRepl(input, output, mockClient)
  input.end()
  await assert.doesNotReject(done)
})
