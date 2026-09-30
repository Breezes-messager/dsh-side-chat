/**
 * Layout audit fixture.
 *
 * The header-button overlap the user hit was a *layout* bug: correct markup and
 * correct copy, wrong box. Unit tests cannot see that class of bug, so this
 * fixture mounts every surface this plugin draws — the panel, the header control,
 * the per-message action, the floating selection action and the notice bar — in a
 * container shaped like the one DSH gives it, and lets a headless browser measure
 * the result.
 *
 * Measurement (`measure-layout.mjs`) looks for four things: a surface overlapping
 * a sibling, a surface escaping its container, text clipped inside its own box,
 * and a control collapsed to zero size.
 *
 *   DSH_SIDE_CHAT_LAYOUT_AUDIT=<out.html> pnpm test tests/client-layout-audit.spec.tsx
 *
 * It is a no-op otherwise, so the normal suite never touches the filesystem.
 */
// @vitest-environment node
import { writeFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { AskInSideChatAction, SideChatHeaderButton } from '../src/client/actions.tsx'
import { en, zh } from '../src/client/locales.ts'
import { CLASS, PANEL_CSS } from '../src/client/styles.ts'
import { storeFor } from '../src/client/store.ts'
import { SideChatBody } from '../src/client/panel.tsx'

const t = (dictionary: Record<string, string>) => (key: string) => dictionary[key] ?? key

/** The tab body, in a real state: one exchange plus a streaming answer. */
function panel(state: 'empty' | 'chat'): string {
  const store = storeFor(`audit-${state}`)
  if (state === 'chat') {
    const answer = store.begin('这段代码里为什么要用 useMemo？')
    store.append(answer, '因为 composer 和整份对话在同一个组件树里，每次输入都会让 React 重新渲染整棵树。')
    store.settle(answer)
  }
  return renderToStaticMarkup(<SideChatBody sessionId={`audit-${state}`} t={t(zh)} />)
}

const headerButton = renderToStaticMarkup(<SideChatHeaderButton t={t(zh)} open={() => {}} />)
const messageAction = renderToStaticMarkup(<AskInSideChatAction messageId={'m1' as never} t={t(zh)} askAbout={() => {}} />)

/** A sibling control shaped like the shipped ones in the same action row. */
const sibling = (label: string) => `<button type="button" class="audit-sibling">${label}</button>`
const selectionButton = (label: string, x: number, y: number) => `
  <div class="${CLASS.selectionLayer}">
    <button type="button" class="${CLASS.selectionButton}" style="left:${x}px;top:${y}px">${label}</button>
  </div>`

const notice = (text: string) => `
  <div class="${CLASS.notice}" role="status">
    <span class="${CLASS.noticeText}">${text}</span>
    <button type="button" class="${CLASS.noticeClose}" aria-label="dismiss">×</button>
  </div>`

/**
 * One case: a surface inside a box shaped like the seat that holds it.
 *
 * The stage's own layout is inline, because the page's first stylesheet has to
 * coexist with the plugin's injected one and an inline style cannot be lost to
 * that interaction.
 */
const caseBlock = (name: string, width: number, height: number, body: string, layout: 'row' | 'column' = 'column') => `
<div class="case">
  <h2>${name}</h2>
  <div class="stage" data-case="${name}" style="width:${width}px;height:${height}px;display:flex;flex-direction:${layout};align-items:${layout === 'row' ? 'center' : 'stretch'};gap:6px;padding:${layout === 'row' ? '4px 8px' : '0'};position:relative;overflow:hidden;border:1px solid #dde;border-radius:6px;background:#fff;margin:0 10px">${body}</div>
</div>`

const page = `<!doctype html>
<meta charset="utf-8">
<title>layout audit</title>
<style>
  body { margin: 0; font: 13px system-ui, sans-serif; color: #0f1115; background: #f9fafb; }
  .case { border-bottom: 1px dashed #ccd; padding-bottom: 10px; }
  .case > h2 { font-size: 11px; margin: 8px 10px 4px; color: #61666b; font-weight: 500; }
  .stage { position: relative; margin: 0 10px; border: 1px solid #dde; border-radius: 6px;
           background: #fff; overflow: hidden; }
  /* Shapes the shell gives these seats. */
  .stage.header-row, .stage.action-row { display: flex; flex-direction: row; align-items: center; gap: 6px; overflow: hidden; }
  .stage.header-row { padding: 4px 8px; }
  .stage.action-row { padding: 2px 6px; }
  .audit-sibling { display: inline-flex; flex: 0 0 auto; align-items: center; height: 26px;
                   padding: 0 8px; border: none; border-radius: 7px; background: none;
                   font: inherit; font-size: 12px; color: inherit; white-space: nowrap; }
  .audit-sibling.squeeze { flex: 0 1 auto; min-width: 0; overflow: hidden; white-space: nowrap; }
</style>
<style>
${PANEL_CSS}
</style>

${caseBlock('panel · 300px 窄侧栏 · 空态', 300, 460, panel('empty'))}
${caseBlock('panel · 300px 窄侧栏 · 有对话', 300, 460, panel('chat'))}
${caseBlock('panel · 520px 宽侧栏 · 有对话', 520, 460, panel('chat'))}

${caseBlock('header · 拥挤行（相邻控件可压缩）', 260, 60, `
  ${sibling('8 个子智能体')}
  <button type="button" class="audit-sibling squeeze">10 个后台任务，名字很长很长</button>
  ${headerButton}
  ${sibling('⋯')}`, 'row')}

${caseBlock('message action · 动作行（相邻可压缩）', 260, 60, `
  ${sibling('赞')}${sibling('踩')}
  <button type="button" class="audit-sibling squeeze">复制这段很长的回答文本</button>
  ${messageAction}`, 'row')}

${caseBlock('selection · 标签靠左边缘', 340, 90, selectionButton('侧边聊天中提问', 90, 30))}
${caseBlock('selection · 标签靠右边缘', 340, 90, selectionButton('侧边聊天中提问', 250, 30))}
${caseBlock('notice · 正常文案', 640, 90, notice('侧边聊天暂时打不开。请先打开一个对话，然后再点一次。'))}
${caseBlock('notice · 极长文案', 320, 140, notice('侧边聊天暂时打不开。请先打开一个对话，然后再点一次。如果一直打不开，请重载窗口后重试，并确认插件页里这个插件是启用状态。'))}

<pre id="report">pending</pre>
<script>
  // Only elements this plugin draws matter; the fixture's own siblings are
  // context, not subjects.
  const isOurs = (el) => [...el.classList].some((c) => c.startsWith('sc-'))
  const nameOf = (el) => el.className.toString().split(' ')[0]
    || el.getAttribute('aria-label') || el.tagName.toLowerCase()

  const result = [...document.querySelectorAll('.stage')].map((stage) => {
    const stageRect = stage.getBoundingClientRect()
    const ours = [...stage.querySelectorAll('*')].filter(isOurs)

    const escapes = []
    const offscreen = []
    // An element inside a fixed layer (the notice bar's text and its close button)
    // is positioned by the viewport too, even though its own position is static.
    const insideFixed = (el) => {
      for (let node = el; node !== null && node !== stage; node = node.parentElement) {
        if (getComputedStyle(node).position === 'fixed') return true
      }
      return false
    }
    for (const el of ours) {
      const r = el.getBoundingClientRect()
      if (r.width === 0 || r.height === 0) continue
      // Fixed layers belong to the viewport, not to this stage: the selection
      // action and the notice bar ride the frame-wide overlay on purpose. Judge
      // those against the viewport instead.
      if (insideFixed(el)) {
        const out = Math.max(
          Math.round(-r.left), Math.round(r.right - window.innerWidth),
          Math.round(-r.top), Math.round(r.bottom - window.innerHeight),
        )
        if (out > 1) offscreen.push(nameOf(el) + ':' + out)
        continue
      }
      const over = Math.max(
        Math.round(stageRect.left - r.left),
        Math.round(r.right - stageRect.right),
        Math.round(stageRect.top - r.top),
        Math.round(r.bottom - stageRect.bottom),
      )
      if (over > 1) escapes.push(nameOf(el) + ':' + over)
    }

    const overlaps = []
    for (const el of ours) {
      const r = el.getBoundingClientRect()
      if (r.width === 0 || r.height === 0) continue
      for (const other of [...stage.querySelectorAll('*')]) {
        if (other === el || el.contains(other) || other.contains(el)) continue
        // Only sibling *content* boxes count; text nodes are not elements.
        const o = other.getBoundingClientRect()
        if (o.width === 0 || o.height === 0) continue
        const ix = Math.min(r.right, o.right) - Math.max(r.left, o.left)
        const iy = Math.min(r.bottom, o.bottom) - Math.max(r.top, o.top)
        if (ix > 1.5 && iy > 1.5) overlaps.push(nameOf(el) + '×' + nameOf(other))
      }
    }

    const clipped = []
    const collapsed = []
    const scrollable = []
    for (const el of ours) {
      const r = el.getBoundingClientRect()
      if (r.width === 0 || r.height === 0) {
        // Absolute/fixed layers and SVG wrappers may legitimately be zero.
        if (!['sc-selection-layer'].includes(nameOf(el))) collapsed.push(nameOf(el))
        continue
      }
      const style = getComputedStyle(el)
      if (el.scrollWidth > el.clientWidth + 1 && style.overflowX !== 'auto' && style.overflowX !== 'scroll') {
        clipped.push(nameOf(el) + ' x:' + (el.scrollWidth - el.clientWidth))
      }
      if (el.scrollHeight > el.clientHeight + 1 && style.overflowY !== 'auto' && style.overflowY !== 'scroll') {
        clipped.push(nameOf(el) + ' y:' + (el.scrollHeight - el.clientHeight))
      }
      if (style.overflowX === 'auto' || style.overflowY === 'auto') {
        if (el.scrollWidth > el.clientWidth + 1 || el.scrollHeight > el.clientHeight + 1) scrollable.push(nameOf(el))
      }
    }

    return {
      case: stage.dataset.case,
      escapes,
      offscreen,
      // De-duplicate: an overlap is reported from both sides.
      overlaps: [...new Set(overlaps.map((p) => p.split('×').sort().join('↔')))],
      clipped: [...new Set(clipped)],
      collapsed: [...new Set(collapsed)],
      scrollable: [...new Set(scrollable)],
    }
  })
  document.getElementById('report').textContent = 'RESULT ' + JSON.stringify(result)
</script>
`

describe('layout audit fixture', () => {
  it('writes the fixture when asked', () => {
    const out = process.env.DSH_SIDE_CHAT_LAYOUT_AUDIT
    if (out !== undefined && out.length > 0) {
      writeFileSync(out, page)
      console.log(`layout audit fixture written to ${out}`)
    }
    expect(page).toContain('sc-root')
  })
})

// Keep the dictionaries referenced so an unused-import error cannot hide a
// future locale change from this fixture.
void en
