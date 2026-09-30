#!/usr/bin/env node
/**
 * Keep `dist/README.md` describing the tarball that is actually in `dist/`.
 *
 * A release note that drifts from its artifact is worse than no note: it tells
 * users a hash to verify and gives them a different file, and it advertises a
 * build that may predate the fixes in the repository. This reads the packed
 * tarball, reports every mismatch, and with `--write` regenerates the note.
 *
 * Usage:
 *   node scripts/release-current.mjs            # check only; exit 1 on drift
 *   node scripts/release-current.mjs --write    # rewrite dist/README.md
 */
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const DIST = join(ROOT, 'dist')
const NOTE = join(DIST, 'README.md')
const REPO_URL = 'https://github.com/Breezes-messager/dsh-side-chat'

/** The one tarball this folder is about. */
function releaseFile() {
  const names = readdirSync(DIST).filter((name) => name.endsWith('.tgz'))
  if (names.length === 0) {
    console.error('release-current: dist/ carries no tarball; run "pnpm pack --pack-destination dist"')
    process.exit(1)
  }
  if (names.length > 1) {
    console.error(`release-current: dist/ carries ${names.length} tarballs (${names.join(', ')}); keep one`)
    process.exit(1)
  }
  return names[0]
}

const file = releaseFile()
const bytes = readFileSync(join(DIST, file))
const sha = createHash('sha256').update(bytes).digest('hex').toUpperCase()
const size = bytes.length

/** Read the packed manifest and the file list, without unpacking to disk. */
function readPacked() {
  const text = execFileSync('tar', ['-tzvf', join(DIST, file)], { encoding: 'utf8' })
  const names = text.split('\n').filter((line) => line.trim() !== '').map((line) => line.split(/\s+/).at(-1))
  const manifest = JSON.parse(execFileSync('tar', ['-xzOf', join(DIST, file), 'package/package.json'], { encoding: 'utf8' }))
  const patch = execFileSync('tar', ['-xzOf', join(DIST, file), 'package/cordis.patch.yml'], { encoding: 'utf8' })
  return { names, manifest, patch }
}

const { names, manifest, patch } = readPacked()
const rowId = /id:\s*(\S+)/.exec(patch)?.[1] ?? '(none)'
const withCommas = size.toLocaleString('en-US')
const releaseUrl = `${REPO_URL}/blob/main/dist/${file}`
const rawUrl = `${REPO_URL}/raw/main/dist/${file}`

const note = `# Prebuilt releases

This folder carries the packed plugin so that people can install it **without an
npm account and without building anything**. Every file here is a verbatim output
of \`pnpm pack\` from the commit that carries it; nothing is hand-edited.

> Publishing a release is three commands, and the last one fails if this note does
> not describe the file exactly:
>
> \`\`\`sh
> pnpm install --frozen-lockfile
> pnpm pack --pack-destination dist
> node scripts/release-current.mjs --write
> \`\`\`

## Download

**[${file}](${releaseUrl})** — direct link: [raw](${rawUrl})

| | |
| --- | --- |
| File | \`${file}\` |
| Version | \`${manifest.version}\` |
| Size | ${withCommas} bytes |
| SHA-256 | \`${sha}\` |
| Loader row | \`id: ${rowId}\` / \`name: ${manifest.name}\` |
| Contents | ${names.length} files — \`lib/index.js\`, \`lib/client.js\` (+ source map), both \`.d.ts\`, \`cordis.patch.yml\`, \`locale/{en,zh}.json\`, \`icon.svg\`, \`scripts/verify.mjs\`, plus the READMEs, LICENSE and \`package.json\` |
| Runtime dependencies | none — everything the Host half needs is inlined, and the browser half uses the shell's React |

### Install it

1. Download the tarball (the link above) into any local folder — the browser's
   **Save link as…** on the direct link works too.
2. In DeepSeek Harness: **Plugins** → **Add plugin** → paste the **absolute path**
   of the downloaded file, for example
   \`C:\\Users\\you\\Downloads\\${file}\`
   (\`/Users/you/Downloads/${file}\` on macOS).
3. Install, then enable it if it is not enabled already, then reload the window.

No registry and no network are involved. To verify what you downloaded:

\`\`\`sh
node -e "const c=require('node:crypto'),f=require('node:fs');console.log(c.createHash('sha256').update(f.readFileSync(process.argv[1])).digest('hex').toUpperCase())" ${file}
\`\`\`

It must print the SHA-256 in the table above.

### Reproduce it

\`\`\`sh
pnpm install --frozen-lockfile
pnpm pack --pack-destination dist
node scripts/check-pack.mjs dist/${file}
node scripts/release-current.mjs
\`\`\`

## Why not \`pnpm add <github url>\`?

Because it does not produce a working plugin, which is worth writing down so nobody
tries it twice. A Git dependency is installed **without devDependencies**, so no
build tool is present; \`prepare\` cannot produce \`lib/\`, and the package lands in
the profile **unbuilt** — installed, enabled, and loading nothing. Measured on this
repository: the install exits 0, the composed configuration tree contains the
Loader row, and \`node_modules/${manifest.name}/lib/\` is absent.

Use this tarball, or install from a clone (see the README's source route, which
builds before linking).
`

const current = readFileSync(NOTE, 'utf8')
const stale = current !== note
const write = process.argv.includes('--write')

if (write) {
  if (stale) {
    writeFileSync(NOTE, note)
    console.log(`release-current: rewrote dist/README.md for ${file} (${withCommas} bytes, ${sha.slice(0, 16)}…)`)
  } else {
    console.log('release-current: dist/README.md already describes this tarball')
  }
} else if (stale) {
  console.error(`release-current: dist/README.md does not describe dist/${file}`)
  console.error(`  actual size: ${size}   actual sha256: ${sha}`)
  console.error('  regenerate with: node scripts/release-current.mjs --write')
  process.exit(1)
} else {
  console.log(`release-current: dist/README.md matches ${file} (${withCommas} bytes)`)
}
