import { readToken } from './token.js'
import { Relay } from './relay.js'

let _client = null

export async function getClient(port = 9876) {
  if (_client) return _client
  const token = await readToken()
  if (!token) throw new Error('No session token found. Run: chrome-bridge start')

  _client = new RelayClient(port, token)
  await _client.connect()
  return _client
}

export function resetClient() {
  _client = null
}

export class RelayClient {
  #ws = null
  #token
  #port
  #pendingCalls = new Map()
  #eventHandlers = new Map()
  #nextId = (() => { let i = 0; return () => ++i })()
  #handshakeResolve = null
  #handshakeReject = null
  constructor(port, token) {
    this.#port = port
    this.#token = token
  }

  async connect() {
    const { WebSocket } = await import('ws')
    await new Promise((resolve, reject) => {
      this.#ws = new WebSocket(`ws://127.0.0.1:${this.#port}`)
      this.#ws.once('error', reject)
      this.#ws.once('open', () => {
        this.#ws.off('error', reject)
        this.#ws.on('error', () => {})
        this.#ws.on('message', (data) => this.#onMessage(data))
        // Send handshake; resolve only after relay acknowledges (id: 0 response)
        this.#handshakeResolve = resolve
        this.#handshakeReject = reject
        this.#ws.send(JSON.stringify({
          jsonrpc: '2.0', method: 'handshake', params: { token: this.#token, role: 'cli' }, id: 0,
        }))
      })
    })
  }

  close() {
    _client = null   // reset the module singleton so getClient() creates fresh next time
    this.#ws?.terminate()
    this.#ws = null
  }

  async call(method, params = {}, timeoutMs = 15000) {
    return new Promise((resolve, reject) => {
      const id = this.#nextId()
      const timer = setTimeout(() => {
        this.#pendingCalls.delete(id)
        reject(new Error(`Timeout waiting for ${method}`))
      }, timeoutMs)
      this.#pendingCalls.set(id, { resolve, reject, timer })
      this.#ws.send(JSON.stringify({ jsonrpc: '2.0', method, params, id }))
    })
  }

  on(event, handler) {
    if (!this.#eventHandlers.has(event)) this.#eventHandlers.set(event, new Set())
    this.#eventHandlers.get(event).add(handler)
    return () => this.#eventHandlers.get(event)?.delete(handler)
  }

  #onMessage(data) {
    let msg
    try { msg = JSON.parse(data.toString()) } catch { return }

    // Handshake acknowledgment (id === 0)
    if (msg.id === 0) {
      if (msg.error) {
        this.#handshakeReject?.(new Error(msg.error.message ?? 'Handshake rejected'))
      } else {
        this.#handshakeResolve?.()
      }
      this.#handshakeResolve = null
      this.#handshakeReject = null
      return
    }

    if (msg.id !== undefined && (msg.result !== undefined || msg.error)) {
      const pending = this.#pendingCalls.get(msg.id)
      if (pending) {
        clearTimeout(pending.timer)
        this.#pendingCalls.delete(msg.id)
        if (msg.error) {
          const e = new Error(msg.error.message)
          e.code = msg.error.code
          e.data = msg.error.data
          pending.reject(e)
        } else {
          pending.resolve(msg.result)
        }
      }
      return
    }

    if (msg.method && msg.id === undefined) {
      const handlers = this.#eventHandlers.get(msg.method)
      if (handlers) handlers.forEach((fn) => fn(msg.params))
    }
  }
}
