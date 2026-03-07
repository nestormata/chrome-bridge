import { test } from 'node:test'
import assert from 'node:assert/strict'
import { request, response, error, isRequest, isResponse, isEvent, ERR } from '../../packages/cli/src/rpc.js'

test('request() creates a valid JSON-RPC 2.0 request object', () => {
  const req = request('tabs.list', { foo: 1 })
  assert.equal(req.jsonrpc, '2.0')
  assert.equal(req.method, 'tabs.list')
  assert.deepEqual(req.params, { foo: 1 })
  assert.ok(typeof req.id === 'number')
})

test('request() auto-increments id', () => {
  const r1 = request('a')
  const r2 = request('a')
  assert.ok(r2.id > r1.id)
})

test('response() creates a valid JSON-RPC 2.0 response', () => {
  const res = response(1, { result: 'ok' })
  assert.equal(res.jsonrpc, '2.0')
  assert.equal(res.id, 1)
  assert.deepEqual(res.result, { result: 'ok' })
})

test('error() creates a valid JSON-RPC 2.0 error response', () => {
  const err = error(2, ERR.TAB_NOT_FOUND, 'TAB_NOT_FOUND')
  assert.equal(err.jsonrpc, '2.0')
  assert.equal(err.id, 2)
  assert.equal(err.error.code, -32000)
  assert.equal(err.error.message, 'TAB_NOT_FOUND')
})

test('isRequest() returns true for request objects', () => {
  assert.ok(isRequest({ jsonrpc: '2.0', method: 'foo', params: {}, id: 1 }))
})

test('isRequest() returns false for objects without id', () => {
  assert.ok(!isRequest({ jsonrpc: '2.0', method: 'foo', params: {} }))
})

test('isResponse() returns true for result responses', () => {
  assert.ok(isResponse({ jsonrpc: '2.0', result: {}, id: 1 }))
})

test('isResponse() returns true for error responses', () => {
  assert.ok(isResponse({ jsonrpc: '2.0', error: { code: -1, message: 'x' }, id: 1 }))
})

test('isEvent() returns true for push events (no id)', () => {
  assert.ok(isEvent({ jsonrpc: '2.0', method: 'tab:navigated', params: {} }))
})

test('isEvent() returns false when id is present', () => {
  assert.ok(!isEvent({ jsonrpc: '2.0', method: 'tab:navigated', params: {}, id: 1 }))
})

test('ERR constants have expected codes', () => {
  assert.equal(ERR.TAB_NOT_FOUND, -32000)
  assert.equal(ERR.ELEMENT_NOT_FOUND, -32001)
  assert.equal(ERR.EXEC_ERROR, -32002)
  assert.equal(ERR.DEBUGGER_ATTACH_FAILED, -32003)
})
