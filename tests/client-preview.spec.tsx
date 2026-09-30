/**
 * Panel states preview generator.
 *
 * The unit tests assert behaviour; this writes one page that shows what the
 * panel looks like in every state a user can reach — empty, streaming, failed,
 * stopped, a long answer, and the frame-wide notice — in both languages and both
 * colour schemes, with the real stylesheet and the real Harness token values.
 *
 *   DSH_SIDE_CHAT_PREVIEW=1 pnpm test
 *   chrome --headless=new --screenshot=panel.png --window-size=1180,1500 <out>
 *
 * It is a no-op otherwise, so the normal suite never touches the filesystem.
 * The output defaults to the OS temporary directory: this generator must not
 * leave an artifact in the repository.
 */
// @vitest-environment node
import { writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { en, zh } from '../src/client/locales.ts'
import { dismissNotice, publishNotice } from '../src/client/notice.ts'
import { SideChatNoticeBar } from '../src/client/Notice.tsx'
import { SideChatBody } from '../src/client/panel.tsx'
import { storeFor } from '../src/client/store.ts'
import { PANEL_CSS } from '../src/client/styles.ts'

/**
 * Token values copied out of the running Harness theme
 * (`@deepseek-ai/dsh-client-ui-theme`, light block and `[data-ds-dark-theme]`).
 */
const TOKENS = `
:root {
  color-scheme: light;
  --dsw-alias-bg-base: #ffffff;
  --dsw-alias-bg-layer-1: #ffffff;
  --dsw-alias-bg-layer-2: #ffffff;
  --dsw-alias-bg-overlay: #e9ecf2;
  --dsw-alias-border-l1: #0000000a;
  --dsw-alias-border-l2: #0000001a;
  --dsw-alias-brand-primary: #0f1115;
  --dsw-alias-button-primary-fill: #0f1115;
  --dsw-alias-button-primary-hover: #43454a;
  --dsw-alias-label-primary: #0f1115;
  --dsw-alias-label-primary-foreground: #ffffff;
  --dsw-alias-label-secondary: #61666b;
  --dsw-alias-state-error-primary: #ec1313;
  --dsw-specific-sidebar-fill: #f9fafb;
}
body[data-ds-dark-theme], [data-ds-dark-theme] {
  color-scheme: dark;
  --dsw-alias-bg-base: #0f1115;
  --dsw-alias-bg-layer-1: #232324;
  --dsw-alias-bg-layer-2: #2c2c2e;
  --dsw-alias-bg-overlay: #61666b;
  --dsw-alias-border-l1: #ffffff0f;
  --dsw-alias-border-l2: #ffffff1f;
  --dsw-alias-brand-primary: #f9fafb;
  --dsw-alias-button-primary-fill: #f9fafb;
  --dsw-alias-button-primary-hover: #ebeef2;
  --dsw-alias-label-primary: #f9fafb;
  --dsw-alias-label-primary-foreground: #0f1115;
  --dsw-alias-label-secondary: #cfd3d6;
  --dsw-alias-state-error-primary: #f25a5a;
  --dsw-specific-sidebar-fill: #1b1b1c;
}
`

/** Preview-only chrome: the panel normally fills the right Sidebar column. */
const HARNESS_CSS = `
body { margin: 0; padding: 24px; background: var(--dsw-alias-bg-base); color: var(--dsw-alias-label-primary);
  font: 13px/1.6 -apple-system, "Segoe UI", "Microsoft YaHei", sans-serif; }
h1 { font-size: 15px; margin: 0 0 12px; }
.grid { display: grid; grid-template-columns: repeat(3, 340px); gap: 16px; }
.card { position: relative; height: 420px; overflow: hidden; border: 0.5px solid var(--dsw-alias-border-l2);
  border-radius: 12px; background: var(--dsw-alias-bg-base); }
.card > .caption { position: absolute; z-index: 2; top: 6px; right: 8px; font-size: 11px; opacity: 0.5; }
/* The notice is fixed to the viewport in the product; pin it inside a card here. */
.card .sc-notice { position: absolute; top: 44px; bottom: auto; max-width: calc(100% - 20px); }
section { margin-bottom: 28px; }
section > h1 { color: var(--dsw-alias-label-secondary); font-weight: 600; }
`

/** One panel, rendered the way the tab kit renders it. */
function panel(sessionId: string, t: (key: string) => string): string {
  return renderToStaticMarkup(<SideChatBody sessionId={sessionId} t={t} />)
}

/** Build the page: the same states in Chinese/light and English/dark. */
function buildPage(): string {
  const zhT = (key: string) => zh[key as keyof typeof zh] ?? key
  const enT = (key: string) => en[key as keyof typeof en] ?? key

  const empty = panel('preview-empty-zh', zhT)
  const streaming = (() => {
    const store = storeFor('preview-streaming-zh')
    const id = store.begin('这段代码里为什么要用 useMemo？')
    store.append(id, '因为 composer 和整份对话在同一个组件树里，每次输入都会让 React 重新渲染整棵树。')
    return panel('preview-streaming-zh', zhT)
  })()
  const failed = (() => {
    const store = storeFor('preview-failed-zh')
    const id = store.begin('帮我解释一下这个报错')
    store.fail(id, { code: 'not-configured', detail: 'No model route is available for the side chat.' })
    return panel('preview-failed-zh', zhT)
  })()
  const stopped = (() => {
    const store = storeFor('preview-stopped-zh')
    const id = store.begin('继续写下去')
    store.append(id, '下面接着说第三点：')
    store.fail(id, { code: 'cancelled' })
    return panel('preview-stopped-zh', zhT)
  })()
  const longAnswer = (() => {
    const store = storeFor('preview-long-zh')
    const id = store.begin('把结论整理成表格')
    store.append(id, [
      '## 结论',
      '',
      '| 单位1 | 12 块糖的 1/3 | 6 块糖的 1/3 |',
      '| :-- | --: | --: |',
      '| 实际数量 | 4 块 | 2 块 |',
      '',
      '> 相对性管“谁是单位1”，可变性管“单位1有多大”。',
      '',
      '```ts',
      'export function share(total: number, unit: number): number {',
      '  return total / unit',
      '}',
      '```',
      '',
      '参考 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)。',
    ].join('\n'))
    store.settle(id)
    return panel('preview-long-zh', zhT)
  })()
  const withContext = (() => {
    const store = storeFor('preview-context-zh')
    store.setSelection('相对性与可变性是两件事，前者说的是身份变，后者说的是数值变。')
    return panel('preview-context-zh', zhT)
  })()

  const cards: readonly (readonly [string, string])[] = [
    ['空闲 / empty', empty],
    ['流式回答 / streaming', streaming],
    ['未配置模型 / no model', failed],
    ['已停止 / stopped', stopped],
    ['长回答 / long answer', longAnswer],
    ['带上下文 + 提示 / context + notice', withContext],
  ]

  const lightCards = cards
    .map(([caption, html]) => `<div class="card"><span class="caption">${caption}</span>${html}</div>`)
    .join('\n')

  // The English column re-renders the same shapes with the other dictionary.
  const englishCards = [
    ['empty', panel('preview-empty-en', enT)],
    ['streaming', (() => {
      const store = storeFor('preview-streaming-en')
      const id = store.begin('Why is useMemo needed here?')
      store.append(id, 'Because the composer and the whole transcript share one tree, so every keystroke re-renders all of it.')
      return panel('preview-streaming-en', enT)
    })()],
    ['failed', (() => {
      const store = storeFor('preview-failed-en')
      const id = store.begin('Explain this error')
      store.fail(id, { code: 'rate-limited' })
      return panel('preview-failed-en', enT)
    })()],
  ] as const

  // The notice is module state, so it is published around its one render.
  publishNotice({ key: 'notice.openFailed' }, 0)
  const noticeBar = renderToStaticMarkup(<SideChatNoticeBar t={enT} />)
  dismissNotice()
  const englishColumn = englishCards
    .map(([caption, html]) => `<div class="card"><span class="caption">${caption}</span>${html}</div>`)
    .join('\n')

  return `<!doctype html>
<html><head><meta charset="utf-8"><title>dsh-side-chat panel states</title>
<style>${TOKENS}</style><style>${PANEL_CSS}</style><style>${HARNESS_CSS}</style></head>
<body>
<section>
  <h1>中文 · 浅色主题（真实 token）</h1>
  <div class="grid">${lightCards}</div>
</section>
<section data-ds-dark-theme>
  <h1>English · dark theme</h1>
  <div class="grid">${englishColumn}
    <div class="card"><span class="caption">notice bar</span>${noticeBar}</div>
  </div>
</section>
</body></html>`
}

describe('panel states preview', () => {
  it('renders every panel state without throwing', () => {
    const page = buildPage()
    expect(page).toContain('sc-root')
    expect(page).toContain(zh['error.not-configured'])
    expect(page).toContain(en['composer.placeholder'])
    if (process.env.DSH_SIDE_CHAT_PREVIEW === '1') {
      const out = process.env.DSH_SIDE_CHAT_PREVIEW_OUT ?? join(tmpdir(), 'dsh-side-chat-panel.html')
      writeFileSync(out, page)
      console.log(`panel preview written to ${out}`)
    }
  })
})
