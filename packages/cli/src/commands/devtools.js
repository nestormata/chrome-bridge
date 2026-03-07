import { getClient } from '../client.js'
import { out, err } from '../output.js'

export const command = 'devtools <subcommand>'
export const describe = 'Access Chrome DevTools data (performance, memory, coverage)'
export const builder = (yargs) => {
  yargs
    .command({
      command: 'performance',
      describe: 'Collect runtime performance metrics',
      builder: { port: { type: 'number', default: 9876 } },
      async handler(argv) {
        try {
          const client = await getClient(argv.port)
          const result = await client.call('devtools.performance', {})
          out(result)
          client.close()
        } catch (e) { err(e.message); process.exit(1) }
      },
    })
    .command({
      command: 'memory',
      describe: 'Take a heap memory snapshot',
      builder: {
        output: { type: 'string', alias: 'o', describe: 'Output file path (default: ./heap-<ts>.heapsnapshot)' },
        port:   { type: 'number', default: 9876 },
      },
      async handler(argv) {
        try {
          const client = await getClient(argv.port)
          const output = argv.output || `./heap-${Date.now()}.heapsnapshot`
          const result = await client.call('devtools.memory', { output })
          out(result)
          client.close()
        } catch (e) { err(e.message); process.exit(1) }
      },
    })
    .command({
      command: 'coverage',
      describe: 'Capture JavaScript code coverage',
      builder: {
        duration: { type: 'number', default: 5000, describe: 'Recording duration in ms' },
        port:     { type: 'number', default: 9876 },
      },
      async handler(argv) {
        try {
          const client = await getClient(argv.port)
          const result = await client.call('devtools.coverage', { duration: argv.duration })
          out(result)
          client.close()
        } catch (e) { err(e.message); process.exit(1) }
      },
    })
    .demandCommand(1, 'Specify a devtools subcommand: performance | memory | coverage')
}

export function handler() {}
