import { getClient } from '../client.js'
import { out, err } from '../output.js'
import { writeFile } from 'node:fs/promises'

export const command = 'screenshot'
export const describe = 'Capture a screenshot of the selected tab'
export const builder = {
  output: { type: 'string', alias: 'o', describe: 'Save PNG to file path instead of printing base64' },
  port:   { type: 'number', default: 9876, describe: 'Relay port' },
}

export async function handler(argv) {
  try {
    const client = await getClient(argv.port)
    const result = await client.call('page.screenshot', {})
    client.close()

    if (argv.output) {
      const base64 = result.dataUrl.replace(/^data:image\/png;base64,/, '')
      await writeFile(argv.output, Buffer.from(base64, 'base64'))
      out({ saved: argv.output })
    } else {
      out(result)
    }
  } catch (e) {
    err(e.message)
    process.exit(1)
  }
}
