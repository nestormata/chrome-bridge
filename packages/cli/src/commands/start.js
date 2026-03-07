import { Relay } from '../relay.js'
import { readToken, TOKEN_PATH } from '../token.js'
import { writeFile, readFile, unlink } from 'node:fs/promises'
import { join } from 'node:path'
import { homedir } from 'node:os'

const PID_FILE = join(homedir(), '.chrome-cli-bridge.pid')

export const command = 'start'
export const describe = 'Start the relay server'
export const builder = {
  port:     { type: 'number', default: 9876, describe: 'Port to listen on' },
  detach:   { type: 'boolean', default: false, describe: 'Run in background (daemon mode)' },
}

export async function handler(argv) {
  const relay = new Relay(argv.port)
  try {
    const token = await relay.start()
    await writeFile(PID_FILE, String(process.pid), 'utf8')
    console.log(`Relay started on ws://127.0.0.1:${argv.port}`)
    console.log(`Session token: ${token}`)
    console.log(`Token saved to: ${TOKEN_PATH}`)
    console.log('')
    console.log('Open the chrome-cli-bridge extension popup in Chrome, paste the token, and click Connect.')
    console.log('Press Ctrl+C to stop.')

    process.on('SIGINT', async () => {
      await relay.stop()
      await unlink(PID_FILE).catch(() => {})
      process.exit(0)
    })
    process.on('SIGTERM', async () => {
      await relay.stop()
      await unlink(PID_FILE).catch(() => {})
      process.exit(0)
    })
  } catch (e) {
    console.error(e.message)
    process.exit(1)
  }
}
