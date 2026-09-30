# dsh-side-chat 独立验收报告（task-5 / 验收者 verifier）

- 验收时间：2026-09-29 22:26 – 23:0x（GMT+8）
- 仓库快照：`C:\Users\29559\Desktop\dsh\dsh-side-chat`，git HEAD `831b669`（工作树脏：A/B/C/D 的未提交改动）
- 验收环境：DSH 桌面版 0.2.0-rc.2（Electron `resources/app.asar`），Host 进程 PID 28592（**未重启**，仍运行旧模块），web 端口 `127.0.0.1:19387`，profile = `desktop`
- 验收者纪律：**未修改 repo 下任何源文件**；未重启/杀进程；未启动任何服务器；未 publish/git push；未改 `$DSH_HOME/profiles/desktop`；真模型调用 **0 次**（全部探测用 GET / 非法 body / 桩 llm 完成）
- 可复现工具（本报告新增，非源文件）：`repo/tests/acceptance/tools/{route-sim.mjs,verify-artifacts.mjs,asar-read.mjs}`；工作副本在 `C:\Users\29559\Desktop\dsh\_verify\`
- 临时 profile/home 已删除：`C:\Users\29559\Desktop\dsh\dsh插件\_verify home`、`...\_verify-empty`（已确认删除；用户 profile 文件 mtime 全部 ≤ 21:14，未被触碰）

---

## 0. 结论先行

**这个包现在不能发布。** 有两个相互独立的阻塞项：

1. **npm 包名 `dsh-side-chat` 已经属于别人，而且那是一个完全不同的插件**（npm 用户 `super-cabbage`，最新 0.1.2，2026-08-15 发布）。本仓库既不可能用这个包名发布（0.1.0 版本已存在 + 名字所有权不在本仓库），README「方式一」让用户填 `dsh-side-chat` 会让用户装上**别人的插件**。
2. **新默认 `trust: 'same-origin'` 会让桌面应用的面板每次提问返回 403**（桌面窗口的页面源是 `dsh-app://app`，其协议代理在转发时**删除 `Origin`**）。README 声称「正常使用不需要任何配置」，对桌面端不成立。

> 第 2 条的证据链中，唯一没能实测的一跳是「Electron 主进程的 fetch 是否会自动补一个 Origin 头」；只可能失败（无 Origin / `null` / `dsh-app://app` 三种情况**都**会被策略拒绝，唯一的放行值是 `http(s)://127.0.0.1:19387`，桌面页面永远不可能有）。判定实验见 D2。

---

## 1. 逐条完成情况

### 1.1 关键结论独立复算（全部亲自复跑，不采信自述）

| # | 复算什么 | 命令 | 结果 |
|---|---|---|---|
| 1 | pack 内容清单 | 见 1.2 | 15 文件 / 239,316 B，与任务 A 声称一致 ✅ |
| 2 | 包内 `lib/index.js` 可被 Node ESM 导入 | `node _verify/verify-artifacts.mjs _verify/offline-import/package` | 只有一个 import：`./protocol.js`；**零外部依赖**；导出 `apply/decideTrust/settingsOf/Config/...` ✅ |
| 3 | `lib/client.js` 是 `__ModuleLoader__` 工厂 | 同上 | `window.__ModuleLoader__.load({ id: "dsh-side-chat", factory })`，`load()` 被调用 1 次，`id` 与 factory 形态正确 ✅（执行到第一个平台 `require('react')` 为止，之后的运行需要真实模块表，未继续） |
| 4 | 干净环境（无 node_modules、路径含空格）install→typecheck→test→build | `robocopy → pnpm install --frozen-lockfile → typecheck → test → build` | install 1.5s / typecheck 0 / **19 files, 233 tests passed** / build 成功（lib/index.js 67,357 B，gzip 18.89 kB） ✅ |
| 5 | 打包产物 = 仓库构建 = profile 里正在加载的副本 | SHA256 对比 | `lib/index.js`、`lib/client.js`、`lib/protocol.js`、`cordis.patch.yml`、`locale/zh.json` 三者**逐字节相同** ✅ |
| 6 | `install.mjs` / `verify.mjs` 真实可用性 | 临时 home（路径含中文+空格）→ `node scripts/install.mjs --home … --profile testprof --no-build`；`verify.mjs` 三种情形 | install exit 0，`[]` 空 patch 根被正确替换；verify 已安装 exit 0 / 未安装 exit 1 / 用法错误 exit 2 ✅ |
| 7 | 主题 token 是否都存在 | 提取 `dsh-client-ui-theme/lib/client.js` 逐个匹配 | 插件用到的 **12/12 个 token 全部存在**（`--dsw-alias-label-primary`、`-brand-primary`、`-label-secondary`、`-bg-layer-1/2`、`-border-l1/l2`、`-state-error-primary`、`-bg-overlay`、`-button-primary-fill`、`-label-primary-foreground`、`-button-primary-hover`） ✅ |
| 8 | 四个挂载点在 DSH 侧确实存在 | 提取 `sidebar-right/conversation/chat/layout` 包并匹配 | `sidebar.right.pane.tab`(sidebar-right)、`conversation.session.header.actions`(conversation)、`conversation.chat.assistant-actions`(chat)、`shell.overlay`(chat+layout) **全部命中** ✅ |
| 9 | locale 键对齐 | 从 `src/client/locales.ts` 提取两套键 | zh 39 / en 39，互无缺失、无重复 ✅（另有 `satisfies Record<SideChatKey,string>` 编译期兜底） |
| 10 | bundle 形态被真 DSH 识别 | `plugin_manager list_bundles` | `dsh-side-chat@0.1.0, installed:true, enabled:false, rows:[{side-chat → dsh-side-chat}]` ✅（说明 `dsh.bundle.patch` 契约正确） |
| 11 | locale/icon 展示契约 | 读 `dsh-app-boot` 的 `readPluginMeta` | 读 `${pkg}/locale/en.json` + `locale/<lang>.json` 的 `meta.title/description` + manifest `icon`（相对路径、≤256 KiB、SVG/PNG/JPEG/WebP）→ 本包完全符合 ✅ |
| 12 | peerDependencies 是否会挡住安装 | 读 `dsh-app-boot#evaluatePluginCompatibility` | 第 294 行只检查 `@deepseek-ai/dsh` / `@deepseek-ai/dsh-*`；**`@deepseek-ai/cordis` 被跳过**，不会触发 `incompatible-version` ✅（我最初怀疑它会挡住，实测代码否掉了）。另：`@deepseek-ai/cordis@4.0.4` 在 npmjs 与 npmmirror 都存在 |
| 13 | 插件页文案与 README 一致 | 提取 `dsh-client-ui-plugin-manager/lib/client.js` | 「添加插件」「包名或地址」「安装源」「中国大陆镜像源」「立即启用」「已安装」「本部署没有可管理的 profile，无法安装或启停插件。」**逐字命中** ✅ |
| 14 | README 的「填仓库绝对路径」备选路线 | 读 `dsh-plugin-manager/lib/types/install-spec.js` | `parseInstallSpec` 支持绝对路径（`kind:'path'`），README 该说法成立 ✅ |
| 15 | 桌面 profile 是否会意外装 peer | 读 `profiles/desktop/pnpm-workspace.yaml` | `autoInstallPeers: false` → 不会自动装 cordis ✅ |
| 16 | 端到端真实问答 | 未做（配额纪律）| 运行中的 Host 仍是旧模块；Lead 已有「POST 200 + 流式回答」证据，本次不重复消耗额度 |

### 1.2 pack 清单（独立产出）

```
pnpm pack            # 在干净副本里跑，prepack 自动重建
tar -tzvf dsh-side-chat-0.1.0.tgz
```
15 个文件：`LICENSE, README.md, README.zh.md, package.json, cordis.patch.yml, icon.svg,
lib/{index.js,protocol.js,client.js,client.js.map,index.d.ts,protocol.d.ts},
locale/{en.json,zh.json}, scripts/verify.mjs` —— 239,316 B。
`node scripts/check-pack.mjs <tarball>` → 19 项全 ok，`packed tarball is good (15 files)`，exit 0。

### 1.3 关键原始输出摘录

```
$ node _verify/verify-artifacts.mjs <repo>
lib/index.js: 1 distinct specifiers -> ["./protocol.js"]
SIDE_CHAT_ROUTE = "/side-chat/ask"
DEFAULT_TRUST = "same-origin"
settingsOf({}) = {"maxBodyBytes":262144,"maxConcurrent":4,"timeoutMs":600000,"trust":"same-origin","trustSource":"default",...}
desktop proxy: loopback, NO origin      -> {"allowed":false,"status":403,"basis":"origin-missing"}
browser page: loopback, matching origin -> {"allowed":true,"basis":"same-origin"}
browser page: loopback, opaque origin   -> {"allowed":false,"status":403,"basis":"origin-opaque"}
non-loopback peer: matching origin      -> {"allowed":false,"status":403,"basis":"not-loopback"}
```

```
$ node tests/acceptance/tools/route-sim.mjs <extracted-tarball>        # 桩 llm，不消耗额度
# trust mode: default (same-origin)
desktop window shape: Origin deleted by the dsh-app:// proxy -> 403 ""
same-origin browser page                                     -> 200 "data: error/model-route-missing | data: done"
cross-site page                                              -> 403 ""
opaque origin                                                -> 403 ""
bare local script with no Origin                             -> 403 ""
GET                                                          -> 403 ""      # 注意：连 405 都到不了
$ node tests/acceptance/tools/route-sim.mjs <…> host
desktop window shape -> 200（并打印 NO_FENCE_WARNING）
```

```
$ node -e "…probe 19387…"      # 免费探测，运行中的旧模块
GET /               -> 401 {"dsh web authentication required; reopen the URL printed by dsh web."}
GET /side-chat/ask  -> 405 {"error":"method-not-allowed"}     # 新默认应为 403 ⇒ 确认旧模块仍在跑
POST text/plain     -> 415
POST json bad body  -> 400     # 无模型调用
```

```
$ pnpm view dsh-side-chat versions time
{ "versions": ["0.1.0","0.1.1","0.1.2"], "time": { "created":"2026-08-14T08:56:08Z", "0.1.2":"2026-08-15T04:52:16Z" } }
$ pnpm view dsh-side-chat description _npmUser
"DSH Side Chat — 并行侧边对话插件：真实并行 agent 会话、独立上下文、摘要带回主对话。"
_npmUser = super-cabbage <2031814001yuyue@gmail.com>
$ pnpm view dsh-side-chat@0.1.2 gitHead   -> ac7d5f4f…（本仓库 `git cat-file` 不存在该对象）
$ tar -tzf <registry tarball>             -> lib/ src/ scripts/ CHANGELOG.md …（与本仓库结构完全不同）
```

---

## 2. 缺陷表

| # | 现象 | 复现步骤 | 期望 | 实际 | 严重度 | 建议归属 |
|---|---|---|---|---|---|---|
| **D1** | **包名被他人占用且是另一个插件** | `pnpm view dsh-side-chat version description _npmUser time`；`pnpm view dsh-side-chat@0.1.2 gitHead`；下载 registry tarball 对比 | 名字可用/可发布，用户按 README 装到本插件 | 最新 `0.1.2`（2026-08-15），维护者 `super-cabbage`，描述是「并行侧边对话」，`gitHead` 不在本仓库，包内结构与本仓库完全不同；本仓库版本 `0.1.0` 也已在 registry 里 → `npm publish` 必然 E403（版本已存在；名字所有权也不在本仓库） | **阻塞发布** | packaging（改名/换 scope）+ docs（全文同步包名） |
| **D2** | **桌面应用（主目标）面板提问 403** | ① 读 `app.asar/lib/main.js`：`applicationUrl = "dsh-app://app/"`、`protocol.handle(SCHEME)`→`forwardWebRequest`；② 读 `forwardWebRequest`（7461-7475 行）`for (const name of ["host","origin","cookie","sec-fetch-site"]) headers.delete(name)`；③ `node tools/route-sim.mjs <pkg>`：loopback + 无 Origin → 403 `origin-missing`；④ `node -e decideTrust(...)` 同结果；⑤ `netstat` 显示 19387 的连接来自 Electron 主进程 33348 与其 NetworkService 27932（页面就是 `dsh-app://app`，不是同源浏览器页） | README：桌面端零配置可用（面板的 fetch 带同源 Origin） | 桌面代理转发时**主动删掉 Origin**；插件在 `loopback && origin===undefined` 时返回 **403**。`dsh-app://app`、`null`、无 Origin 三种桌面可能值**全部**被拒；唯一放行值是 `http(s)://127.0.0.1:<port>`，而桌面页面永远拿不到这个源。用户看到「这次提问被拒绝了。请刷新页面后重试。」（刷新永远不会好） | **阻塞发布**（需 1 分钟终验确认，见下） | hostle（trust 默认值/策略）+ docs（隐私章节） |
| **D3** | 发布包里 `install:profile` 是死脚本 | `tar -tzf` 只见 `scripts/verify.mjs`；解包后的 `package.json` 仍含 `"install:profile": "node scripts/install.mjs"`；`verify.mjs` 第 232 行的补救建议也指向它 | 声明的脚本文件随包发布，或不要声明 | 已安装包里执行 `pnpm run install:profile` 会 `Cannot find module …/scripts/install.mjs`；照 `verify.mjs` 的补救提示做会撞同样的错 | 打磨项 | packaging（把 install.mjs 加进 `files`，或改文案为「在插件页安装」） |
| **D4** | 手工 Loader 行 + 插件页「立即启用」→ 同一 `id: side-chat` 被插入两次 | 读 `dsh-app-boot#applyEntryPatches`（`data.push(...insert)`，不做去重）；读 `dsh-host-webserver` 第 179 行 `if (table.has(route.path)) throw new Error('webserver: duplicate … route')`；旁证：registry 上那个同名包的 `cordis.patch.yml` 自己写着「不需要也不应该再在 profile 的 cordis.patch.yml 里手动插入，否则重复注册崩溃」 | 两种安装方式互斥且被检测 | 当前 `desktop` profile 正是「手工行存在 + `list_bundles` 显示 `enabled:false`」的状态；用户在插件页点「立即启用」时不会移除手工行，第二个插件实例 `apply` 会因重复路由抛错（**推断**：第二个实例加载失败，第一个继续服务；Loader 的容错未实测） | 影响使用 | scripts/install.mjs（写行前先查 bundle 选择+反向提示）+ docs 写明二选一 |
| **D5** | `verify.mjs` 的 403 解释在新默认下会误导 | 读 `verify.mjs` `explain()`：403 →「refused by the Host trust check」；`route-sim` 显示 GET 无 Origin 在**旧**模块是 405、在**新**默认是 403，且 403 与 Host 无关 | 区分「插件 same-origin 拒绝」与「Host 信任检查拒绝」 | 把插件自己的策略拒绝说成 Host 的检查；用户按提示查 Host 配置会白费功夫 | 打磨项 | packaging |
| **D6** | `pnpm pack` 后 `packageManager` 字段消失 | 解包 `package.json` 与源文件逐字段比对 | — | npm/pnpm 打包时会剔除 `packageManager`（发布后 Corepack 不再固定 pnpm 11.7.0）。不影响插件运行 | 打磨项（信息） | packaging |

**未发现缺陷的攻击面**（明确列出，避免"没试"）：包名之外的 manifest/`files`/exports/types 完整性（逐字段核对通过）；tarball 杂物（`preview.html/png` 未入包）；离线导入（无 node_modules 也能 import）；`lib/client.js` 工厂形态；空/畸形 body、非 JSON content-type、超限 body 的分支；并发上限与超时（有单测且本次全绿，未再打真实端口）；locale 键对齐；主题 token 存在性；id 大小写/路径分隔符（脚本全部用 `node:path`，未见 shell 专有语法）。

---

## 3. 发布结论 + 普通用户最可能踩的三个坑

**能不能发布：不能（as-is）。** 至少要先把 D1（包名）与 D2（桌面 trust）处理掉，并做一次真实桌面端到端验收。

发布后（假设 D1/D2 已修）最可能踩的三个坑，按概率排序：

1. **装到了别人的插件**——只要文档/包名还写 `dsh-side-chat`，用户在插件页输入这个名字就会从 registry 装到 `super-cabbage` 的 0.1.2；两款插件的 bundle 行 id/name **完全相同**（`side-chat` / `dsh-side-chat`），装进已有手工行的 profile 会重复注册。占位符、README 命令、`package.json.name`、`cordis.patch.yml` 的 `name:` 必须一起改。
2. **桌面端点开面板就问不出话**（403）——用户看到「这次提问被拒绝了。请刷新页面后重试。」，刷新无效，大概率放弃并给差评。（若 D2 修复方式选「默认 host」，则第 2 坑变成：任何本机进程都能无凭据调用该路由并把当前会话内容折叠进模型请求——README 已如实写明，但那是"默认不安全"，需要用户决策。）
3. **排错时被引入死路**——照 `verify.mjs` 的提示运行 `pnpm run install:profile`（已安装包里没有这个文件），或按 README「方式一」在旧版本 DSH 上找不到「插件」入口 / 装完忘记重载界面。

---

## 4. 我没能验证的事项（如实列出）

| 事项 | 原因 |
|---|---|
| **桌面窗口点面板提问的真实 HTTP 结果** | 不能重启 Host（PID 28592）、不能点击 UI；只能做到「Electron 源码 + 插件级仿真」。**唯一未实测的一跳**：Electron 主进程 `fetch` 是否自动补 `Origin`。三种可能取值（无/`null`/`dsh-app://app`）都会被拒，故结论方向不变 |
| 浏览器端**实际渲染**（面板长什么样、深色主题发送按钮文字、Esc/IME/上滚行为） | `client/Slots.listSubTree`（×2）、`client/Theme.listTokens`、`client/Service.listService` 共 4 次 10s 超时（task 卡预告过该现象，需刷新页面；我不能刷新用户页面）。替代证据：slot 名在 DSH 包内存在、12/12 token 存在、`lib/client.js` 工厂形态正确、客户端单测全绿（含 panel/preview/styles/locales）。**渲染本身未验证**，无截图 |
| 非 desktop profile（`web` / `cc-tui`）真机安装 | 需要启动新的 DSH 实例/端口，任务禁止 |
| 真实模型端到端（新模块） | 运行中的 Host 未热加载；且为省额度，真模型调用 0 次 |
| `npm publish` 的实际报错码（E403/EPRIVATE/ownership） | 不允许发布；只能从 registry 元数据推断 |
| macOS / Linux 行为 | 无机器；仅做了代码审查（未见平台专有假设） |
| Windows PowerShell 执行策略 FAQ、`dsh plugin --profile desktop` 的原文报错 | 未在 `dsh-plugin-manager`/`dsh-app-boot`/`desktop-host/lib/cli.js`/Electron `main.js` 中检索到 README 引用的那句 `profile "desktop" is managed exclusively by the Electron application`（只在 `dsh-desktop-host/lib/cli.js` 里找到 `manageDesktopProfile: true`），**该 README 引文未能证实**（也未证伪：其他包未全量检索） |
| D4 的 Loader 容错（第二个实例抛错后第一个是否继续工作） | 需要真实 Loader 组合（会碰用户 profile），未做；结论标注为推断 |

---

## 5. 「让任何人都能用上」还差什么（按优先级）

1. **P0 定名并全链同步**：改 `package.json.name`（建议 `@breezes-messager/dsh-side-chat` 或未被占用的名字）、`cordis.patch.yml` 的 `name:`、README/README.zh/CONTRIBUTING/docs 中所有安装命令与插件页输入值、`homepage/repository`、GitHub 仓库名（可选）。
2. **P0 修 trust 默认**：三选一——(a) 默认回 `host`（桌面+浏览器**都**可用，代价是本机任意进程可调用，README 已写明）；(b) 保留 `same-origin` 但额外接受「loopback + 无 Origin + 带 Host cookie」的请求，并在 README 里删掉「桌面端零配置即可用」的错误保证；(c) 调研 `connection.admit({headers})`（Service 目录里有该方法）能否给出一个既认 cookie 又对桌面友好的判定——**未验证，仅建议**。
3. **P1 真实端到端验收**：重启应用后，(i) 桌面窗口面板问一句拿到流式回答；(ii) 浏览器（若可用）面板同样验证；(iii) `curl` 无 Origin 得到预期的 403/200。把这三条写进 README 的「确认装好了」。
4. **P1 发布作业单**：npm 登录 → 版本号 → `pnpm publish` 前确认 `prepack` 构建 → 用 `check-pack.mjs` 校验真实 tarball → 发布后再用插件页装一遍（装用户视角，而不是从源码 link）。
5. **P2 去掉死脚本/误导文案**（D3、D5），并在 `install.mjs` 里加「已选为 bundle 就不写行；已有行就不选 bundle」的双向提示（D4）。
6. **P2 补一个「装完自检」的用户可见路径**：现在 `verify.mjs` 只在仓库里被发现，README 仅在开发者小节提到。
7. **P3 打磨**：`preview.png` 用于 README 效果预览（当前 README 未引用它）；GitHub topics/description。

---

## 6. 证据与环境处置

- 本报告：`repo/tests/acceptance/independent-verification-2026-09-29.md`
- 可复现工具：`repo/tests/acceptance/tools/route-sim.mjs`（桩 llm 复现各来源的 403/200 矩阵）、`verify-artifacts.mjs`（离线导入 + 导入清单）、`asar-read.mjs`（只读 asar 读取，用于核对 DSH 侧契约）
- 临时产物（不在仓库内）：`C:\Users\29559\Desktop\dsh\_verify\`（clean room 副本、tarball、解包、asar 提取、日志）；`dsh插件\_verify home` 与 `dsh插件\_verify-empty` 已删除
- 未触碰：`$DSH_HOME/profiles/desktop/**`（mtime 核对通过）、运行中的 Harness 进程、npm registry（只读查询）、git（未提交/未推送）
