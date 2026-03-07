import { test } from 'node:test'
import assert from 'node:assert/strict'
import { Relay } from '../../packages/cli/src/relay.js'
import { RelayClient } from '../../packages/cli/src/client.js'
import { readToken } from '../../packages/cli/src/token.js'

const TEST_PORT = 19876

test('Relay starts and a client can perform handshake', async () => {
  const relay = new Relay(TEST_PORT)
  const token = await relay.start()
  assert.ok(token, 'Token should be non-empty')

  // Simulate the extension connecting
  const { WebSocket } = await import('ws')
  const extWs = new WebSocket(`ws://127.0.0.1:${TEST_PORT}`)
  await new Promise((resolve, reject) => {
    extWs.once('error', reject)
    extWs.once('open', () => {
      extWs.send(JSON.stringify({ jsonrpc: '2.0', method: 'handshake', params: { token, role: 'extension' }, id: 0 }))
    })
    extWs.on('message', (data) => {
      const msg = JSON.parse(data.toString())
      if (msg.result?.status === 'ok') resolve()
    })
  })

  assert.ok(relay.connected, 'Extension should be connected after handshake')
  extWs.terminate()
  await relay.stop()
})

test('Relay rejects wrong token with close code 4001', async () => {
  const relay = new Relay(TEST_PORT + 1)
  await relay.start()

  const { WebSocket } = await import('ws')
  const ws = new WebSocket(`ws://127.0.0.1:${TEST_PORT + 1}`)

  const closeCode = await new Promise((resolve) => {
    ws.on('open', () => {
      // Send wrong token
      ws.send(JSON.stringify({ jsonrpc: '2.0', method: 'handshake', params: { token: 'wrong' }, id: 0 }))
    })
    ws.on('close', (code) => resolve(code))
  })

  assert.equal(closeCode, 4001)
  await relay.stop()
})

test('Relay rejects connection with no handshake after 5s timeout', { timeout: 7000 }, async () => {
  const relay = new Relay(TEST_PORT + 2)
  await relay.start()

  const { WebSocket } = await import('ws')
  const ws = new WebSocket(`ws://127.0.0.1:${TEST_PORT + 2}`)

  const closeCode = await new Promise((resolve) => {
    ws.on('open', () => { /* intentionally send nothing */ })
    ws.on('close', (code) => resolve(code))
  })

  assert.equal(closeCode, 4001)
  await relay.stop()
})

// ── Graceful shutdown tests ─────────────────────────────────────────────────

test('relay.stop() with no connections resolves within 200 ms', { timeout: 1000 }, async () => {
  const relay = new Relay(19880)
  await relay.start()
  const start = Date.now()
  await relay.stop()
  const elapsed = Date.now() - start
  assert.ok(elapsed < 200, `stop() took ${elapsed} ms, expected < 200 ms`)
})

test('relay.stop() with extension connected resolves within 200 ms', { timeout: 1000 }, async () => {
  const relay = new Relay(19881)
  const token = await relay.start()

  const { WebSocket } = await import('ws')
  const extWs = new WebSocket(`ws://127.0.0.1:19881`)
  await new Promise((resolve, reject) => {
    extWs.once('error', reject)
    extWs.on('open', () => {
      extWs.send(JSON.stringify({ jsonrpc: '2.0', method: 'handshake', params: { token, role: 'extension' }, id: 0 }))
    })
    extWs.on('message', (data) => {
      const msg = JSON.parse(data.toString())
      if (msg.result?.status === 'ok') resolve()
    })
  })

  const start = Date.now()
  await relay.stop()
  const elapsed = Date.now() - start
  assert.ok(elapsed < 200, `stop() took ${elapsed} ms, expected < 200 ms`)
})

test('relay.stop() with multiple CLI clients connected resolves within 200 ms', { timeout: 1000 }, async () => {
  const relay = new Relay(19882)
  const token = await relay.start()

  const { WebSocket } = await import('ws')
  async function connectCliClient() {
    const ws = new WebSocket(`ws://127.0.0.1:19882`)
    await new Promise((resolve, reject) => {
      ws.once('error', reject)
      ws.on('open', () => {
        ws.send(JSON.stringify({ jsonrpc: '2.0', method: 'handshake', params: { token, role: 'cli' }, id: 0 }))
      })
      ws.on('message', () => resolve())
    })
    return ws
  }

  await connectCliClient()
  await connectCliClient()

  const start = Date.now()
  await relay.stop()
  const elapsed = Date.now() - start
  assert.ok(elapsed < 200, `stop() took ${elapsed} ms, expected < 200 ms`)
})

// ── Original relay tests ─────────────────────────────────────────────────────

test('Relay fails with clear error when port is in use', async () => {
  const relay1 = new Relay(TEST_PORT + 3)
  await relay1.start()

  const relay2 = new Relay(TEST_PORT + 3)
  await assert.rejects(
    () => relay2.start(),
    (err) => {
      assert.ok(err.message.includes('already in use'), `Expected "already in use" in: ${err.message}`)
      return true
    }
  )

  await relay1.stop()
})
