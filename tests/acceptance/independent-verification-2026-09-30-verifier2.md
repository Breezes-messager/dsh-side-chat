# dsh-side-chat-plugin 最终独立复核报告（verifier2 / 第二轮）

- 复核时间：2026-09-30 07:51 – 07:58（GMT+8）
- 仓库快照：`C:\Users\29559\Desktop\dsh\dsh-side-chat`，git HEAD `831b669`（工作树脏，本轮改动未提交）
- **复核期间源文件零漂移**：07:51 与 07:58 两次 SHA256 完全一致（`package.json 75258DCFF8E12B0B`、`README.md 5BE9ED6CD8EB6D84`、`README.zh.md A309407AD0C3FB7A`、`CONTRIBUTING.md 32F2550609E3A9C9`、`scripts/verify.mjs 7D2039995866DF23`、`scripts/install.mjs 6CEA498B2F9923AE`、`src/index.ts CAFD01C4A566C05E`、`src/protocol.ts E8EDFC0BDA6EC7A6` …）
- 环境：Node `v24.21.0`、pnpm `11.7.0`（`node <pnpm.mjs>` 直调）、registry = `https://registry.npmmirror.com`
- 运行中的 Host：`http://127.0.0.1:19387`（`dsh web` 形态、profile `desktop`、browser-auth **开启**），**未重启、未杀进程**
- 纪律：**未修改 repo 下任何源文件**；未碰 `~/.dsh/profiles/desktop`（复核后 mtime 仍是 2026-09-29 20:57:51 / 21:09:54）；临时 `DSH_HOME` 只在 `%TEMP%\dsh-verifier2\home{,2,3}` + 复现脚本自建目录，**已全部删除**；**模型调用 0 次**（GET / 错误 content-type / 非法 JSON）
- 本轮新增证据工具（不属于源文件）：`tests/acceptance/tools/v2-{install-truncation,trust-probe,decide-matrix}.mjs`

---

## 0. 结论先行

1. **不能发布（as-is）**，但不是因为上一轮的两个阻塞项——那两项都真的修好了：
   - 改名链（包名 → patch → tsdown → bundle 注册 id → tarball → 脚本 → CI → 文档）**逐环实测一致** ✅
   - 桌面端 trust 回退**源码级三段证据 + 实测信任矩阵**都成立 ✅
2. **新的阻塞项 D1**：`node scripts/install.mjs`（README「方式二」的官方路径）会**把 profile 的 `cordis.patch.yml` 整个覆盖掉**，用户已有的模型/密钥/主题/权限配置全部丢失，且退出码 0、无任何警告。实测 340 B → 75 B。
3. **D2**：`scripts/verify.mjs:232` 仍让用户去跑**已被删除的 `pnpm run install:profile`**（CONTRIBUTING 明文说不要再加回来）。
4. **D3**：`SIDE_CHAT_TAB_ID` 仍是旧包名 `dsh-side-chat`——它自己的注释和 DSH tab kit 的文档都说这里应写包名，而 tab registry 对重复 id 会**抛错**（右侧栏静默不出现）。
5. `node scripts/verify.mjs` 退出 1 属**预期**（desktop profile 尚未迁移，仍是旧依赖名/旧行 id），不是缺陷。

---

## 1. 一致性复核（最高优先级，逐环实测）

| # | 环节 | 期望（新身份） | 实测 | 结论 |
|---|---|---|---|---|
| 1 | `package.json` `name` / `version` | `dsh-side-chat-plugin` / `0.2.0` | 同左（第 2、3 行） | ✅ |
| 2 | `cordis.patch.yml` `id` / `name` | 都是裸包名 | `id: dsh-side-chat-plugin` / `name: dsh-side-chat-plugin`（第 26–27 行） | ✅ |
| 3 | `tsdown.config.ts` `PACKAGE_NAME` | 同包名 | `const PACKAGE_NAME = 'dsh-side-chat-plugin'`（第 30 行） | ✅ |
| 4 | 构建产物 `lib/client.js` 注册 id | 同包名 | `window.__ModuleLoader__.load({ id: "dsh-side-chat-plugin", factory: ...})`（第 1–3 行） | ✅ |
| 5 | `lib/index.js` | 可 ESM 导入、`apply` 导出 | `check-pack.mjs`：`ok lib/index.js imports as ESM and exports apply() (name="side-chat")` | ✅（`name="side-chat"` 是 Cordis fiber 名，不是包身份，见 D5） |
| 6 | tarball 内 `package.json` | 新名新版本 | `"name": "dsh-side-chat-plugin"`, `"version": "0.2.0"` | ✅ |
| 7 | tarball 内 `cordis.patch.yml` | 新行 | `- insert: - id: dsh-side-chat-plugin / name: dsh-side-chat-plugin` | ✅ |
| 8 | tarball 内 `lib/client.js` | 新注册 id | `id: "dsh-side-chat-plugin"` | ✅ |
| 9 | `scripts/install.mjs` | `PACKAGE_NAME`/`ROW_ID` 新值 | 第 25–26 行两值皆新；实跑写出的行也是新值 | ✅（但有 D1 覆盖 bug） |
| 10 | `scripts/verify.mjs` | 同上 | 第 34–35 行两值皆新；实跑打印 `name dsh-side-chat-plugin@0.2.0`、`inserts row dsh-side-chat-plugin -> dsh-side-chat-plugin` | ✅ |
| 11 | `scripts/check-pack.mjs` | 期望新名 | 第 29 行新值；实跑逐项 ok | ✅ |
| 12 | `.github/workflows/ci.yml` | tarball 通配新名 | 第 51 行 `dsh-side-chat-plugin-*.tgz` | ✅ |
| 13 | README / README.zh / CONTRIBUTING / docs | 安装与配置处皆新值 | 见 §3 | ✅（除 D2 一处） |
| 14 | **仓库目录名 / GitHub URL 保持 `dsh-side-chat`** | 不变 | `package.json` 的 `repository`/`bugs`/`homepage`、两份 README 第 97–98 行的 clone+cd、`docs/advanced-install.zh.md:101` 的 `link:` 路径全部仍是 `dsh-side-chat` | ✅ |

**注册 id 必须等于包名这一条**，我另外在 DSH 实现里核对了它的执行机制（不是只信文档）：
`_verify/asar/client-modules.js:119-120`「The manifest package name identifies the browser module」、`:741-788` `locatePkgJson/nearestPackage`（行说明符 → 解析模块路径 → 向上找 **name 等于该说明符**的 package.json）。当前 profile 正是反例：行 `name: dsh-side-chat` 解析到本仓库，而仓库 `package.json.name` 已是 `dsh-side-chat-plugin` → `nearestPackage` 找不到匹配 → **浏览器半边不会被组装**（所以迁移不是"洁癖"，是右侧栏能否出现的前提）。这也解释了为什么 `verify.mjs` 退出 1 与"面板暂时消失"是同一件事。

**仍残留在产物里的旧身份字符串**（`lib/client.js` 6 处）：`SIDE_CHAT_TAB_ID`、`TAG_ID`、`dataset.plugin`、两处 `console.warn` 前缀、`const name`。见 D3/D5。

---

## 2. 回归复核（原始退出码）

```
$ node <pnpm.mjs> install --frozen-lockfile        exit 0   "Already up to date / Done in 315ms using pnpm v11.7.0"
$ node <pnpm.mjs> typecheck                        exit 0
$ node <pnpm.mjs> test                             exit 0
$ node <pnpm.mjs> build                            exit 0
$ node <pnpm.mjs> pack --pack-destination <tmp>    exit 0
$ node scripts/check-pack.mjs <tgz>                exit 0
$ node scripts/verify.mjs                          exit 1   ← 预期（见下）
```

`pnpm test` 原始输出（节选）：

```
 Test Files  19 passed (19)
      Tests  237 passed (237)
   Start at  07:52:52
   Duration  953ms (transform 1.77s, setup 0ms, import 3.03s, tests 729ms, environment 2ms)
```

`pnpm build` 原始输出（节选，可见 tsdown 用的也是新身份）：

```
ℹ [dsh-side-chat-plugin] entry: src/index.ts, src/protocol.ts
ℹ [dsh-side-chat-plugin/client] entry: src/client/index.ts
ℹ [dsh-side-chat-plugin] [ESM] lib\index.js       68.28 kB │ gzip: 19.24 kB
ℹ [dsh-side-chat-plugin/client] [CJS] lib\client.js  255.16 kB │ gzip: 67.63 kB
```

`pnpm pack` 产物：`dsh-side-chat-plugin-0.2.0.tgz`，**242 453 B**，
SHA256 `559822E371704DED1F71C0F41B2E3753BDE146223C2E0EA2B296D780CAE6B898`，15 个文件：

```
package/LICENSE            1073      package/lib/client.js     255161   package/scripts/verify.mjs  16201
package/README.md         24712      package/lib/index.js       68283   package/icon.svg              768
package/README.zh.md      24488      package/lib/protocol.js     2111   package/lib/index.d.ts      31720
package/package.json       3240      package/lib/client.js.map 453874   package/lib/protocol.d.ts    4313
package/locale/en.json      203      package/locale/zh.json       182   package/cordis.patch.yml     1606
```

`node scripts/check-pack.mjs <tgz>` → **19 项全 ok**，`packed tarball is good (15 files).`，exit 0（含 `lib/client.js registers id "dsh-side-chat-plugin" with a factory function`、`cordis.patch.yml inserts the row id=dsh-side-chat-plugin name=dsh-side-chat-plugin`、`scripts/verify.mjs parses as an ES module`）。

`node scripts/verify.mjs`（继承会话环境 `DSH_PROFILE=desktop`）**exit 1**，两条失败，**两条都只是"尚未迁移"这一预期状态**：

```
FAIL  profile    C:\Users\29559\.dsh\profiles\desktop neither selects the bundle nor declares its Loader row
FAIL  profile    C:\Users\29559\.dsh\profiles\desktop\node_modules\dsh-side-chat-plugin is missing — the package is declared but not installed
```

实际 profile 状态（只读核对，未改动）：`dependencies` 仍是 `"dsh-side-chat": "link:C:/Users/29559/Desktop/dsh/dsh-side-chat"`，`node_modules/dsh-side-chat` 是指向本仓库的 junction，`cordis.patch.yml` 末尾仍是 `- insert: - id: side-chat / name: dsh-side-chat`。**迁移后这两条应转 ok**（`verify.mjs` 在"恰好一个 profile 提到本插件"时会自动选中它）。
（第二条文案本身不准确：新依赖并没有被声明，是"没装"而非"声明了没装"——并入 D2。）

---

## 3. 文档-实现一致性（用户照着做的每一条）

| 文档处 | 文档承诺 | 核对方式与结果 |
|---|---|---|
| README.md:69 / README.zh.md:69 | 插件页输入 `dsh-side-chat-plugin` | 与 `package.json.name` 一致；`pnpm view dsh-side-chat-plugin` 在两个 registry 都是 **404（名字可用）** ✅ |
| README.md:97-98 / README.zh.md:97-98 | `git clone .../dsh-side-chat.git` + `cd dsh-side-chat` | 仓库名确实未改，URL 与 `package.json.repository` 一致 ✅ |
| README.md:101-114 / CONTRIBUTING.md:39-48 | `node scripts/install.mjs [--profile/--home/--no-build]` | 三个 flag 都实现；profile 选择顺序（`--profile` → `DSH_PROFILE` → 唯一 profile → 唯一 link 本 checkout 的 profile）与代码逐行一致；"已是 bundle 就不写行"也在代码里 ✅ —— 但**这个命令本身有 D1 覆盖 bug** ❌ |
| README.md:118 / README.zh.md:118 | 插件页填仓库绝对路径（`pnpm add link:` 路径） | 仓库目录名仍是 `dsh-side-chat`，`docs/advanced-install.zh.md:97` 明确写了"包名是新名、目录名仍是旧名" ✅ |
| README.md:145 / README.zh.md:145 / docs:126 | 卸载时删 `id` 为 `dsh-side-chat-plugin` 的行 | 与 `cordis.patch.yml` 实际行 id 一致 ✅ |
| README.md:308 / README.zh.md:308 / docs:114 | 配置覆盖示例 `- id: dsh-side-chat-plugin` | **新值**（写成旧 id 会静默失效这一点，文档自己在迁移节写明了）✅ |
| README.md:232 / docs:171 | `pnpm run verify` | `package.json.scripts.verify` 存在 ✅ |
| CONTRIBUTING.md:36 | "`package.json` 里既没有 `install:profile`，也不要再加回去" | `package.json` 确实没有 ✅ —— **但 `scripts/verify.mjs:232` 仍在教用户跑它** ❌（D2） |
| 全文检索 `install:profile` | 不应再出现 | 只剩 `scripts/verify.mjs:232` 一处（其余全是"不要再加回来"的说明）❌ |
| CONTRIBUTING.md:58-63 | `pnpm pack` 后恰好 15 个文件；`check-pack.mjs ./dsh-side-chat-plugin-0.2.0.tgz` | 15 文件 ✅；`check-pack` exit 0 ✅ |
| CONTRIBUTING.md:86 | 路由 `POST /side-chat/ask` | 与 `lib/protocol.js` 的 `SIDE_CHAT_ROUTE` 一致 ✅ |
| docs:29-39 | 包内 patch 内容、`id/name` 必须是裸包名 | 与 `cordis.patch.yml` 逐字一致 ✅ |
| docs:151 | tarball 里已有构建好的 `lib/`、`cordis.patch.yml`、`locale/`、`icon.svg` | 与 tarball 清单一致 ✅ |
| docs:180 | `pnpm why dsh-side-chat-plugin` | 新名 ✅ |
| 隐私与安全（README.md:369-380 / README.zh.md:369-380） | `decideTrust` 顺序与语义 | 逐条比对源码：模式判定顺序（open → Host 拒绝 → host → 非 loopback → 无 Origin → `null` → 同源比较）与 `src/index.ts:466-477` **完全一致**；`Origin` 有无两条路径、`Origin: null` 403、跨站 403、非 loopback 403、桌面回退都写在文档里 ✅。唯一问题：文档里"实测 Host 没有信任检查 → 放行所有人"的那句与运行中的 Host 不符（D4）。 |
| docs:157 | 离线：`pnpm add <tgz>` | tarball 声明的 runtime 依赖 `@deepseek-ai/schemastery@~3.18.4` 在 registry 存在（3.18.4）✅；但真离线 + 冷 store 的机器上这一步仍需解析该依赖（D7，未实测） |

---

## 4. 只读对抗性探测（运行中的 19387，0 次模型调用）

命令：`node tests/acceptance/tools/v2-trust-probe.mjs 19387`（只用 GET / 错误 content-type / 非法 JSON `{`）

```
GET  no Origin                                            -> 401  ct=(none) len=0
GET  Origin=http://127.0.0.1:19387 (same)                 -> 401  ct=(none) len=0
GET  Origin=https://127.0.0.1:19387 (same host)           -> 401  ct=(none) len=0
GET  Origin=http://127.0.0.1 (port 80)                    -> 403  ct=(none) len=0
GET  Origin=http://evil.example                           -> 403  ct=(none) len=0
GET  Origin=null                                          -> 403  ct=(none) len=0
GET  Origin=dsh-app://app                                 -> 403  ct=(none) len=0
GET  Origin=:::: (unparsable)                             -> 403  ct=(none) len=0
GET  sec-fetch-site: cross-site                           -> 403  ct=(none) len=0
GET  bogus cookie                                         -> 401  ct=(none) len=0
POST text/plain, no Origin                                -> 401  ct=(none) len=0
POST application/json, invalid body, no Origin            -> 401  ct=(none) len=0
POST application/json, invalid body, cross-site Origin    -> 403  ct=(none) len=0
POST text/plain, cross-site Origin                        -> 403  ct=(none) len=0
GET  /  (app shell)                                       -> 401  ct=text/plain len=68 "dsh web authentication required; reopen the URL printed by dsh web."
```

对照离线矩阵（`tests/acceptance/tools/v2-decide-matrix.mjs`，直接 import **构建产物** `lib/index.js`）：

```
same-origin + Host admitted:  no Origin -> ALLOW(host-authenticated) | null -> 403(origin-opaque)
                              matching (http/https, 大小写/尾斜杠无关) -> ALLOW(same-origin)
                              端口不同 / 跨站 / dsh-app://app / 不可解析 -> 403(origin-mismatch)
Host 拒绝 (401/403) 在 same-origin 与 host 两种模式下都优先 -> 返回该状态
非 loopback -> 403(not-loopback)；host 模式不看 Origin；open 模式连 rejection=403 都放行
settingsOf({}) = same-origin/default；显式 trust 压过 DSH_SIDE_CHAT_ALLOW_LOOPBACK=1；非法值回落默认
```

**结论：实测矩阵与 `decideTrust` 的规则逐格一致**——但要如实说明归因：
D SH 自己的 `connection.requestRejection`（`@deepseek-ai/dsh-client-connection/lib/index.js:586-588`）= `isTrustedApiRequest`（Host/Origin fence，`:205-219`；Host 必须是 loopback/受信 authority，`sec-fetch-site: cross-site` 直接 false，无 Origin 放行，有 Origin 必须与 `Host` 的 authority 完全相等）+ `browserAuth.isAuthenticated`（`:433-443`，要求与 authority 绑定、由本进程密钥签名的 **cookie**）。
所以：(a) 那些 403 可能来自 Host fence，也可能来自插件自己的比较（两者规则一致，观测上不可区分）；(b) 那些 **401 是插件把 Host 的 401 原样回传**（响应体为空，而 Host 自己的 `writeUnauthorized` 会写 68 字节文本——`GET /` 就是后者，可对比）；(c) **插件自己独有的分支（Host 放行时按 `Origin` 判断）在本机 Host 上被 Host fence 遮蔽**，因此"插件比 host 更严"在本机是冗余防线而非唯一防线。
唯一能体现插件独有分支的形态是「无 Origin」：实测无 Origin + 无 cookie → 401（Host 拒绝）；Electron 转发形态（无 Origin + 有效 cookie）→ Host 放行 → 插件 `host-authenticated` 放行。

### 上一轮的"桌面端 403"是否真的修好：三段源码证据

1. `_verify/asar/main.js:7461-7492` `forwardWebRequest`：只接受 `origin === null || origin === 'dsh-app://app'`，然后删除 `host/origin/cookie/sec-fetch-site`，**只补回 cookie**。删掉的 `Host` 由 Node `fetch`（undici）按目标 URL 自动补成 `127.0.0.1:19387` —— 这正是 Host fence 需要的。
2. `isTrustedApiRequest`：无 Origin → `return true`；有 cookie → `isAuthenticated` 为真。
3. 插件：`rejection === undefined` + loopback + `origin === undefined` → `{ allowed: true, basis: 'host-authenticated' }`。

→ 桌面端面板的转发请求**在逻辑上必然被放行**（三段都在源码里核实过），且比旧的 `host` 默认更严（多挡一层跨站 Origin）。**唯一未做的是"真点一次面板"**（不能点 UI、不能重启 Host）。

---

## 5. 缺陷表

| # | 现象 | 复现命令 / 原始输出 | 期望 | 实际 | 严重度 |
|---|---|---|---|---|---|
| **D1** | **`scripts/install.mjs` 覆盖用户的 `cordis.patch.yml`，已有配置全部丢失，退出码 0** | `node tests/acceptance/tools/v2-install-truncation.mjs`（自建临时 DSH_HOME，跑仓库的 install.mjs）：<br>`patch before : 340 bytes, 14 lines` → `patch after : 75 bytes, 5 lines`；`everything except the new row survived: NO — THE PATCH LAYER WAS REPLACED`，脚本 exit 1。BOM 无关版本（`[IO.File]::WriteAllText` 写的无 BOM 文件）同样 275 B → 75 B，`apiKey: secret-value-must-survive` 消失 | 保留原内容并追加 `- insert:` 行（`verify.mjs` 的提示与 README「方式二」都建立在这个语义上） | `install.mjs:206` `writeFileSync(patchPath, `${patch.endsWith('\n') ? '' : '\n'}\n${row}`)` **模板里没有 `patch`** → 整文件被替换成一行 insert；提示仍是 `added the Loader row`；CI 无任何测试覆盖 `scripts/*.mjs` | **阻塞发布**（用户在官方源码安装路径上丢配置，无警告） |
| **D2** | **`verify.mjs` 让用户跑已被删除的 `pnpm run install:profile`；另一条失败文案与状态不符** | `$env:DSH_PROFILE=$null; node scripts/verify.mjs --port 1`：<br>`FAIL  profile    not installed anywhere under C:\Users\29559\.dsh\profiles — install it from the Plugins page, or run "pnpm run install:profile"`（exit 1）<br>另一条：`node scripts/verify.mjs`（多 profile 的 desktop 状态）→ `... is missing — the package is declared but not installed`（其实根本没声明） | 提示 `node scripts/install.mjs`（仓库内）或插件页安装；文案只陈述事实 | `scripts/verify.mjs:232` 引用不存在的 script（`package.json` 里没有，CONTRIBUTING.md:36 明确说不要再加回来）；`:252` 文案在"纯粹没装"时也会说"declared but not installed" | **影响使用**（排错被引入死路） |
| **D3** | **`SIDE_CHAT_TAB_ID` 仍是旧包名 `dsh-side-chat`** | `Select-String src\protocol.ts -Pattern SIDE_CHAT_TAB_ID` → `L21: export const SIDE_CHAT_TAB_ID = 'dsh-side-chat'`；构建产物 `lib/client.js:50` 同值 | 按它自己的注释（`src/protocol.ts:16-20`：「the package name is the value the tab kit documents for this」）与 DSH 契约（`dsh-client-ui-sidebar-right/lib/types/client/tab-registry.d.ts:77-83`「unique across every registration (a package name is the natural value)」、`:155-164` 重复 id 抛错）写成 `dsh-side-chat-plugin` | 旧值。当前无现行故障：npm 上那个 `dsh-side-chat` 插件并不注册 sidebar tab（它用 `shell.overlay`/`conversation.session.header.actions`，id 是 `sidechat-panel`/`sidechat-toggle`），`shell.overlay`/header action 的 id 也不撞车；但一旦有插件的 tab id 取 `dsh-side-chat`，或改名后 tab 语义与包名继续错位，就会**静默不出现标签页** | **影响使用**（低概率、静默；发布前 1 行即可修） |
| **D4** | **文档/源码注释里"Host 没有配置信任检查 → 放行所有人"的实测断言，与运行中的 Host 不符** | `node tests/acceptance/tools/v2-trust-probe.mjs 19387` → 无 cookie 一律 401；`GET /` → 401 + 68 B 文本。源码：`dsh-client-connection/lib/index.js:586-588` `requestRejection` = fence + `browserAuth.isAuthenticated`；`:433-443` 必须有签名 cookie | 文档应说：`trust: host` 也要求调用方持有 Host 的浏览器 cookie，无 cookie 的本地程序会拿到 **401**；"放行所有人"的路径在 0.2.0-rc.2 的 connection 实现里不可达 | `README.md:374/376`、`README.zh.md:374/376`、`src/index.ts:41-45`、以及日志文案 `NO_FENCE_WARNING`（`src/index.ts:863-865`）都断言"desktop profile 实测没有信任检查、任何本机进程都能调用"。偏差方向是**把风险说大**（不会造成暴露），但会让用户在选择 `trust` 时判断错误；且该警告会在"调用方已认证"时打印"this Host does not authenticate the route" | **打磨项**（文档/日志准确性） |
| **D5** | 浏览器/宿主半边自述名仍是旧值（`export const name`、console 前缀、样式命名空间） | `Select-String lib\client.js -Pattern 'dsh-side-chat[^-]'` → 6 处：`L50 SIDE_CHAT_TAB_ID`、`L290 TAG_ID`、`L655 dataset.plugin`、`L9294/L9606 console.warn`、`L9584 const name = "dsh-side-chat"`；`lib/index.js:1044 const name = "side-chat"` | 改名后这些"自我介绍"应指向新身份（至少 console 前缀与 `name`） | 仍自称旧名。**影响面已核实为诊断级**：Cordis 只把 `plugin.name` 存成 `runtime.name` 用于 fiber 显示名/日志（`@deepseek-ai/cordis/lib/index.js:1625-1633`、`:1120`），不参与装配或身份匹配；`TAG_ID` 只用于"是否已注入"的 `style[data-plugin-css=...]` 查询（`src/client/styles.ts:426-429`），撞车概率极低 | **打磨项**（一致性/排错体验） |
| **D6** | `install.mjs` 不识别旧身份，可能在同一 profile 留下"旧行 + 新行"两行 | 只读核对当前 desktop profile：仍有 `- id: side-chat / name: dsh-side-chat`；此时运行 `install.mjs` 会再插一行 `dsh-side-chat-plugin`（代码只查"新行是否已存在"，不查旧行） | 检测到旧行时拒绝写入并提示先按 README「从旧版迁移」清理 | 两行都解析到同一个包 → 第二个实例注册同一路由 → `dsh-host-webserver/lib/index.js:179` `throw new Error('webserver: duplicate exact route "/side-chat/ask"')`。首个实例是否继续服务、Loader 容错行为**未实测**（需要改 profile，禁止） | **打磨项**（文档已写"先清旧再装"，installer 缺检测；后果为推演） |
| **D7** | 发布包把已被内联的 `@deepseek-ai/schemastery` 仍声明为 runtime dependency | `check-pack.mjs` 输出 `ok runtime dependencies are Harness-provided only (@deepseek-ai/schemastery)`；`pnpm view @deepseek-ai/schemastery version` → `3.18.4`（npmmirror 与 npmjs 都在） | 依赖可用（不阻塞）；但 `lib/index.js` 已把它内联，profile 并无此包（本机 desktop profile 的 `node_modules/@deepseek-ai` 不存在） | 用户每次安装多一个下载；docs:143-160「完全离线」的 `pnpm add <tgz>` 在真离线+冷 store 机器上仍要解析这个依赖 → **该文档路径有缺口**（未实测，属推演） | **打磨项**（信息） |
| **D8** | 发布 tarball 里没有 `packageManager`/`prepack` | 对比仓库 `package.json` 与 tarball 内 `package.json`（两者都在证据文件里） | — | npm/pnpm 打包剥离，属正常行为；`prepack` 缺失不影响用户（产物已构建好） | **信息**（复核第一位验收者的 D6） |

**已复核确认修好、不再存在的问题**：包名被占用（新名两个 registry 均 404）；桌面端 403（源码三段 + 实测）；`verify` 的 403 解释只怪 Host（现在写"Host 或插件自己的策略"）；发布包声明死脚本 `install:profile`（tarball 的 scripts 只剩 `build/watch/typecheck/test/verify`，且 `verify.mjs` 随包发布）；pack 清单 15 文件 ✅。

---

## 6. 这个包现在能不能发布？

**不能（as-is）。** 差三件事，前两件很小、第三件必须做：

1. **修 D1**（一行）：`writeFileSync(patchPath, \`${patch}${patch.endsWith('\n') ? '' : '\n'}\n${row}\`)`，并给 `install.mjs` 补一个回归测试（现在 CI 完全不覆盖 `scripts/*.mjs`，这正是它能逃过 CI 的原因）。
2. **修 D2 + D3**：`verify.mjs:232` 改成 `node scripts/install.mjs`（或"在插件页安装"）；`SIDE_CHAT_TAB_ID` 改成 `dsh-side-chat-plugin`（注意副作用：升级用户持久化布局里可能残留一个 `providerId=dsh-side-chat` 的标签页，需要手动关一次——迁移/重载文档可以加一句）。
3. **把 D4 的文档断语改准确**（`trust: host` 也要求 Host cookie；"任何本机进程都能调用"在当前 DSH 版本不成立），否则隐私章节在教用户做一个基于错误前提的决定。

发布动作本身我可以确认的部分：名字可用、`pnpm pack` 会先构建、tarball 自检 19/19 通过、`prepublish` 类脚本不存在（不会误触发）、`publishConfig.registry` 指向 npmjs 而本机默认 registry 是 npmmirror（发布需用户自己 `--registry` 或先登录）。

**发布后普通用户最可能踩的三个坑（按概率）**

1. **源码安装（README 方式二）把 profile 配置清空**（D1）。用户跑完 `node scripts/install.mjs` 看到 "installed"，重启后发现模型/密钥/主题设置全没了；而且退出码 0，没有任何提示。这是数据丢失，必须是发布前修掉的第一条。
2. **升级用户按文档迁移后，`pnpm run install:profile` 被提示但不存在，或者旧行没清干净导致"面板不出现/重复注册"**（D2 + D6）。旧行 `id: side-chat` 留着时：旧行解析到的包 `name` 已变，浏览器半边因"说明符≠包名"**不会被组装**——用户看到 Host 半边在工作（路由 401/403/405 都在）但右侧栏就是没有标签页，最难排查。
3. **把桌面端"又要配置才能用"当成事实**（D4 的连带影响）：文档说默认策略下 `trust: host` 会把路由暴露给本机任意进程，用户为了"更安全"去改配置反而可能选错模式；实际上当前 DSH 版本的 `connection` 对无 cookie 调用一律 401，真正的信任边界是 Host 的 cookie。

---

## 7. 我没能验证的事项（如实列出）

| 事项 | 原因 |
|---|---|
| **真实桌面窗口点面板提问的端到端结果** | 不能重启 Host（PID 28592）、不能点击 UI。结论建立在 Electron `forwardWebRequest` + Host `isTrustedApiRequest/requestRejection` + 插件 `decideTrust` 三段源码 + 实测信任矩阵之上；**唯一没实测的一跳**是 undici 在删除 Host 头后自动补 `Host: 127.0.0.1:19387`（这是我按 fetch 规范与 undici 行为推断的，未跑通一次真实转发） |
| **迁移后 `verify.mjs` 是否转 ok、右侧栏是否真的出现** | 迁移未执行（Lead 的 `migrate-profile.mjs`），且我不允许改 desktop profile |
| **双行（旧行+新行）同时存在时 Loader 的容错行为**（D6 的后果） | 需要改 profile 或起一个临时 DSH 实例，均被禁止；只做了源码级推演（`webserver: duplicate exact route`） |
| **`dsh plugin --profile web add ...` / 插件页安装 / 离线 `pnpm add <tgz>`** | 会写 profile 或需要隔离网络环境；只核对了文档与代码契约（`pnpm view` 只读查询除外） |
| **浏览器端实际渲染**（面板长什么样、主题、Esc/IME） | 与第一位验收者同一限制：无 UI 控制权。本轮未重复尝试客户端 Inspect 查询 |
| **macOS / Linux 行为** | 无机器 |
| **`npm publish` 的真实返回码** | 不允许发布；仅从 registry 元数据确认新名可用、账号未登录 |

---

## 8. 证据与环境处置

- 本报告：`repo/tests/acceptance/independent-verification-2026-09-30-verifier2.md`
- 可复现工具（新增，均在 `repo/tests/acceptance/tools/`）：
  - `v2-install-truncation.mjs` —— 自建临时 DSH_HOME 复现 D1，跑完自动删除（`--keep` 保留），D1 存在时 exit 1
  - `v2-trust-probe.mjs` —— 对运行中的端口发只读探测，永不发送合法 JSON
  - `v2-decide-matrix.mjs` —— import 构建产物打印完整信任矩阵与默认值
- 临时目录 `C:\Users\29559\AppData\Local\Temp\dsh-verifier2\`（regression.log、tarball 与解包、探测脚本）在仓库之外；本轮创建的临时 DSH_HOME（`home`/`home2`/`home3`、junction 试验、复现脚本自建目录）**已全部删除**，最后只剩这一个临时目录。
- 未触碰：`~/.dsh/profiles/desktop/**`（package.json mtime 2026-09-29 20:57:51、cordis.patch.yml 21:09:54，复核前后一致）、运行中的 Harness（PID 28592）、npm registry 只读查询、git（未提交/未推送）。
- 复核期间**未修改 repo 下任何源文件**；新增文件只在 `tests/acceptance/`（未覆盖第一位验收者的报告）。
