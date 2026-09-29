/**
 * The panel's stylesheet, injected once per page from TypeScript.
 *
 * A standalone plugin ships no build-time CSS pipeline, and the panel is one
 * self-contained surface, so the sheet travels as a string. Every colour is a
 * theme token with a fallback, so the panel follows light/dark without a second
 * definition, and every selector is namespaced under `sc-` to avoid reaching
 * into another plugin's surface.
 */

/** Class names the panel draws with. */
export const CLASS = {
  root: 'sc-root',
  empty: 'sc-empty',
  emptyIcon: 'sc-empty-icon',
  emptyTitle: 'sc-empty-title',
  emptyBody: 'sc-empty-body',
  transcript: 'sc-transcript',
  turn: 'sc-turn',
  turnUser: 'sc-turn-user',
  userBubble: 'sc-user-bubble',
  assistant: 'sc-assistant',
  caret: 'sc-caret',
  error: 'sc-error',
  context: 'sc-context',
  footer: 'sc-footer',
  composer: 'sc-composer',
  input: 'sc-input',
  send: 'sc-send',
  ghost: 'sc-ghost',
  headerButton: 'sc-header-button',
  messageAction: 'sc-message-action',
} as const

/** The style tag's identity, so a re-injection is a no-op and HMR can replace it. */
const TAG_ID = 'dsh-side-chat/panel.css'

const CSS = `
.sc-root {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  color: var(--dsw-alias-label-primary, inherit);
  font-size: 13px;
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
.sc-assistant { white-space: pre-wrap; word-break: break-word; line-height: 1.75; }
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
.sc-error { color: var(--dsw-alias-state-error-primary, #d9534f); }
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
  background: var(--dsw-alias-brand-primary, #4d6bfe);
  color: #fff;
  font: inherit;
  cursor: pointer;
}
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
}
.sc-header-button:hover { background: var(--dsw-alias-bg-layer-2, rgba(127, 127, 127, 0.14)); opacity: 1; }
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
`

/** Inject the stylesheet once per page. */
export function ensureStyles(): void {
  if (typeof document === 'undefined') return
  if (document.querySelector(`style[data-plugin-css="${TAG_ID}"]`) !== null) return
  const tag = document.createElement('style')
  tag.dataset.plugin = 'dsh-side-chat'
  tag.dataset.pluginCss = TAG_ID
  tag.textContent = CSS
  document.head.appendChild(tag)
}
