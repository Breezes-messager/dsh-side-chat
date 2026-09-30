/**
 * Crowded-header layout check.
 *
 * The conversation/sidebar header is a shared flex row: several plugins
 * contribute controls to it, and once the labels add up the row runs out of
 * room. If our control is allowed to shrink below its content, its label spills
 * over the neighbour on both sides — which is exactly what a user reported.
 *
 * This writes a page that puts the real button markup and the real stylesheet
 * into such a row at several widths, with a script that reports measured
 * rectangles. `tests/acceptance/tools`-style measurement reads the result with a
 * headless browser; see the command in the repository's development notes.
 *
 *   DSH_SIDE_CHAT_HEADER_PREVIEW=<out.html> pnpm test tests/client-header-fit.spec.tsx
 *
 * It is a no-op otherwise, so the normal suite never touches the filesystem.
 */
// @vitest-environment node
import { writeFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { SideChatHeaderButton } from '../src/client/actions.tsx'
import { CLASS, PANEL_CSS } from '../src/client/styles.ts'

/** The button as the slot renders it, with copy instead of a live injection. */
const button = renderToStaticMarkup(<SideChatHeaderButton t={(key: string) => (key === 'header.open' ? '侧边聊天' : key)} />)

/** Neighbouring controls, shaped like the shipped ones (icon, or icon + label). */
const neighbour = (label: string, withLabel = true) => `
  <button type="button" class="sc-header-button nb">${withLabel ? `<span class="sc-header-label">${label}</span>` : ''}</button>`

const page = `<!doctype html>
<meta charset="utf-8">
<title>crowded header fit</title>
<style>
  body { margin: 0; font: 13px system-ui, sans-serif; background: #f9fafb; color: #0f1115; }
  /* The header row as the shell lays it out: one flex line, no wrapping. */
  .row { display: flex; align-items: center; gap: 6px; padding: 6px 10px; white-space: nowrap; overflow: hidden; }
  .row.narrow { width: 360px; }
  .row.tight { width: 300px; }
  .row.cramped { width: 210px; }
  .row.roomy { width: 900px; }
  .nb { display: inline-flex; flex: 0 0 auto; align-items: center; height: 26px; padding: 0 8px; border: none;
        border-radius: 7px; background: none; font: inherit; font-size: 12px; }
  .case { border-bottom: 1px dashed #ccc; }
  .case > h2 { font-size: 12px; margin: 8px 10px 0; color: #61666b; font-weight: 500; }
  .spacer { flex: 0 0 auto; width: 22px; }
</style>
<style>
${PANEL_CSS}
</style>
<div class="case"><h2>900px — roomy</h2>
  <div class="row roomy" id="roomy" data-case="roomy">
    ${neighbour('8 个子智能体')}
    <button type="button" class="sc-header-button nb" aria-label="agents"></button>
    ${neighbour('10 个后台任务')}
    <span class="spacer"></span>
    ${button}
    ${neighbour('⋯', false)}
  </div>
</div>
<div class="case"><h2>360px — narrow (sidebar width)</h2>
  <div class="row narrow" id="narrow" data-case="narrow">
    ${neighbour('8 个子智能体')}
    ${neighbour('10 个后台任务')}
    <span class="spacer"></span>
    ${button}
    ${neighbour('⋯', false)}
  </div>
</div>
<div class="case"><h2>300px — tight</h2>
  <div class="row tight" id="tight" data-case="tight">
    ${neighbour('8 个子智能体')}
    ${neighbour('10 个后台任务')}
    ${button}
    ${neighbour('⋯', false)}
  </div>
</div>
<div class="case"><h2>210px — cramped (label should give way, glyph stays)</h2>
  <div class="row cramped" id="cramped" data-case="cramped">
    ${neighbour('8 个子智能体')}
    ${button}
    ${neighbour('⋯', false)}
  </div>
</div>
<pre id="report">pending</pre>
<script>
  // Measure: does our button overlap any sibling, and is its label readable?
  const rows = [...document.querySelectorAll('.row')]
  const out = rows.map((row) => {
    const mine = row.querySelector('.${CLASS.headerButton}.sc-header-button:not(.nb)')
    const rect = mine.getBoundingClientRect()
    const overlaps = [...row.children].filter((el) => el !== mine).filter((el) => {
      const r = el.getBoundingClientRect()
      return r.width > 0 && rect.left < r.right - 0.5 && r.left < rect.right - 0.5
    }).map((el) => el.textContent.trim().slice(0, 12) || el.getAttribute('aria-label') || el.tagName)
    const label = mine.querySelector('.${CLASS.headerLabel}')
    const labelWidth = label ? label.getBoundingClientRect().width : 0
    const rowRect = row.getBoundingClientRect()
    return {
      row: row.dataset.case,
      buttonWidth: Math.round(rect.width),
      labelWidth: Math.round(labelWidth),
      rowWidth: Math.round(rowRect.width),
      insideRow: rect.left >= rowRect.left - 0.5 && rect.right <= rowRect.right + 0.5,
      overlaps,
    }
  })
  document.getElementById('report').textContent = 'RESULT ' + JSON.stringify(out)
</script>
`

describe('crowded header fit', () => {
  it('writes the fixture when asked', () => {
    const out = process.env.DSH_SIDE_CHAT_HEADER_PREVIEW
    if (out !== undefined && out.length > 0) {
      writeFileSync(out, page)
      console.log(`header-fit fixture written to ${out}`)
    }
    expect(page).toContain('sc-header-button')
  })
})
