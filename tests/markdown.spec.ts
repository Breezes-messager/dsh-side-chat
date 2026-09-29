import { describe, expect, it } from 'vitest'
import { parseInline, parseMarkdown, splitTableRow } from '../src/client/markdown.ts'

describe('inline parsing', () => {
  it('reads bold, italic and code', () => {
    expect(parseInline('a **b** c *d* e `f`')).toEqual([
      { kind: 'text', text: 'a ' },
      { kind: 'strong', children: [{ kind: 'text', text: 'b' }] },
      { kind: 'text', text: ' c ' },
      { kind: 'em', children: [{ kind: 'text', text: 'd' }] },
      { kind: 'text', text: ' e ' },
      { kind: 'code', text: 'f' },
    ])
  })

  it('reads a link and leaves its label inline-parsed', () => {
    expect(parseInline('[**文档**](https://example.com/x)')).toEqual([
      {
        kind: 'link',
        href: 'https://example.com/x',
        children: [{ kind: 'strong', children: [{ kind: 'text', text: '文档' }] }],
      },
    ])
  })

  it('keeps an unsafe link literal instead of emitting it', () => {
    expect(parseInline('[x](javascript:alert(1))')).toEqual([
      { kind: 'text', text: '[x](javascript:alert(1))' },
    ])
  })

  it('keeps an unmatched marker literal', () => {
    expect(parseInline('2 * 3 = 6')).toEqual([{ kind: 'text', text: '2 * 3 = 6' }])
    expect(parseInline('a **b')).toEqual([{ kind: 'text', text: 'a **b' }])
  })

  it('does not let one marker swallow the rest of the line', () => {
    expect(parseInline('除数 1/3 与 **单位1** 无关')).toEqual([
      { kind: 'text', text: '除数 1/3 与 ' },
      { kind: 'strong', children: [{ kind: 'text', text: '单位1' }] },
      { kind: 'text', text: ' 无关' },
    ])
  })
})

describe('block parsing', () => {
  it('groups paragraph lines until a blank line', () => {
    expect(parseMarkdown('one\ntwo\n\nthree')).toEqual([
      { kind: 'paragraph', lines: ['one', 'two'] },
      { kind: 'paragraph', lines: ['three'] },
    ])
  })

  it('reads headings by level and a horizontal rule', () => {
    expect(parseMarkdown('## 标题\n\n---')).toEqual([
      { kind: 'heading', level: 2, text: '标题' },
      { kind: 'rule' },
    ])
  })

  it('reads a fenced block with its language and keeps its lines verbatim', () => {
    expect(parseMarkdown('```ts\nconst a = 1\n\nconst b = 2\n```')).toEqual([
      { kind: 'code', language: 'ts', text: 'const a = 1\n\nconst b = 2' },
    ])
  })

  it('reads bullet and ordered lists', () => {
    expect(parseMarkdown('- a\n- b\n\n1. x\n2. y')).toEqual([
      { kind: 'list', ordered: false, start: 1, items: [
        { lines: ['a'], children: [] },
        { lines: ['b'], children: [] },
      ] },
      { kind: 'list', ordered: true, start: 1, items: [
        { lines: ['x'], children: [] },
        { lines: ['y'], children: [] },
      ] },
    ])
  })

  it('keeps an ordered list start number', () => {
    expect(parseMarkdown('3. three\n4. four')).toEqual([
      { kind: 'list', ordered: true, start: 3, items: [
        { lines: ['three'], children: [] },
        { lines: ['four'], children: [] },
      ] },
    ])
  })

  it('nests an indented list inside its item', () => {
    const [list] = parseMarkdown('- outer\n  - inner\n  - inner two\n- second')
    expect(list?.kind).toBe('list')
    const items = list?.kind === 'list' ? list.items : []
    expect(items).toHaveLength(2)
    expect(items[0]?.children).toHaveLength(1)
    expect(items[0]?.children[0]).toMatchObject({
      kind: 'list',
      ordered: false,
      items: [{ lines: ['inner'], children: [] }, { lines: ['inner two'], children: [] }],
    })
  })

  it('nests an ordered list inside a bullet', () => {
    const [list] = parseMarkdown('- steps\n  1. first\n  2. second')
    const nested = list?.kind === 'list' ? list.items[0]?.children[0] : undefined
    expect(nested).toMatchObject({ kind: 'list', ordered: true, start: 1 })
  })

  it('keeps a list together across a blank line', () => {
    const blocks = parseMarkdown('- a\n\n- b')
    expect(blocks).toHaveLength(1)
    expect(blocks[0]?.kind === 'list' ? blocks[0].items.length : 0).toBe(2)
  })

  it('keeps a continuation line in its item', () => {
    const [list] = parseMarkdown('- first line\n  second line\n- other')
    const first = list?.kind === 'list' ? list.items[0] : undefined
    expect(first?.lines).toEqual(['first line', 'second line'])
  })

  it('reads a table with its alignment', () => {
    const [table] = parseMarkdown('| a | b | c |\n| :-- | :-: | --: |\n| 1 | 2 | 3 |')
    expect(table).toEqual({
      kind: 'table',
      align: ['left', 'center', 'right'],
      header: ['a', 'b', 'c'],
      rows: [['1', '2', '3']],
    })
  })

  it('reads a table with no outer pipes and no alignment', () => {
    const [table] = parseMarkdown('a | b\n--- | ---\n1 | 2')
    expect(table).toEqual({
      kind: 'table',
      align: [undefined, undefined],
      header: ['a', 'b'],
      rows: [['1', '2']],
    })
  })

  it('keeps an escaped pipe inside one cell', () => {
    expect(splitTableRow('| a \\| b | c |')).toEqual(['a | b', 'c'])
  })

  it('leaves pipe-bearing prose as a paragraph', () => {
    const blocks = parseMarkdown('用 a | b 表示二选一')
    expect(blocks[0]?.kind).toBe('paragraph')
  })

  it('reads a blockquote', () => {
    expect(parseMarkdown('> quoted\n> more')).toEqual([{ kind: 'quote', lines: ['quoted', 'more'] }])
  })

  it('parses the shape an answer actually arrives in', () => {
    const blocks = parseMarkdown([
      '说的是：**相对性与可变性**。',
      '',
      '- **相对性**说的是身份变',
      '- **可变性**说的是数值变',
      '',
      '一句话收口：先统一单位1。',
    ].join('\n'))
    expect(blocks.map(block => block.kind)).toEqual(['paragraph', 'list', 'paragraph'])
  })
})
