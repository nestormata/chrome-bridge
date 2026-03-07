import { getClient } from '../client.js'
import { out, err } from '../output.js'

export const command = 'navigate'
export const describe = 'Navigate the selected tab to a URL'
export const builder = {
  url:  { type: 'string', demandOption: true, describe: 'URL to navigate to' },
  port: { type: 'number', default: 9876, describe: 'Relay port' },
}

export async function handler(argv) {
  try {
    const client = await getClient(argv.port)
    const result = await client.call('page.navigate', { url: argv.url })
    out(result)
    client.close()
  } catch (e) {
    err(e.message)
    process.exit(1)
  }
}
