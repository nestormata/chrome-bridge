import { getClient } from '../client.js'
import { out, err } from '../output.js'

export const command = 'wait'
export const describe = 'Wait until a CSS selector appears in the DOM'
export const builder = {
  selector: { type: 'string', demandOption: true, describe: 'CSS selector to wait for' },
  timeout:  { type: 'number', default: 5000, describe: 'Timeout in ms (default 5000)' },
  port:     { type: 'number', default: 9876, describe: 'Relay port' },
}

export async function handler(argv) {
  try {
    const client = await getClient(argv.port)
    const result = await client.call('page.wait', { selector: argv.selector, timeout: argv.timeout })
    out(result)
    client.close()
    if (!result.found) process.exit(1)
  } catch (e) {
    err(e.message)
    process.exit(1)
  }
}
