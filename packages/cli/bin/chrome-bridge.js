#!/usr/bin/env node
import { createInterface } from 'node:readline'
import { getClient } from '../src/client.js'
import { outLine } from '../src/output.js'

// ── Pipe mode ───────────────────────────────────────────────────────────────
// Activated when stdin is not a TTY or --pipe flag is present

const forcePipe = process.argv.includes('--pipe')
const isPipeMode = forcePipe || !process.stdin.isTTY

if (isPipeMode) {
  // Remove --pipe flag from args so yargs doesn't complain
  const idx = process.argv.indexOf('--pipe')
  if (idx !== -1) process.argv.splice(idx, 1)

  runPipeMode()
} else {
  runCLI()
}

async function runPipeMode() {
  const portArg = process.argv.indexOf('--port')
  const port = portArg !== -1 ? parseInt(process.argv[portArg + 1], 10) : 9876

  let client
  try {
    client = await getClient(port)
  } catch (e) {
    process.stderr.write(JSON.stringify({ error: 'connection_failed', message: e.message }) + '\n')
    process.exit(1)
  }

  const rl = createInterface({ input: process.stdin, crlfDelay: Infinity })

  rl.on('line', async (line) => {
    const trimmed = line.trim()
    if (!trimmed) return

    let msg
    try {
      msg = JSON.parse(trimmed)
    } catch {
      outLine({ error: 'invalid_input', message: `Invalid JSON: ${trimmed.slice(0, 80)}` })
      return
    }

    const { command, ...params } = msg
    if (!command) {
      outLine({ error: 'invalid_input', message: 'Missing "command" field' })
      return
    }

    const methodMap = {
      tabs:        'tabs.list',
      select:      'tabs.select',
      query:       'page.query',
      exec:        'page.exec',
      logs:        'page.logs',
      network:     'page.network',
      trigger:     'page.trigger',
      screenshot:  'page.screenshot',
      navigate:    'page.navigate',
      storage:     'page.storage',
      wait:        'page.wait',
      inject:      'page.inject',
      snapshot:    'page.snapshot',
      type:        'page.type',
      click:       'page.click',
      hover:       'page.hover',
    }

    const method = methodMap[command]
    if (!method) {
      outLine({ error: 'unknown_command', message: `Unknown command: ${command}` })
      return
    }

    try {
      const result = await client.call(method, params)
      outLine({ result })
    } catch (e) {
      outLine({ error: e.message, code: e.code, ...(e.data && { data: e.data }) })
    }
  })

  rl.on('close', () => {
    client.close()
    process.exit(0)
  })
}

async function runCLI() {
  const yargs = (await import('yargs')).default
  const { hideBin } = await import('yargs/helpers')

  // commandDir() is not supported in ESM — import commands explicitly
  const [start, stop, status, tabs, query, exec, logs, trigger,
         screenshot, navigate, storage, wait, inject, snapshot,
         type, click, hover, repl, devtools] = await Promise.all([
    import('../src/commands/start.js'),
    import('../src/commands/stop.js'),
    import('../src/commands/status.js'),
    import('../src/commands/tabs.js'),
    import('../src/commands/query.js'),
    import('../src/commands/exec.js'),
    import('../src/commands/logs.js'),
    import('../src/commands/trigger.js'),
    import('../src/commands/screenshot.js'),
    import('../src/commands/navigate.js'),
    import('../src/commands/storage.js'),
    import('../src/commands/wait.js'),
    import('../src/commands/inject.js'),
    import('../src/commands/snapshot.js'),
    import('../src/commands/type.js'),
    import('../src/commands/click.js'),
    import('../src/commands/hover.js'),
    import('../src/commands/repl.js'),
    import('../src/commands/devtools.js'),
  ])

  yargs(hideBin(process.argv))
    .scriptName('chrome-bridge')
    .usage('$0 <command> [options]')
    .command(start)
    .command(stop)
    .command(status)
    .command(tabs)
    .command(query)
    .command(exec)
    .command(logs)
    .command(trigger)
    .command(screenshot)
    .command(navigate)
    .command(storage)
    .command(wait)
    .command(inject)
    .command(snapshot)
    .command(type)
    .command(click)
    .command(hover)
    .command(repl)
    .command(devtools)
    .option('port', { type: 'number', default: 9876, global: true, describe: 'Relay port' })
    .option('pipe', { type: 'boolean', describe: 'Force stdin pipe mode (NDJSON in, NDJSON out)' })
    .demandCommand(1, 'Specify a command. Run --help for available commands.')
    .strict()
    .help()
    .alias('h', 'help')
    .wrap(null)
    .parse()
}
