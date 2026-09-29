/**
 * Visual preview generator.
 *
 * Rendering bugs in a transcript are easier to see than to assert, so this
 * writes `preview.html` — the real component with the real stylesheet — and a
 * headless browser can screenshot it:
 *
 *   DSH_SIDE_CHAT_PREVIEW=1 pnpm test
 *   chrome --headless=new --screenshot=preview.png --window-size=720,1180 preview.html
 *
 * It is a no-op otherwise, so the normal suite never touches the working tree.
 */
import { writeFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { Markdown } from '../src/client/Markdown.tsx'
import { PANEL_CSS } from '../src/client/styles.ts'

/** A document exercising every construct the parser supports. */
const SAMPLE = `说的是：**相对性**与**可变性**是两件事。

- **相对性**说的是身份变：同一个量在这里是单位1，换道题可能只配当某个分数。
  - 甲是乙的 1/3，则单位1是**乙**
  - 反过来说甲是乙的 2 倍，单位1就变成了**甲**
- **可变性**说的是数值变：单位1定下来之后，它本身是大是小，直接决定分数背后的绝对量。

| 单位1 | 12 块糖的 1/3 | 6 块糖的 1/3 |
| :-- | --: | --: |
| 实际数量 | 4 块 | 2 块 |

> 一句话收口：相对性管“谁是单位1”，可变性管“单位1有多大”。

代码示例：

\`\`\`ts
export function share(total: number, unit: number): number {
  // 分数不变，绝对值跟着单位1走
  return total / unit
}
\`\`\`

\`\`\`bash
pnpm build && pnpm test
\`\`\`

参考 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 的实现。

---

正文结束。`

/** Theme tokens the panel normally inherits from the Harness. */
const TOKENS = `:root { color-scheme: light; --dsw-alias-bg-base:#fff; --dsw-alias-bg-layer-1:#f7f7f8;
  --dsw-alias-bg-layer-2:#eceef1; --dsw-alias-border-l1:rgba(0,0,0,.14); --dsw-alias-border-l2:rgba(0,0,0,.3);
  --dsw-alias-label-primary:#1b1c1e; --dsw-alias-label-secondary:#6b6f76; --dsw-alias-brand-primary:#4d6bfe;
  --dsw-alias-state-error-primary:#d9534f; }
body { margin:0; padding:22px; background:var(--dsw-alias-bg-base);
  font:13px/1.6 -apple-system,"Segoe UI","Microsoft YaHei",sans-serif; }
.sc-root { height:auto; }`

describe('markdown preview', () => {
  it('renders every construct without throwing', () => {
    const body = renderToStaticMarkup(<Markdown text={SAMPLE} />)
    expect(body).toContain('<table')
    expect(body).toContain('hljs-keyword')
    if (process.env.DSH_SIDE_CHAT_PREVIEW === '1') {
      writeFileSync('preview.html', `<!doctype html>
<html><head><meta charset="utf-8"><style>${TOKENS}</style><style>${PANEL_CSS}</style></head>
<body><div class="sc-root">${body}</div></body></html>`)
    }
  })
})
