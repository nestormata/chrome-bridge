import { WebSocketServer } from 'ws'
import { generateToken, readToken } from './token.js'
import { isRequest, isResponse, isEvent, error, ERR } from './rpc.js'

const HANDSHAKE_TIMEOUT_MS = 5000
const KEEPALIVE_INTERVAL_MS = 20000

export class Relay {
  #port
  #wss = null
  #extension = null          // the authenticated extension WS
  #cliClients = new Set()    // all authenticated CLI client sockets
  #token = null
  #pendingCalls = new Map()  // id → { resolve, reject, timer }
  #eventHandlers = new Map() // method → Set<fn>
  #keepaliveTimer = null

  constructor(port = 9876) {
    this.#port = port
  }

  get port() { return this.#port }
  get token() { return this.#token }
  get connected() { return this.#extension !== null }

  async start() {
    this.#token = await generateToken()

    await new Promise((resolve, reject) => {
      this.#wss = new WebSocketServer({ host: '127.0.0.1', port: this.#port })

      this.#wss.once('error', (err) => {
        if (err.code === 'EADDRINUSE') {
          reject(new Error(`Port ${this.#port} is already in use. Is chrome-bridge already running?\nRun: chrome-bridge stop`))
        } else {
          reject(err)
        }
      })

      this.#wss.once('listening', resolve)
      this.#wss.on('connection', (ws) => this.#onConnection(ws))
    })

    return this.#token
  }

  async stop() {
    clearInterval(this.#keepaliveTimer)
    // Terminate ALL connected sockets (extension + any CLI clients) so wss.close()
    // completes immediately instead of waiting for them to close on their own.
    if (this.#wss) {
      for (const ws of this.#wss.clients) ws.terminate()
    }
    this.#extension = null
    await new Promise((resolve) => this.#wss ? this.#wss.close(resolve) : resolve())
    this.#wss = null
  }

  // Send a JSON-RPC request to the extension and await the response
  async call(method, params = {}, timeoutMs = 10000) {
    if (!this.#extension) throw new Error('Extension not connected')

    return new Promise((resolve, reject) => {
      const msg = { jsonrpc: '2.0', method, params, id: this.#nextId() }
      const timer = setTimeout(() => {
        this.#pendingCalls.delete(msg.id)
        reject(new Error(`Timeout waiting for response to ${method}`))
      }, timeoutMs)

      this.#pendingCalls.set(msg.id, { resolve, reject, timer })
      this.#extension.send(JSON.stringify(msg))
    })
  }

  on(event, handler) {
    if (!this.#eventHandlers.has(event)) this.#eventHandlers.set(event, new Set())
    this.#eventHandlers.get(event).add(handler)
    return () => this.#eventHandlers.get(event)?.delete(handler)
  }

  #nextId = (() => { let i = 0; return () => ++i })()

  #onConnection(ws) {
    let role = null  // 'extension' | 'cli'

    const handshakeTimer = setTimeout(() => {
      if (!role) ws.close(4001, 'Unauthorized: handshake timeout')
    }, HANDSHAKE_TIMEOUT_MS)

    ws.on('message', (data) => {
      let msg
      try { msg = JSON.parse(data.toString()) } catch {
        ws.send(JSON.stringify(error(null, ERR.PARSE_ERROR, 'Parse error')))
        return
      }

      if (!role) {
        if (msg.method === 'handshake' && msg.params?.token === this.#token) {
          clearTimeout(handshakeTimer)
          role = msg.params?.role === 'cli' ? 'cli' : 'extension'

          if (role === 'extension') {
            this.#extension = ws
            this.#startKeepalive()
          } else if (role === 'cli') {
            this.#cliClients.add(ws)
          }

          ws.send(JSON.stringify({ jsonrpc: '2.0', result: { status: 'ok', role }, id: msg.id }))
        } else {
          ws.close(4001, 'Unauthorized')
        }
        return
      }

      if (role === 'cli') {
        // Forward request to extension, send response back to this CLI client
        if (!this.#extension) {
          ws.send(JSON.stringify(error(msg.id, -32000, 'Extension not connected')))
          return
        }
        const id = this.#nextId()
        const forwarded = { ...msg, id }
        const timer = setTimeout(() => {
          this.#pendingCalls.delete(id)
          ws.send(JSON.stringify(error(msg.id, -32000, 'Timeout')))
        }, 10000)
        this.#pendingCalls.set(id, {
          resolve: (result) => ws.send(JSON.stringify({ jsonrpc: '2.0', result, id: msg.id })),
          reject:  (err) => ws.send(JSON.stringify(error(msg.id, err.code ?? -32000, err.message))),
          timer,
        })
        this.#extension.send(JSON.stringify(forwarded))
        return
      }

      // role === 'extension': handle responses to our outgoing calls
      if (isResponse(msg)) {
        const pending = this.#pendingCalls.get(msg.id)
        if (pending) {
          clearTimeout(pending.timer)
          this.#pendingCalls.delete(msg.id)
          if (msg.error) {
            const err = new Error(msg.error.message)
            err.code = msg.error.code
            err.data = msg.error.data
            pending.reject(err)
          } else {
            pending.resolve(msg.result)
          }
        }
        return
      }

      // Handle push events from the extension — forward to local handlers AND all CLI clients
      if (isEvent(msg)) {
        const handlers = this.#eventHandlers.get(msg.method)
        if (handlers) handlers.forEach((fn) => fn(msg.params))
        // Forward the raw event to all connected CLI WebSocket clients
        const raw = data.toString()
        for (const cliWs of this.#cliClients) {
          if (cliWs.readyState === 1 /* OPEN */) cliWs.send(raw)
        }
        return
      }
    })

    ws.on('close', () => {
      this.#cliClients.delete(ws)
      if (this.#extension === ws) {
        this.#extension = null
        clearInterval(this.#keepaliveTimer)
        this.#keepaliveTimer = null
        // reject all pending calls
        for (const [, pending] of this.#pendingCalls) {
          clearTimeout(pending.timer)
          pending.reject(new Error('Extension disconnected'))
        }
        this.#pendingCalls.clear()
      }
    })
  }

  #startKeepalive() {
    clearInterval(this.#keepaliveTimer)
    this.#keepaliveTimer = setInterval(() => {
      if (this.#extension?.readyState === 1 /* OPEN */) {
        this.#extension.ping()
      }
    }, KEEPALIVE_INTERVAL_MS)
  }
}

// Singleton for CLI commands
let _relay = null

export function getRelay(port) {
  if (!_relay) _relay = new Relay(port)
  return _relay
}
