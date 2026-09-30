/**
 * The panel's stylesheet, injected once per page from TypeScript.
 *
 * A standalone plugin ships no build-time CSS pipeline, and the panel is one
 * self-contained surface, so the sheet travels as a string. Every colour is a
 * theme token with a fallback, so the panel follows light/dark without a second
 * definition, and every selector is namespaced under `sc-` to avoid reaching
 * into another plugin's surface.
 *
 * Exported so a rendering test can preview the real sheet instead of a copy.
 */

/** Class names the panel draws with. */
export const CLASS = {
  root: 'sc-root',
  empty: 'sc-empty',
  emptyIcon: 'sc-empty-icon',
  emptyTitle: 'sc-empty-title',
  emptyBody: 'sc-empty-body',
  emptyHint: 'sc-empty-hint',
  transcript: 'sc-transcript',
  turn: 'sc-turn',
  turnUser: 'sc-turn-user',
  userBubble: 'sc-user-bubble',
  assistant: 'sc-assistant',
  caret: 'sc-caret',
  error: 'sc-error',
  failure: 'sc-failure',
  failureError: 'sc-failure-error',
  failureDetail: 'sc-failure-detail',
  partial: 'sc-partial',
  notice: 'sc-notice',
  noticeText: 'sc-notice-text',
  noticeClose: 'sc-notice-close',
  context: 'sc-context',
  footer: 'sc-footer',
  composer: 'sc-composer',
  input: 'sc-input',
  send: 'sc-send',
  ghost: 'sc-ghost',
  headerButton: 'sc-header-button',
  headerLabel: 'sc-header-label',
  messageAction: 'sc-message-action',
  contextText: 'sc-context-text',
  contextClear: 'sc-context-clear',
  selectionLayer: 'sc-selection-layer',
  selectionButton: 'sc-selection-button',
  mdRoot: 'sc-md',
  mdParagraph: 'sc-md-p',
  mdHeading: 'sc-md-h',
  mdCode: 'sc-md-code',
  mdPre: 'sc-md-pre',
  mdList: 'sc-md-list',
  mdQuote: 'sc-md-quote',
  mdLink: 'sc-md-link',
  mdRule: 'sc-md-rule',
  mdTableWrap: 'sc-md-table-wrap',
  mdTable: 'sc-md-table',
} as const

/** The style tag's identity, so a re-injection is a no-op and HMR can replace it. */
const TAG_ID = 'dsh-side-chat/panel.css'

/** The stylesheet text; exported for rendering previews and tests. */
export const PANEL_CSS = `
.sc-root {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  color: var(--dsw-alias-label-primary, inherit);
  font-size: 13px;
}
/* Keyboard users must be able to see where they are: the panel's controls are
   plain text at rest, so focus needs a ring of its own. */
.sc-root :focus-visible {
  outline: 2px solid var(--dsw-alias-brand-primary, #4d6bfe);
  outline-offset: 1px;
  border-radius: 6px;
}
.sc-empty {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  padding: 28px 24px;
  text-align: center;
}
.sc-empty-icon { color: var(--dsw-alias-label-secondary, currentColor); opacity: 0.9; }
.sc-empty-title { margin: 0; font-size: 17px; font-weight: 600; letter-spacing: 0.01em; }
.sc-empty-body {
  margin: 0;
  max-width: 250px;
  color: var(--dsw-alias-label-secondary, currentColor);
  font-size: 13px;
  line-height: 1.7;
}
/* What to do with the panel, for someone opening it for the first time. */
.sc-empty-hint {
  margin: 0;
  max-width: 250px;
  color: var(--dsw-alias-label-secondary, currentColor);
  font-size: 12px;
  line-height: 1.7;
  opacity: 0.85;
}
.sc-transcript {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 16px 14px 8px;
}
.sc-turn { display: flex; flex-direction: column; gap: 5px; }
.sc-turn-user { align-items: flex-end; }
.sc-user-bubble {
  max-width: 88%;
  padding: 8px 11px;
  border-radius: 12px;
  background: var(--dsw-alias-bg-layer-2, rgba(127, 127, 127, 0.14));
  white-space: pre-wrap;
  word-break: break-word;
  line-height: 1.65;
}
.sc-assistant { word-break: break-word; line-height: 1.75; }
.sc-md > *:first-child { margin-top: 0; }
.sc-md > *:last-child { margin-bottom: 0; }
.sc-md-p { margin: 0 0 10px; }
.sc-md-h { margin: 14px 0 8px; font-size: 14px; font-weight: 600; }
.sc-md-list { margin: 0 0 10px; padding-left: 20px; }
.sc-md-list li { margin: 2px 0; }
.sc-md-code {
  padding: 1px 4px;
  border-radius: 5px;
  background: var(--dsw-alias-bg-layer-2, rgba(127, 127, 127, 0.16));
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 12px;
}
.sc-md-pre {
  margin: 0 0 10px;
  padding: 9px 11px;
  overflow-x: auto;
  border: 0.5px solid var(--dsw-alias-border-l1, rgba(127, 127, 127, 0.3));
  border-radius: 8px;
  background: var(--dsw-alias-bg-layer-1, rgba(127, 127, 127, 0.08));
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 12px;
  line-height: 1.6;
  white-space: pre;
}
.sc-md-quote {
  margin: 0 0 10px;
  padding: 2px 0 2px 10px;
  border-left: 2px solid var(--dsw-alias-border-l2, rgba(127, 127, 127, 0.4));
  color: var(--dsw-alias-label-secondary, currentColor);
}
.sc-md-quote p { margin: 0 0 4px; }
.sc-md-link { color: var(--dsw-alias-brand-primary, inherit); text-decoration: none; }
.sc-md-link:hover { text-decoration: underline; }
.sc-md-rule {
  margin: 12px 0;
  border: none;
  border-top: 0.5px solid var(--dsw-alias-border-l1, rgba(127, 127, 127, 0.3));
}
.sc-caret {
  display: inline-block;
  width: 7px;
  height: 13px;
  margin-left: 2px;
  vertical-align: -2px;
  background: currentColor;
  opacity: 0.55;
  animation: sc-blink 1s steps(2, start) infinite;
}
@keyframes sc-blink { to { visibility: hidden; } }
@media (prefers-reduced-motion: reduce) {
  .sc-caret { animation: none; }
}
.sc-error { color: var(--dsw-alias-state-error-primary, #d9534f); }
/* A turn that ended without an answer: the reason first, the raw text under it. */
.sc-failure {
  display: flex;
  flex-direction: column;
  gap: 2px;
  margin-top: 4px;
  color: var(--dsw-alias-label-secondary, currentColor);
  font-size: 12px;
  line-height: 1.6;
}
.sc-failure-error { color: var(--dsw-alias-state-error-primary, #d9534f); }
.sc-failure-detail {
  color: var(--dsw-alias-label-secondary, currentColor);
  font-size: 11px;
  word-break: break-word;
  opacity: 0.8;
}
/* Text streamed before the turn failed: literal, never parsed as Markdown. */
.sc-partial { white-space: pre-wrap; word-break: break-word; }
.sc-context {
  display: flex;
  align-items: center;
  gap: 6px;
  margin: 0 14px 4px;
  padding: 6px 9px;
  border: 0.5px solid var(--dsw-alias-border-l1, rgba(127, 127, 127, 0.3));
  border-radius: 8px;
  color: var(--dsw-alias-label-secondary, currentColor);
  font-size: 12px;
}
.sc-context-text {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.sc-context-clear {
  flex: none;
  border: none;
  background: none;
  color: inherit;
  cursor: pointer;
  font-size: 14px;
  line-height: 1;
  padding: 0 2px;
  opacity: 0.7;
}
.sc-context-clear:hover { opacity: 1; }
.sc-selection-layer {
  position: fixed;
  inset: 0;
  z-index: 60;
  pointer-events: none;
}
.sc-selection-button {
  position: fixed;
  transform: translate(-50%, -100%);
  pointer-events: auto;
  display: inline-flex;
  align-items: center;
  gap: 5px;
  height: 28px;
  padding: 0 10px;
  border: 0.5px solid var(--dsw-alias-border-l1, rgba(127, 127, 127, 0.35));
  border-radius: 8px;
  background: var(--dsw-alias-bg-overlay, #fff);
  color: var(--dsw-alias-label-primary, inherit);
  font: inherit;
  font-size: 12px;
  cursor: pointer;
  box-shadow: 0 4px 14px rgba(0, 0, 0, 0.16);
}
.sc-selection-button:hover { border-color: var(--dsw-alias-border-l2, currentColor); }
/* The frame-wide notice: the only voice a click has when no panel can open. */
.sc-notice {
  position: fixed;
  left: 50%;
  bottom: 28px;
  transform: translateX(-50%);
  z-index: 61;
  pointer-events: auto;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  max-width: min(560px, calc(100vw - 48px));
  padding: 9px 10px 9px 13px;
  border: 0.5px solid var(--dsw-alias-border-l1, rgba(127, 127, 127, 0.3));
  border-radius: 10px;
  background: var(--dsw-alias-bg-overlay, #fff);
  color: var(--dsw-alias-label-primary, inherit);
  font-size: 12px;
  line-height: 1.5;
  box-shadow: 0 4px 14px rgba(0, 0, 0, 0.16);
}
.sc-notice-text { flex: 1; min-width: 0; }
.sc-notice-close {
  flex: none;
  border: none;
  background: none;
  color: inherit;
  cursor: pointer;
  font-size: 15px;
  line-height: 1;
  padding: 0 3px;
  opacity: 0.7;
}
.sc-notice-close:hover { opacity: 1; }
.sc-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 2px 14px 8px;
  color: var(--dsw-alias-label-secondary, currentColor);
  font-size: 11px;
}
.sc-composer {
  display: flex;
  align-items: flex-end;
  gap: 8px;
  padding: 10px 12px 12px;
  border-top: 0.5px solid var(--dsw-alias-border-l1, rgba(127, 127, 127, 0.25));
}
.sc-input {
  flex: 1;
  min-height: 34px;
  max-height: 160px;
  padding: 8px 10px;
  border: 0.5px solid var(--dsw-alias-border-l1, rgba(127, 127, 127, 0.35));
  border-radius: 10px;
  background: var(--dsw-alias-bg-layer-1, transparent);
  color: inherit;
  font: inherit;
  line-height: 1.6;
  outline: none;
  resize: none;
}
.sc-input:focus { border-color: var(--dsw-alias-border-l2, currentColor); }
.sc-send {
  height: 34px;
  padding: 0 14px;
  border: none;
  border-radius: 10px;
  /* The theme's own primary-button pair. A hard-coded white label on the brand
     token reads as an empty button in a dark theme, where that token is
     near-white: both halves have to come from the theme. */
  background: var(--dsw-alias-button-primary-fill, #4d6bfe);
  color: var(--dsw-alias-label-primary-foreground, #fff);
  font: inherit;
  cursor: pointer;
}
.sc-send:hover:not(:disabled) { background: var(--dsw-alias-button-primary-hover, #3f56d0); }
.sc-send:disabled { opacity: 0.45; cursor: default; }
.sc-ghost {
  border: none;
  background: none;
  color: inherit;
  opacity: 0.72;
  font: inherit;
  font-size: 11px;
  cursor: pointer;
  padding: 0;
}
.sc-ghost:hover { opacity: 1; }
.sc-header-button {
  display: inline-flex;
  flex: 0 0 auto;
  align-items: center;
  gap: 5px;
  height: 26px;
  padding: 0 8px;
  border: none;
  border-radius: 7px;
  background: none;
  color: inherit;
  font: inherit;
  font-size: 12px;
  cursor: pointer;
  opacity: 0.78;
  /* A crowded header row must never squeeze this control: shrinking it past its
     content makes the label overlap the neighbour on both sides. */
  min-width: max-content;
  white-space: nowrap;
}
.sc-header-button:hover { background: var(--dsw-alias-bg-layer-2, rgba(127, 127, 127, 0.14)); opacity: 1; }
/* The glyph keeps its box; the label simply cannot wrap. */
.sc-header-button > svg { flex: 0 0 auto; }
.sc-header-label { white-space: nowrap; }
.sc-message-action {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: none;
  background: none;
  color: inherit;
  cursor: pointer;
  padding: 2px;
  border-radius: 6px;
  opacity: 0.75;
}
.sc-message-action:hover { opacity: 1; background: var(--dsw-alias-bg-layer-2, rgba(127, 127, 127, 0.14)); }
.sc-md-table-wrap { margin: 0 0 10px; overflow-x: auto; }
.sc-md-table {
  border-collapse: collapse;
  width: 100%;
  font-size: 12px;
  line-height: 1.55;
}
.sc-md-table th,
.sc-md-table td {
  padding: 5px 8px;
  border: 0.5px solid var(--dsw-alias-border-l1, rgba(127, 127, 127, 0.3));
  vertical-align: top;
}
.sc-md-table th {
  background: var(--dsw-alias-bg-layer-2, rgba(127, 127, 127, 0.12));
  font-weight: 600;
  text-align: left;
}
/* Highlight tokens: one palette per colour scheme. The panel's own colours come
   from theme tokens, but a syntax palette has no token vocabulary to draw on, so
   it follows the system scheme the same way an editor would. */
.sc-md-pre .hljs-comment, .sc-md-pre .hljs-quote { color: #6a737d; font-style: italic; }
.sc-md-pre .hljs-keyword, .sc-md-pre .hljs-selector-tag, .sc-md-pre .hljs-literal, .sc-md-pre .hljs-doctag { color: #cf222e; }
.sc-md-pre .hljs-string, .sc-md-pre .hljs-regexp { color: #0a3069; }
.sc-md-pre .hljs-number, .sc-md-pre .hljs-symbol, .sc-md-pre .hljs-bullet { color: #0550ae; }
.sc-md-pre .hljs-title, .sc-md-pre .hljs-section, .sc-md-pre .hljs-name, .sc-md-pre .hljs-selector-id { color: #8250df; }
.sc-md-pre .hljs-attr, .sc-md-pre .hljs-attribute, .sc-md-pre .hljs-variable,
.sc-md-pre .hljs-template-variable, .sc-md-pre .hljs-type, .sc-md-pre .hljs-property { color: #953800; }
.sc-md-pre .hljs-built_in, .sc-md-pre .hljs-class .hljs-title { color: #0550ae; }
.sc-md-pre .hljs-meta, .sc-md-pre .hljs-params { color: #57606a; }
.sc-md-pre .hljs-addition { color: #116329; }
.sc-md-pre .hljs-deletion { color: #82071e; }
@media (prefers-color-scheme: dark) {
  .sc-md-pre .hljs-comment, .sc-md-pre .hljs-quote { color: #8b949e; }
  .sc-md-pre .hljs-keyword, .sc-md-pre .hljs-selector-tag, .sc-md-pre .hljs-literal, .sc-md-pre .hljs-doctag { color: #ff7b72; }
  .sc-md-pre .hljs-string, .sc-md-pre .hljs-regexp { color: #a5d6ff; }
  .sc-md-pre .hljs-number, .sc-md-pre .hljs-symbol, .sc-md-pre .hljs-bullet { color: #79c0ff; }
  .sc-md-pre .hljs-title, .sc-md-pre .hljs-section, .sc-md-pre .hljs-name, .sc-md-pre .hljs-selector-id { color: #d2a8ff; }
  .sc-md-pre .hljs-attr, .sc-md-pre .hljs-attribute, .sc-md-pre .hljs-variable,
  .sc-md-pre .hljs-template-variable, .sc-md-pre .hljs-type, .sc-md-pre .hljs-property { color: #ffa657; }
  .sc-md-pre .hljs-built_in, .sc-md-pre .hljs-class .hljs-title { color: #79c0ff; }
  .sc-md-pre .hljs-meta, .sc-md-pre .hljs-params { color: #8b949e; }
  .sc-md-pre .hljs-addition { color: #7ee787; }
  .sc-md-pre .hljs-deletion { color: #ffa198; }
}
`

/** Inject the stylesheet once per page. */
export function ensureStyles(): void {
  if (typeof document === 'undefined') return
  if (document.querySelector(`style[data-plugin-css="${TAG_ID}"]`) !== null) return
  const tag = document.createElement('style')
  tag.dataset.plugin = 'dsh-side-chat'
  tag.dataset.pluginCss = TAG_ID
  tag.textContent = PANEL_CSS
  document.head.appendChild(tag)
}
