import { getClient } from '../client.js'
import { out, err } from '../output.js'

export const command = 'query'
export const describe = 'Query the DOM of the selected tab'
export const builder = {
  selector: { type: 'string', describe: 'CSS selector to query' },
  html:     { type: 'boolean', describe: 'Return full page HTML' },
  port:     { type: 'number', default: 9876, describe: 'Relay port' },
}

export async function handler(argv) {
  if (!argv.selector && !argv.html) {
    err('Provide --selector <css> or --html')
    process.exit(1)
  }
  try {
    const client = await getClient(argv.port)
    const result = await client.call('page.query', {
      selector: argv.selector,
      full: argv.html ?? false,
    })
    out(result)
    client.close()
  } catch (e) {
    err(e.message)
    process.exit(1)
  }
}
