# dsh-side-chat

[English](README.md) | 中文

给 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 加一个**侧边聊天**：挂在右侧栏里的临时对话。可以问当前这轮对话、问某一条具体的消息、或者问刚在主会话里选中的那段文字——关掉应用，它就消失了。

```
        ⊕
    侧边聊天
侧边聊天是临时聊天，关闭应用后会消失。
```

## 它能做什么

- **右侧栏里的一个面板。** 它是一个标准的标签页类型（`side-chat`），走公开的 `ctx.sidebarRightTabs` / `sidebar.right.pane.tab` 扩展位注册，所以停靠、浮动、拆分成两栏、关闭，和右侧栏里其他标签页完全一样。**输入框在空态下也挂载**，面板一打开就能直接打字。
- **三个入口。**
  1. 会话标题栏上的「侧边聊天」按钮。
  2. 每条**已完成的助手消息**动作栏里的气泡按钮：直接就着这条消息提问。
  3. 在主会话里**选中一段文字**，选区上方会浮出「在侧边聊天中提问」按钮；点它就把这段文字带进面板当上下文。它挂在框架级的 `shell.overlay` 扩展位上——因为 Harness 没有选区菜单可以贡献。
- **上下文在宿主侧折叠。** 每个问题都会带上会话 id，以及面板被打开时所指向的东西。宿主用 `ctx.sessionQuery` 读那个会话的日志，把选中的那条消息（没指定就是最近的若干条）折成摘录，连同选中的文字一起作为参考材料交给模型。
- **和所在会话同一个模型。** 路由取自该会话日志里最后一次 `request/header`，取不到才回退到宿主的默认模型选择。
- **真正的临时。** 不写会话日志、不写投影缓存、不落盘。对话只活在浏览器页面的内存里（按会话分键），宿主侧完全无状态。重载窗口就清空，关掉应用就当没发生过。
- **回答按 Markdown 渲染。** 粗体、斜体、标题、有序/无序列表（支持嵌套）、带语法高亮的代码块、带列对齐的表格、引用、分隔线，以及 `http(s)`/`mailto` 链接，全部渲染成 React 元素——模型的输出永远不会变成标记，因为这个插件里**根本不存在 `innerHTML` 这条路径**。高亮用 highlight.js 做词法分析，再把它的 span 解析回同一棵元素树，而不是注入 HTML。

## 安装

在这个仓库的检出目录里跑一条命令：

```sh
node scripts/install.mjs --profile desktop
```

它会构建插件、把它链接进 `$DSH_HOME/profiles/<profile>`，并把 Loader 行写进该 profile 的 `cordis.patch.yml`。之后**重载 Harness 窗口**（或重启应用），浏览器半边才会被加载。

手动等价步骤：

1. `pnpm install && pnpm build`
2. 在 `$DSH_HOME/profiles/<profile>` 下执行：`pnpm add link:<本目录>`
3. 往该 profile 的 `cordis.patch.yml` 追加：

   ```yaml
   - insert:
       - id: side-chat
         name: dsh-side-chat
   ```

4. 重载窗口。

> 为什么改了宿主半边的代码要重启：Node 会缓存 ESM 模块，patch 热重载不会重新 import 插件本身。只改浏览器半边时，重载窗口就够。

### 卸载

1. 从 profile 里删掉那条 `- insert:` 行（以及 `dsh-side-chat` 依赖）。
2. 删掉 `$DSH_HOME/profiles/<profile>/node_modules/dsh-side-chat`。

## 它是怎么搭起来的

| 部分 | 文件 | 负责什么 |
| --- | --- | --- |
| 线上协议 | `src/protocol.ts` | 路由、标签页 kind、SSE 分帧——两半边共用 |
| 宿主半边 | `src/index.ts` | `POST /side-chat/ask`：信任校验、体积限制、模型路由、`ctx.llm.stream` → SSE |
| 上下文折叠 | `src/context.ts` | 会话日志 → 提示词上下文；纯函数、不依赖 Harness、有单元测试 |
| 浏览器半边 | `src/client/index.ts` | 四处注册（标签页类型、标题栏按钮、消息动作、选区动作） |
| 面板 | `src/client/panel.tsx` | 空态、对话流、输入框、流式输出、上下文行 |
| 选区动作 | `src/client/selection-action.tsx` | 主会话里选中文字时浮出的触发器 |
| 临时存储 | `src/client/store.ts` | 页面内存里的对话，按会话分键 |
| 传输 | `src/client/transport.ts` | `fetch` + SSE 解码（`EventSource` 带不了请求体） |
| Markdown | `src/client/markdown.ts` | 只做解析：块与内联节点，不碰 DOM |
| 渲染 | `src/client/Markdown.tsx` | 解析结果 → React 元素；全程没有 `innerHTML` |
| 代码高亮 | `src/client/highlight.ts` | highlight.js 做词法，span 重建进同一棵元素树 |

宿主路由受 `connection.requestRejection` 约束，只接受 JSON，限制请求体大小，并限制并发回答数量。它流式返回 `text` 帧、以 `done` 收尾；任何失败都作为 `error` 帧送达，而不是把连接弄断。

## 已知限制

- **没有工具。** 侧边聊天只回答问题，不能执行命令、不能改文件。要做「能用的工具」的侧边会话，需要一个**临时 Session**，而 DeepSeek Harness 目前没有这个概念：`CreateAgentOptions` 没有 `ephemeral` 开关，持久化挂在每一个被发布的会话上，而且只要是活着的会话就一定会出现在侧边栏（哪怕它从没写进磁盘）。这需要改 Harness 内核，不是插件能解决的。
- **没有消息右键菜单。** Harness 没有消息级的右键菜单扩展位，所以「就此消息提问」落在已完成助手消息的动作栏按钮上——和点赞/点踩同一个位置；至于用户消息，它连动作位都没有，因此用「选中文字」的浮动按钮来覆盖这个场景。
- **只支持已完成的助手消息。** 被打断、还没收尾的消息没有持久化 id，无法作为提问目标。
- **面板按会话隔离。** 上下文跟着当前挂载的会话走；换个会话再打开面板，就是一个空白的临时对话。
- **高亮语言集是固定的。** 内置 TypeScript/JavaScript/JSON、Python、Bash、PowerShell、HTML/XML、CSS、Markdown、SQL、YAML、Go、Rust、Java、C++、INI/TOML、diff；fence 写了别的语言就按纯文本渲染。配色跟随**系统浅色/深色**，因为 Harness 的主题 token 描述的是面板和文字语义色，没有一套语法色板可以继承。
- **上下文有上限**（最近 20 条消息、单条 4000 字符、整段 24000 字符），并且每次回答只发一次模型请求——没有多轮工具循环，也没有记忆压缩。

## 开发

```sh
pnpm install
pnpm build       # lib/index.js（宿主）+ lib/client.js（浏览器 bundle）
pnpm typecheck
pnpm test
```

浏览器 bundle 是一个交给 `window.__ModuleLoader__` 的 CommonJS 闭包工厂，只把 `react` 和 `react/jsx-runtime` 留给 shell 的模块表，其余全部内联；宿主半边就是普通的 ESM Cordis 插件。

渲染类改动看起来比断言起来容易，所以仓库提供了一个预览生成器，把真实组件和真实样式表写进 `preview.html`：

```sh
DSH_SIDE_CHAT_PREVIEW=1 pnpm test
chrome --headless=new --screenshot=preview.png --window-size=720,1180 preview.html
```

## 许可

MIT
