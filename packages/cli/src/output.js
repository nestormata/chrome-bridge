const isTTY = process.stdout.isTTY

export function out(data) {
  if (isTTY) {
    prettyPrint(data)
  } else {
    process.stdout.write(JSON.stringify(data) + '\n')
  }
}

export function outLine(data) {
  process.stdout.write(JSON.stringify(data) + '\n')
}

export function err(msg, data) {
  const obj = { error: msg, ...(data && { data }) }
  if (isTTY) {
    process.stderr.write(`\x1b[31mError:\x1b[0m ${msg}${data ? '\n' + JSON.stringify(data, null, 2) : ''}\n`)
  } else {
    process.stderr.write(JSON.stringify(obj) + '\n')
  }
}

function prettyPrint(data) {
  if (Array.isArray(data)) {
    if (data.length === 0) { console.log('(empty)'); return }
    // Detect tab list shape
    if (data[0]?.id !== undefined && data[0]?.url !== undefined) {
      const rows = data.map((t) =>
        `  [${t.id}] ${t.active ? '●' : '○'} ${t.title?.slice(0, 50).padEnd(50)} ${t.url}`)
      console.log(rows.join('\n'))
      return
    }
    // Detect element list shape
    if (data[0]?.tag !== undefined) {
      data.forEach((el, i) => {
        console.log(`  [${i}] <${el.tag}${el.id ? '#' + el.id : ''}> ${el.textContent?.slice(0, 80)}`)
      })
      return
    }
    console.log(JSON.stringify(data, null, 2))
    return
  }
  if (typeof data === 'object' && data !== null) {
    // Log entry shape
    if (data.level && data.message && data.timestamp) {
      const d = new Date(data.timestamp).toISOString()
      const lvl = data.level.toUpperCase().padEnd(5)
      console.log(`  ${d} [${lvl}] ${data.message}`)
      return
    }
    console.log(JSON.stringify(data, null, 2))
    return
  }
  console.log(data)
}
