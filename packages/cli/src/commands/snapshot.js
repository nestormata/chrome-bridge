import { getClient } from '../client.js'
import { out, err } from '../output.js'

export const command = 'snapshot'
export const describe = 'Capture the full HTML of the current page'
export const builder = {
  styles: { type: 'boolean', default: false, describe: 'Include computed styles inline' },
  port:   { type: 'number', default: 9876, describe: 'Relay port' },
}

export async function handler(argv) {
  try {
    const client = await getClient(argv.port)
    const result = await client.call('page.snapshot', { styles: argv.styles })
    out(result)
    client.close()
  } catch (e) {
    err(e.message)
    process.exit(1)
  }
}
