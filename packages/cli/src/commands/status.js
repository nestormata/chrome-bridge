import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { homedir } from 'node:os'
import { out } from '../output.js'
import { readToken } from '../token.js'
import { RelayClient } from '../client.js'

const PID_FILE = join(homedir(), '.chrome-cli-bridge.pid')

export const command = 'status'
export const describe = 'Check relay and extension connection status'
export const builder = {
  port: { type: 'number', default: 9876, describe: 'Relay port' },
}

export async function handler(argv) {
  const result = { relay: 'stopped', extension: 'disconnected', pid: null, token: null }

  try {
    const pid = parseInt(await readFile(PID_FILE, 'utf8'), 10)
    process.kill(pid, 0) // check if alive
    result.relay = 'running'
    result.pid = pid
  } catch { /* not running */ }

  result.token = (await readToken()) ? '(set)' : '(not set)'

  if (result.relay === 'running') {
    try {
      const token = await readToken()
      const client = new RelayClient(argv.port, token)
      await client.connect()
      // If connect succeeded, relay responded; check if extension is attached
      const tabs = await client.call('tabs.list', {}).catch(() => null)
      result.extension = tabs !== null ? 'connected' : 'not connected'
      client.close()
    } catch {
      result.extension = 'not connected'
    }
  }

  out(result)
}
