import { getClient } from '../client.js'
import { out, err } from '../output.js'

export const command = 'storage'
export const describe = 'Read or write cookies, localStorage, or sessionStorage'
export const builder = {
  type: { type: 'string', choices: ['local', 'session', 'cookies'], demandOption: true, describe: 'Storage type' },
  key:  { type: 'string', describe: 'Key to read or write' },
  set:  { type: 'string', describe: 'Value to write (requires --key)' },
  port: { type: 'number', default: 9876, describe: 'Relay port' },
}

export async function handler(argv) {
  try {
    const client = await getClient(argv.port)
    const params = { type: argv.type }
    if (argv.key !== undefined) params.key = argv.key
    if (argv.set !== undefined) params.set = argv.set
    const result = await client.call('page.storage', params)
    out(result)
    client.close()
  } catch (e) {
    err(e.message)
    process.exit(1)
  }
}
