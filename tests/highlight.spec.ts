import { describe, expect, it } from 'vitest'
import { highlightCode, parseHighlightedHtml, resolveLanguage } from '../src/client/highlight.ts'

/** Collect every text leaf of a highlight tree, in order. */
function textOf(nodes: readonly { text?: string, children?: readonly unknown[] }[]): string {
  return nodes.map(node => node.children === undefined
    ? node.text ?? ''
    : textOf(node.children as readonly { text?: string, children?: readonly unknown[] }[])).join('')
}

/** Collect every class name in a highlight tree. */
function classesOf(nodes: readonly { className?: string, children?: readonly unknown[] }[]): string[] {
  return nodes.flatMap(node => [
    ...(node.className === undefined ? [] : [node.className]),
    ...(node.children === undefined ? [] : classesOf(node.children as readonly { className?: string, children?: readonly unknown[] }[])),
  ])
}

describe('language resolution', () => {
  it('maps tags and aliases onto bundled languages', () => {
    expect(resolveLanguage('ts')).toBe('typescript')
    expect(resolveLanguage('TSX')).toBe('typescript')
    expect(resolveLanguage('py')).toBe('python')
    expect(resolveLanguage('sh')).toBe('bash')
    expect(resolveLanguage('html')).toBe('xml')
    expect(resolveLanguage('javascript')).toBe('javascript')
  })

  it('reports nothing for an unknown or empty tag', () => {
    expect(resolveLanguage(undefined)).toBeUndefined()
    expect(resolveLanguage('')).toBeUndefined()
    expect(resolveLanguage('brainfuck')).toBeUndefined()
  })
})

describe('highlighted html parsing', () => {
  it('keeps text verbatim and decodes entities', () => {
    const nodes = parseHighlightedHtml('a &lt;b&gt; &amp;&amp; c &#x27;d&#x27;')
    expect(textOf(nodes)).toBe('a <b> && c \'d\'')
  })

  it('rebuilds nested spans', () => {
    const nodes = parseHighlightedHtml('<span class="hljs-title"><span class="hljs-function">run</span></span>()')
    expect(classesOf(nodes)).toEqual(['hljs-title', 'hljs-function'])
    expect(textOf(nodes)).toBe('run()')
  })

  it('ignores a stray closing tag', () => {
    expect(textOf(parseHighlightedHtml('a</span>b'))).toBe('ab')
  })
})

describe('code highlighting', () => {
  it('highlights a known language and preserves the source exactly', () => {
    const code = 'const answer: number = 42\n'
    const nodes = highlightCode(code, 'ts')
    expect(nodes).toBeDefined()
    expect(textOf(nodes ?? [])).toBe(code)
    expect(classesOf(nodes ?? []).some(name => name.includes('hljs-keyword'))).toBe(true)
  })

  it('never introduces markup: angle brackets stay text', () => {
    const nodes = highlightCode('<div class="x">hi</div>', 'html')
    expect(textOf(nodes ?? [])).toBe('<div class="x">hi</div>')
    expect(classesOf(nodes ?? []).every(name => name.startsWith('hljs-'))).toBe(true)
  })

  it('leaves an unknown language to the caller', () => {
    expect(highlightCode('whatever', 'unknown-lang')).toBeUndefined()
  })

  it('renders fenced python without losing indentation', () => {
    const code = 'def f(x):\n    return x + 1'
    expect(textOf(highlightCode(code, 'python') ?? [])).toBe(code)
  })
})
