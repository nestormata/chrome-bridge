import { getClient } from '../client.js'
import { out, err } from '../output.js'
import { readFile } from 'node:fs/promises'

export const command = 'inject'
export const describe = 'Inject a local JavaScript file into the selected tab'
export const builder = {
  file: { type: 'string', demandOption: true, describe: 'Path to JS file to inject' },
  port: { type: 'number', default: 9876, describe: 'Relay port' },
}

export async function handler(argv) {
  let code
  try {
    code = await readFile(argv.file, 'utf8')
  } catch {
    err(`file_not_found: ${argv.file}`)
    process.exit(1)
  }

  try {
    const client = await getClient(argv.port)
    const result = await client.call('page.inject', { code })
    out(result)
    client.close()
    if (result?.error) process.exit(1)
  } catch (e) {
    err(e.message)
    process.exit(1)
  }
}
