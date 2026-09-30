# Prebuilt releases

This folder carries the packed plugin so that people can install it **without an
npm account and without building anything**. Every file here is a verbatim output
of `pnpm pack` from the commit that carries it; nothing is hand-edited.

> Publishing a release is three commands, and the last one fails if this note does
> not describe the file exactly:
>
> ```sh
> pnpm install --frozen-lockfile
> pnpm pack --pack-destination dist
> node scripts/release-current.mjs --write
> ```

## Download

**[dsh-side-chat-plugin-0.2.0.tgz](https://github.com/Breezes-messager/dsh-side-chat/blob/main/dist/dsh-side-chat-plugin-0.2.0.tgz)** — direct link: [raw](https://github.com/Breezes-messager/dsh-side-chat/raw/main/dist/dsh-side-chat-plugin-0.2.0.tgz)

| | |
| --- | --- |
| File | `dsh-side-chat-plugin-0.2.0.tgz` |
| Version | `0.2.0` |
| Size | 249,798 bytes |
| SHA-256 | `E54A1CE659E14866A18ED4506CCBD7D7F6DAD4E07B121E25D32C5245441A1C53` |
| Loader row | `id: dsh-side-chat-plugin` / `name: dsh-side-chat-plugin` |
| Contents | 15 files — `lib/index.js`, `lib/client.js` (+ source map), both `.d.ts`, `cordis.patch.yml`, `locale/{en,zh}.json`, `icon.svg`, `scripts/verify.mjs`, plus the READMEs, LICENSE and `package.json` |
| Runtime dependencies | none — everything the Host half needs is inlined, and the browser half uses the shell's React |

### Install it

1. Download the tarball (the link above) into any local folder — the browser's
   **Save link as…** on the direct link works too.
2. In DeepSeek Harness: **Plugins** → **Add plugin** → paste the **absolute path**
   of the downloaded file, for example
   `C:\Users\you\Downloads\dsh-side-chat-plugin-0.2.0.tgz`
   (`/Users/you/Downloads/dsh-side-chat-plugin-0.2.0.tgz` on macOS).
3. Install, then enable it if it is not enabled already, then reload the window.

No registry and no network are involved. To verify what you downloaded:

```sh
node -e "const c=require('node:crypto'),f=require('node:fs');console.log(c.createHash('sha256').update(f.readFileSync(process.argv[1])).digest('hex').toUpperCase())" dsh-side-chat-plugin-0.2.0.tgz
```

It must print the SHA-256 in the table above.

### Reproduce it

```sh
pnpm install --frozen-lockfile
pnpm pack --pack-destination dist
node scripts/check-pack.mjs dist/dsh-side-chat-plugin-0.2.0.tgz
node scripts/release-current.mjs
```

## Why not `pnpm add <github url>`?

Because it does not produce a working plugin, which is worth writing down so nobody
tries it twice. A Git dependency is installed **without devDependencies**, so no
build tool is present; `prepare` cannot produce `lib/`, and the package lands in
the profile **unbuilt** — installed, enabled, and loading nothing. Measured on this
repository: the install exits 0, the composed configuration tree contains the
Loader row, and `node_modules/dsh-side-chat-plugin/lib/` is absent.

Use this tarball, or install from a clone (see the README's source route, which
builds before linking).
