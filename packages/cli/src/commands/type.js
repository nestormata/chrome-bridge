import { getClient } from '../client.js'
import { out, err } from '../output.js'

export const command = 'type'
export const describe = 'Simulate keyboard typing into a DOM element'
export const builder = {
  selector: { type: 'string', demandOption: true, describe: 'CSS selector for target element' },
  text:     { type: 'string', demandOption: true, describe: 'Text to type' },
  port:     { type: 'number', default: 9876, describe: 'Relay port' },
}

export async function handler(argv) {
  try {
    const client = await getClient(argv.port)
    const result = await client.call('page.type', { selector: argv.selector, text: argv.text })
    out(result)
    client.close()
    if (result?.error) process.exit(1)
  } catch (e) {
    err(e.message)
    process.exit(1)
  }
}
