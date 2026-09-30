# 贡献指南 / Contributing

[English summary below](#english-summary)

感谢你想参与。这个仓库的目标很具体：**让一个从没用过 DSH 插件的人，照着 README 就能装好、用起来、出问题能自救。** 改动只要服务于这个目标，都欢迎。

---

## 本地开发环境

| 需要 | 版本 | 说明 |
| --- | --- | --- |
| Node.js | **22 或更高**（`engines.node: ">=22"`） | 构建与测试都跑在 Node 上 |
| pnpm | **11**（`packageManager: "pnpm@11.7.0"`） | 仓库只维护 pnpm 的 lockfile |
| DeepSeek Harness | 近期版本（开发验证于 `0.2.0-rc.2` 系列） | 想真机验证时需要 |
| 浏览器 | 任意现代浏览器 | 桌面应用内置的即可 |

```sh
node -v      # 期望 v22 或更高
pnpm -v      # 期望 11.x
```

## 常用脚本 / Scripts

| 命令 | 作用 |
| --- | --- |
| `pnpm install` | 安装依赖 |
| `pnpm build` | 构建两个产物：`lib/index.js`（宿主半边，ESM）与 `lib/client.js`（浏览器半边，`window.__ModuleLoader__` 闭包工厂） |
| `pnpm watch` | 监听源码，自动重建 |
| `pnpm typecheck` | `tsc --noEmit` 类型检查 |
| `pnpm test` | vitest 单元测试 |
| `pnpm run verify` | 自检：构建产物、包声明、包内组合包补丁、profile 是否装了本插件、本机 DSH 端口的路由是否挂上 |
| `node scripts/install.mjs` | 把当前 checkout 安装进一个 profile（刻意做成仓库内的脚本，不是 npm script，理由见下） |
| `pnpm pack` | 打包（`prepack` 会先自动构建） |

> ⚠️ **安装脚本故意不做成 npm script，尤其不叫 `install`。** npm/pnpm 的 `install` 是生命周期钩子：只要这个 script 存在，`pnpm install` 就会顺带触发它去改用户的 profile——而 profile 是用户的运行环境，不该是「装依赖」的副作用。所以 `package.json` 里既没有 `install:profile`，也不要再把它加回去；要装就显式运行仓库里的脚本：

```sh
node scripts/install.mjs
```

`scripts/install.mjs` 选择 profile 的顺序：`--profile <名字>` → 环境变量 `DSH_PROFILE` → `$DSH_HOME/profiles` 下唯一的 profile → 唯一一个已经链接了本仓库的 profile。等价的手动调用：

```sh
node scripts/install.mjs --profile web                     # 指定 profile
node scripts/install.mjs --profile web --home /path/to/dsh-home   # 指定 DSH_HOME
node scripts/install.mjs --profile desktop --no-build      # 跳过构建
```

`verify` 也可以带参数：

```sh
node scripts/verify.mjs --profile desktop
node scripts/verify.mjs --home /path/to/dsh-home --port 19387
node scripts/verify.mjs --json      # 给 CI 用的机器可读输出
```

**打包清单校验**：`pnpm pack` 产出的 tarball 必须恰好包含约定的 15 个文件（`lib/` 的 5 个产物 + `lib/client.js.map` + `cordis.patch.yml` + `locale/zh.json`、`locale/en.json` + `icon.svg` + `scripts/verify.mjs` + `README.md`、`README.zh.md`、`LICENSE`、`package.json`）。用这个脚本逐条核对，它会同时在内存里解包、导入宿主半边、检查浏览器半边是不是 `__ModuleLoader__` 工厂：

```sh
pnpm pack
node scripts/check-pack.mjs ./dsh-side-chat-plugin-0.2.0.tgz
```

**改完怎么生效**：改浏览器半边（`src/client/**`）→ `pnpm build` → 重载 DSH 界面即可。改宿主半边（`src/index.ts`、`src/context.ts`、`src/protocol.ts`）→ 需要重启应用（Node 会缓存 ESM 模块）。

### 视觉预览 / Visual preview

渲染问题看起来比断言起来容易，所以仓库带一个预览生成器，把真实组件和真实样式表写进 `preview.html`：

```sh
DSH_SIDE_CHAT_PREVIEW=1 pnpm test
chrome --headless=new --screenshot=preview.png --window-size=720,1180 preview.html
```

Windows PowerShell 里设置环境变量的写法：

```powershell
$env:DSH_SIDE_CHAT_PREVIEW = "1"; pnpm test; Remove-Item Env:\DSH_SIDE_CHAT_PREVIEW
```

## 仓库结构 / Repository layout

| 路径 | 负责什么 |
| --- | --- |
| `src/index.ts` | 宿主半边：`POST /side-chat/ask` 路由、请求校验、模型调用、SSE 输出 |
| `src/context.ts` | 会话日志 → 提示词上下文；纯函数，不依赖 Harness，便于测试 |
| `src/protocol.ts` | 两半边共用的线上协议：路由、标签页 kind、SSE 分帧、类型 |
| `src/client/index.ts` | 浏览器半边入口：注册标签页类型、标题栏按钮、消息动作、选区动作 |
| `src/client/panel.tsx` | 面板本体：空态、对话流、输入框、上下文行 |
| `src/client/actions.tsx` | 标题栏按钮与「就这条回答提问」动作 |
| `src/client/selection-action.tsx` | 主对话里选中文字时浮出的按钮 |
| `src/client/store.ts` | 页面内存里的临时对话（按会话分键，不落盘） |
| `src/client/transport.ts` | `fetch` + SSE 解码（`EventSource` 带不了请求体） |
| `src/client/markdown.ts` · `Markdown.tsx` · `highlight.ts` | Markdown 解析、React 渲染、代码高亮（全程没有 `innerHTML`） |
| `src/client/locales.ts` | 中英文字典：**两套键必须完全一致**，有测试守着 |
| `src/client/styles.ts` | 面板样式，颜色取自 Harness 主题 token |
| `cordis.patch.yml` | 包自带的**组合包补丁**：声明 `id: dsh-side-chat-plugin` 的 Loader 行。改它等于改所有用户的安装结果。`id` 与 `name` 都必须是裸包名 `dsh-side-chat-plugin`，理由见下表下方 |
| `locale/zh.json` · `locale/en.json` | 插件在「插件」页里显示的名称与描述 |
| `icon.svg` | 插件卡片图标 |
| `scripts/install.mjs` | 安装脚本：构建 → 链接进 profile → 声明依赖 → 确保 DSH 会加载它 |
| `scripts/verify.mjs` | 面向已安装用户的自检脚本 |
| `scripts/check-pack.mjs` | 发布清单校验：解包 tarball、核对文件、验证两半边产物 |
| `tests/` | vitest 单元测试 |
| `docs/` | 面向用户的补充文档 |
| `tsdown.config.ts` | 构建配置（宿主 ESM + 浏览器 CJS 闭包工厂） |
| `.github/workflows/ci.yml` | CI：Node 22/24 矩阵 |

### 两条不要破坏的不变量

1. **`dependencies` 必须始终为空。** 宿主半边需要的运行期代码要**内联**进 `lib/index.js`（`tsdown.config.ts` 里的 `INLINED_RUNTIME` 就是这份名单，含 Config 用到的 `@deepseek-ai/schemastery`），浏览器半边从 DSH 的模块表取 React。原因很实际：一旦声明了运行期依赖，每次安装都要去 registry 解析它，**离线机器上就装不上**（实测 `ERR_PNPM_NO_OFFLINE_META`）。所以 Schemastery 放在 `devDependencies`——构建要用它，运行时用不到它的包。改完用 `node scripts/check-pack.mjs <tgz>` 复核，它会断言"no runtime dependencies"。
2. **浏览器半边的注册 id 必须等于 `package.json` 的 `name`。** `tsdown.config.ts` 的 `PACKAGE_NAME`、`cordis.patch.yml` 的 `id`/`name`、`src/protocol.ts` 的 `SIDE_CHAT_TAB_ID` 都是同一个值。DSH 只把浏览器半边挂在"说明符恰好等于包名"的 Loader 行上——对不上时的症状是 **Host 半边正常、右侧栏却始终没有标签页**，最难排查。`scripts/check-pack.mjs` 也会断言这一点。

### 包名与 Loader 行 id / package name and loader row id

**当前版本 `0.2.0`，包名与 Loader 行 id 都是 `dsh-side-chat-plugin`，两者必须一直保持一致。** 这不是巧合：

- npm 上另有一个 `dsh-side-chat` 包，是**别人的**另一个插件（"并行侧边对话"，维护者不是本仓库）。它用的行 id 是 `side-chat`，而 Loader 行 id 在一个 profile 内必须唯一——两个包同时生效会重复注册同一个 id 并崩溃。改名前本仓库用的正是 `side-chat` / `dsh-side-chat`，所以 0.2.0 把两个名字一起换掉了。
- 浏览器半边挂在「说明符恰好等于包名」的那条 Loader 行上（`lib/client.js` 里 `window.__ModuleLoader__.load({ id: "dsh-side-chat-plugin" })` 必须与 `package.json` 的 `name` 一致）。任何一处改了、其它处没改，结果都是「宿主半边加载了，但右侧栏没有标签页」。
- 因此改包名时，这些地方必须一起改：`package.json` 的 `name`、`cordis.patch.yml` 的 `id` 与 `name`、`scripts/install.mjs` 与 `scripts/verify.mjs` 里的 `PACKAGE_NAME`/`ROW_ID`、`scripts/check-pack.mjs` 的期望、`.github/workflows/ci.yml` 里的 tarball 通配、README/CONTRIBUTING/docs 里所有安装命令与插件页输入值。改完跑 `pnpm run verify` 和 `check-pack.mjs` 兜底。

## 提交与 PR 约定 / Commits and pull requests

- **约定式提交（Conventional Commits）**：`<type>(<scope>): <subject>`，例如
  `fix(panel): keep the caret visible while an answer streams`、
  `docs(readme): explain the profile layout`。
  常用 type：`feat`、`fix`、`docs`、`refactor`、`test`、`chore`。
- **行为改动必须带测试。** 纯文档、纯样式微调可以不补。
- **一次 PR 只做一件事。** 不要在一个 PR 里混入无关的格式化。
- **合并前本地必须全绿**：

  ```sh
  pnpm typecheck && pnpm test && pnpm build
  ```

- **元数据改动要同步。** 改 `package.json` 的 `files`/`exports`/`dsh` 时，同时确认 `pnpm run verify` 与打包清单仍然正确。
- CI 在 Node 22 与 24 上跑：`pnpm install --frozen-lockfile` → `typecheck` → `test` → `build` → `pnpm pack` + `scripts/check-pack.mjs` 校验发布清单 → 在一个空的 `DSH_HOME` 上跑 `verify` 并断言它以退出码 1 失败（保证「没装却说一切正常」不会发生）。

## 不要提交这些 / Do not commit

`.gitignore` 已经挡住了大部分，但请确认你的 PR 里**没有**：

- `lib/` —— 构建产物，由 CI/发布流程生成；
- `preview.html`、`preview.png` —— 本地预览产物；
- `node_modules/`、各种 `*.log`；
- 任何来自你本机 profile（`$DSH_HOME/profiles/<profile>/`）的文件，特别是 `cordis.patch.yml`、`package.json` 与 `.plugin-manager/` 日志——那是用户的运行环境，不是仓库内容。

提交前自查：

```sh
git status --short
git diff --cached --stat
```

## 报 Issue / Reporting issues

请尽量带上这五项，否则很难复现：

1. **DSH 版本与安装方式**：桌面应用还是 `dsh web`；版本号（设置里能看到的那个）。
2. **profile 名**：默认是 `desktop`；命令行启动时是你 `--profile` 写的名字。
3. **复现步骤**：从打开应用到出问题的每一步，具体到点了哪个入口（标题栏 / 消息动作 / 选中文字）。
4. **期望与实际**：你以为会发生什么，实际发生了什么（有截图最好）。
5. **控制台输出**：桌面应用按 `Ctrl+Shift+I` 打开开发者工具，把 `dsh-side-chat-plugin` 开头的报错整段贴出来。宿主半边的报错在应用日志里，请一并贴上 `side-chat:` 开头的行——插件加载时会打印一条 `side-chat: trust=<策略> (<来源>)`。
   - 默认策略 `same-origin` 的含义：**带 `Origin` 的请求**必须与本机所访问地址同源，否则 403（拦跨站网页与 `Origin: null`）；**不带 `Origin` 的请求**（桌面应用的 Electron 转发就是这样——它删掉 `Origin`、只补回 Host 的 cookie）交给 DSH 自己的信任检查判定，DSH 拒绝就按其状态码拒绝，DSH 没意见就放行。桌面端默认可用，靠的就是这条回退。
   - 因此 401 / 403 可能是四种来源：插件的同源策略（跨站 `Origin` / `Origin: null` / 非本机）、DSH 自己的信任检查、一个要求凭据的 `trust: host` 配置、以及反向代理解析出的地址与页面源不一致。贴日志时请把这一行 `trust=` 也贴上。
   - 只有当 `trust` 被显式设成 `host`、且 DSH 没有配置信任检查时，才会另有一条 `side-chat: this Host does not authenticate the side-chat route (connection.requestRejection returned undefined)…` 的警告——它说的是「这条路由没有宿主级防线」，属于已知情况，不是报错。

如果是安装问题，再加上 `pnpm run verify` 的输出，以及 `pnpm -v`、`node -v`。

## GitHub 仓库元数据建议 / Repository metadata

仓库设置（Settings → General → Description / Topics）里可以直接粘贴：

**Description（英文）**

```
Temporary side chat for DeepSeek Harness: ask beside the conversation in the right sidebar — gone when the app closes.
```

**Description（中文）**

```
DeepSeek Harness 的临时侧边聊天：挂在右侧栏，就当前对话、某条回答或选中的文字提问，关掉应用即消失。
```

**Topics**

```
deepseek-harness
dsh
dsh-plugin
side-chat
plugin
typescript
react
markdown
ai-assistant
codex
```

---

## English summary

- **Requirements**: Node.js 22+, pnpm 11, a recent DeepSeek Harness (`0.2.0-rc.2` line).
- **Scripts**: `pnpm build` (Host ESM + browser bundle), `pnpm watch`, `pnpm typecheck`, `pnpm test`, `pnpm run verify`, `pnpm pack`. To install this checkout into a profile, run `node scripts/install.mjs` — it is deliberately **not** an npm script, because a script named `install` is a package-manager lifecycle hook that `pnpm install` would run, editing the user's profile as a side effect. `scripts/check-pack.mjs` verifies the published file list.
- **Names**: the package name and the loader row id are both `dsh-side-chat-plugin` (version `0.2.0`), and they must stay equal — the browser half attaches to the loader row whose specifier is exactly the package name (`lib/client.js` registers id `dsh-side-chat-plugin`). The unrelated npm package `dsh-side-chat` uses the row id `side-chat`; two rows sharing one id in a profile register twice and crash.
- **After a change**: browser half → `pnpm build` + reload the DSH interface; Host half → restart the app.
- **Preview**: `DSH_SIDE_CHAT_PREVIEW=1 pnpm test` writes `preview.html`; screenshot it with headless Chrome.
- **Commits**: Conventional Commits; behaviour changes need tests; one concern per PR; `pnpm typecheck && pnpm test && pnpm build` must pass locally.
- **Never commit**: `lib/`, `preview.html`, `preview.png`, `node_modules/`, logs, or anything from your local `$DSH_HOME/profiles/<profile>/`.
- **Issues**: include the DSH version and how you run it, the profile name, reproduction steps, expected vs actual, and the browser console output.
