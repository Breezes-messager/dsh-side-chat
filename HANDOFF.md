# HANDOFF —— dsh-side-chat → `dsh-side-chat-plugin` 0.2.0 交接说明

> 给维护者看的**状态说明**，不是用户文档（用户文档见 [README.zh.md](README.zh.md) / [README.md](README.md)）。
> 只写有证据的结论；凡未实测的都标「**未验证**」。
> 事实截止 **2026-09-30 08:25（GMT+8）**，仓库 `C:\Users\29559\Desktop\dsh\dsh-side-chat`（基线 git HEAD `831b669`，本轮全部改动**尚未提交**）。

## 0. 一句话结论

**代码、构建、打包与本机运行态都已就绪，可以发布**（`typecheck` / 237 个测试 / `pack`+`check-pack` / `verify` 全绿，见 §2）；**只剩一件必须由人做的事：在 npmjs 上发布**（本机 registry 是 npmmirror 镜像且未登录，只能 `npm login --registry=https://registry.npmjs.org` 后 `pnpm publish`）。发布之后再做一次「从注册表真装一次 + 点开面板问一句」的收尾验收即可对外宣布可用。

本机 `desktop` profile 的迁移**已于 08:20 完成**，并且 `dsh-hmr` 监听到 profile manifest 变化后**自动重载**——无需重启即已生效：Host 行 `include:dsh-side-chat-plugin` 为 `status: "schema"`（Config 可配可校验），浏览器半边在 `sidebar.right.pane.tab` 上以 key `dsh-side-chat-plugin` 注册且 `active: true`，路由 `/side-chat/ask` 已挂载（未带凭据的探测返回 401，即 DSH 自己的信任检查在起作用）。

## 1. 本轮改造做了什么

| 主题 | 结果 | 关键证据 |
| --- | --- | --- |
| 可安装性 / 分发（task-1、task-8） | npm 包做到「可直接 publish」：`files` 白名单、`prepack` 强制构建、`publishConfig`、CI 矩阵；新增零依赖自检 `scripts/verify.mjs` 与打包清单校验 `scripts/check-pack.mjs`。**Git 是本项目唯一分发渠道（用户无 npm 账号）**，所以 `dist/` 里带一个预构建包，`scripts/release-current.mjs` 保证发布说明与包体一致、CI 会在两者漂移时失败 | `pnpm pack` 15 文件；体积与 SHA-256 见 `dist/README.md`（由脚本生成，故不在此处复述）；`check-pack.mjs` 19 项全 ok |
| **改名解除名称占用**（task-8） | 包名与 Loader 行 id 都改为 `dsh-side-chat-plugin`，版本 `0.2.0`；仓库名与 GitHub URL 未变 | `package.json` `name/version`；`cordis.patch.yml` 两处；`lib/client.js` 注册 id 一致（本次实测） |
| Host 加固（task-2、task-6） | 无会话/无模型时给可执行指引而非开发者措辞；SSE 生命周期、并发归还、畸形 body 全部有测试；Config 导出运行期 schemastery schema，`@deepseek-ai/schemastery` 内联进 `lib/index.js` | `typecheck` exit 0；`lib/index.js` 只有一条外部 import：`./protocol.js`（本次实测） |
| 信任边界（task-6、task-7） | 默认 `trust: 'same-origin'`：带 `Origin` 查同源、`Origin: null` 拒绝、非 loopback 拒绝、**无 `Origin` 回退给 Host 的 `connection.requestRejection`**——这修掉了桌面端 403（Electron 转发会删掉 `Origin`、只补 cookie） | `decideTrust` 矩阵：desktop 形态 → `allowed / host-authenticated`；跨站 → 403 `origin-mismatch`（本次实测） |
| 浏览器端可用性（task-3） | `src/client/**` 补测试（store/transport/contract/panel/locales/styles/notice/failure/preview）；错误可见、键盘可达、locale 中英键对齐。**2026-09-30 10:50 用户报告头部按钮与相邻控件重叠 → 已修**（`.sc-header-button` / `.sc-message-action` 补 `flex: 0 0 auto` + `min-width: max-content`，标签可截断但绝不外溢；`.sc-header-label` 加 ellipsis）。**同批修掉同类隐患**：`.sc-message-action` 原先同样缺压缩保护。 | `pnpm test` 21 文件 / 239 通过；两个 headless Chrome 布局审计（见下）| 
| 布局回归护栏（新增） | 布局类缺陷单测看不见，于是加了两个可复现夹具：`tests/client-header-fit.spec.tsx`（4 个宽度下量按钮矩形与相交）与 `tests/client-layout-audit.spec.tsx`（把面板/头部控件/消息动作/选区浮层/提示条放进各自真实容器，检测**越界、相交、文字被裁、控件塌成 0 尺寸**）。默认不写盘，给出环境变量才生成页面，由仓库外的 `measure-header-fit.mjs` / `measure-layout.mjs` 驱动 headless Chrome 测量。 | 当前：`9/9 surfaces clean`、`no overlap at any width`；实测「拥挤行」里可压缩的**邻居**从 178px 压到 43px，而本插件按钮稳定保持 84px | 
| 用户文档（task-4、task-9） | README 两语种重写为「照做即可」；新增 CONTRIBUTING / 进阶安装；两次改名同步 + 「从旧名迁移」章节。**2026-09-30 08:45 又做了一轮「陌生人走查」修正**：补了"包还没发布到 npm"的醒目提示与 FAQ、把 `pnpm` 也会被执行策略拦一并写清、替换掉无效的 `pnpm why` 自查、手工卸载按安装方式分岔、插件版本与 DSH 版本消歧、`install.mjs` 后不要再点「立即启用」 | 两份 README 各 496 行 / 16 围栏 / 23 标题且**行号一一对应**；新增命令均由走查者实跑并贴出输出 |
| 独立验收（task-5） | 由非实现者复算 pack 清单、离线导入、干净环境 install→test→build，并找出两个阻塞项（旧包名被占用、桌面 403）——两项均已修 | [tests/acceptance/independent-verification-2026-09-29.md](tests/acceptance/independent-verification-2026-09-29.md) |

## 2. 当前状态（除注明外均为本次实测）

- **包名 / 行 id / 版本**：`dsh-side-chat-plugin` / `dsh-side-chat-plugin` / `0.2.0`。两者必须始终相等：浏览器半边只挂在「说明符恰好等于包名」的 Loader 行上。
- **产物**：`pnpm build` 成功；`lib/index.js` 68,259 B（唯一外部 import `./protocol.js`）、`lib/client.js` 254,094 B（`window.__ModuleLoader__.load({ id: "dsh-side-chat-plugin", factory })`，`load()` 调用 1 次）。
- **打包**：`dsh-side-chat-plugin-0.2.0.tgz`，恰好 15 个文件；`node scripts/check-pack.mjs <tgz>` → 19 项 ok，exit 0。**体积与 SHA-256 以 [dist/README.md](dist/README.md) 为准**——那份说明由 `node scripts/release-current.mjs --write` 从包体本身生成，这里再抄一遍只会在下次重新打包时变成过期数字。
- **质量门**：`pnpm typecheck` exit 0；`pnpm test` **19 文件 / 237 用例全通过**（本轮开始前的基线是 58 个用例，据 task-5 验收记录）。
- **默认信任策略及其真实边界**（`trust: 'same-origin'`）：
  - 带 `Origin` → 必须与本机所访问地址同源，否则 403；`Origin: null` → 403；非 loopback → 403。
  - 无 `Origin` → 交给 DSH 的信任检查；DSH 拒绝就按其状态码，DSH 无意见则放行。**桌面应用正是这种形态**，所以默认设置下桌面端可用。
  - 比旧的默认 `host` **更严**（`host` 完全不看 `Origin`）。
  - **边界（必须如实传达）**：本机进程可以伪造请求头，所以它不是对存心调用者的防线。真正的边界是 **DSH 自己那个带签名的浏览器凭据**：实测不带凭据的请求在到达插件之前就被 DSH 拒为 **401**（`GET /` 与 `GET|POST /side-chat/ask` 均是），跨站 `Origin` 才由插件补一刀 403。
- **零手改安装已端到端复验**（2026-09-30 08:26，临时 `DSH_HOME`，跑完自删）：`dsh --profile e2e --from-default-profile web` 建全新 profile → `dsh plugin --profile e2e add <tarball>` → 实测：依赖由 DSH 自己写入（`file:…tgz`）、**`dsh.profile.bundles` 自动变成 `[dsh-base, dsh-web-app, dsh-side-chat-plugin]`**、profile 自己的 `cordis.patch.yml` **217B → 217B 逐字节未动**、安装副本含 host/browser/bundle patch/locale/icon、`--dump-config` 合成树出现本插件的 Loader 行、且 `lib/client.js` 注册的 id 等于包名。即"任何人装上就能用"这句话有可复现证据。
- **零运行时依赖，且 tarball 可完全离线安装**（2026-09-30 08:29 实测并修掉一个真问题）：
  - 发现：`@deepseek-ai/schemastery` 原先声明在 `dependencies` 里。它**已被内联进 `lib/index.js`**（宿主半边唯一的 import 是 `./protocol.js`），所以这条声明在运行时不提供任何东西，却要求每次安装都去 registry 解析它。实测把 registry 指向不可达地址 + `--offline`：**安装失败**，`ERR_PNPM_NO_OFFLINE_META: Failed to resolve @deepseek-ai/schemastery`。
  - 处理：把它移到 `devDependencies`（构建期仍需要它来产出 Config schema），`dependencies` 整块删除；`scripts/check-pack.mjs` 的断言从"运行时依赖只能是 `@deepseek-ai/*`"收紧为**"运行时依赖必须为零"**，CI 会挡住回退。
  - 复验：同样 `--offline` + 不可达 registry，**安装成功**（`reused 1, added 1`），且安装后的 `lib/index.js` 能导入、`apply` 是函数、Config 仍是合法原生 schema。`check-pack` 现在打印 `ok    no runtime dependencies`。
  - 注意 Schemastery 的 schema 是**可调用实例**、没有 `.validate()` 方法（`Config.validate({})` 会 TypeError）；等价调用是 **`Config({})`** → `{"maxBodyBytes":262144,"maxConcurrent":4,"recentMessages":20,"maxMessageChars":4000,"maxContextChars":24000,"timeoutMs":600000}`，`trust` 保持缺省，逐字段带 `meta.description`。
  - 前提条件：profile 里 DSH 生成的 `pnpm-workspace.yaml` 有 `autoInstallPeers: false`（本机 desktop profile 实测如此）。若它被改成 `true`，`peerDependencies: @deepseek-ai/cordis` 会被 pnpm 自动下载而在离线机失败——该 peer 仅用于类型检查，构建产物里没有任何对它的 import。已写进 `docs/advanced-install.zh.md`。
- **渲染证据**（2026-09-30 08:28，从当前代码生成，非旧快照）：`DSH_SIDE_CHAT_PREVIEW=1 pnpm vitest run tests/client-preview.spec.tsx` 写出预览页 → `chrome --headless=new --screenshot` 出图，肉眼逐格检查通过。覆盖：中文浅色 6 态（空态含新加的"可以问：…"示例、流式光标、未配置模型的可操作提示、已停止的灰色文案、长回答含表格与代码块、带选区上下文的提示条）+ 英文深色 3 态。**关键回归点确认**：深色主题下"Stop"按钮为**浅底深字**清晰可读——这正是之前 `color:#fff` + 近白 `brand-primary` 造成按钮文字不可见的那处缺陷，现用 `--dsw-alias-button-primary-fill` / `--dsw-alias-label-primary-foreground` 修复；预览页里已不含硬编码 `#fff`，且出现在渲染中的 `--dsw-alias-button-primary-fill` 证明用的是主题 token。
- **四个挂载点在运行实例中全部 confirmed**（2026-09-30 08:27，`cordis_inspect_query client/Slots`）：`sidebar.right.pane.tab`（key `dsh-side-chat-plugin`）、`shell.overlay`（id `side-chat`）、`conversation.session.header.actions`（id `side-chat`，order 20）、`conversation.chat.assistant-actions`（id `side-chat`，order 20）——四条 `active: true`。
- **自检脚本**：`node scripts/verify.mjs` 对当前 live desktop（`127.0.0.1:19387`）**exit 0，全部检查通过**（迁移完成后）。该脚本对 401/403 的解释措辞为「**可能来自 Host 信任检查，也可能来自插件自身的同源策略**」，不再只归因 Host。
- **改宿主半边必须重启**：DSH **不会热重载插件代码**（实测：`touch lib/index.js` 后等待，配置投影仍是旧的）。但 **profile manifest（`package.json` 的 bundles 列表）会被 `dsh-hmr` 热监听**：本次迁移改完 `bundles` 后无需重启，Host 行立刻变成 `status: "schema"`、浏览器半边立刻以新 key 注册。
- **脚本入口**：`package.json` 的 `scripts` **已没有 `install:profile`**；从仓库安装请直接 `node scripts/install.mjs`（不再有 `pnpm run install:profile`）。

## 3. 尚未完成 / 需要用户决策或操作（按优先级）

**P0 发布（只有用户能做）**

1. `npm login --registry=https://registry.npmjs.org`（本机默认 registry 是 npmmirror 镜像、且未登录 → 从本机无法 publish）。
2. 确认版本号：当前 `0.2.0`（旧名 `0.1.x` 已被他人占用，无法沿用）。
3. **发布路径本身已用 dry run 验证过**（2026-09-30 08:30）：`pnpm publish --dry-run --no-git-checks --registry=https://registry.npmjs.org` → **exit 0**，`prepack` 先跑完整构建，tsdown 自报把 `highlight.js` 内联进浏览器半边、把 `@deepseek-ai/schemastery` + `@deepseek-ai/cosmokit` + `@standard-schema/spec` 内联进宿主半边，最后打印 `dsh-side-chat-plugin@0.2.0 → https://registry.npmjs.org/` 与 `[WARN] Skip publishing … (dry run)`。即"发布命令、构建钩子、目标 registry"三件事都已确认，只差登录后的那一次真发。
4. `pnpm pack` → `node scripts/check-pack.mjs ./dsh-side-chat-plugin-0.2.0.tgz`（本次实测全绿）→ `pnpm publish`。
4. 发布后用应用内「插件」页输入新名 `dsh-side-chat-plugin` 真装一次（不是从源码 link），确认能搜到、能启用。

**P1 收尾验收（发布后做，两项）**

1. **从注册表真装一次**：应用内「插件」页输入 `dsh-side-chat-plugin`（不要输入 `dsh-side-chat`，那是别人的包）→ 安装 → 确认列表里出现卡片且默认启用、`dsh.profile.bundles` 里出现该包名。这一步验证的是"陌生人能不能一键装上"，与源码 link 路径不同。
2. **点开面板问一句**，拿到流式回答（**未验证**：需要人点 UI 并真实调用一次模型）。已在运行态确认的替代证据：路由已挂载、Host 行 `status: "schema"`、浏览器半边在 `sidebar.right.pane.tab` 上 `active: true`、未带凭据的探测被 DSH 信任检查拒为 401（面板请求会带 Host cookie，因此不会被这道检查挡住）。

**P2 迁移本机 `desktop` profile —— 已于 2026-09-30 08:20 由 Lead 执行完毕**（备份：`cordis.patch.yml.bak.20260930_080021`、`package.json.bak.20260930_080021`、`package.json.bak.20260930_082005`）。

实际改动（四处，缺一不可）：
1. `package.json` 依赖 `dsh-side-chat` → `dsh-side-chat-plugin`；
2. `node_modules` 的 junction 重建为新名（实测删除旧 junction 不会波及仓库目录）；
3. `cordis.patch.yml` 里手写的 `- id: side-chat / name: dsh-side-chat` 那条已删除（其余配置逐字节保留，2421 B → 2365 B）；
4. **`dsh.profile.bundles` 里追加 `dsh-side-chat-plugin`** —— 这一步最早被漏掉，是个真陷阱：组合包的补丁层**只有在该 profile 选中它时才生效**。只删手写行而不选中组合包，结果是「手写行没了、组合包的行也没来」，插件静默消失。已用 CLI 的 `--dump-config` 在 profile 副本上双向验证：不选中 → 合成树里没有本插件的行；选中 → 出现 `- id: dsh-side-chat-plugin / name: dsh-side-chat-plugin`。

**迁移过程中的中途状态，以及为什么本次没有重启**：删掉手写行之后、`bundles` 还没补上的那段时间里，插件会从**运行中**的进程里被卸掉——实测那一小段时间 `GET /side-chat/ask` 从 405 变成 **404**（路由不再挂载），而 `GET /` 仍是 401。补上第 4 步（`dsh.profile.bundles`）之后，**`dsh-hmr` 监听到 profile manifest 变化并自动重载**：无需重启，Host 行即变为 `include:dsh-side-chat-plugin / status: "schema"`，浏览器半边即以新 key `dsh-side-chat-plugin` 注册且 `active: true`，`node scripts/verify.mjs` 回到 **exit 0**、路由恢复挂载（无凭据探测返回 401）。所以本次迁移**没有**重启应用；但**改插件自身代码**（`lib/index.js`）仍需重启，两者不是一回事。

**`scripts/install.mjs` 现在也会自动清理旧行**（2026-09-30 08:32，08:47 修正一处过删缺陷）：在写新 Loader 行之前，它先移除 profile 里遗留的 `- id: side-chat / name: dsh-side-chat` 组合。实测用一个"旧状态"临时 profile：`apiKey` 覆盖保留、`ui-theme` 覆盖保留、旧行消失、新行追加，**整文件与「原文件 − 旧行 + 新行」逐字节相等**；脚本还会在装完后探测 `127.0.0.1:${DSH_PORT:-19387}`，若发现 Harness 在跑就提示需要重启（因为插件代码不热重载）。

⚠️ **修正过的过删缺陷（`scripts/install.mjs` 与仓库外 `migrate-profile.mjs` 都有过，已修）**：最初的实现在删旧行时会"顺手"删掉紧邻的 `- insert:` 头。**如果旧行是共享 insert 块的第一行、块内还有别人的行**，头被摘掉后那些行就变成"缩进但没有父块"的根级条目——YAML 解析失败，**整个 profile 起不来**。现改为：只有当该 insert 块里**再没有其它 `- id:` 行**时才删头，否则保留。两个脚本各过 3 种形态（旧行在首/在尾/独占一块）× 共 6 个用例，全部通过；verifier2 自己的复现工具 `tests/acceptance/tools/v2-install-legacy.mjs` 也从 FAIL 转为 `all assertions passed`。

两条顺带修掉的健壮性问题（都实测过）：① profile 的 `package.json` 若带 UTF-8 BOM（Windows 编辑器会这么存），`JSON.parse` 会抛——`install.mjs` 与 `migrate-profile.mjs` 现在都先剥 BOM（`verify.mjs`/`check-pack.mjs` 早已如此）；② `migrate-profile.mjs` 在**没有 `node_modules` 目录**的 profile 上建 junction 会 ENOENT，现在先 `mkdirSync`。

手动迁移步骤（其他机器/其他 profile 适用）见 [README.zh.md 的「从旧版迁移」](README.zh.md#从旧版迁移01x--020) 与 [docs/advanced-install.zh.md](docs/advanced-install.zh.md)。要点：退出应用 → 删掉 `cordis.patch.yml` 里 `- id: side-chat / name: dsh-side-chat` 那条 → 删掉 profile `package.json` 里的旧依赖 → **把 `dsh-side-chat-plugin` 加进 `dsh.profile.bundles`** → 删掉 `node_modules/dsh-side-chat` → 重启。**旧行不能留**：npm 上那个 `dsh-side-chat` 用的就是 `side-chat` 这个 id，同 id 插两次会崩溃。注意 `desktop` profile 被应用托管，`plugin_manager` 工具与 `dsh plugin` CLI 都不能代管它，迁移只能手改 profile。

**P3 仍未验证（不要当成已完成）**

- macOS / Linux：**未实机**，只做过代码审查（未见平台专有假设）。
- 浏览器端**实际渲染**：**已于 2026-09-30 08:28 用 headless Chrome 截图确认**（见 §2「渲染证据」）。在此之前它确实是未验证项。
- `npm publish` 的真实返回码（E403/ownership）：**未实测**，只能从 registry 元数据推断。
- `dsh plugin --profile desktop ...` 的原文报错：**已实测确认存在**（`error: profile "desktop" is managed exclusively by the Electron application`，exit 1）。

## 4. 已知风险与遗留项

- **npm 上另有一个 `dsh-side-chat`，是别人的插件**（"并行侧边对话"）。任何文档/命令里出现裸 `dsh-side-chat` 都会让用户装错包；行 id 撞车还会崩溃。已在 README/CONTRIBUTING/进阶安装里显式警告。
- **本机 registry 是 npmmirror 镜像**：`pnpm publish` 必须显式 `--registry=https://registry.npmjs.org`，否则会推错地方。
- **真实的信任边界是 DSH 的浏览器凭据，不是插件策略**：实测不带凭据的请求在到达插件前就被 DSH 拒为 401（`GET /`、`GET|POST /side-chat/ask` 都一样），插件的 `trust` 只是在 Host 放行之后再加一层（拦跨站 `Origin` 等）。所以不要把 `trust` 当成网络级防护；也不要在这条路由前面再叠一个会**改写地址**的反向代理（那会让同源判定失效，需要显式放宽）。
- **插件不写盘、无遥测**：不写会话日志/缓存/临时文件，只发一次模型请求（走主对话同一服务商）。
- **没有工具能力**是设计取舍：DSH 目前没有「临时 Session」概念，所以侧边聊天只回答问题，不能执行命令或改文件。
- **`packageManager` 字段在 pack 后会被 npm/pnpm 剔除**（信息项，不影响运行）。
- **CI 已覆盖** Node 22/24：`install --frozen-lockfile → typecheck → test → build → pack + check-pack → dist/ 与源码一致 → 空 DSH_HOME 上 verify 必须 exit 1`。

### 踩坑记录：CI 门禁的跨平台假设必须显式验证

第一次 CI 红，是我自己加的门禁写错了，而且**我在本地"验证"过它通过**——那次验证什么也没证明，因为我的复现和打包发生在同一台 Windows 上。

1. **第一版门禁**：`test "$(sha256sum fresh.tgz)" = "$(sha256sum dist/*.tgz)"` —— 要求**逐字节相等**。
   实际：`dist/` 那个包在 Windows 上打，CI 在 Ubuntu 上重打。**gzip 头第 9 字节是 OS 标识**（实测 Windows `0x0a`、Unix `0x03`），且 gzip 头还带 mtime。结果：**文件内容完全一致（15/15 成员逐字节相同），哈希却不同** → 一个正确的发布被判失败。
2. **第二版门禁**：改成比对"内容摘要"。第一次实现又错了两处，都是我在本地才发现、CI 还没机会红的：
   - 用 `tar -tzf` 列成员，把**目录条目**也算了进去。`pnpm pack` 不写目录条目，而用普通 `tar` 重新打包会多出 `package/`、`package/lib/` 等 4 条 → 同样内容、摘要不同。
   - 用 `tar -tvzf` 解析文件类型，但 **bsdtar（Windows）与 GNU tar 的列表格式不同**，解析直接崩。
   最终实现：**解包到临时目录、遍历真实文件树、按排序后的相对路径逐个读字节**——完全不依赖 tar 的列表格式、成员顺序或 gzip 封装。
3. **验证方式**（这才是有效的那种）：构造"另一个平台打包"的样本——解包再重打，确认 ① 两者逐字节不同、② 内容摘要相同、③ 故意改一个文件后摘要必然不同。三条都过才算数。

教训：**门禁脚本本身要有"它必须能失败"的测试**。一个永远通过（或不通过）的检查，比没有检查更糟，因为它会让人以为已经被保护了。

## 5. 结论

**能发布：代码与打包层面已就绪（typecheck / 237 测试 / pack+check-pack 全绿）；发布前只差用户侧的 npm 发布、重启后的三项真机终验、以及本机 profile 的旧行迁移。**
