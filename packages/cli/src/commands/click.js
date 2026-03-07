import { getClient } from '../client.js'
import { out, err } from '../output.js'

export const command = 'click'
export const describe = 'Simulate a mouse click on a DOM element'
export const builder = {
  selector: { type: 'string', demandOption: true, describe: 'CSS selector for target element' },
  port:     { type: 'number', default: 9876, describe: 'Relay port' },
}

export async function handler(argv) {
  try {
    const client = await getClient(argv.port)
    const result = await client.call('page.click', { selector: argv.selector })
    out(result)
    client.close()
    if (result?.error) process.exit(1)
  } catch (e) {
    err(e.message)
    process.exit(1)
  }
}
