# 进阶安装：手动、命令行与离线场景

[← 返回 README.zh.md](../README.zh.md)

> English summary at the [end of this page](#english-summary).

这份文档给四种情况用：

1. 你习惯用命令行，不想点界面；
2. 应用内「插件」页不可用（老版本 DSH、没有可管理的 profile）；
3. 你在公司内网、私有 npm 源或完全离线的机器上安装；
4. 你从旧版本（0.1.x，包名 `dsh-side-chat`）装过，要迁移到**插件 0.2.0** 的新名——看[第 5 节](#5-从旧名迁移01x--020)。

**先读这一句：** 侧边聊天是**浏览器界面**功能。`cc-tui`、`headless` 这类没有 Web 界面的 profile 里，插件就算装上了也看不到任何东西，不建议安装。

---

## 0. 先理解两件事

**profile 是什么。** 每个 profile 是 `$DSH_HOME/profiles/<名字>` 下的一个目录（Windows 默认 `C:\Users\<你>\.dsh\profiles\<名字>`）。它有两个关键文件：

| 文件 | 作用 |
| --- | --- |
| `package.json` | 这个 profile 装了哪些包（`dependencies`），以及要启用哪些组合包（`dsh.profile.bundles`，**有序**列表） |
| `cordis.patch.yml` | 用户自己的配置层，可以按 id 覆盖配置、启用/禁用插件行、插入插件行 |

**包和组合包（bundle）的区别。** 一个普通依赖只是"文件躺在 profile 的 `node_modules` 里"，默认不会加载。一个**组合包**在 `package.json` 里声明了 `dsh.bundle.patch`，指向包内自带的 YAML 补丁；把它的名字写进 `dsh.profile.bundles`，DSH 启动时就会应用这个补丁，补丁里 `insert` 的那些插件行才会被加载。

`dsh-side-chat-plugin` 是组合包，包内 `cordis.patch.yml` 的内容是：

```yaml
- insert:
    - id: dsh-side-chat-plugin
      name: dsh-side-chat-plugin
```

> ⚠️ **别装错包。** npm 上另有一个只差一个词的 `dsh-side-chat`，那是**别人的**另一个插件（"并行侧边对话"，维护者不是本仓库）。它用的 Loader 行 id 是 `side-chat`，正是本插件 0.1.x 用过的旧 id：两个包同时生效会重复注册同一个 id 而崩溃。本文所有命令里的包名都是 `dsh-side-chat-plugin`，请照抄。
>
> `id` 与 `name` 都必须是裸包名 `dsh-side-chat-plugin`，两者也都要与 `package.json` 的 `name` 一致——行 id 在一个 profile 里必须唯一，而浏览器半边只挂在「说明符恰好等于包名」的那条 Loader 行上。

所以完整安装 = **两步**：① 把包装进 profile 的 `node_modules`；② 让 profile 选中它（选组合包，或者手写上面那条 `insert` 行）。

应用内「插件」页把这两步一起做了。下面的手工步骤是把它们拆开。

---

## 1. 命令行安装（`web` 等非桌面 profile）

桌面应用的 `desktop` profile **不接受** `dsh plugin` 命令（应用独占管理，会直接报错），请用应用内「插件」页。

其他 profile：

```sh
dsh plugin --profile web add dsh-side-chat-plugin
```

这条命令等价于在 `$DSH_HOME/profiles/web` 里执行 `pnpm add dsh-side-chat-plugin`：它只完成第 ① 步。

然后编辑 `$DSH_HOME/profiles/web/package.json`，把包名加进 `dsh.profile.bundles`（放在最后）：

```json
{
  "name": "dsh-profile-web",
  "private": true,
  "dependencies": {
    "dsh-side-chat-plugin": "^0.2.0"
  },
  "dsh": {
    "profile": {
      "bundles": [
        "@deepseek-ai/dsh-base",
        "@deepseek-ai/dsh-web-app",
        "dsh-side-chat-plugin"
      ]
    }
  }
}
```

（`@deepseek-ai/dsh-base`、`@deepseek-ai/dsh-web-app` 这两项照抄你文件里原有的内容，不要改。）

保存后重启该 profile，再刷新浏览器。

> 如果你的 profile 里没有 `dsh.profile.bundles`，说明它从未被初始化过——先用 `dsh plugin --profile <名字> add dsh-side-chat-plugin` 初始化一次，然后**照上面的方法确认包名真的出现在 `dsh.profile.bundles` 里**；没有出现就手工加上。

### Windows PowerShell 的两个坑

- `dsh` 在 PowerShell 里会命中 `dsh.ps1`，默认执行策略会拦下它，报「因为在此系统上禁止运行脚本」。改用 **`dsh.cmd plugin --profile web add dsh-side-chat-plugin`**，或者放宽本机策略：`Set-ExecutionPolicy -Scope CurrentUser RemoteSigned`。
- `pnpm` 和 `npm` 同理，请用 **`pnpm.cmd`** / `npm.cmd`（实测：`pnpm -v` 会被拦下，`pnpm.cmd -v` 正常打印版本）。本文里其它 `pnpm ...` 命令同理。

---

## 2. 手动安装到桌面 profile

不想用应用内页面时（或者页面坏了），可以照 `scripts/install.mjs` 的做法手工来：

1. 让 profile 认识这个包。从仓库目录安装时用链接（注意：**包名是 `dsh-side-chat-plugin`，仓库目录仍然叫 `dsh-side-chat`**）：

   ```sh
   cd "C:/Users/<你>/.dsh/profiles/desktop"
   pnpm add link:"C:/Users/<你>/dsh-side-chat"
   ```

   已经发布到 npm 的话，直接：

   ```sh
   pnpm add dsh-side-chat-plugin
   ```

2. 在 `$DSH_HOME/profiles/desktop/cordis.patch.yml` 末尾追加插件行：

   ```yaml
   - insert:
       - id: dsh-side-chat-plugin
         name: dsh-side-chat-plugin
   ```

   > `id` 与 `name` 都必须写成**裸包名** `dsh-side-chat-plugin`。`name` 写成路径、别名或加 `/client` 后缀，会只加载宿主半边、右侧栏里不会出现标签页；`id` 在一个 profile 里必须唯一，写错或与别的插件撞车会导致重复注册。

3. 重载界面；宿主半边需要时重启应用。

两条路（组合包选择 / 手写 insert 行）**只走一条**，不要同时做，否则同一行会被插入两次。

### 手工卸载

先看你是哪种装法：

- **用插件页装的（组合包路线）**：`cordis.patch.yml` 里没有本插件的插入行，不用去删它。
- **当初手写 `- insert:` 行装的**：打开 `cordis.patch.yml`，删掉 `id` 为 `dsh-side-chat-plugin` 的插入行（或 `disabled` 覆盖）。

然后：

1. 从 profile 的 `package.json` 删除 `"dsh-side-chat-plugin"` 依赖，以及 `dsh.profile.bundles` 里的同名项；
2. 删除 `$DSH_HOME/profiles/<profile>/node_modules/dsh-side-chat-plugin`；
3. 重启应用。

---

## 3. 私有源、内网与离线

**用国内镜像 / 私有源：**

```sh
dsh plugin --profile web add dsh-side-chat-plugin --registry=https://registry.npmmirror.com
```

应用内安装时，可以在「添加插件」对话框的「安装源」里选「中国大陆镜像源」，或填公司内网的 npm 地址。需要登录的源，把凭据放在**本机**的 `~/.npmrc` 里（Windows：`C:\Users\<你>\.npmrc`）。

**完全离线：**

1. 在一台能上网的机器上打包：

   ```sh
   pnpm pack
   ```

   得到 `dsh-side-chat-plugin-<版本>.tgz`。这个 tarball 里已经有构建好的 `lib/`、`cordis.patch.yml`、`locale/` 与 `icon.svg`，不需要再构建。

2. 把 tarball 拷到目标机器，然后在 profile 目录里安装：

   ```sh
   cd "$DSH_HOME/profiles/desktop"
   pnpm add "D:/transfer/dsh-side-chat-plugin-0.2.0.tgz"
   ```

   这一步**不需要网络**：这个包没有任何运行时依赖——宿主半边需要的全部代码（包括 Config 用到的 Schemastery）都已经内联进 `lib/index.js`，浏览器半边从 DSH 自己的模块表里取 React。实测：在一台"没有网络"的等价环境里（`pnpm install --offline`，并把 registry 指向一个不可达地址），从 tarball 安装成功，安装后的 `lib/index.js` 也能正常导入并导出可用的 Config。

   前提是 profile 里有 DSH 生成的 `pnpm-workspace.yaml`，里面那两行是让离线成立的关键：

   ```yaml
   nodeLinker: hoisted
   autoInstallPeers: false
   ```

   DSH 新建的 profile 都是这样配置的。`autoInstallPeers: false` 表示"不要自动下载 `peerDependencies`"——本包声明了 `peerDependencies: @deepseek-ai/cordis`（仅用于类型检查，运行时由 DSH 自己提供，构建产物里没有任何对它的 import）。如果这个文件被人删掉或改成了 `true`，`pnpm add` 就会去下载 cordis，离线机器上会失败并报 `ERR_PNPM_NO_OFFLINE_META`。遇到这种情况，把上面两行补回去即可。

3. 按[第 2 节](#2-手动安装到桌面-profile)的第 2 步写插件行，或把包名加进 `dsh.profile.bundles`。

**从源码目录直接安装（不打包）：** 先在仓库里 `pnpm install && pnpm build`，再在 profile 目录里 `pnpm add link:"<仓库绝对路径>"`。`link:` 指向的是目录，所以构建产物必须已经存在。

---

## 4. 装完之后怎么自查

有仓库 checkout 的话，在仓库目录里：

```sh
pnpm run verify
```

（Windows PowerShell 里用 `pnpm.cmd run verify`，原因见[第 1 节的 Windows 两个坑](#windows-powershell-的两个坑)。）它会检查构建产物、包声明、profile 里的插件行，并探测本机 DSH 的端口。装上但没有界面时，先跑它。

没有 checkout 也能查 profile。在 `$DSH_HOME/profiles/<profile>` 目录里跑下面几条，逐条对照注释里的预期（**不要用 `pnpm why`**：profile 目录通常没有 lockfile，它会什么都不打印，看起来像"没装"）：

```sh
cd "$DSH_HOME/profiles/desktop"

# 依赖里有没有这个包（预期看到 dsh-side-chat-plugin，值可能是 link: 路径或版本号）
node -e "console.log(require('./package.json').dependencies)"

# profile 选中了哪些组合包（预期最后一项是 'dsh-side-chat-plugin'）
node -e "console.log(require('./package.json').dsh.profile.bundles)"

# 插件版本（预期打印 0.2.0 这样的版本号）
node -e "console.log(require('./node_modules/dsh-side-chat-plugin/package.json').version)"

# 包目录在不在（预期列出包内文件，而不是报「路径不存在」；Windows PowerShell 用 Get-ChildItem node_modules\dsh-side-chat-plugin）
ls node_modules/dsh-side-chat-plugin
```

---

## 5. 从旧名迁移（0.1.x → 0.2.0）

**谁需要看这节：** 你在**插件 0.2.0** 之前装过本插件——那时包名是 `dsh-side-chat`、Loader 行 id 是 `side-chat`。**插件 0.2.0** 把这两个值都改成了 `dsh-side-chat-plugin`。旧的行 id 在新版本里不会再被匹配到（`id: side-chat` 的配置覆盖会**静默失效**），旧的依赖也不会自动换成新包。

> **先把版本号分清。** 本节里的「0.1.x / 0.2.0」指**本插件自己的版本**，与 **DSH 的版本**（例如 DSH `0.2.0-rc.2`）无关，不需要为此升级 DSH。查自己装的是哪一版（在 profile 目录里跑）：`node -e "console.log(require('./package.json').dependencies)"`——看到 `dsh-side-chat` 是旧版、`dsh-side-chat-plugin` 是新版；已经装上新名的话，`node -e "console.log(require('./node_modules/dsh-side-chat-plugin/package.json').version)"` 会打印插件版本（本机是 `0.2.0`），插件页卡片上也会写。

**先认清一件事：** npm 上的 `dsh-side-chat` 现在（以及以后）是**别人的**另一个插件（"并行侧边对话"，维护者不是本仓库）。所以迁移不是"升级同名包"，而是"清掉旧的、装新的"。

### 迁移前先确认你现在是哪种装法

Windows PowerShell（把 `desktop` 换成你的 profile 名）：

```powershell
$profileDir = "$env:USERPROFILE\.dsh\profiles\desktop"
Select-String -Path "$profileDir\package.json" -Pattern '"dsh-side-chat"'
Select-String -Path "$profileDir\cordis.patch.yml" -Pattern 'id:\s*side-chat\s*$'
```

macOS / Linux：

```sh
PROFILE="$HOME/.dsh/profiles/desktop"
grep -n '"dsh-side-chat"' "$PROFILE/package.json"
grep -n 'id: *side-chat$' "$PROFILE/cordis.patch.yml"
```

两条命令都**不该有输出**；有输出就说明是旧装法，按下面的步骤清理。

### 步骤

⚠️ **迁移必须四步齐全，缺一不可：① 删掉旧的 Loader 行 → ② 把 profile 的依赖换成新名 → ③ 把 `dsh-side-chat-plugin` 加进 `dsh.profile.bundles` → ④ 删掉旧包目录并重启。** 最容易漏的是第 ③ 步；漏掉它**不会报错，插件会直接消失**：手写的旧行删掉了（①）、组合包的行没来（③ 没做），右侧栏没有「侧边聊天」，`POST /side-chat/ask` 返回 404，日志里也没有对应的报错。

**为什么第 ③ 步不能省。** 见[第 0 节](#0-先理解两件事)：组合包的补丁层**只有在该 profile 的 `dsh.profile.bundles` 里选中它时才生效**；包躺在 `node_modules` 里但没被选中的组合包，DSH 根本不会加载。实测（CLI `dsh --profile <profile 副本> --dump-config`）：依赖已装好、组合包未选中 → 合成树里没有本插件的行；把 `dsh-side-chat-plugin` 加进 `dsh.profile.bundles` → 合成树里出现 `# == dsh-side-chat-plugin` 与 `- id: dsh-side-chat-plugin` / `name: dsh-side-chat-plugin`。

**开始之前：** 完全退出桌面应用（`dsh web` 就停掉那个进程）——第 4 步要删目录下的文件。四步一次做完，再启动应用。

1. **删掉旧的 Loader 行。** 打开 `$DSH_HOME/profiles/<profile>/cordis.patch.yml`，删掉这一段（可能只剩其中一行，也可能写在按 `id` 定位的 `config:` 覆盖里）：

   ```yaml
   - insert:
       - id: side-chat
         name: dsh-side-chat
   ```

   Windows PowerShell：`notepad "$env:USERPROFILE\.dsh\profiles\desktop\cordis.patch.yml"`
   macOS / Linux：`${EDITOR:-vi} "$HOME/.dsh/profiles/desktop/cordis.patch.yml"`
2. **把 profile 的依赖换成新名。** 打开同目录的 `package.json`：从 `dependencies` 里删掉 `"dsh-side-chat"`；如果 `dsh.profile.bundles` 里也有 `"dsh-side-chat"`，一并删掉。新名 `"dsh-side-chat-plugin"` 由安装动作写进去——桌面端用应用内「插件」页安装（见 [README.zh.md 的安装章节](../README.zh.md#安装)），命令行 profile 用本页[第 1 节](#1-命令行安装web-等非桌面-profile)的命令。手工安装（在 profile 目录里执行，已发布到 npm 的版本）：

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

   （从源码 checkout 用 `link:` 安装见[第 2 节](#2-手动安装到桌面-profile)，两种装法不要叠加。）
3. **把 `dsh-side-chat-plugin` 追加进 `dsh.profile.bundles`（关键一步）。** 打开同一个 `$DSH_HOME/profiles/<profile>/package.json`，在 `dsh.profile.bundles` 数组的**末尾**追加 `"dsh-side-chat-plugin"`；数组里已有的包名（例如 `@deepseek-ai/dsh-base`）**保持不动、不要重排**。追加后这一段应该长这样（文件其它字段保持原样；`"……"` 那一项代表你原有的内容）：

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

   编辑命令：Windows PowerShell `notepad "$env:USERPROFILE\.dsh\profiles\desktop\package.json"`；macOS / Linux `${EDITOR:-vi} "$HOME/.dsh/profiles/desktop/package.json"`。

   确认一下（预期看到数组里含 `'dsh-side-chat-plugin'`）：

   ```sh
   cd "$DSH_HOME/profiles/desktop" && node -e "console.log(require('./package.json').dsh.profile.bundles)"
   ```

   > 选好组合包之后，Loader 行由包内自带的 `cordis.patch.yml` 提供——**不要**再手写 `- insert:` 行（见[第 2 节](#2-手动安装到桌面-profile)末尾：两条路只走一条）。
   >
   > 如果 profile 里**根本没有** `dsh.profile.bundles`，说明它从未被初始化过：按[第 1 节](#1-命令行安装web-等非桌面-profile)先建起来，再追加包名。**只把包装进 `node_modules` 是不够的。**
4. **删掉旧包目录并重启**（注意路径末尾是旧包名 `dsh-side-chat`，没有 `-plugin`）：

   Windows PowerShell：

   ```powershell
   Remove-Item -Recurse -Force "$env:USERPROFILE\.dsh\profiles\desktop\node_modules\dsh-side-chat"
   ```

   macOS / Linux：

   ```sh
   rm -rf "$HOME/.dsh/profiles/desktop/node_modules/dsh-side-chat"
   ```

   然后启动应用、重载界面。如果新包是到这时候才装的，装完**回到第 3 步再确认一次** `dsh.profile.bundles`。

**（可选）确认迁移干净。** 如果手边有仓库 checkout，在仓库目录里跑 `pnpm run verify`；只有发布包的用户直接看右侧栏有没有出现「侧边聊天」。

**为什么不能"新旧并存"：** 旧行 `id: side-chat` 留在 profile 里、新包又插入 `id: dsh-side-chat-plugin`，看上去只是多一行；但 npm 上那个同名包用的正是 `side-chat`——一旦两者同时生效，同一个行 id 被插入两次会**崩溃**。先清旧行，再装新包。

---

## English summary

**A profile is a directory** under `$DSH_HOME/profiles/<name>`. `package.json` holds its dependencies and its ordered `dsh.profile.bundles` selection; `cordis.patch.yml` is the user's own patch layer.

**A plain dependency does nothing until it is selected.** `dsh-side-chat-plugin` ships a bundle patch (`dsh.bundle.patch` → `cordis.patch.yml`, which inserts the row `{ id: dsh-side-chat-plugin, name: dsh-side-chat-plugin }`). Installing is therefore two steps: get the package into the profile's `node_modules`, and make the profile load it (select the bundle, or write the same `insert` row by hand). The in-app **Plugins** page does both. Both `id` and `name` must be the bare package name: the row id has to be unique in a profile, and the browser half only attaches to the loader row whose specifier is exactly the package name.

**CLI profiles (not `desktop`):**

```sh
dsh plugin --profile web add dsh-side-chat-plugin
```

then add `dsh-side-chat-plugin` to `dsh.profile.bundles` in `$DSH_HOME/profiles/web/package.json` and restart that profile. On Windows PowerShell use `dsh.cmd` (and `pnpm.cmd` / `npm.cmd`); the `.ps1` shims are blocked by the default execution policy.

**Manual install on `desktop`:** `pnpm add link:<this repo>` (or `pnpm add dsh-side-chat-plugin`) inside the profile directory, then append the `- insert:` row shown above to that profile's `cordis.patch.yml`. Never do both this and the bundle selection — the row would be inserted twice.

**Private registry / offline:** `dsh plugin --profile web add dsh-side-chat-plugin --registry=<url>`; for an offline machine, `pnpm pack` on a connected machine and `pnpm add <file>.tgz` on the target. The tarball already contains the built `lib/`. **No network is needed for that install:** the package has no runtime dependencies — everything the Host half needs (including Schemastery, for the Config schema) is inlined into `lib/index.js`, and the browser half takes React from the shell's module table. Measured with `pnpm install --offline` against an unreachable registry: the install succeeded and the installed `lib/index.js` imported and exposed a working Config. This relies on the profile's DSH-written `pnpm-workspace.yaml` keeping `autoInstallPeers: false`; the plugin's `peerDependencies: @deepseek-ai/cordis` is type-check-only (nothing in the built artifact imports it), so with automatic peer installation turned on, pnpm would try to fetch it and fail offline with `ERR_PNPM_NO_OFFLINE_META`.

**Self-check:** run `pnpm run verify` from the repository directory (`pnpm.cmd run verify` on Windows PowerShell). Without a checkout, check the profile directory instead: `node -e "console.log(require('./package.json').dependencies)"`, `node -e "console.log(require('./package.json').dsh.profile.bundles)"`, `node -e "console.log(require('./node_modules/dsh-side-chat-plugin/package.json').version)"` and `ls node_modules/dsh-side-chat-plugin` — do **not** use `pnpm why`, which prints nothing without a lockfile.

**Migrating from the old name (0.1.x → 0.2.0):** up to 0.1.x this plugin was published as `dsh-side-chat` with the loader row id `side-chat`. Note that the npm package `dsh-side-chat` is now **someone else's** plugin, so this is a remove-and-reinstall, not an upgrade. All four steps are required: quit the app, delete the old `- id: side-chat` / `name: dsh-side-chat` row from `$DSH_HOME/profiles/<profile>/cordis.patch.yml`, delete `"dsh-side-chat"` from that profile's `package.json` (and from `dsh.profile.bundles` if present), **append `"dsh-side-chat-plugin"` to `dsh.profile.bundles` in that same `package.json`**, then delete `<profile>/node_modules/dsh-side-chat` and restart. The third step is the one that gets missed: a bundle's patch layer is applied only while the profile selects its package name in `dsh.profile.bundles`, so skipping it raises no error at all — the plugin simply vanishes (no Side chat tab, `/side-chat/ask` returns 404). Never leave the old row in place either: the unrelated `dsh-side-chat` package uses that same `side-chat` id, and two rows sharing one id in a profile crash on load.
