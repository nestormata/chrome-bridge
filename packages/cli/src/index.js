import { Relay } from './relay.js'
import { RelayClient } from './client.js'
import { readToken } from './token.js'

/**
 * ChromeBridge SDK — programmatic interface for Node.js consumers.
 *
 * Usage:
 *   const bridge = new ChromeBridge()
 *   await bridge.connect()
 *   const tabs = await bridge.tabs()
 *   await bridge.selectTab(tabs[0].id)
 *   const { result } = await bridge.exec({ code: 'document.title' })
 *   await bridge.disconnect()
 */
export class ChromeBridge {
  #client = null
  #port

  constructor({ port = 9876 } = {}) {
    this.#port = port
  }

  async connect() {
    const token = await readToken()
    if (!token) throw new Error('No session token found. Run: chrome-bridge start')
    this.#client = new RelayClient(this.#port, token)
    await this.#client.connect()
  }

  async disconnect() {
    this.#client?.close()
    this.#client = null
  }

  #call(method, params) {
    if (!this.#client) throw new Error('Not connected. Call bridge.connect() first.')
    return this.#client.call(method, params)
  }

  // ── Existing commands ────────────────────────────────────────────────────
  tabs()                    { return this.#call('tabs.list', {}) }
  selectTab(tabId)          { return this.#call('tabs.select', { tabId }) }
  query(params)             { return this.#call('page.query', params) }
  exec(params)              { return this.#call('page.exec', params) }
  logs(params = {})         { return this.#call('page.logs', params) }
  network()                 { return this.#call('page.network', {}) }
  trigger(params)           { return this.#call('page.trigger', params) }

  // ── New commands ─────────────────────────────────────────────────────────
  screenshot(params = {})              { return this.#call('page.screenshot', params) }
  navigate(params)                     { return this.#call('page.navigate', params) }
  storage(params)                      { return this.#call('page.storage', params) }
  wait(params)                         { return this.#call('page.wait', params) }
  inject(params)                       { return this.#call('page.inject', params) }
  snapshot(params = {})                { return this.#call('page.snapshot', params) }
  type(params)                         { return this.#call('page.type', params) }
  click(params)                        { return this.#call('page.click', params) }
  hover(params)                        { return this.#call('page.hover', params) }

  /** Subscribe to real-time console log push events.
   *  @returns {() => void} unsubscribe function */
  streamLogs(handler) {
    if (!this.#client) throw new Error('Not connected.')
    return this.#client.on('stream.log', handler)
  }

  /** DevTools namespace */
  get devtools() {
    return {
      performance: ()       => this.#call('devtools.performance', {}),
      memory:      (params = {}) => this.#call('devtools.memory', params),
      coverage:    (params = {}) => this.#call('devtools.coverage', params),
    }
  }

  on(event, handler) {
    if (!this.#client) throw new Error('Not connected.')
    return this.#client.on(event, handler)
  }
}

export { Relay, RelayClient, readToken }
