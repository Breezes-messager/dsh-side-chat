# Prebuilt releases

This folder carries the packed plugin so that people can install it **without an
npm account and without building anything**. Every file here is a verbatim output
of `pnpm pack` from the commit that carries it; nothing is hand-edited.

## 0.2.0

| | |
| --- | --- |
| File | `dsh-side-chat-plugin-0.2.0.tgz` |
| Size | 247,985 bytes |
| SHA-256 | `900C6A34496058E39702F8445B0AF8963F48A667F2C8E2519EEC57583A8D45F2` |
| Contents | 15 files — `lib/index.js`, `lib/client.js` (+ source map), both `.d.ts`, `cordis.patch.yml`, `locale/{en,zh}.json`, `icon.svg`, `scripts/verify.mjs`, plus the READMEs, LICENSE and `package.json` |

### Install it

1. Download the tarball to any local folder (the button on this file's page, or a
   raw download URL).
2. In DeepSeek Harness: **Plugins** → **Add plugin** → paste the **absolute path**
   of the downloaded file, for example
   `C:\Users\you\Downloads\dsh-side-chat-plugin-0.2.0.tgz`
   (`/Users/you/Downloads/dsh-side-chat-plugin-0.2.0.tgz` on macOS).
3. Install, then enable it if it is not enabled already, then reload the window.

Installing this way needs no registry and no network: the package has no runtime
dependencies — everything the Host half needs is inlined into `lib/index.js`, and
the browser half takes React from the shell's module table.

To check the download first:

```sh
node -e "const c=require('node:crypto'),f=require('node:fs');console.log(c.createHash('sha256').update(f.readFileSync(process.argv[1])).digest('hex').toUpperCase())" dsh-side-chat-plugin-0.2.0.tgz
```

It must print the SHA-256 above.

### Reproduce it

```sh
pnpm install --frozen-lockfile
pnpm pack
node scripts/check-pack.mjs ./dsh-side-chat-plugin-0.2.0.tgz
```
