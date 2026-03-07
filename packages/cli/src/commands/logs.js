import { getClient } from '../client.js'
import { out, outLine, err } from '../output.js'

export const command = 'logs'
export const describe = 'Read console or network logs from the selected tab'
export const builder = {
  follow:  { type: 'boolean', alias: 'f', describe: 'Stream logs in real time (legacy alias for --watch)' },
  watch:   { type: 'boolean', alias: 'w', describe: 'Stream logs in real time via push events' },
  level:   { type: 'string', describe: 'Filter by level: log|warn|error|info|debug' },
  network: { type: 'boolean', describe: 'Show network requests instead of console logs' },
  port:    { type: 'number', default: 9876, describe: 'Relay port' },
}

export async function handler(argv) {
  try {
    const client = await getClient(argv.port)

    if (argv.network) {
      const result = await client.call('page.network', {})
      out(result)
      client.close()
      return
    }

    if (argv.watch || argv.follow) {
      // Print buffered logs first, then stream push events
      const buffered = await client.call('page.logs', { level: argv.level })
      buffered.forEach((entry) => outLine(entry))

      // Subscribe to push events (stream.log is canonical; page:log is legacy)
      client.on('stream.log', (entry) => {
        if (!argv.level || entry.level === argv.level) outLine(entry)
      })
      client.on('page:log', () => {}) // drain legacy events silently

      process.on('SIGINT', () => { client.close(); process.exit(0) })
      return
    }

    const result = await client.call('page.logs', { level: argv.level })
    out(result)
    client.close()
  } catch (e) {
    err(e.message)
    process.exit(1)
  }
}
