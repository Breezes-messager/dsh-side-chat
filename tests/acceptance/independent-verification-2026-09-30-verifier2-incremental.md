# dsh-side-chat-plugin 增量复核报告（verifier2，第二轮改动之后）

- 复核时间：2026-09-30 08:32 – 08:45（GMT+8）
- 仓库：`C:\Users\29559\Desktop\dsh\dsh-side-chat`，HEAD `831b669`（工作树仍脏）
- 上一份报告：`tests/acceptance/independent-verification-2026-09-30-verifier2.md`（07:58）
- 复核基线哈希（本次全部改动）：
  `package.json E69ED0E4`、`tsdown.config.ts B905DE56`、`scripts/install.mjs CF7AF079`、`scripts/check-pack.mjs 2F2CD13D`、`scripts/verify.mjs EEF56A87`、`src/protocol.ts 9F057FD2`、`src/index.ts 6CEF9882`、`README.md 322F7D19`、`README.zh.md 0F92B88B`、`CONTRIBUTING.md E7104467`、`docs/advanced-install.zh.md D192F386`、`HANDOFF.md 79A451FE`；未改动：`cordis.patch.yml 88A57645`、`ci.yml 4397D27F`
- 纪律：未改任何 repo 源文件；未碰 desktop profile（其 package.json 8:20:05 / cordis.patch.yml 8:00:39 是 Lead 迁移所写，非本次操作）；临时 DSH_HOME 全部由工具自建自删；0 次模型调用；未重启进程、未 publish/push
- 新增可复现工具：`tests/acceptance/tools/v2-offline-install.mjs`、`v2-install-legacy.mjs`（跑完自删临时 home）

---

## 0. 结论

| 复核项 | 结论 |
|---|---|
| 1. schemastery 移出 `dependencies`，离线安装 | ✅ **成立**（冷 store + 不可达 registry 安装成功；安装后的 Config 仍是合法原生 schema）；脚手架前提已复现证实；`check-pack` 断言确实收紧为"零依赖"并打印 `ok no runtime dependencies` |
| 2. `install.mjs` 旧行移除 + 重启提示；D1 是否修复 | ✅ **(a)(b) 都生效、D1 已修复**（逐字节验证：两个覆盖零丢失）；⚠️ **(a) 存在过度删除反例**（见 D-新） |
| 3. 文档抽查 | ✅ 无 `${REPO_DIR}` 残留、代码围栏全部成对、离线两处说法与实测一致；两处措辞/数字陈旧（不阻塞） |
| 4. 常规回归 + 零外部 import | ✅ 全绿：install 0 / typecheck 0 / test 0（19 文件 **237** 用例）/ build 0 / pack 0 / check-pack 0 / **verify 0**；`lib/index.js` 仅 `./protocol.js` 一个静态 import |
| 上一轮 D1/D2/D3 | ✅ 全部修复；D4 README 部分修正、源码注释未改；D5 未改（仅日志，非缺陷） |

**发布结论：比上一轮大幅接近"可发布"。** 新发现的过度删除反例是"影响使用"级别（静默让另一个插件不加载，触发条件较窄），不是数据丢失；建议发布前一并修掉。

---

## 1. schemastery 移到 devDependencies + 离线安装（独立复算）

**代码核对**：`package.json` 已无 `dependencies` 整块，`@deepseek-ai/schemastery ~3.18.4` 位于 `devDependencies`（第 109 行）；`tsdown.config.ts:49-53,77` 的 `alwaysBundle: INLINED_RUNTIME` 仍在（这是内联的关键，没有它构建产物会保留 `import ... from '@deepseek-ai/schemastery'`）。

**工具**：`node tests/acceptance/tools/v2-offline-install.mjs <tgz>`（本次用的 tgz 由回归步骤产出，245 243 B）

原始输出（case A，**DSH 形态 profile** = `pnpm-workspace.yaml` 含 `nodeLinker: hoisted` + `autoInstallPeers: false`，冷 store，`--offline --registry=http://127.0.0.1:9/`）：

```
dependencies:
+ dsh-side-chat-plugin file:C:/Users/.../plugin.tgz
Packages: +1
Progress: resolved 1, reused 0, downloaded 1, added 1, done
Done in 437ms using pnpm v11.7.0
exit=0

installed at : ...\profiles\a-dsh-shaped\node_modules\dsh-side-chat-plugin
name@version : dsh-side-chat-plugin@0.2.0
dependencies : {}                       <- 运行时依赖为零
peerDeps     : {"@deepseek-ai/cordis":"^4.0.4"}
@deepseek-ai/ in node_modules : absent  <- 没有下载任何 @deepseek-ai 包
--- installed lib/index.js ---
static imports : ["./protocol.js"]
dynamic imports: []
require() calls: []
apply is fn    : true
Symbol.for(schemastery): true
type is string : string
meta is object : true
meta keys      : ["default"]
typeof Config  : function
validate({})   : {"maxBodyBytes":262144,"maxConcurrent":4,"recentMessages":20,"maxMessageChars":4000,"maxContextChars":24000,"timeoutMs":600000}
defaults match : [["maxBodyBytes",262144],["maxConcurrent",4],["recentMessages",20],["maxMessageChars",4000],["maxContextChars",24000],["timeoutMs",600000]]
trust absent by default (no schema default) : true
per-field meta.description present : {"maxBodyBytes":true,...,"timeoutMs":true}
```

> **关于 `validate({})` 的写法**：Schemastery 的 schema 是**可调用的实例**，没有 `.validate()` 方法（我第一次按字面写 `Config.validate({})` 得到 `TypeError: Config.validate is not a function`）。`lib/types/index.d.ts:126`：「Callable schema instance that validates input and returns normalized output」。等价的调用是 `Config({})`，上表就是它的结果——6 个默认值齐全、`trust` 保持缺省（设计如此，好让环境变量开关生效）、每个字段都有 `meta.description`。`Symbol.for('schemastery') === true` / `type` 为 string / `meta` 为 object 三条与 DSH `app-boot.js:2159-2166` 的原生 schema 识别条件一致。

**负对照（case B，裸 profile，无 `pnpm-workspace.yaml`）**——正是 Lead 提醒的脚手架陷阱，已复现：

```
[ERR_PNPM_NO_OFFLINE_META] Failed to resolve @deepseek-ai/cordis@>=4.0.4 <5.0.0-0 in package mirror ...
exit=1   (expected failure: peer auto-install)
```

即：**A 的成功是真的**（同一个冷 store、同一个不可达 registry，唯一差别就是那两行 workspace 配置），B 的失败是 pnpm 自动装 peer 导致，与包本身无关。

**case C**：把 `- insert:` 行写进 case A 的 profile 后跑仓库自带的 `node scripts/verify.mjs --home <temp> --profile a-dsh-shaped --port 1` → **exit 0**，`ok installed ... carries the Host half, the browser half and its bundle patch`，仅 `warn route`（没有端口）。

**check-pack 断言核对**：`scripts/check-pack.mjs:212-224`

```
// Zero runtime dependencies is the invariant, not merely "Harness-provided".
const runtime = Object.keys(packed.dependencies ?? {})
check(runtime.length === 0, `no runtime dependencies${runtime.length === 0 ? '' : ` (found ${runtime.join(', ')})`}`)
```

回归实跑输出中该行为：**`ok    no runtime dependencies`** ✅（"Harness-provided" 只剩注释里的历史说明，不再是断言）。

**新增小瑕疵**：`src/index.ts:243-250`（`Config` 的文档注释）仍写着 Schemastery "is a `dependencies` entry rather than a dev one so the package is honest about what it needs to build"——搬迁后这句话与事实相反（源码注释，非用户文档，打磨项）。

---

## 2. `install.mjs` 的两条新行为

### (a)(b) 按 Lead 给的"旧状态"独立验证 —— 通过

fixture：一个 `apiKey` 覆盖 + 一个 `ui-theme` 覆盖 + 旧 `- insert: id: side-chat / name: dsh-side-chat`；工具 `node tests/acceptance/tools/v2-install-legacy.mjs`：

```
dsh-side-chat-plugin: removed 1 leftover dsh-side-chat Loader row(s) from ...\cordis.patch.yml
dsh-side-chat-plugin: added the Loader row to ...\cordis.patch.yml
dsh-side-chat-plugin: a Harness appears to be listening on 127.0.0.1:19387 — restart it (and reload the window) so the new Host half is the one that loads.

--- cordis.patch.yml after (441 bytes, before 422) ---
# my profile config
- id: agent-default-model
  name: "@deepseek-ai/dsh-agent-default-model"
  config:
    provider: deepseek-account
    model: deepseek-flash
- id: llm-deepseek
  name: "@deepseek-ai/dsh-llm-deepseek-api-key"
  config:
    apiKey: secret-value-must-survive
- id: ui-theme
  name: "@deepseek-ai/dsh-client-ui-theme"
  config:
    preference: system

- insert:
    - id: dsh-side-chat-plugin
      name: dsh-side-chat-plugin

  ok    result is byte-for-byte: original overrides + new row, nothing truncated
  ok    both overrides survived
  ok    legacy row removed (no bare id: side-chat left)
  ok    new Loader row appended
  ok    exactly one insert block
```

"逐字节"是按**整文件等于（原文件 − 旧行 3 行 + 新行）**断言的，不是在文件里搜关键字；因此两个覆盖确实零改动。`(b)` 的重启提示在真机端口 19387 上真实触发（文案正确，且失败不影响安装）。

### D1（上一轮的清空 patch 缺陷）确认已修

- `install.mjs:240` 现在是 `` `${patch}${patch.endsWith('\n') ? '' : '\n'}\n${row}` ``（模板里重新带上 `patch`），后面还加了写后校验 `:244-248`（"refused to finish — would have lost existing content"）。
- 用**上一轮那个复现工具**原样重跑：`node tests/acceptance/tools/v2-install-truncation.mjs` → `everything except the new row survived: YES`，**exit 0**（上一轮是 NO / exit 1）。

### ⚠️ 新缺陷 D-A：(a) 的删除逻辑会**过度删除**——把同一个 `- insert:` 块里别人的行"摘掉父节点"

反例（case 2：旧行是共享 insert 块的第一行，后面还跟着另一个插件的行）：

```
输入（case 2 的 cordis.patch.yml）：
- insert:
    - id: side-chat
      name: dsh-side-chat
    - id: some-other-plugin
      name: some-other-plugin

安装后实际写出：
    - id: some-other-plugin
      name: some-other-plugin

- insert:
    - id: dsh-side-chat-plugin
      name: dsh-side-chat-plugin
```

（即：旧行被删掉是对的，但 `- insert:` 头被一并 pop，而它下面还剩着另一个插件的行。）

工具判定：`FAIL  other plugin row LOST its insert header (over-deletion)`（`node tests/acceptance/tools/v2-install-legacy.mjs`，exit 1）。

- 原因：`install.mjs:209` 的 `if (/^\s*-?\s*insert:\s*$/.test(kept.at(-1) ?? '')) kept.pop()` 只看"紧邻的上一行是不是 `- insert:`"，没有检查这个 insert 块里还有没有别的行。
- 后果（文件损坏是**实测**；加载行为是**推演**）：剩下的 `- id: some-other-plugin / name: ...` 变成文档根级的补丁条目（YAML 里根序列可以带缩进，所以文件多半仍能解析），但**不再是 insert 行**——那个插件不会被插入加载，即"另一个插件静默失效"。判为**影响使用**（不是数据丢失，触发需要旧行恰好在多行 insert 块的第一位）。
- case 3（旧行在同一个块里排第二）实测**安全**：别人的行原样保留。
- 同一段启发式也存在于 Lead 的 `migrate-profile.mjs:106`（仓库外），同一个反例适用；建议两处一起改：只有当该 `- insert:` 块内不再有其它 `- id:` 行时才 pop，否则保留头。
- 边界：仅块内同缩进的 `- id:` 行需要扫描；或改成"按块解析后再写回"。

---

## 3. 文档抽查

| 检查 | 结果 |
|---|---|
| `${REPO_DIR}` 等未替换占位符 | ✅ 已无（`README.md:118` 现在是 `C:\Users\you\dsh-side-chat` / `/Users/you/dsh-side-chat`；全仓库 grep `${...}` 只剩代码里的模板字符串） |
| 代码围栏成对 | ✅ 行首 ` ``` ` 计数均为偶数：README.md 16、README.zh.md 16、CONTRIBUTING.md 22、docs/advanced-install.zh.md 18、HANDOFF.md 0（无围栏） |
| docs §3「离线不需要网络」 | ✅ 与实测一致（case A 成功；"tarball 已含构建产物"与清单一致） |
| docs §3「`autoInstallPeers: false` 是关键 + `ERR_PNPM_NO_OFFLINE_META`」 | ✅ 与 case B 的错误码/文案**逐字一致**；"peerDependencies 仅类型检查、产物里没有对它的 import"经 `lib/index.js` 导入扫描证实（唯一 import 是 `./protocol.js`） |
| CONTRIBUTING「两条不要破坏的不变量」 | ✅ 两条都成立：①`dependencies` 必须为空（check-pack 现在正是这么断言的）②浏览器半边注册 id == 包名，且列出的四处（`tsdown PACKAGE_NAME` / `cordis.patch.yml` id+name / `src/protocol.ts` 的 `SIDE_CHAT_TAB_ID`）本次身份扫描**全部同值 `dsh-side-chat-plugin`** |
| HANDOFF.md | 主体与实测一致（§38-41 的离线结论与我复算相同）；两处陈旧：`L29` 的 tarball 体积 240,177 B（当前 245,243 B，因 README/docs 增补）、`L40` 写 "`validate({})`"（该 API 不存在，应为 `Config({})`）——信息级 |
| D2（verify 死脚本提示） | ✅ 已修：`verify.mjs:232` 现在提示 `node <repo>/scripts/install.mjs`；`:259` 的误导文案也改成 "the profile names the package but nothing is installed there" |
| D3（旧 tab id） | ✅ 已修：`src/protocol.ts:21 SIDE_CHAT_TAB_ID = 'dsh-side-chat-plugin'`，构建产物 `lib/client.js` 同步；`docs`/CONTRIBUTING 的不变量也写明了这一点 |
| D4（"Host 没有信任检查"断言） | ⚠️ **部分修**：`README.md:448/450` 已改成"实测 Host 要求签名浏览器凭据，无凭据的调用被拒 401/403"（与我的探测一致）；但 `src/index.ts:42/462/871`（模块注释、`decideTrust` 注释、`NO_FENCE_WARNING` 文案）仍断言"shipped desktop profile 没有认证"。用户文档已安全，源码注释/日志文案未同步——打磨项 |
| D5（浏览器半边旧名） | 未改（`lib/client.js` 5 处：`TAG_ID`、`dataset.plugin`、两处 console 前缀、`const name`）。仍为日志/诊断级，非缺陷 |

---

## 4. 常规回归（原始退出码）

```
$ node <pnpm.mjs> install --frozen-lockfile    exit 0   "Already up to date / Done in 276ms"
$ node <pnpm.mjs> typecheck                    exit 0
$ node <pnpm.mjs> test                         exit 0
$ node <pnpm.mjs> build                        exit 0
$ node <pnpm.mjs> pack --pack-destination <tmp> exit 0
$ node scripts/check-pack.mjs <tgz>            exit 0
$ node scripts/verify.mjs                      exit 0
```

- `test`：`Test Files 19 passed (19)` / `Tests 237 passed (237)`（与上一轮同数）
- `pack`：`dsh-side-chat-plugin-0.2.0.tgz`，**245 243 B**，15 个文件，SHA256 `AE2AEE4EE3F9908106CE67B4B406E111FF86BC5AC5F5310F9E04FE785B15CAD2`
- `check-pack`：19 项全 ok（含新的 `ok    no runtime dependencies`），`packed tarball is good (15 files).`
- `verify`：**exit 0** —— `ok profile ...\desktop selects dsh-side-chat-plugin in dsh.profile.bundles`、`ok installed ...\node_modules\dsh-side-chat-plugin carries the Host half, the browser half and its bundle patch`、`ok route GET .../side-chat/ask returned 401`。desktop profile 的迁移已由 Lead 完成且干净：依赖/`bundles`/junction 都是新名，`cordis.patch.yml` 里**已无** `id: side-chat` 旧行，`pnpm-workspace.yaml`（`autoInstallPeers: false`）未被改动。
- **`lib/index.js` 零外部 import**：68 632 B，`static : ["./protocol.js"]`、`dynamic: []`、`require: []`；`lib/protocol.js` 三类均为空。安装到临时 profile 后的同一文件结论相同。

---

## 5. 增量缺陷清单

| # | 现象 | 复现 | 严重度 |
|---|---|---|---|
| **D-A** | `install.mjs` 移除旧行时会把共享 `- insert:` 块的父节点一起摘掉，块内另一个插件的行变成无父级的补丁条目（不再插入 → 该插件静默失效） | `node tests/acceptance/tools/v2-install-legacy.mjs`（case 2 → `FAIL other plugin row LOST its insert header`，exit 1） | **影响使用**（触发条件窄：旧行必须是多行 insert 块的第一行）。同一启发式在 `migrate-profile.mjs:106` |
| D-B | `src/index.ts:243-250` 注释仍说 Schemastery 是 `dependencies`（已迁 devDependencies）；`src/index.ts:42/462/871` 仍是旧的"desktop profile 没有认证"断言（README 已修正） | 读源码；`README.md:448/450` 对比 | 打磨项 |
| D-C | HANDOFF.md `L29` 的 tarball 体积、`L40` 的 "`validate({})`" 措辞与事实不符（当前 245 243 B；schema 是可调用的，没有 `.validate()`） | 见 §1 | 信息 |

上一轮 D1/D2/D3 已修并复验；D4 用户文档已修；D5 保留（日志级）。

---

## 6. 我没能验证的

- 真实桌面窗口点面板的端到端（不能点 UI / 重启），与上一轮相同。
- case 2 损坏后的文件在真 DSH Loader 里的最终表现（"另一个插件不加载"是读 `applyEntryPatches` 语义推演；YAML 是否解析、是否会报错未在真机跑）。
- `pnpm add <tgz>` 在真机断网（不是 `--offline` 模拟）下的行为；本机无法真正断网。
- Node 22 上的离线安装（本机只有 Node 24）。
