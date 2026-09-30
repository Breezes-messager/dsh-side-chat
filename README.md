# dsh-side-chat-plugin

English | [中文](README.zh.md)

A **temporary side chat** for [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness): a panel in the right Sidebar where you can ask about the conversation you are in, about one particular answer, or about text you just selected. Close the app and it is gone.

```
        ⊕
     Side chat
A side chat is temporary. It disappears when the app closes.
```

The interaction comes from OpenAI Codex's side chat — a scratch conversation opened from a message, deliberately temporary, gone when the app closes. This repository re-implements it on DeepSeek Harness using the Harness's own public extension points; no source was ported.

---

## Contents

- [What it is](#what-it-is)
- [Install](#install)
- [Migrating from 0.1.x](#migrating-from-01x)
- [How to use it](#how-to-use-it)
- [Confirm it worked](#confirm-it-worked)
- [Troubleshooting](#troubleshooting)
- [Configuration](#configuration)
- [Platform support and known limitations](#platform-support-and-known-limitations)
- [Privacy and security](#privacy-and-security)
- [Development and contributing](#development-and-contributing)
- [License](#license)

---

## What it is

Once installed, the Harness gains a **new kind of right-Sidebar tab** called "Side chat". It docks, floats, splits and closes like every other tab in that column.

One thing makes it different from the conversation you are already having: it is **temporary**. A side chat lives in the page's memory only. It never enters your session history, your exports, or search; reloading the window empties it, and closing the app leaves no trace.

Answers render as Markdown: headings, ordered and nested lists, tables, quotes, rules, `http(s)`/`mailto` links, and syntax-highlighted code fences all come through.

Use it to:

- follow up on the **current conversation** without leaving that question in the permanent record;
- ask about **one specific answer** ("what is this code actually doing?");
- ask about **text you selected** in the original conversation;
- keep a scratchpad for something off-topic, then close it.

It **cannot** run commands, edit files, or look anything up. It answers questions — see [known limitations](#platform-support-and-known-limitations) for why.

---

## Install

> [!IMPORTANT]
> **This package is not on npm yet** (as of 2026-09-30), so **Option 3 below does not work today**. Use **Option 1 — the prebuilt package**: it needs no npm account, no Node and no pnpm.

### Before you start

1. Your DeepSeek Harness works: open a conversation, send a message, get an answer. **A side chat borrows the same model route as your main conversation** — if the main one cannot answer, neither can this.
2. You have a browser surface: the **desktop app**, or **DSH Web** opened in a browser. This plugin's UI is a web surface; a terminal-only profile will never show it.

### Option 1: the prebuilt package (recommended — no npm account)

Works for everyone. No terminal, no Node, no pnpm.

1. **Download the prebuilt package.** Open this page and use the download button:

   <https://github.com/Breezes-messager/dsh-side-chat/blob/main/dist/dsh-side-chat-plugin-0.2.0.tgz>

   Or fetch it from a terminal (either platform):

   ```sh
   curl -L -o dsh-side-chat-plugin-0.2.0.tgz https://raw.githubusercontent.com/Breezes-messager/dsh-side-chat/main/dist/dsh-side-chat-plugin-0.2.0.tgz
   ```

   To check the download, verify its SHA-256 (it should print `900C6A34496058E39702F8445B0AF8963F48A667F2C8E2519EEC57583A8D45F2`):

   ```sh
   node -e "const c=require('node:crypto'),f=require('node:fs');console.log(c.createHash('sha256').update(f.readFileSync(process.argv[1])).digest('hex').toUpperCase())" dsh-side-chat-plugin-0.2.0.tgz
   ```

2. Open DeepSeek Harness.
3. In the **left sidebar**, open **Plugins** (中文界面是「插件」).
4. Click **Add plugin**.
5. In **Package name or address**, enter the **absolute path of the file you downloaded**:
   - Windows: `C:\Users\<you>\Downloads\dsh-side-chat-plugin-0.2.0.tgz`
   - macOS / Linux: `/Users/<you>/Downloads/dsh-side-chat-plugin-0.2.0.tgz`
6. Click **Install**, then **Enable now** if it is not enabled, then **reload the interface** (`Ctrl+R` / `Cmd+R`).

This route needs **no npm account and no network at install time**: the package has no runtime dependencies, and everything the Host half needs is inlined into it.

> You can also try pasting the download URL into the box instead. **That variant is not verified here** (this development sandbox blocks child processes from reaching an HTTP server, and fetching a URL needs one), so if it fails, download the file first and give the absolute path — that path is verified.

### Option 2: build from source

For when the package is not on npm yet, or you want to change the code.

Requirements: **Node.js 22 or newer** and **pnpm 11**. Check:

```sh
node -v
pnpm -v
```

> Windows PowerShell users: `pnpm` can hit the execution policy too ("running scripts is disabled"); use **`pnpm.cmd`** instead, and read every other `pnpm ...` command on this page the same way. See [Troubleshooting](#troubleshooting).

The same commands on Windows PowerShell, macOS and Linux (copy them one by one):

```sh
git clone https://github.com/Breezes-messager/dsh-side-chat.git
cd dsh-side-chat
pnpm install
pnpm build
node scripts/install.mjs
```

The last step builds the plugin, uses pnpm to link this checkout into a profile, declares the dependency there, and makes sure DSH will load it (if the profile already selects it as a bundle, the loader row is skipped).

It picks the profile in this order: `--profile <name>` → the `DSH_PROFILE` environment variable → the only profile under `$DSH_HOME/profiles` → the only one already linking this checkout. To be explicit:

```sh
node scripts/install.mjs --profile web
node scripts/install.mjs --profile web --home "/path/to/dsh-home"
node scripts/install.mjs --profile desktop --no-build
```

(`--no-build` skips the build, for when you have already run `pnpm build`. Without it, the script builds once itself — running `pnpm build` first just tells you the build is healthy.)

Then **reload the interface**, as above.

> An equivalent no-file-editing route from source: run `pnpm install && pnpm build`, then open **Add plugin** in the app and enter the **absolute path of this directory** (for example `C:\Users\you\dsh-side-chat` or `/Users/you/dsh-side-chat`). Pick one route or the other — do not combine it with `node scripts/install.mjs`; likewise, once you have installed with `node scripts/install.mjs`, do **not** go back and click **Enable now** in the Plugins page — both routes insert the same loader row, and inserting it twice crashes the load.

> Advanced scenarios — CLI-installed profiles, manual installs, private npm registries, fully offline machines: see [docs/advanced-install.zh.md](docs/advanced-install.zh.md) (Chinese, with an English summary at the end).

### Option 3: install from npm (not available yet)

Works for everyone. No terminal, no files to edit.

1. Open DeepSeek Harness.
2. In the **left sidebar**, open **Plugins** (中文界面是「插件」).
3. Click **Add plugin**.
4. In **Package name or address**, enter:

   ```
   dsh-side-chat-plugin
   ```

5. (Optional) Expand **Registry** and pick **Mainland China mirror** if the default registry is slow.
6. Click **Install**.
   - You will see a progress view; when it finishes it shows the package name and version.
   - If it fails, the dialog explains why in one line (network, wrong package name, unreachable registry) and keeps your input so you can edit it.
7. Click **Enable now**. (If you miss it, find the `dsh-side-chat-plugin` card under **Installed** and switch it on.)
8. **Reload the interface**: `Ctrl+R` (`Cmd+R` on macOS) in the desktop app, or close and reopen the app.

That is the whole install. The right Sidebar should now offer "Side chat".

> Why there are no files to edit: the package ships a DSH **bundle** declaration. Installing it from the Plugins page puts it into the current profile; clicking **Enable now** applies the plugin row that ships inside the package. You never touch `cordis.patch.yml`.

### Which profile did it install into?

Every DSH profile is a directory under `$DSH_HOME/profiles/<name>`. `$DSH_HOME` defaults to:

- Windows: `C:\Users\<you>\.dsh`
- macOS / Linux: `~/.dsh`

| How you run DSH | Profile name |
| --- | --- |
| Desktop app | `desktop` |
| `dsh web` | `web` |
| Any other command line | Whatever you passed to `--profile` |

The install script picks the profile in the order described above (usually `desktop`). The desktop profile is owned by the application, so **do not** try to manage it with `dsh plugin --profile desktop ...` — the command is refused on purpose (see [Troubleshooting](#troubleshooting)).

> If you boot DSH from a terminal with `dsh web`, the in-app Plugins page works in your browser too — just use Option 1. Only terminal-only profiles need the CLI route; see [docs/advanced-install.zh.md](docs/advanced-install.zh.md).

### Uninstall

**Recommended:** left sidebar → **Plugins** → the `dsh-side-chat-plugin` card → **Uninstall** → confirm → reload the interface.

**By hand** (for example when the Plugins page offers no uninstall — check which way you installed first):

- **Installed from the Plugins page (bundle route)**: `cordis.patch.yml` holds no row for this plugin; do not open it, just do step 1 below.
- **Installed by hand-writing the `- insert:` row**: first open `$DSH_HOME/profiles/<profile>/cordis.patch.yml` and delete the entry whose `id` is `dsh-side-chat-plugin`.

1. Open the `package.json` in the same directory: remove `"dsh-side-chat-plugin"` from `dependencies`, **and remove it from `dsh.profile.bundles`** — that one is not optional: while the name stays in that list, the profile still tries to load the bundle on the next start.
2. Delete `$DSH_HOME/profiles/<profile>/node_modules/dsh-side-chat-plugin`.
3. Reload the interface; restart the app if the Host half is still running.

---

## Migrating from 0.1.x

**Only for people who installed a version before plugin 0.2.0.** Back then the package was `dsh-side-chat` and the loader row id was `side-chat`; from plugin 0.2.0 both are `dsh-side-chat-plugin`.

> **Get the two version numbers straight first.** "0.1.x / 0.2.0" in this section is **this plugin's own version** (old package name `dsh-side-chat` → new name `dsh-side-chat-plugin`), not the **DSH version** (this machine runs DSH `0.2.0-rc.2`), and you never need to upgrade DSH for it. To see which one you have, run `node -e "console.log(require('./package.json').dependencies)"` inside the profile directory — `dsh-side-chat` means the old version, `dsh-side-chat-plugin` the new one; with the new name installed, `node -e "console.log(require('./node_modules/dsh-side-chat-plugin/package.json').version)"` prints the plugin version (0.2.0 here), and the Plugins page card shows it too.

⚠️ **Enter `dsh-side-chat-plugin` when you install — not `dsh-side-chat`.** On npm, `dsh-side-chat` is **someone else's** plugin ("parallel side conversation"), and it uses the row id `side-chat` as well. Two rows sharing one id in a profile register twice and crash — which is exactly why this plugin was renamed.

⚠️ **Migration takes four steps, and all four are required: ① delete the old loader row → ② put the new dependency name into the profile → ③ add `dsh-side-chat-plugin` to `dsh.profile.bundles` → ④ delete the old package directory and restart.** Step ③ is the one people miss, and missing it raises no error — the plugin **vanishes**: the hand-written row is gone (①), the bundle's row never arrives (③), the right Sidebar has no "Side chat" tab, `POST /side-chat/ask` returns 404, and no red error explains why.

**Why step ③ is not optional.** `dsh-side-chat-plugin` is a DSH **bundle**: the loader row inside its own `cordis.patch.yml` (`id` and `name` both `dsh-side-chat-plugin`) is applied **only when this profile selects that package name in `dsh.profile.bundles`**. A bundle that sits in `node_modules` unselected is never loaded — measured: with the dependency installed and the bundle unselected, DSH's synthesized config tree contains no row for this plugin at all; put the name into `dsh.profile.bundles` and the tree gains `# == dsh-side-chat-plugin` plus `- id: dsh-side-chat-plugin` / `name: dsh-side-chat-plugin`. (`dsh.profile.bundles` is an **ordered** list; append the new name at the end.)

**Before you start:** fully quit the desktop app (or stop the `dsh web` process) — step 4 deletes files. Do all four steps, then start the app again.

1. **Delete the old loader row.** Open `$DSH_HOME/profiles/<profile>/cordis.patch.yml` and remove:

   ```yaml
   - insert:
       - id: side-chat
         name: dsh-side-chat
   ```

   Remove any old `- id: side-chat` override as well (a `trust:` or `provider:` block): the new version no longer matches that id, so it would **silently stop working**.

   To open that file (desktop profile; replace `desktop` with your profile name):

   Windows PowerShell:

   ```powershell
   notepad "$env:USERPROFILE\.dsh\profiles\desktop\cordis.patch.yml"
   ```

   macOS / Linux:

   ```sh
   ${EDITOR:-vi} "$HOME/.dsh/profiles/desktop/cordis.patch.yml"
   ```

2. **Put the new dependency name into the profile.** In the `package.json` beside it, delete `"dsh-side-chat"` from `dependencies`, and make sure `"dsh-side-chat-plugin"` is listed there — installing from the in-app [Option 1](#option-1-recommended-install-from-inside-dsh), or the manual command below, writes it.

   Manual install (run inside the profile directory; published version):

   Windows PowerShell:

   ```powershell
   Set-Location "$env:USERPROFILE\.dsh\profiles\desktop"
   pnpm add dsh-side-chat-plugin
   ```

   macOS / Linux:

   ```sh
   cd "$HOME/.dsh/profiles/desktop"
   pnpm add dsh-side-chat-plugin
   ```

   To edit `package.json` by hand: `notepad "$env:USERPROFILE\.dsh\profiles\desktop\package.json"` on Windows PowerShell, or `${EDITOR:-vi} "$HOME/.dsh/profiles/desktop/package.json"` on macOS / Linux. For a `link:` install from a source checkout, see [docs/advanced-install.zh.md §2](docs/advanced-install.zh.md#2-手动安装到桌面-profile).

3. **Append `dsh-side-chat-plugin` to `dsh.profile.bundles` (the critical step).** In the same `$DSH_HOME/profiles/<profile>/package.json`, add `"dsh-side-chat-plugin"` at the **end** of the `dsh.profile.bundles` array. Leave every name already in that array exactly as it is. Afterwards that part of the file should look like this (the rest of the file is unchanged; the `"……"` entry stands for whatever is already there — copy it unchanged):

   ```json
   {
     "dsh": {
       "profile": {
         "bundles": [
           "……the bundles already in your file — copy them unchanged……",
           "dsh-side-chat-plugin"
         ]
       }
     }
   }
   ```

   Check it (expected: the array contains `'dsh-side-chat-plugin'`):

   Windows PowerShell:

   ```powershell
   Set-Location "$env:USERPROFILE\.dsh\profiles\desktop"
   node -e "console.log(require('./package.json').dsh.profile.bundles)"
   ```

   macOS / Linux:

   ```sh
   cd "$HOME/.dsh/profiles/desktop" && node -e "console.log(require('./package.json').dsh.profile.bundles)"
   ```

   > Once the bundle is selected, the loader row comes from the `cordis.patch.yml` inside the package — do **not** also write an `- insert:` row by hand; the same row inserted twice crashes the load.
   >
   > If this profile has **no** `dsh.profile.bundles` at all, it was never initialised: build it first as described in [advanced-install.zh.md §1](docs/advanced-install.zh.md#1-命令行安装web-等非桌面-profile), then append the name. **Getting the package into `node_modules` is not enough on its own.**

4. **Delete the old package directory, then start the app** (the path ends in the old name, without `-plugin`):

   Windows PowerShell:

   ```powershell
   Remove-Item -Recurse -Force "$env:USERPROFILE\.dsh\profiles\desktop\node_modules\dsh-side-chat"
   ```

   macOS / Linux:

   ```sh
   rm -rf "$HOME/.dsh/profiles/desktop/node_modules/dsh-side-chat"
   ```

   Now start the app (or `dsh web`) and **reload the interface** (`Ctrl+R` / `Cmd+R`). If you only install `dsh-side-chat-plugin` from the in-app [Option 1](#option-1-recommended-install-from-inside-dsh) at this point, go **back to step 3 and check `dsh.profile.bundles` again** once it finishes.

   The right Sidebar should now offer "Side chat"; if you have a checkout handy, `pnpm run verify` from the repository directory double-checks the profile.

The longer manual route (uninstall, CLI profiles, private registries, offline machines) is in [docs/advanced-install.zh.md](docs/advanced-install.zh.md) — Chinese, with an English summary at the end.

---

## How to use it

### Three ways in

**Entry 1 — the conversation header.** Open any conversation. There is a **Side chat** button in the header (the row with the conversation title). Click it and the panel opens in the right Sidebar.

**Entry 2 — one specific answer.** Hover any **finished** assistant message. A bubble icon appears in its action row (tooltip: "Ask in side chat"). Click it and the panel opens **with that answer attached as context** — the row above the composer reads "The selected message is attached as context".

**Entry 3 — selected text.** Select a passage in the original conversation (at least 2 characters). A floating **Ask in side chat** button appears above the selection. Click it and the panel opens with that text attached; the context row shows "Asking about the selected text" plus a short preview.

> The floating button disappears when you scroll or resize. That is deliberate: the selection changed, so the question changed. Select, then click.

You can also open it as an ordinary tab from the right Sidebar's tab menu.

### In the panel

| What you want | How |
| --- | --- |
| Ask | Type in the composer, press `Enter` |
| New line | `Shift+Enter` |
| Stop a streaming answer | The **Send** button becomes **Stop** while an answer arrives; click it (or press `Esc`) |
| Close the panel | Press `Esc` while nothing is streaming, or close the tab like any other |
| See what context is attached | The row above the composer names it: a quoted message / the recent conversation / selected text |
| Drop the context | Click the `×` on that row; it falls back to "The recent conversation is attached as context" |
| Clear this temporary chat | **Clear**, at the bottom right (it does not touch the main conversation) |

An `Enter` that belongs to an input method (Chinese, Japanese, Korean candidate selection) never sends by accident.

While a long answer streams, the transcript follows the newest text — until you scroll up, at which point it stops following. Scroll back to the bottom to resume.

**Each conversation has its own side chat.** Open the panel in a different conversation and you get a fresh, empty one.

---

## Confirm it worked

Check these in order; if one fails, see [Troubleshooting](#troubleshooting).

1. Left sidebar → **Plugins** → **Installed** shows a `dsh-side-chat-plugin` card and it is enabled.
2. Any conversation shows the **Side chat** button in its header.
3. Clicking it opens a "Side chat" tab in the right Sidebar with a composer at the bottom.
4. Ask something simple ("hello"); the answer streams in character by character.
5. (Developers) From the repository directory, run `pnpm run verify` (`pnpm.cmd run verify` on Windows PowerShell): it checks the build artifacts, the package declaration, the plugin's loader row in the profile, and whether the local DSH port answers.
6. You can also check the profile itself, with no checkout at hand. Run these inside `$DSH_HOME/profiles/<profile>` (for the desktop profile: `C:\Users\<you>\.dsh\profiles\desktop`) and compare with the expectation in brackets:
   - `node -e "console.log(require('./package.json').dependencies)"` — expect to see `dsh-side-chat-plugin` (its value may be a `link:...` path or a version).
   - `node -e "console.log(require('./package.json').dsh.profile.bundles)"` — expect `'dsh-side-chat-plugin'` to be the **last** entry of the array.
   - `node -e "console.log(require('./node_modules/dsh-side-chat-plugin/package.json').version)"` — expect the plugin version (0.2.0 on this machine).
   - List the directory: `Get-ChildItem node_modules\dsh-side-chat-plugin` on Windows PowerShell, `ls node_modules/dsh-side-chat-plugin` on macOS / Linux — expect the package's files (at least `package.json`), not "path not found".

---

## Troubleshooting

### It will not install / there is no entry point

**There is no "Plugins" entry in the left sidebar.**
Your DSH build is probably older. Update the desktop app, or install from source with [Option 2](#option-2-build-from-source).

**The Plugins page says "This deployment runs without a manageable profile, so plugins cannot be installed or switched here."**
You are on a deployment without profile management (for example an ad-hoc command-line instance). Install from the desktop app, or use [Option 2](#option-2-build-from-source).

**Install fails with "This package declares no bundle, so it cannot be installed as a plugin".**
The package you have carries no bundle declaration — usually because the version is old. Make sure you are installing the latest published `dsh-side-chat-plugin`; if you modified a local checkout, use [Option 2](#option-2-build-from-source).

**The Plugins page cannot find the package `dsh-side-chat-plugin`.**
It has not been published to npm yet (as of 2026-09-30). Install [from source](#option-2-build-from-source) instead, or wait for the release and use Option 1.

**On Windows PowerShell, `dsh` or `pnpm` fails with "running scripts is disabled on this system".**
PowerShell blocks `.ps1` shims by default, and both `dsh` and `pnpm` can hit it. Either replace `dsh` / `pnpm` with **`dsh.cmd`** / **`pnpm.cmd`** in the command (for example `dsh.cmd plugin --profile web add dsh-side-chat-plugin`, `pnpm.cmd run verify`), or relax the local policy with `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned`. The second option loosens a machine-local security setting — your call.

**`dsh plugin --profile desktop ...` says the profile "is managed exclusively by the Electron application".**
That is by design: the desktop app owns its own profile. Use the in-app Plugins page there. The `dsh plugin` command is for non-desktop profiles such as `web` and `cc-tui`.

### Installed, but nothing appears

**No "Side chat" in the right Sidebar.**
In order:

1. Reload the interface (`Ctrl+R` / `Cmd+R`); if that does not help, restart the app.
2. Go back to **Plugins** and confirm the `dsh-side-chat-plugin` card is enabled.
3. Open the browser console (`Ctrl+Shift+I` in the desktop app) and look for red errors starting with `dsh-side-chat-plugin`; paste them into an issue.

**Clicking Side chat says it "cannot open right now".**
No conversation is open, so the panel has nowhere to mount. Open a conversation and click again.

**The Side chat button does nothing, with no message.**
Check the console first. If the right Sidebar is collapsed, the tab may have opened out of sight — expand the column.

### It opens but will not answer

**It says no model is available yet, or nothing comes back.**
A side chat borrows the model your **current conversation** used. Send a normal message in that conversation and get an answer first, then ask again. If the main conversation is broken, fix that first (Settings → Models); you can also pin `provider` and `model` as described in [Configuration](#configuration).

**"This request was refused" (HTTP 401 / 403).**
Under the default `same-origin` policy the plugin stops **cross-site pages**: a request that carries an `Origin` must be same-origin with the address it was sent to, or it gets 403; `Origin: null` is refused too, and so is any caller from another machine. A request with **no `Origin`** (`curl`, and the desktop app's Electron forwarder, which strips `Origin` and re-adds only the Host's cookie) is handed to DSH's own trust check: if DSH refuses, its status code is returned, and if DSH has no opinion the call proceeds. So a 401 / 403 can come from four places: the plugin's own same-origin policy, DSH's trust check, a `trust: host` profile whose Host requires credentials, or a reverse proxy whose address no longer matches the page's origin. See [Privacy and security](#privacy-and-security); if you really need that access, set `trust: host` or `trust: open` there and protect the access path yourself. Refresh the interface and retry; if you reach DSH over the network, check the address and your sign-in state.

**"Too many questions are running at once" (HTTP 429).**
Concurrent side-chat answers are capped (4 by default). Wait for one to finish.

**An answer stopped by itself and reported a failure.**
It may have hit the per-answer time limit (10 minutes by default), or the model service itself may have failed. Ask again in different words; if it keeps timing out, raise `timeoutMs` in the configuration.

**An answer stopped halfway, or Send does nothing after Stop.**
Reload the interface. The temporary chat is cleared — that is the design.

**Code fences have no colours, or an unknown language.**
Highlighting is a curated set: TypeScript/JavaScript, JSON, Python, Bash, PowerShell, HTML/XML, CSS, Markdown, SQL, YAML, Go, Rust, Java, C++, INI/TOML and diff. Anything else renders as plain code; nothing else changes.

**My questions are still there after closing the app.**
A side chat leaves no record at all. If you see similar text in your session history, that is a main-conversation message, not a side chat.

---

## Configuration

**Most people need none of this.** When you do, edit:

```
$DSH_HOME/profiles/<profile>/cordis.patch.yml
```

(On Windows that is usually `C:\Users\<you>\.dsh\profiles\desktop\cordis.patch.yml`.)

Append an id-targeted override at the end of the file. For example, to pin the provider and model you can see in Settings:

```yaml
- id: dsh-side-chat-plugin
  config:
    provider: deepseek-account
    model: deepseek-flash
```

To reach the plugin from a browser that is **not** on the same machine as DSH — or through a reverse proxy that rewrites the address — you have to loosen the default:

```yaml
- id: dsh-side-chat-plugin
  config:
    trust: host
```

Saving is usually picked up live; restart the app if it is not.

| Setting | Default | What it does |
| --- | --- | --- |
| `provider` / `model` | follow the current conversation | Pin which provider and model answer side chats. Write both together. |
| `trust` | `'same-origin'` | Who may call the plugin. `same-origin` (the default): a request **with** an `Origin` must be same-origin with the address it was sent to (cross-site pages and `Origin: null` get 403), a request **without** an `Origin` is handed to DSH's own trust check (that is how the desktop app works, so the default is usable there), and callers from another machine are refused. `host` defers entirely to DSH's own trust check and never looks at `Origin`; `open` skips the check. See [Privacy and security](#privacy-and-security). |
| `timeoutMs` | `600000` (10 minutes) | Hard time limit for one answer, in milliseconds; the answer is stopped when it expires. `0` disables the limit. |
| `maxConcurrent` | `4` | Concurrent side-chat answers; further requests are refused with 429. |
| `maxBodyBytes` | `262144` (256 KB) | Request body limit in bytes; larger bodies get 413. Rarely worth changing. |
| `recentMessages` | `20` | How many recent main-conversation messages are folded in as context when no specific message is named. |
| `maxMessageChars` | `4000` | Longest single context message, in characters. |
| `maxContextChars` | `24000` | Longest whole context excerpt, in characters. |

---

## Platform support and known limitations

**Supported**

- The DeepSeek Harness desktop app (Windows / macOS / Linux) — the primary target.
- DSH Web in a browser.
- Developed and verified against the DSH `0.2.0-rc.2` line.

**Not supported**

- Terminal-only profiles (such as `cc-tui`): the plugin's UI is a web surface, so no panel appears there.
- A tool-using side agent like Codex's: that needs a temporary *Session*, a concept DeepSeek Harness does not have today. A side chat answers; it cannot run commands or edit files.

**Known limitations**

- **Finished assistant messages only**: partial or interrupted messages carry no durable id and cannot be targeted.
- **Context is capped**: 20 recent messages, 4 000 characters each, 24 000 in total, plus up to 8 000 characters of selected text.
- **One model call per answer**: no multi-turn tool loop and no automatic memory compaction; follow-up questions carry the history with them.
- **The panel is per conversation**: switching conversations starts an empty side chat.
- **Highlighting is a curated set**: see [Troubleshooting](#it-opens-but-will-not-answer).
- **Nothing is written down**: reloading clears it. That is the feature, not a bug.

---

## Privacy and security

**Nothing is written.** No file is opened for writing anywhere in this plugin: no session log, no projection cache, no temporary file. A side chat lives in the current page's memory and dies with the window, so it never appears in session history, exports or search.

**What leaves the machine.** One model request per question, through the Harness's own model service: your question, the temporary conversation's history, and the context folded from the current conversation — at most the 20 most recent messages, 4 000 characters each and 24 000 in total, plus the text you selected (capped at 8 000 characters). It goes to **the same provider your main conversation already uses**. The plugin carries no telemetry and makes no outbound request of its own.

**Who may call it — please read this part.**

- By default (`trust: 'same-origin'`) the decision has two halves:
  - **A request that carries an `Origin`** must be same-origin with the address it was sent to, or it gets 403. A page on another website posting to your DSH port, and an opaque `Origin: null` (a sandboxed frame), are both stopped here — a browser always sends `Origin` on a cross-site request and cannot be talked out of it, so this half is a real fence for the web.
  - **A request without an `Origin`** has no page behind it: it is handed to DSH's own trust check (`connection.requestRejection`). If DSH refuses, its status code is returned (401 / 403); if DSH has no opinion, the call proceeds. **That is exactly what the desktop app's requests look like** — the Electron forwarder strips `Origin` and re-adds only the Host's cookie — so the desktop app works with no configuration.
  - Callers from **another machine** are refused as well (they do not come over loopback).
  - This is **stricter** than the Host check alone (`trust: host`), which never looks at `Origin` at all.
  - **What this is not.** A program running on this machine can forge any header, so this stops a web page from using your browser and stops accidental calls — it is not a fence against software that means to call the route. What actually keeps that software out is DSH's own **signed browser credential**: in our measurements a request without it is refused by DSH (401) before the plugin is ever reached.
- To change it, set `trust`:
  - `host`: defer entirely to DSH's own trust check and never look at `Origin` (so a cross-site page is admitted too). On the DSH versions we measured the Host requires that signed browser credential, so **a call without it is refused (401 / 403)**. Only when the Host has no trust check configured does this mode admit every local caller; the first such admission leaves a `side-chat:` warning in the application log. Choose it to allow a cross-site page, or when DSH itself is your only intended boundary. **It is not the mode for a browser on another machine** — non-loopback calls are refused by the plugin (next line).
  - `open`: skip the check entirely. Only for local development, or when a fronting proxy has already authenticated you.
- **Reaching DSH from another machine?** The default refuses those calls (they do not come over loopback), so set `trust: host` or `trust: open` — and make sure that access path is authenticated some other way.
- So: **do not expose the DSH web port beyond this machine** (no port forwarding, no listening on `0.0.0.0`) unless you have deliberately chosen and protected one of the modes above.
- The environment variable `DSH_SIDE_CHAT_ALLOW_LOOPBACK=1` is equivalent to `trust: 'open'`, also for local development. An explicit `trust` in the profile wins over it; the variable is read once when the plugin loads, so restart after changing it.

**What is logged.** A failed session read logs its id; a failed model call logs the failure code and HTTP status, and **never** the provider's message, which can echo request text. The conversation itself is never logged.

---

## Development and contributing

To change the code, run the tests, or send a pull request, see [CONTRIBUTING.md](CONTRIBUTING.md) (Chinese-first, with the key steps in English).

The short version:

```sh
pnpm install
pnpm build        # build
pnpm typecheck    # type check
pnpm test         # unit tests
```

After changing the browser half (`src/client/**`), run `pnpm build` again and reload the interface — no app restart needed.

---

## License

MIT — see [LICENSE](LICENSE).
