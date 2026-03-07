import { getClient } from '../client.js'
import { out, err } from '../output.js'

export const command = 'tabs'
export const describe = 'List open tabs or select a target tab'
export const builder = {
  select: { type: 'string', describe: 'Select a tab by ID or "active"' },
  port:   { type: 'number', default: 9876, describe: 'Relay port' },
}

export async function handler(argv) {
  try {
    const client = await getClient(argv.port)

    if (argv.select !== undefined) {
      const tabId = argv.select === 'active' ? 'active' : parseInt(argv.select, 10)
      const result = await client.call('tabs.select', { tabId })
      out(result)
    } else {
      const result = await client.call('tabs.list', {})
      out(result)
    }

    client.close()
  } catch (e) {
    err(e.message)
    process.exit(1)
  }
}
