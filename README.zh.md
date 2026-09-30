# dsh-side-chat-plugin（侧边聊天）

[English](README.md) | 中文

[![CI](https://github.com/Breezes-messager/dsh-side-chat/actions/workflows/ci.yml/badge.svg)](https://github.com/Breezes-messager/dsh-side-chat/actions/workflows/ci.yml)

给 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 加一个**临时侧边聊天**：它挂在右侧栏，可以就当前这轮对话、某一条回答、或者你刚选中的一段文字提问。关掉应用，它就没了。

```
        ⊕
    侧边聊天
侧边聊天是临时聊天，关闭应用后会消失。
```

这个交互来自 OpenAI Codex 的 side chat（从某条消息开一个临时对话、关掉应用即消失）。本仓库用 DeepSeek Harness 自己的公开扩展点重新实现了它，代码不是移植来的。

---

## 目录

- [它是什么、长什么样](#它是什么长什么样)
- [安装](#安装)
- [从旧版迁移（0.1.x → 0.2.0）](#从旧版迁移01x--020)
- [怎么用](#怎么用)
- [确认装好了](#确认装好了)
- [常见问题](#常见问题)
- [配置](#配置)
- [平台支持与已知限制](#平台支持与已知限制)
- [隐私与安全](#隐私与安全)
- [开发与贡献](#开发与贡献)
- [许可](#许可)

---

## 它是什么、长什么样

装上之后，Harness 的**右侧栏多出一种标签页**，名字叫「侧边聊天」。它和其他标签页一样可以停靠、浮动、拆分、关闭。

它和主对话的区别只有一个：**临时**。侧边聊天的问答只存在于当前页面的内存里，不写进会话历史、不进导出、不进搜索；重载窗口就清空，关掉应用就当没发生过。

回答按 Markdown 渲染：标题、有序/无序列表（含嵌套）、表格、引用、分隔线、`http(s)`/`mailto` 链接，以及带语法高亮的代码块都会正常显示。

你可以用它来：

- 就**当前这轮对话**追问一句，不想把这个问题留在正式记录里；
- 就**某一条回答**单独提问（比如「这段代码到底在干什么？」）；
- 就**主对话里选中的一段文字**提问；
- 把侧边聊天当草稿纸，问点跑题的东西，然后直接关掉。

它**不能**做的事：执行命令、改文件、联网查资料。它只会回答问题——原因见[已知限制](#平台支持与已知限制)。

---

## 安装

> [!IMPORTANT]
> **这个包还没有发布到 npm**（截至 2026-09-30），所以下面的**方式三无法使用**。请用**方式一：预构建包**——不需要 npm 账号，也不需要 Node 或 pnpm。

### 先确认两件事

1. 你的 DeepSeek Harness 能正常用：打开一个对话，发一句话，能收到回答。**侧边聊天借用主对话的同一条模型通道**，主对话不能用，它也不能用。
2. 你的 Harness 有浏览器界面：**桌面应用**，或者在浏览器里打开的 **DSH Web 版**。这个插件的界面是网页，纯终端界面里看不到它。

### 方式一：预构建包（推荐 —— 不需要 npm 账号）

适合所有人。不需要命令行，也不需要装 Node 或 pnpm。

1. **下载预构建包。** 打开这个页面并点下载按钮：

   <https://github.com/Breezes-messager/dsh-side-chat/blob/main/dist/dsh-side-chat-plugin-0.2.0.tgz>

   或者用命令行下载（两种平台都适用）：

   ```sh
   curl -L -o dsh-side-chat-plugin-0.2.0.tgz https://raw.githubusercontent.com/Breezes-messager/dsh-side-chat/main/dist/dsh-side-chat-plugin-0.2.0.tgz
   ```

   想先确认下载完整，校验一下——把结果与 **[dist/README.md](dist/README.md) 里 `SHA-256` 那一行**对比，两者必须一致：

   ```sh
   node -e "const c=require('node:crypto'),f=require('node:fs');console.log(c.createHash('sha256').update(f.readFileSync(process.argv[1])).digest('hex').toUpperCase())" dsh-side-chat-plugin-0.2.0.tgz
   ```

   > 这里刻意**不写死哈希值**：每次重新打包哈希都会变，写死就会过期，而过期的校验值会让用户误以为下载坏了。`dist/README.md` 由 `node scripts/release-current.mjs --write` 自动生成，永远对应当前那个包，CI 也会在两者不一致时失败。

2. 打开 DeepSeek Harness。
3. 在**左侧栏**找到「插件」（英文界面是 **Plugins**），点开。
4. 点「**添加插件**」（**Add plugin**）。
5. 在「包名或地址」里填**你刚下载那个文件的绝对路径**：
   - Windows：`C:\Users\<你>\Downloads\dsh-side-chat-plugin-0.2.0.tgz`
   - macOS / Linux：`/Users/<你>/Downloads/dsh-side-chat-plugin-0.2.0.tgz`
6. 点「**安装**」→ 需要的话再点「**立即启用**」→ **重载界面**（`Ctrl+R` / `Cmd+R`）。

这条路径**不需要 npm 账号，安装时也不需要联网**：这个包没有运行时依赖，宿主半边需要的代码已经全部内联在包里。

> 也可以试着在输入框里直接填下载 URL。**这一条我未能在本机验证**（开发环境的沙箱不允许子进程连本机 HTTP，而按 URL 取包需要子进程联网），所以如果它失败，请按上面第 1 步先下载成文件、再填绝对路径——那是本机验证过的做法。

### 方式二：从源码安装

适合：包还没发布到 npm；或者你想自己改代码。

前置条件：**Node.js 22 或更高**、**pnpm 11**。检查一下：

```sh
node -v
pnpm -v
```

> Windows PowerShell 用户注意：`pnpm` 也可能被执行策略拦下（报「因为在此系统上禁止运行脚本」），此时把命令里的 `pnpm` 换成 **`pnpm.cmd`** 即可；本页其它 `pnpm ...` 命令同理。说明见[常见问题](#常见问题)。

Windows PowerShell、macOS、Linux 通用（逐条复制）：

```sh
git clone https://github.com/Breezes-messager/dsh-side-chat.git
cd dsh-side-chat
pnpm install
pnpm build
node scripts/install.mjs
```

最后一步会：构建插件 → 用 pnpm 把本仓库链接进 profile → 在 profile 里声明依赖 → 确保 DSH 会加载它（如果这个 profile 已经把它选为组合包，就跳过写插件行）。

装到哪个 profile，按这个顺序决定：`--profile <名字>` → 环境变量 `DSH_PROFILE` → `$DSH_HOME/profiles` 下**唯一**的 profile → 唯一一个已经链接了本仓库的 profile。想明确指定：

```sh
node scripts/install.mjs --profile web
node scripts/install.mjs --profile web --home "D:\dsh-home"
node scripts/install.mjs --profile desktop --no-build
```

（`--no-build` 表示跳过构建，用在已经 `pnpm build` 过的时候。不带这个参数时，脚本自己也会构建一次——上面的 `pnpm build` 只是让你先确认构建能通过。）

装完同样**重载界面**。

> 另一条同样不用手改文件的源码路径：先 `pnpm install && pnpm build`，然后打开应用里的「添加插件」，在输入框里填**这个仓库目录的绝对路径**（例如 `C:\Users\你\dsh-side-chat` 或 `/Users/你/dsh-side-chat`）。二选一，不要和 `node scripts/install.mjs` 叠加使用；同样地，用 `node scripts/install.mjs` 装过之后**不要**再去插件页点「立即启用」——两条路都会插入同一个 Loader 行，插入两次会崩溃。

> 进阶场景——命令行安装、手动安装、私有 npm 源、完全离线的机器：见 [docs/advanced-install.zh.md](docs/advanced-install.zh.md)。

### 方式三：从 npm 安装（尚未可用）

适合所有人。不用命令行，不用改任何文件。

1. 打开 DeepSeek Harness。
2. 在**左侧栏**找到「插件」（英文界面是 **Plugins**），点开。
3. 点页面上的「**添加插件**」（**Add plugin**）。
4. 在「包名或地址」输入框里填：

   ```
   dsh-side-chat-plugin
   ```

5. （可选）展开「**安装源**」，选「**中国大陆镜像源**」下载会快一些；默认是 npm 官方源。
6. 点「**安装**」。
   - 你会看到进度界面；结束后显示包名和版本。
   - 如果失败，界面会给出一句说明（网络不通、包名写错、源不可用……），并保留输入内容让你改。
7. 点「**立即启用**」（如果错过了，就在「已安装」列表里找到 `dsh-side-chat-plugin` 这张卡片，把它打开）。
8. **重载界面**：桌面应用按 `Ctrl+R`（macOS 是 `Cmd+R`），或者直接关掉应用再打开。

之后就装好了。右侧栏里应该已经出现「侧边聊天」。

> 为什么不用手动改配置文件：这个包自带 DSH 的**组合包声明**（bundle）。插件页安装时会把它装进当前 profile；点「立即启用」后，DSH 直接应用包内自带的插件行。你不需要碰 `cordis.patch.yml`。

### 它装到了哪个 profile

DSH 的每个 profile 是 `$DSH_HOME/profiles/<名字>` 下面的一个目录，`$DSH_HOME` 默认是：

- Windows：`C:\Users\<你的用户名>\.dsh`
- macOS / Linux：`~/.dsh`

| 你怎么用 DSH | profile 名 |
| --- | --- |
| 桌面应用 | `desktop` |
| `dsh web` | `web` |
| 其他命令行启动 | 你 `--profile` 后面写的那个名字 |

安装脚本按上面的顺序自动选择 profile（本机通常就是 `desktop`）。桌面应用的 profile 由应用自己管理，**不要**用 `dsh plugin --profile desktop ...` 命令去装（应用会拒绝，见[常见问题](#常见问题)）。

> 用命令行启动 `dsh web` 的话，浏览器里的「插件」页一样能用，直接用方式一即可。只有纯终端 profile 才需要命令行安装，步骤见 [docs/advanced-install.zh.md](docs/advanced-install.zh.md)。

### 卸载

**推荐做法**：左侧栏「插件」→ 找到 `dsh-side-chat-plugin` 卡片 → 「卸载」→ 确认 → 重载界面。

**手动做法**（比如插件页里没有卸载按钮时，先看自己当初是哪种装法）：

- **用插件页装的（组合包路线）**：`cordis.patch.yml` 里没有本插件的插入行，不用打开它，直接做下面第 1 步。
- **当初手写 `- insert:` 行装的**：先打开 `$DSH_HOME/profiles/<profile>/cordis.patch.yml`，删掉 `id` 为 `dsh-side-chat-plugin` 的那一行。

1. 打开同目录的 `package.json`：从 `dependencies` 里删掉 `"dsh-side-chat-plugin"`，**并把它从 `dsh.profile.bundles` 里删掉**（这一项不能省：名字留在列表里，profile 下次启动仍会去加载这个组合包）。
2. 删除 `$DSH_HOME/profiles/<profile>/node_modules/dsh-side-chat-plugin`。
3. 重载界面；宿主半边如果还生效，重启应用。

---

## 从旧版迁移（0.1.x → 0.2.0）

**这一节只给装过插件 0.2.0 之前版本的人看。** 旧版本包名是 `dsh-side-chat`，Loader 行 id 是 `side-chat`；从插件 0.2.0 起两者都改成 `dsh-side-chat-plugin`。

> **先把版本号分清。** 这一节里的「0.1.x / 0.2.0」指**本插件自己的版本**（旧包名 `dsh-side-chat` → 新包名 `dsh-side-chat-plugin`），与 **DSH 的版本**无关（本机是 DSH `0.2.0-rc.2`），你不需要为此升级 DSH。想知道自己装的是哪一版：在 profile 目录里跑 `node -e "console.log(require('./package.json').dependencies)"`——看到 `dsh-side-chat` 是旧版，看到 `dsh-side-chat-plugin` 是新版；已经装上新名的话，`node -e "console.log(require('./node_modules/dsh-side-chat-plugin/package.json').version)"` 会打印插件版本（本机是 `0.2.0`），插件页卡片上也会写。

⚠️ **安装时请填 `dsh-side-chat-plugin`，不要填 `dsh-side-chat`。** npm 上的 `dsh-side-chat` 是**别人的**另一个插件（"并行侧边对话"），而且它用的行 id 也是 `side-chat`——与本插件的旧 id 相同，两者同时生效会重复注册同一个 id 而崩溃。改名就是为了彻底分开。

⚠️ **迁移必须四步齐全，缺一不可：① 删掉旧的 Loader 行 → ② 把 profile 的依赖换成新名 → ③ 把 `dsh-side-chat-plugin` 加进 `dsh.profile.bundles` → ④ 删掉旧包目录并重启应用。** 最容易漏的是第 ③ 步；漏掉它**不会报错，插件会彻底消失**：手写的旧行删掉了（①），组合包的行又不会来（③ 没做），右侧栏没有「侧边聊天」标签页，`POST /side-chat/ask` 返回 404，控制台里也没有一条能看懂的红色报错。

**为什么第 ③ 步不能省。** `dsh-side-chat-plugin` 是 DSH 的**组合包**（bundle）：包内 `cordis.patch.yml` 里那条 `id` / `name` 都是 `dsh-side-chat-plugin` 的 Loader 行，**只有在这个 profile 的 `dsh.profile.bundles` 列表里选中了它，才会被应用**。依赖躺在 `node_modules` 里而没有被选中的组合包**不会被加载**——实测：依赖已装好、组合包未选中时，DSH 合成出的配置树里没有本插件的任何一行；把包名加进 `dsh.profile.bundles` 后，合成树里才出现 `# == dsh-side-chat-plugin` 与 `- id: dsh-side-chat-plugin` / `name: dsh-side-chat-plugin`。（`dsh.profile.bundles` 是**有序**列表，新包名追加到末尾。）

**开始之前：** 完全退出桌面应用（`dsh web` 就停掉那个进程）——第 4 步要删目录下的文件。下面四步一次做完，再启动应用。

1. **删掉旧的 Loader 行。** 打开 `$DSH_HOME/profiles/<profile>/cordis.patch.yml`，删掉下面这段（如果你当时是手写的）：

   ```yaml
   - insert:
       - id: side-chat
         name: dsh-side-chat
   ```

   如果你用的是旧的 `- id: side-chat` 配置覆盖（比如写了 `trust:` 或 `provider:`），也一并删掉：新版本不再匹配这个 id，它会**静默失效**。

   打开这个文件（桌面 profile；其它 profile 把 `desktop` 换成你的 profile 名）：

   Windows PowerShell：

   ```powershell
   notepad "$env:USERPROFILE\.dsh\profiles\desktop\cordis.patch.yml"
   ```

   macOS / Linux：

   ```sh
   ${EDITOR:-vi} "$HOME/.dsh/profiles/desktop/cordis.patch.yml"
   ```

2. **把 profile 的依赖换成新名。** 打开同目录的 `package.json`：从 `dependencies` 里删掉 `"dsh-side-chat"`，并确认新名 `"dsh-side-chat-plugin"` 在里面（用应用内[方式一](#方式一推荐在-dsh-应用里安装)安装、或下面的手工安装，都会把它写进去）。

   手工安装（在 profile 目录里执行，已发布到 npm 的版本）：

   Windows PowerShell：

   ```powershell
   Set-Location "$env:USERPROFILE\.dsh\profiles\desktop"
   pnpm add dsh-side-chat-plugin
   ```

   macOS / Linux：

   ```sh
   cd "$HOME/.dsh/profiles/desktop"
   pnpm add dsh-side-chat-plugin
   ```

   要手工编辑 `package.json`：Windows PowerShell 用 `notepad "$env:USERPROFILE\.dsh\profiles\desktop\package.json"`，macOS / Linux 用 `${EDITOR:-vi} "$HOME/.dsh/profiles/desktop/package.json"`。从源码 checkout 用 `link:` 安装的写法见 [docs/advanced-install.zh.md 第 2 节](docs/advanced-install.zh.md#2-手动安装到桌面-profile)。

3. **把 `dsh-side-chat-plugin` 追加进 `dsh.profile.bundles`（关键一步，最容易漏）。** 打开同一个 `$DSH_HOME/profiles/<profile>/package.json`，在 `dsh.profile.bundles` 数组的**末尾**加上 `"dsh-side-chat-plugin"`；数组里已有的其它包名**一律不要动**。追加后这一段应该长这样（文件其它字段保持原样；`"……"` 那一项代表你原有的内容，照抄不动）：

   ```json
   {
     "dsh": {
       "profile": {
         "bundles": [
           "……这里是你原有的组合包，照抄不动……",
           "dsh-side-chat-plugin"
         ]
       }
     }
   }
   ```

   改完确认一下（预期看到数组里含 `'dsh-side-chat-plugin'`）：

   Windows PowerShell：

   ```powershell
   Set-Location "$env:USERPROFILE\.dsh\profiles\desktop"
   node -e "console.log(require('./package.json').dsh.profile.bundles)"
   ```

   macOS / Linux：

   ```sh
   cd "$HOME/.dsh/profiles/desktop" && node -e "console.log(require('./package.json').dsh.profile.bundles)"
   ```

   > 选好组合包之后，Loader 行由包内自带的 `cordis.patch.yml` 提供——**不要**再手写 `- insert:` 行，同一行插入两次会崩溃。
   >
   > 如果这个 profile 里**根本没有** `dsh.profile.bundles`（说明它从未被初始化过），先照[进阶安装文档第 1 节](docs/advanced-install.zh.md#1-命令行安装web-等非桌面-profile)把它建起来，再追加包名。**只把包装进 `node_modules` 是不够的。**

4. **删掉旧包目录，然后启动应用**（注意路径末尾是旧包名 `dsh-side-chat`，没有 `-plugin`）：

   Windows PowerShell：

   ```powershell
   Remove-Item -Recurse -Force "$env:USERPROFILE\.dsh\profiles\desktop\node_modules\dsh-side-chat"
   ```

   macOS / Linux：

   ```sh
   rm -rf "$HOME/.dsh/profiles/desktop/node_modules/dsh-side-chat"
   ```

   然后启动应用（或 `dsh web`），并**重载界面**（`Ctrl+R` / `Cmd+R`）。如果新包是到这时候才通过应用内[方式一](#方式一推荐在-dsh-应用里安装)安装的，装完**回到第 3 步再确认一次** `dsh.profile.bundles` 里有 `"dsh-side-chat-plugin"`。

   右侧栏应该出现「侧边聊天」；手边有仓库 checkout 的话，也可以在仓库目录里跑 `pnpm run verify` 复核一遍。

更细的手工步骤（含手工卸载与离线安装）见 [docs/advanced-install.zh.md](docs/advanced-install.zh.md#5-从旧名迁移01x--020)。

---

## 怎么用

### 三种打开方式

**入口 1：会话标题栏。** 打开任意一个对话，标题栏（会话名称那一行）上有「**侧边聊天**」按钮，点它，右侧栏出现面板。

**入口 2：某一条回答。** 把鼠标移到任意一条**已经回答完的**助手消息上，动作栏里会出现一个气泡图标（悬停提示「在侧边聊天中提问」）。点它，面板打开，并且**自动带上这条回答作为上下文**——面板底部会显示「已引用所选消息作为上下文」。

**入口 3：选中的文字。** 在主对话里用鼠标选中一段文字（至少 2 个字符），选区上方会浮出「**在侧边聊天中提问**」按钮。点它，面板带着这段文字打开，底部显示「询问选中的内容」和一小段预览。

> 浮动按钮在滚动页面或改变窗口大小后会消失，这是有意的——选区变了，问题也就变了。选好了直接点。

你也可以把它当作普通标签页：从右侧栏的标签页菜单里打开「侧边聊天」。

### 面板里的操作

| 操作 | 怎么做 |
| --- | --- |
| 提问 | 在底部输入框打字，按 `Enter` 发送 |
| 换行 | `Shift+Enter` |
| 中途停止回答 | 回答过程中，右下角「发送」会变成「**停止**」，点它（按 `Esc` 也行） |
| 关闭面板 | 没有回答在跑的时候按 `Esc`，或者像关普通标签页那样关掉它 |
| 看这次带了什么上下文 | 输入框上方那一行会写清楚：引用某条消息 / 带上最近对话 / 询问选中的内容 |
| 去掉上下文 | 点那一行右侧的 `×`，改回「已带上当前对话的最近内容作为上下文」 |
| 清空这段临时对话 | 右下角「**清空**」（只清侧边聊天，不影响主对话） |

输入法（中文、日文、韩文）选字时的回车不会误发送。

回答很长、正在流式输出时，面板会自动跟着最新的字走；但只要你往上滚了一下，它就不再往下拽——想回到最新，滚到底即可。

**每个主对话有自己的一条侧边聊天。** 换一个对话再打开面板，就是一条全新的临时对话。

---

## 确认装好了

按顺序检查，任何一步不过见[常见问题](#常见问题)：

1. 左侧栏「插件」→「已安装」里能看到 `dsh-side-chat-plugin` 卡片，状态是启用。
2. 打开任意一个对话，标题栏能看到「侧边聊天」按钮。
3. 点它，右侧栏出现「侧边聊天」标签页，底部有一个可输入的输入框。
4. 随便问一句（比如「你好」），能看到回答一个字一个字地出现。
5. （开发者可选）在仓库目录里运行 `pnpm run verify`（PowerShell 里用 `pnpm.cmd run verify`）：它会检查构建产物是否存在、包声明是否完整、profile 里有没有本插件的插件行，并试着探测本机 DSH 的端口。
6. 没有仓库也能自查。在 `$DSH_HOME/profiles/<profile>` 目录里（桌面 profile 就是 `C:\Users\<你>\.dsh\profiles\desktop`）跑下面几条，逐条对照括号里的预期：
   - `node -e "console.log(require('./package.json').dependencies)"` —— 预期看到 `dsh-side-chat-plugin`（值可能是 `link:...` 路径，也可能是版本号）。
   - `node -e "console.log(require('./package.json').dsh.profile.bundles)"` —— 预期数组的**最后一项**是 `'dsh-side-chat-plugin'`。
   - `node -e "console.log(require('./node_modules/dsh-side-chat-plugin/package.json').version)"` —— 预期打印插件版本号（本机是 `0.2.0`）。
   - 列目录：Windows PowerShell 用 `Get-ChildItem node_modules\dsh-side-chat-plugin`，macOS / Linux 用 `ls node_modules/dsh-side-chat-plugin` —— 预期列出包里的文件（至少能看到 `package.json`），而不是报「路径不存在」。

---

## 常见问题

### 装不上 / 找不到入口

**左侧栏没有「插件」入口。**
你的 DSH 版本可能较老。请升级到近期的 DSH 桌面版；或者改用[方式二](#方式二从源码安装)在命令行里安装。

**插件页显示「本部署没有可管理的 profile，无法安装或启停插件」。**
你打开的是没有 profile 管理能力的部署（例如从命令行临时启动的实例）。请用桌面应用安装，或用[方式二](#方式二从源码安装)。

**安装时报「这个包没有声明组合包，无法作为插件安装」。**
你手里的包不带组合包声明，通常是因为版本太旧。请确认安装的是最新发布的 `dsh-side-chat-plugin`；如果是从源码改过的，请改用[方式二](#方式二从源码安装)。

**在插件页填 `dsh-side-chat-plugin`，提示找不到这个包。**
这个包目前还没有发布到 npm（截至 2026-09-30）。请改用[方式二](#方式二从源码安装)从源码安装，或者等发布后再用方式一。

**Windows PowerShell 里运行 `dsh` 或 `pnpm` 报「因为在此系统上禁止运行脚本」。**
PowerShell 默认禁止运行 `.ps1` 脚本，`dsh` 和 `pnpm` 都可能中招。两个办法：把命令里的 `dsh` / `pnpm` 换成 **`dsh.cmd`** / **`pnpm.cmd`**（例如 `dsh.cmd plugin --profile web add dsh-side-chat-plugin`、`pnpm.cmd run verify`），或者放宽本机脚本策略——`Set-ExecutionPolicy -Scope CurrentUser RemoteSigned`。后者是放松本机安全策略，是否接受请你自己判断。

**`dsh plugin --profile desktop ...` 报「profile "desktop" is managed exclusively by the Electron application」。**
这是 DSH 的设计：桌面应用的 profile 只由应用自己管理。桌面端请用应用内的「插件」页安装；`dsh plugin` 命令只适用于 `web`、`cc-tui` 等非桌面 profile。

### 装上了但看不见

**右侧栏没有「侧边聊天」。**
按顺序试：

1. 重载界面：`Ctrl+R` / `Cmd+R`；不行就关掉应用重开。
2. 回到「插件」页，确认 `dsh-side-chat-plugin` 卡片是启用状态。
3. 打开浏览器控制台（桌面应用按 `Ctrl+Shift+I`）看有没有 `dsh-side-chat-plugin` 开头的红色报错，把它贴进 issue。

**点了「侧边聊天」按钮，界面提示「侧边聊天暂时打不开」。**
你现在没有打开任何对话，面板没有地方挂。打开一个对话，再点一次。

**点了「侧边聊天」按钮，右侧栏没反应，也没有提示。**
先看控制台有没有报错。如果右侧栏当前处于折叠状态，标签页可能开在看不见的地方——把它展开。

### 能打开但用不了

**提示还没有可用的模型，或者问了没有回答。**
侧边聊天借用你**当前对话**用过的模型。请先在这个对话里正常发一条消息并收到回答，再回到侧边聊天提问。如果主对话本身就不通，先修主对话（设置 → 模型）；也可以按[配置](#配置)写死 `provider` 和 `model`。

**提示「这次提问被拒绝了」（HTTP 401 / 403）。**
默认策略 `same-origin` 下，插件拦住的是**跨站网页**：带 `Origin` 的请求必须与本机所访问地址同源，否则 403；`Origin: null` 也拒绝；来自另一台机器的调用拒绝。**不带 `Origin` 的请求**（`curl`，以及桌面应用的 Electron 转发——它会删掉 `Origin`、只补回 Host 的 cookie）交给 DSH 自己的信任检查：DSH 拒绝就按其状态码拒绝，DSH 没意见就放行。所以 401 / 403 可能来自四处：插件的同源策略、DSH 自己的信任检查、一个要求凭据的 `trust: host` 配置、以及反向代理改写了地址导致页面源与服务端地址不一致。细节见[隐私与安全](#隐私与安全)；如果你确实需要从别的机器或别的页面调用，请按那一节把 `trust` 改成 `host` 或 `open`，并自行保护那条访问路径。先在界面里刷新一次再试；如果你是通过网络地址访问 DSH 的，请确认地址与登录状态。

**提示「同时进行的提问太多了」（HTTP 429）。**
侧边聊天的并发回答有上限（默认 4 个）。等一个回答结束再问。

**回答中途自己停了，提示这次回答失败。**
可能是单次回答超过了时间上限（默认 10 分钟），也可能是模型服务本身出错。可以换个说法重问；如果总是超时，把配置里的 `timeoutMs` 调大。

**回答到一半断了，或者点「停止」后再问没反应。**
重载界面即可恢复（临时对话会清空，这是设计如此）。

**回答里的代码块没有颜色 / 语言不认识。**
语法高亮内置了一组常用语言（TypeScript/JavaScript、JSON、Python、Bash、PowerShell、HTML/XML、CSS、Markdown、SQL、YAML、Go、Rust、Java、C++、INI/TOML、diff）。别的语言按纯文本显示，功能不受影响。

**关掉应用后我的提问还在？**
侧边聊天本身不会留下任何记录。如果你在会话历史里看到类似内容，那是主对话的消息，不是侧边聊天的。

---

## 配置

**绝大多数人不需要配置。** 需要时，编辑这个文件：

```
$DSH_HOME/profiles/<profile>/cordis.patch.yml
```

（Windows 上通常是 `C:\Users\<你>\.dsh\profiles\desktop\cordis.patch.yml`。）

在文件末尾追加一段按 `id` 定位的覆盖。例如把模型固定成你在设置里看到的服务商与模型名：

```yaml
- id: dsh-side-chat-plugin
  config:
    provider: deepseek-account
    model: deepseek-flash
```

如果你的浏览器**不在**运行 DSH 的这台机器上（或者你用了会改写地址的反向代理），就需要放宽默认策略：

```yaml
- id: dsh-side-chat-plugin
  config:
    trust: host
```

保存后，宿主半边通常会被热加载；如果没有生效，重启应用。

| 配置项 | 默认值 | 作用 |
| --- | --- | --- |
| `provider` / `model` | 跟随当前会话 | 固定用哪个服务商和模型回答侧边聊天。两个必须一起写。 |
| `trust` | `'same-origin'` | 谁能调用这个插件。`same-origin`（默认）= 带 `Origin` 的请求必须与本机所访问地址同源，跨站网页与 `Origin: null` 一律 403；**不带 `Origin` 的请求交给 DSH 自己的信任检查**（桌面应用就是这样工作的，所以默认设置下桌面端正常可用）；非本机请求拒绝。`host` = 完全交给 DSH 自己的信任检查、不看 `Origin`；`open` = 不检查。详见[隐私与安全](#隐私与安全)。 |
| `timeoutMs` | `600000`（10 分钟） | 单次回答的时间上限，毫秒；超时会中止这次回答。`0` 表示不限制。 |
| `maxConcurrent` | `4` | 同时进行的侧边聊天回答上限；超出的请求会被拒绝（429）。 |
| `maxBodyBytes` | `262144`（256 KB） | 单次请求体的字节上限；超过会返回 413。一般不用改。 |
| `recentMessages` | `20` | 没指定具体消息时，最多折叠最近多少条主对话消息作为上下文。 |
| `maxMessageChars` | `4000` | 单条上下文消息最多取多少字符。 |
| `maxContextChars` | `24000` | 整段上下文最多多少字符。 |

---

## 平台支持与已知限制

**支持**

- DeepSeek Harness 桌面应用（Windows / macOS / Linux）——主要目标。
- 浏览器里的 DSH Web 界面。
- 本项目针对 DSH `0.2.0-rc.2` 系列开发与验证。

**不支持**

- 纯终端界面（如 `cc-tui`）：插件的界面是网页，终端里不会出现面板。
- Codex 那种「能调工具的侧边 agent」：那需要一个临时会话（Session），而 DeepSeek Harness 目前没有这个概念。侧边聊天只回答问题，不能执行命令、不能改文件。

**已知限制**

- **只支持已完成的助手消息**：被打断、还没收尾的消息没有持久化 id，不能作为提问目标。
- **上下文有上限**：最近 20 条消息、单条 4000 字符、整段 24000 字符，选中文字上限 8000 字符。
- **每次回答只发一次模型请求**：没有多轮工具循环，也不会自动压缩记忆；追问靠把历史一起发过去。
- **面板按会话隔离**：换一个对话就是新的一条临时对话。
- **高亮语言集固定**：见[常见问题](#能打开但用不了)。
- **不写任何记录**：重载界面就清空——这是特性，不是缺陷。

---

## 隐私与安全

**不落盘。** 这个插件没有任何一处以写入方式打开文件：不写会话日志、不写投影缓存、不建临时文件。侧边聊天的内容只活在当前页面内存里，随窗口一起消失，所以它不会出现在会话历史、导出或搜索里。

**离开这台机器的内容。** 每个问题会发出一次模型请求，走 Harness 自己的模型服务：你的问题、这段临时对话的历史，以及从当前会话折叠出来的上下文——最多最近 20 条消息、单条 4000 字符、合计 24000 字符，再加上你选中的文字（上限 8000 字符）。它发往**你主对话本来就在用的同一个服务商**。插件不带遥测，也不会自己发起任何对外请求。

**谁能调用它（请务必读这一段）。**

- 插件默认（配置项 `trust` 的默认值 `same-origin`）分两种情况判断：
  - **请求带 `Origin` 时**：必须与本机所访问地址同源，否则 403。其它网站的页面朝你的 DSH 端口发请求、以及 `Origin: null` 的沙箱页面，都在这里被拦下——浏览器对跨站请求必定会带上 `Origin`，页面也无法把它藏起来，所以这对网页是真正的防线。
  - **请求不带 `Origin` 时**：它背后没有页面，交给 DSH 自己的信任检查（`connection.requestRejection`）判断：DSH 明确拒绝就按其状态码拒绝（401 / 403），DSH 没有意见就放行。**桌面应用的请求正是这种形态**——Electron 转发时会删掉 `Origin`、只补回 Host 的认证 cookie——所以桌面端在默认设置下正常可用，不需要额外配置。
  - 此外，来自**其它机器**的请求一律拒绝（它们不经过 loopback）。
  - 这套策略比只做 Host 检查的 `trust: host` **更严**：`host` 连跨站 `Origin` 都不看。
  - **它不是什么。** 本机上的程序可以自己伪造请求头，所以它挡住的是「网页借你的浏览器发起调用」和「无意的调用」，而不是**存心**要调用这个路由的程序。真正把这类调用挡在外面的是 DSH 自己那个**带签名的浏览器凭据**：实测中不带凭据的请求会先被 DSH 拒绝（401），根本到不了插件。
- 想改就配置项 `trust`：
  - `host`：完全交给 DSH 自己的信任检查，**不看 `Origin`**（所以跨站网页也一并放行）。在实测的 DSH 版本上，宿主要求那个带签名的浏览器凭据：**没带凭据的调用会被拒绝（401 / 403）**。只有当你确定宿主没有配置任何信任检查时，这个模式才会放行所有本机调用；那种情况下第一次放行会在应用日志里留下一条 `side-chat:` 开头的警告。需要放宽到「跨站网页也能调」时才选它。**浏览器不在本机时不能用它**——非 loopback 的调用会被插件按「来自其它机器」拒绝（见下一行）。
  - `open`：完全跳过信任检查。只在你已经用前置代理等方式做过认证、或本地开发调试时使用。
- **要从另一台机器访问 DSH？** 默认策略会拒绝这类调用（它们不经过 loopback），请显式改成 `trust: host` 或 `trust: open`，并确保那条访问路径本身有认证。
- 因此建议：**不要把 DSH 的 Web 端口暴露到本机之外**（不要做端口转发、不要让它在 `0.0.0.0` 上对外监听），除非你已经按上面的说明明确选择并保护了某种模式。
- 环境变量 `DSH_SIDE_CHAT_ALLOW_LOOPBACK=1` 等价于 `trust: 'open'`，同样是本地开发用的。profile 里显式写下的 `trust` 优先级更高；这个变量在插件加载时读一次，改完要重启。

**日志里有什么。** 读取会话失败只记录会话 id；模型调用失败只记录失败码与 HTTP 状态，**不记录**服务商返回的原文（它可能回显请求内容）。对话正文永远不进日志。

---

## 开发与贡献

想改代码、跑测试、提 PR，请看 [CONTRIBUTING.md](CONTRIBUTING.md)（中文为主，关键步骤附英文）。

一句话版本：

```sh
pnpm install
pnpm build        # 构建
pnpm typecheck    # 类型检查
pnpm test         # 单元测试
```

改完浏览器半边（`src/client/**`）后重新 `pnpm build`，再重载界面即可生效，不用重启应用。

---

## 许可

MIT，见 [LICENSE](LICENSE)。
