import { createInterface } from 'node:readline'
import { getClient } from '../client.js'
import { err } from '../output.js'

export const command = 'repl'
export const describe = 'Start an interactive JavaScript REPL in the selected tab'
export const builder = {
  port: { type: 'number', default: 9876, describe: 'Relay port' },
}

export async function handler(argv) {
  let client
  try {
    client = await getClient(argv.port)
  } catch (e) {
    err(e.message)
    process.exit(1)
  }
  await runRepl(process.stdin, process.stdout, client)
  client.close()
  process.exit(0)
}

/**
 * Run the REPL loop.
 * Accepts injectable input/output streams and a client for testability.
 * @param {import('node:stream').Readable} input
 * @param {import('node:stream').Writable} output
 * @param {{ call: (method: string, params: object) => Promise<any> }} client
 * @returns {Promise<void>} resolves when the REPL exits
 */
export async function runRepl(input, output, client) {
  const isTTY = output.isTTY ?? false

  if (isTTY) {
    output.write('chrome-bridge REPL — JavaScript in the selected tab\n')
    output.write('Type .exit or press Ctrl+C/Ctrl+D to quit.\n')
  }

  const rl = createInterface({ input, output: isTTY ? output : undefined, terminal: false, crlfDelay: Infinity })

  if (isTTY) rl.setPrompt('> ')

  return new Promise((resolve) => {
    rl.on('line', async (line) => {
      const code = line.trim()
      if (!code || code === '.exit') { rl.close(); return }
      rl.pause()
      try {
        const res = await client.call('page.exec', { code })
        output.write(JSON.stringify(res.result) + '\n')
      } catch (e) {
        output.write(`Error: ${e.message}\n`)
      }
      rl.resume()
      if (isTTY) rl.prompt()
    })

    rl.on('close', resolve)

    if (isTTY) rl.prompt()
  })
}
