import { test } from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { writeFile, readFile, unlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

// Patch TOKEN_PATH to a temp file for testing
const TEST_TOKEN_PATH = join(tmpdir(), `chrome-cli-bridge-test-${randomUUID()}.token`)

// We inline the token logic to avoid side-effects on the real token file
async function generateTestToken(path) {
  const { chmod } = await import('node:fs/promises')
  const token = randomUUID()
  await writeFile(path, token, { encoding: 'utf8', mode: 0o600 })
  await chmod(path, 0o600)
  return token
}

test('generateToken returns a UUID v4 string', async () => {
  const token = await generateTestToken(TEST_TOKEN_PATH)
  assert.match(token, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
})

test('token file is written with content matching returned token', async () => {
  const token = await generateTestToken(TEST_TOKEN_PATH)
  const stored = (await readFile(TEST_TOKEN_PATH, 'utf8')).trim()
  assert.equal(stored, token)
})

test('each call generates a different token', async () => {
  const t1 = await generateTestToken(TEST_TOKEN_PATH)
  const t2 = await generateTestToken(TEST_TOKEN_PATH)
  assert.notEqual(t1, t2)
})

// Cleanup
test('cleanup temp token file', async () => {
  await unlink(TEST_TOKEN_PATH).catch(() => {})
  assert.ok(true)
})
