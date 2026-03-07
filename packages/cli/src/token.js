import { randomUUID } from 'node:crypto'
import { writeFile, readFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { chmod } from 'node:fs/promises'

const TOKEN_PATH = join(homedir(), '.chrome-cli-bridge.token')

export async function generateToken() {
  const token = randomUUID()
  await writeFile(TOKEN_PATH, token, { encoding: 'utf8', mode: 0o600 })
  await chmod(TOKEN_PATH, 0o600)
  return token
}

export async function readToken() {
  try {
    return (await readFile(TOKEN_PATH, 'utf8')).trim()
  } catch {
    return null
  }
}

export { TOKEN_PATH }
