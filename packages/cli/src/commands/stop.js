import { readFile, unlink } from 'node:fs/promises'
import { join } from 'node:path'
import { homedir } from 'node:os'

const PID_FILE = join(homedir(), '.chrome-cli-bridge.pid')

export const command = 'stop'
export const describe = 'Stop the relay server'
export const builder = {}

export async function handler() {
  try {
    const pid = parseInt(await readFile(PID_FILE, 'utf8'), 10)
    process.kill(pid, 'SIGTERM')
    await unlink(PID_FILE).catch(() => {})
    console.log(`Stopped relay (pid ${pid})`)
  } catch (e) {
    if (e.code === 'ENOENT') {
      console.error('No relay is running (no PID file found)')
    } else if (e.code === 'ESRCH') {
      console.error('Relay process not found — cleaning up stale PID file')
      await unlink(PID_FILE).catch(() => {})
    } else {
      console.error(e.message)
    }
    process.exit(1)
  }
}
