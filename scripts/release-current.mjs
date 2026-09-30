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

/**
 * The regular files inside a tarball, as `package/`-relative paths.
 *
 * `tar -tzvf` prints one member per line and is the only listing this script
 * needs; taking the **last whitespace-separated field** is what makes it work
 * under both bsdtar (Windows) and GNU tar (the runner), whose columns otherwise
 * differ. Directory entries end in `/` and are dropped: `pnpm pack` records none,
 * while repacking with plain `tar` adds `package/`, `package/lib/` and friends,
 * and those must not count as content.
 * @param tarball - path to a `.tgz` file.
 * @returns sorted relative paths.
 */
function members(tarball) {
  return execFileSync('tar', ['-tzvf', tarball], { encoding: 'utf8' })
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => line.split(/\s+/).at(-1))
    .filter((name) => name.startsWith('package/') && !name.endsWith('/'))
    .map((name) => name.slice('package/'.length))
    .filter((name) => name.length > 0)
    .sort()
}

/**
 * A digest of what is *inside* a tarball, independent of the archive's own
 * framing.
 *
 * Two things must not affect this. Archive framing: gzip carries an mtime and an
 * OS byte, and only tar's member order is standardised, so a Windows-built
 * release and a CI-built one can share every file and still differ byte for byte
 * (measured: OS byte `0x0a` versus `0x03`). Directory entries: as above.
 *
 * What matters is the regular files and their bytes; that is what this digests,
 * because it is what a user actually installs.
 * @param tarball - path to a `.tgz` file.
 * @returns a hex digest over sorted relative paths and their contents.
 */
export function contentDigest(tarball) {
  const files = members(tarball)
  const hash = createHash('sha256')
  for (const relative of files) {
    hash.update(relative)
    hash.update('\u0000')
    hash.update(execFileSync('tar', ['-xzOf', tarball, `package/${relative}`], { maxBuffer: 64 * 1024 * 1024 }))
    hash.update('\u0000')
  }
  return { digest: hash.digest('hex').toUpperCase(), members: files.length }
}

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

/**
 * Compare the committed release against a freshly built one.
 *
 * This is what CI runs: it answers "is dist/ a build of these sources?" without
 * depending on gzip framing matching byte for byte across machines. The SHA-256
 * in the note is still the user's integrity check; this is the repository's
 * drift check.
 * @param fresh - path to a tarball packed from the working tree.
 * @returns whether the two carry identical contents.
 */
function compare(fresh) {
  const a = contentDigest(join(DIST, file))
  const b = contentDigest(fresh)
  if (a.digest === b.digest) {
    console.log(`release-current: dist/${file} is a build of the current sources `
      + `(${a.members} members, content ${a.digest.slice(0, 16)}…)`)
    return true
  }
  console.error('release-current: the committed release does NOT match the current sources')
  console.error(`  committed: ${a.members} members, content ${a.digest}`)
  console.error(`  fresh    : ${b.members} members, content ${b.digest}`)
  console.error('  fix with: pnpm pack --pack-destination dist && node scripts/release-current.mjs --write')
  return false
}

const current = readFileSync(NOTE, 'utf8')
const stale = current !== note
const write = process.argv.includes('--write')
const compareIndex = process.argv.indexOf('--compare')

if (write) {
  if (stale) {
    writeFileSync(NOTE, note)
    console.log(`release-current: rewrote dist/README.md for ${file} (${withCommas} bytes, ${sha.slice(0, 16)}…)`)
  } else {
    console.log('release-current: dist/README.md already describes this tarball')
  }
} else if (compareIndex >= 0) {
  const fresh = process.argv[compareIndex + 1]
  if (fresh === undefined) {
    console.error('release-current: --compare needs the path of a freshly packed tarball')
    process.exit(2)
  }
  if (stale) {
    console.error(`release-current: dist/README.md does not describe dist/${file}`)
    console.error('  regenerate with: node scripts/release-current.mjs --write')
    process.exit(1)
  }
  if (!compare(fresh)) process.exit(1)
  console.log(`release-current: dist/README.md matches ${file} (${withCommas} bytes)`)
} else if (stale) {
  console.error(`release-current: dist/README.md does not describe dist/${file}`)
  console.error(`  actual size: ${size}   actual sha256: ${sha}`)
  console.error('  regenerate with: node scripts/release-current.mjs --write')
  process.exit(1)
} else {
  console.log(`release-current: dist/README.md matches ${file} (${withCommas} bytes)`)
}
