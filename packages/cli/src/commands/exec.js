import { getClient } from '../client.js'
import { out, err } from '../output.js'

export const command = 'exec'
export const describe = 'Execute JavaScript in the selected tab'
export const builder = {
  code: { type: 'string', demandOption: true, describe: 'JavaScript expression or statement' },
  port: { type: 'number', default: 9876, describe: 'Relay port' },
}

export async function handler(argv) {
  try {
    const client = await getClient(argv.port)
    const result = await client.call('page.exec', { code: argv.code })
    out(result)
    client.close()
    if (result?.error) process.exit(1)
  } catch (e) {
    err(e.message, e.data)
    process.exit(1)
  }
}
