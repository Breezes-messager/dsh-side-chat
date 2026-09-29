/**
 * Syntax highlighting for fenced code blocks.
 *
 * highlight.js does the lexing, but its output is an HTML string — and this
 * plugin has no `innerHTML` path. So the string is parsed back into a small
 * node tree here (the only markup highlight.js emits is `<span class="hljs-…">`
 * around escaped text) and rendered as React elements. That keeps a single
 * safety story for the whole transcript: model output is data, never markup.
 */
import hljs from 'highlight.js/lib/core'
import bash from 'highlight.js/lib/languages/bash'
import cpp from 'highlight.js/lib/languages/cpp'
import css from 'highlight.js/lib/languages/css'
import diff from 'highlight.js/lib/languages/diff'
import go from 'highlight.js/lib/languages/go'
import ini from 'highlight.js/lib/languages/ini'
import java from 'highlight.js/lib/languages/java'
import javascript from 'highlight.js/lib/languages/javascript'
import json from 'highlight.js/lib/languages/json'
import markdown from 'highlight.js/lib/languages/markdown'
import plaintext from 'highlight.js/lib/languages/plaintext'
import powershell from 'highlight.js/lib/languages/powershell'
import python from 'highlight.js/lib/languages/python'
import rust from 'highlight.js/lib/languages/rust'
import sql from 'highlight.js/lib/languages/sql'
import typescript from 'highlight.js/lib/languages/typescript'
import xml from 'highlight.js/lib/languages/xml'
import yaml from 'highlight.js/lib/languages/yaml'

/** One highlighted run: a class-carrying span, or literal text. */
export interface HighlightNode {
  readonly className?: string
  readonly text?: string
  readonly children?: readonly HighlightNode[]
}

/** Languages this bundle carries, keyed by their canonical name. */
const LANGUAGES: Record<string, unknown> = {
  bash, cpp, css, diff, go, ini, java, javascript, json, markdown, plaintext, powershell, python, rust, sql,
  typescript, xml, yaml,
}

/** Everything a fence may name, mapped onto a bundled language. */
const ALIASES: Record<string, string> = {
  ts: 'typescript', tsx: 'typescript',
  js: 'javascript', jsx: 'javascript', mjs: 'javascript', cjs: 'javascript', node: 'javascript',
  py: 'python', python3: 'python',
  sh: 'bash', shell: 'bash', zsh: 'bash', console: 'bash',
  ps1: 'powershell', pwsh: 'powershell',
  html: 'xml', htm: 'xml', xml: 'xml', svg: 'xml', vue: 'xml',
  md: 'markdown',
  yml: 'yaml',
  golang: 'go',
  rs: 'rust',
  'c++': 'cpp', cc: 'cpp', h: 'cpp', hpp: 'cpp',
  toml: 'ini', conf: 'ini',
  patch: 'diff',
  text: 'plaintext', txt: 'plaintext', output: 'plaintext', log: 'plaintext',
}

for (const [name, language] of Object.entries(LANGUAGES)) {
  hljs.registerLanguage(name, language as never)
}

/** Resolve a fence's language tag onto a bundled language name. */
export function resolveLanguage(tag: string | undefined): string | undefined {
  if (tag === undefined) return undefined
  const normalized = tag.trim().toLowerCase()
  if (normalized.length === 0) return undefined
  if (normalized in LANGUAGES) return normalized
  return ALIASES[normalized]
}

/** Decode the entity forms highlight.js escapes into. */
function decodeEntities(text: string): string {
  return text.replace(/&(?:#(\d+)|#x([0-9a-f]+)|(amp|lt|gt|quot|#39|apos));/gi, (_match, dec: string, hex: string, named: string) => {
    if (dec !== undefined) return String.fromCodePoint(Number.parseInt(dec, 10))
    if (hex !== undefined) return String.fromCodePoint(Number.parseInt(hex, 16))
    switch ((named as string).toLowerCase()) {
      case 'amp': return '&'
      case 'lt': return '<'
      case 'gt': return '>'
      case 'quot': return '"'
      default: return "'"
    }
  })
}

/**
 * Turn highlight.js HTML into nodes.
 * @param html - the `value` highlight.js produced.
 * @returns the node tree.
 */
export function parseHighlightedHtml(html: string): HighlightNode[] {
  const root: HighlightNode[] = []
  const stack: { className?: string, children: HighlightNode[] }[] = [{ children: root }]
  const pattern = /<span class="([^"]*)">|<\/span>|([^<]+)/g
  let match: RegExpExecArray | null
  while ((match = pattern.exec(html)) !== null) {
    const [raw, openClass, text] = match
    if (openClass !== undefined) {
      const node: { className?: string, children: HighlightNode[] } = { className: openClass, children: [] }
      ;(stack[stack.length - 1] as { children: HighlightNode[] }).children.push(node)
      stack.push(node)
      continue
    }
    if (raw === '</span>') {
      if (stack.length > 1) stack.pop()
      continue
    }
    if (text !== undefined) {
      ;(stack[stack.length - 1] as { children: HighlightNode[] }).children.push({ text: decodeEntities(text) })
    }
  }
  return root
}

/**
 * Highlight one fenced block.
 * @param code - the verbatim source.
 * @param language - the fence's language tag, when it named one.
 * @returns the node tree, or `undefined` when the tag names no bundled language.
 */
export function highlightCode(code: string, language: string | undefined): HighlightNode[] | undefined {
  const name = resolveLanguage(language)
  if (name === undefined) return undefined
  try {
    return parseHighlightedHtml(hljs.highlight(code, { language: name, ignoreIllegals: true }).value)
  } catch {
    // A lexer failure is never worth losing the code over: the block falls back
    // to plain text.
    return undefined
  }
}
