#!/usr/bin/env node
/**
 * Minimal read-only asar reader (verifier tool, lives outside the repo).
 *
 * Usage:
 *   node asar-read.mjs <archive> list [substring]
 *   node asar-read.mjs <archive> cat <internal/path>
 *
 * The asar container is: 8-byte Pickle holding the header-string size,
 * then that many bytes of JSON header, then the file data. Every file entry
 * stores { offset, size }, both relative to the start of the data section.
 */
import { readFileSync, openSync, readSync, closeSync, writeFileSync } from 'node:fs'

const [archive, action, arg] = process.argv.slice(2)
if (archive === undefined || action === undefined) {
  console.error('usage: asar-read.mjs <archive> list [substring] | cat <path>')
  process.exit(2)
}

const fd = openSync(archive, 'r')
// The size Pickle occupies 16 bytes: at 0 the Pickle payload size (4), at 4
// the header-string length, at 8 and 12 the same length minus 4 and 8. The
// JSON header itself starts at 16 and the file data follows it, 4-byte aligned.
const sizeProbe = Buffer.alloc(16)
readSync(fd, sizeProbe, 0, 16, 0)
const headerSize = sizeProbe.readUInt32LE(12)
const headerBuf = Buffer.alloc(headerSize)
readSync(fd, headerBuf, 0, headerSize, 16)
const header = JSON.parse(headerBuf.toString('utf8'))
const base = 16 + headerSize + ((4 - ((16 + headerSize) % 4)) % 4)

/** Walk the header tree, yielding [path, entry] for every file. */
function* walk(node, prefix = '') {
  for (const [name, entry] of Object.entries(node.files ?? {})) {
    const path = prefix.length === 0 ? name : `${prefix}/${name}`
    if (entry.files !== undefined) yield* walk(entry, path)
    else yield [path, entry]
  }
}

if (action === 'list') {
  const filter = arg
  for (const [path, entry] of walk(header)) {
    if (filter !== undefined && !path.includes(filter)) continue
    console.log(`${entry.size}\t${path}`)
  }
} else if (action === 'cat' || action === 'extract') {
  const wanted = action === 'extract' ? process.argv[4] : arg
  const dest = action === 'extract' ? process.argv[5] : undefined
  for (const [path, entry] of walk(header)) {
    if (path !== wanted) continue
    const buffer = Buffer.alloc(entry.size)
    readSync(fd, buffer, 0, entry.size, base + Number(entry.offset))
    if (dest === undefined) process.stdout.write(buffer)
    else writeFileSync(dest, buffer)
    closeSync(fd)
    process.exit(0)
  }
  console.error(`not found in archive: ${wanted}`)
  closeSync(fd)
  process.exit(1)
} else {
  console.error(`unknown action: ${action}`)
  process.exit(2)
}
closeSync(fd)
