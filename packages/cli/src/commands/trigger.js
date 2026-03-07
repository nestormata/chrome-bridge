import { getClient } from '../client.js'
import { out, err } from '../output.js'

export const command = 'trigger'
export const describe = 'Dispatch a DOM event on an element in the selected tab'
export const builder = {
  selector: { type: 'string', demandOption: true, describe: 'CSS selector for the target element' },
  event:    { type: 'string', demandOption: true, describe: 'Event type: click|input|change|submit|keydown|keyup' },
  port:     { type: 'number', default: 9876, describe: 'Relay port' },
}

export async function handler(argv) {
  try {
    const client = await getClient(argv.port)
    const result = await client.call('page.trigger', { selector: argv.selector, event: argv.event })
    out(result)
    client.close()
  } catch (e) {
    err(e.message)
    process.exit(e.code === -32001 ? 1 : 1)
  }
}
