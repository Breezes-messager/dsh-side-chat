# dsh-side-chat

A **side chat** for [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness): a
temporary conversation that lives in the right Sidebar beside the one you are already
having. Ask it about the conversation, about a single message, or about anything else —
and close the app, and it is gone.

```
        ⊕
    侧边聊天
侧边聊天是临时聊天，关闭应用后会消失。
```

## What it does

- **A right-Sidebar panel.** It is a tab type (`side-chat`) registered through the public
  `ctx.sidebarRightTabs` / `sidebar.right.pane.tab` seats, so it docks, floats, splits and
  closes like every other tab in that column.
- **Two ways in.** A `侧边聊天` control in the conversation header, and a bubble action on
  every finished assistant message that opens the panel *on that message*
  (`在侧边聊天中提问`).
- **Context, folded on the Host.** Every question carries the Session id. The Host reads
  that Session's log through `ctx.sessionQuery`, folds the selected message — or the most
  recent messages when nothing specific was picked — and hands the excerpt to the model
  as reference material.
- **The same model as the conversation you are in.** The route is resolved from the
  Session's own last `request/header`, falling back to the Host's default selection.
- **Genuinely temporary.** Nothing is written to a Session log, to the projection cache,
  or to disk. The transcript lives in a page-memory store keyed by Session; the Host is
  stateless. Reload the window and it is empty; close the app and it never existed.

## Install

One command, from a checkout of this repository:

```sh
node scripts/install.mjs --profile desktop
```

It builds the plugin, links it into `$DSH_HOME/profiles/<profile>`, and adds the Loader row
to that profile's `cordis.patch.yml`. Then **reload the Harness window** (or restart the
app) so the browser half is picked up.

Manual equivalent:

1. `pnpm install && pnpm build`
2. In `$DSH_HOME/profiles/<profile>`: `pnpm add link:<this directory>`
3. Append to that profile's `cordis.patch.yml`:

   ```yaml
   - insert:
       - id: side-chat
         name: dsh-side-chat
   ```

4. Reload the window.

### Uninstall

1. Remove the `- insert:` row (and the `dsh-side-chat` dependency) from the profile.
2. Delete `$DSH_HOME/profiles/<profile>/node_modules/dsh-side-chat`.

## How it is put together

| Piece | File | What it owns |
| --- | --- | --- |
| Wire contract | `src/protocol.ts` | Route, tab kind, SSE framing — shared by both halves |
| Host half | `src/index.ts` | `POST /side-chat/ask`: trust check, body limits, model route, `ctx.llm.stream` → SSE |
| Host context fold | `src/context.ts` | Session log → prompt context; pure, no Harness imports, unit-tested |
| Browser half | `src/client/index.ts` | The three registrations (tab type, header control, message action) |
| Panel | `src/client/panel.tsx` | Empty state, transcript, composer, streaming |
| Temporary store | `src/client/store.ts` | Page-memory transcript, keyed by Session |
| Transport | `src/client/transport.ts` | `fetch` + SSE decode; `EventSource` cannot carry a body |

The Host route is guarded by `connection.requestRejection`, accepts JSON only, bounds the
body, and caps concurrent answers. It streams `text` frames and ends with `done`; every
failure arrives as an `error` frame rather than a broken connection.

## Known limitations

- **No tools.** The side chat answers; it cannot run commands or edit files. A tool-using
  side conversation needs an ephemeral *Session*, and DeepSeek Harness has no such concept
  today: `CreateAgentOptions` has no `ephemeral` flag, session persistence is attached to
  every published session, and a live session always appears in the sidebar (including
  ones that were never written to disk). Shipping that would mean core changes in the
  Harness, not a plugin.
- **No message context menu.** The Harness has no message-level context-menu seat, so the
  "ask in side chat" entry is a button in the finished assistant message's action row —
  the same seat the Like/Dislike controls use. User messages have no action seat at all.
- **Assistant messages only.** Partial and interrupted messages carry no durable id, so
  they cannot be targeted.
- **The panel is per Session.** Context follows the mounted Session; reopening the panel
  for another Session starts an empty temporary chat.
- Context is capped (20 recent messages, 4 000 characters each, 24 000 characters total)
  and each answer is one model call — no multi-turn tool loop, no memory compaction.

## Development

```sh
pnpm install
pnpm build       # lib/index.js (Host) + lib/client.js (browser bundle)
pnpm typecheck
pnpm test
```

The browser bundle is a CommonJS closure factory handed to `window.__ModuleLoader__` with
`react` and `react/jsx-runtime` left external for the shell's module table; everything else
is inlined. The Host half is a plain ESM Cordis plugin.

## License

MIT
