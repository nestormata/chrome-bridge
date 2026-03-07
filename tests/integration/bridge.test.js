/**
 * Integration test: relay + mock extension client → list tabs → execute JS
 *
 * This test does NOT require a real Chrome instance.
 * It simulates the extension side with a raw WebSocket client that
 * handles JSON-RPC requests the same way the extension service worker would.
 *
 * To run against a real Chromium with the extension loaded, set:
 *   CHROME_INTEGRATION=1 node --test tests/integration/bridge.test.js
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { WebSocket } from 'ws'
import { Relay } from '../../packages/cli/src/relay.js'
import { RelayClient } from '../../packages/cli/src/client.js'

const PORT = 29876

// Mock extension: connects, authenticates, and handles a fixed set of methods
async function startMockExtension(port, token) {
  const ws = new WebSocket(`ws://127.0.0.1:${port}`)

  const MOCK_TABS = [
    { id: 1, windowId: 1, title: 'Test Page', url: 'https://example.com', active: true, status: 'complete' },
  ]

  await new Promise((resolve, reject) => {
    ws.once('error', reject)
    ws.once('open', () => {
      ws.off('error', reject)
      ws.send(JSON.stringify({ jsonrpc: '2.0', method: 'handshake', params: { token, role: 'extension' }, id: 0 }))
    })
    ws.on('message', (data) => {
      const msg = JSON.parse(data.toString())
      // Handshake ack
      if (msg.id === 0 && msg.result?.status === 'ok') { resolve(); return }

      // Handle requests
      if (msg.method === 'tabs.list') {
        ws.send(JSON.stringify({ jsonrpc: '2.0', result: MOCK_TABS, id: msg.id }))
      } else if (msg.method === 'page.exec') {
        // Echo back a fake document.title
        ws.send(JSON.stringify({ jsonrpc: '2.0', result: { result: 'Test Page Title' }, id: msg.id }))
      } else {
        ws.send(JSON.stringify({ jsonrpc: '2.0', error: { code: -32601, message: 'Method not found' }, id: msg.id }))
      }
    })
  })

  return ws
}

test('relay starts, mock extension connects, CLI client can list tabs', async () => {
  const relay = new Relay(PORT)
  const token = await relay.start()

  const mockExt = await startMockExtension(PORT, token)
  assert.ok(relay.connected)

  const client = new RelayClient(PORT, token)
  await client.connect()

  const tabs = await client.call('tabs.list', {})
  assert.equal(tabs.length, 1)
  assert.equal(tabs[0].title, 'Test Page')
  assert.equal(tabs[0].url, 'https://example.com')

  client.close()
  mockExt.terminate()
  await relay.stop()
})

test('relay forwards page.exec to mock extension and returns result', async () => {
  const relay = new Relay(PORT + 1)
  const token = await relay.start()

  const mockExt = await startMockExtension(PORT + 1, token)

  const client = new RelayClient(PORT + 1, token)
  await client.connect()

  const result = await client.call('page.exec', { code: 'document.title' })
  assert.equal(result.result, 'Test Page Title')

  client.close()
  mockExt.terminate()
  await relay.stop()
})
