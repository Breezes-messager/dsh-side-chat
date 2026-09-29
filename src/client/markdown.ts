/**
 * A small Markdown parser for the side-chat transcript.
 *
 * The transcript is model output, so it cannot be injected as HTML: this parser
 * produces data, and the renderer builds React elements from it. There is no
 * `dangerouslySetInnerHTML` anywhere in this plugin, which is why the subset
 * below — the constructs a chat answer actually uses — is enough.
 *
 * Pure and dependency-free on purpose: the whole surface is unit-tested without
 * a DOM.
 */

/** One block-level construct. */
export type Block =
  | { readonly kind: 'paragraph'; readonly lines: readonly string[] }
  | { readonly kind: 'heading'; readonly level: number; readonly text: string }
  | { readonly kind: 'code'; readonly language: string | undefined; readonly text: string }
  | { readonly kind: 'list'; readonly ordered: boolean; readonly start: number; readonly items: readonly ListItem[] }
  | { readonly kind: 'quote'; readonly lines: readonly string[] }
  | { readonly kind: 'table'; readonly align: readonly TableAlign[]; readonly header: readonly string[], readonly rows: readonly (readonly string[])[] }
  | { readonly kind: 'rule' }

/** One list entry: its own text plus any block nested under it. */
export interface ListItem {
  readonly lines: readonly string[]
  readonly children: readonly Block[]
}

/** Column alignment declared by a table's delimiter row. */
export type TableAlign = 'left' | 'center' | 'right' | undefined

/** One inline construct. */
export type Inline =
  | { readonly kind: 'text'; readonly text: string }
  | { readonly kind: 'code'; readonly text: string }
  | { readonly kind: 'strong'; readonly children: readonly Inline[] }
  | { readonly kind: 'em'; readonly children: readonly Inline[] }
  | { readonly kind: 'link'; readonly href: string; readonly children: readonly Inline[] }

/** Link targets this renderer will emit; anything else stays literal text. */
const SAFE_HREF = /^(?:https?:\/\/|mailto:)/i

const FENCE = /^\s*(?:```|~~~)\s*([^`\s]*)\s*$/
const HEADING = /^(#{1,6})\s+(.*)$/
const RULE = /^\s*(?:-{3,}|\*{3,}|_{3,})\s*$/
const LIST_ITEM = /^([ \t]*)([-*+]|\d{1,9}[.)])[ \t]+(.*)$/
const QUOTE = /^\s*>\s?(.*)$/
const TABLE_DELIMITER = /^\s*\|?[ \t]*:?-{1,}:?[ \t]*(?:\|[ \t]*:?-{1,}:?[ \t]*)*\|?\s*$/

/**
 * Split one line into inline constructs.
 *
 * Unmatched markers stay literal, which is what makes an answer that mentions
 * `**` mid-sentence read correctly instead of swallowing the rest of the line.
 * @param text - one line of Markdown.
 * @returns the inline run, always non-empty for non-empty input.
 */
export function parseInline(text: string): Inline[] {
  const nodes: Inline[] = []
  let buffer = ''
  let index = 0
  const flush = (): void => {
    if (buffer.length > 0) {
      nodes.push({ kind: 'text', text: buffer })
      buffer = ''
    }
  }

  while (index < text.length) {
    const rest = text.slice(index)
    const char = rest[0] as string

    if (char === '`') {
      const end = rest.indexOf('`', 1)
      if (end > 1) {
        flush()
        nodes.push({ kind: 'code', text: rest.slice(1, end) })
        index += end + 1
        continue
      }
    }

    if (char === '*' || char === '_') {
      const marker = char.repeat(2)
      if (rest.startsWith(marker)) {
        const end = rest.indexOf(marker, 2)
        if (end > 2) {
          flush()
          nodes.push({ kind: 'strong', children: parseInline(rest.slice(2, end)) })
          index += end + 2
          continue
        }
      }
      const end = rest.indexOf(char, 1)
      if (end > 1) {
        flush()
        nodes.push({ kind: 'em', children: parseInline(rest.slice(1, end)) })
        index += end + 1
        continue
      }
    }

    if (char === '[') {
      const close = rest.indexOf('](')
      const end = close < 0 ? -1 : rest.indexOf(')', close + 2)
      if (close > 1 && end > close + 2) {
        const href = rest.slice(close + 2, end).trim()
        if (SAFE_HREF.test(href)) {
          flush()
          nodes.push({ kind: 'link', href, children: parseInline(rest.slice(1, close)) })
          index += end + 1
          continue
        }
      }
    }

    buffer += char
    index += 1
  }
  flush()
  return nodes
}

/** Leading indentation of one line, with tabs counted as two columns. */
function indentOf(line: string): number {
  let width = 0
  for (const char of line) {
    if (char === ' ') width += 1
    else if (char === '\t') width += 2
    else break
  }
  return width
}

/** One parsed list marker. */
interface Marker {
  readonly indent: number
  readonly ordered: boolean
  /** What distinguishes this list from the next one: `ordered`, or the bullet character. */
  readonly kind: string
  readonly start: number
  readonly text: string
}

/** Read one line as a list marker, or `undefined`. */
function markerOf(line: string): Marker | undefined {
  const match = LIST_ITEM.exec(line)
  if (match === null) return undefined
  const bullet = match[2] as string
  const ordered = /^\d/.test(bullet)
  return {
    indent: indentOf(match[1] as string),
    ordered,
    kind: ordered ? 'ordered' : bullet,
    start: ordered ? Number.parseInt(bullet, 10) : 1,
    text: match[3] as string,
  }
}

/**
 * Parse one list run, including the lists nested inside its items.
 * @param lines - the whole document's lines.
 * @param start - index of the run's first item.
 * @returns the list block and the index after it.
 */
function parseList(lines: readonly string[], start: number): { block: Block; next: number } {
  const first = markerOf(lines[start] as string) as Marker
  const base = first.indent
  const items: { lines: string[], children: Block[] }[] = []
  let index = start

  while (index < lines.length) {
    const line = lines[index] as string
    const marker = markerOf(line)

    if (marker === undefined) {
      // A blank line ends the run unless the same list continues after it
      // (a "loose" list, which only changes presentation).
      if (line.trim().length === 0) {
        const following = lines[index + 1]
        const next = following === undefined ? undefined : markerOf(following)
        if (next === undefined || next.indent !== base || next.kind !== first.kind) break
        index += 1
        continue
      }
      break
    }
    if (marker.indent < base) break
    // A different marker at the same level starts a new list, as Markdown does.
    if (marker.indent === base && marker.kind !== first.kind) break
    if (marker.indent > base) {
      const parent = items[items.length - 1]
      if (parent === undefined) break
      const nested = parseList(lines, index)
      parent.children.push(nested.block)
      index = nested.next
      continue
    }

    items.push({ lines: [marker.text], children: [] })
    index += 1
    while (index < lines.length) {
      const continuation = lines[index] as string
      if (continuation.trim().length === 0) break
      if (markerOf(continuation) !== undefined) break
      if (indentOf(continuation) <= base) break
      ;(items[items.length - 1] as { lines: string[] }).lines.push(continuation.trim())
      index += 1
    }
  }

  return {
    block: { kind: 'list', ordered: first.ordered, start: first.start, items },
    next: index,
  }
}

/** Split one table row into cells, honoring a backslash-escaped pipe. */
export function splitTableRow(line: string): string[] {
  const cells: string[] = []
  let current = ''
  let trimmed = line.trim()
  if (trimmed.startsWith('|')) trimmed = trimmed.slice(1)
  if (trimmed.endsWith('|') && !trimmed.endsWith('\\|')) trimmed = trimmed.slice(0, -1)
  for (let index = 0; index < trimmed.length; index += 1) {
    const char = trimmed[index] as string
    if (char === '\\' && trimmed[index + 1] === '|') {
      current += '|'
      index += 1
      continue
    }
    if (char === '|') {
      cells.push(current.trim())
      current = ''
      continue
    }
    current += char
  }
  cells.push(current.trim())
  return cells
}

/** Read one delimiter row's column alignments, or `undefined` when it is not one. */
function alignmentOf(line: string): TableAlign[] | undefined {
  if (!TABLE_DELIMITER.test(line) || !line.includes('-')) return undefined
  return splitTableRow(line).map((cell) => {
    const left = cell.startsWith(':')
    const right = cell.endsWith(':')
    if (left && right) return 'center'
    if (right) return 'right'
    if (left) return 'left'
    return undefined
  })
}

/**
 * Parse one Markdown document into blocks.
 * @param text - the whole message.
 * @returns the blocks, in order.
 */
export function parseMarkdown(text: string): Block[] {
  const lines = text.replace(/\r\n?/g, '\n').split('\n')
  const blocks: Block[] = []
  let paragraph: string[] = []

  const flushParagraph = (): void => {
    if (paragraph.length > 0) {
      blocks.push({ kind: 'paragraph', lines: paragraph })
      paragraph = []
    }
  }

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] as string

    const fence = FENCE.exec(line)
    if (fence !== null) {
      flushParagraph()
      const body: string[] = []
      index += 1
      while (index < lines.length && FENCE.exec(lines[index] as string) === null) {
        body.push(lines[index] as string)
        index += 1
      }
      const language = fence[1]
      blocks.push({ kind: 'code', language: language === '' ? undefined : language, text: body.join('\n') })
      continue
    }

    if (line.trim().length === 0) {
      flushParagraph()
      continue
    }

    if (RULE.test(line)) {
      flushParagraph()
      blocks.push({ kind: 'rule' })
      continue
    }

    const heading = HEADING.exec(line)
    if (heading !== null) {
      flushParagraph()
      blocks.push({ kind: 'heading', level: (heading[1] as string).length, text: (heading[2] as string).trim() })
      continue
    }

    // A table is a row followed by a delimiter row; without the delimiter this
    // is an ordinary line that happens to contain pipes.
    if (line.includes('|')) {
      const alignment = lines[index + 1] === undefined ? undefined : alignmentOf(lines[index + 1] as string)
      if (alignment !== undefined) {
        flushParagraph()
        const header = splitTableRow(line)
        const rows: string[][] = []
        index += 2
        while (index < lines.length) {
          const row = lines[index] as string
          if (row.trim().length === 0 || !row.includes('|')) break
          rows.push(splitTableRow(row))
          index += 1
        }
        index -= 1
        blocks.push({ kind: 'table', align: alignment, header, rows })
        continue
      }
    }

    if (markerOf(line) !== undefined) {
      flushParagraph()
      const list = parseList(lines, index)
      blocks.push(list.block)
      index = list.next - 1
      continue
    }

    const quote = QUOTE.exec(line)
    if (quote !== null) {
      flushParagraph()
      const body: string[] = [quote[1] as string]
      while (index + 1 < lines.length) {
        const next = QUOTE.exec(lines[index + 1] as string)
        if (next === null) break
        body.push(next[1] as string)
        index += 1
      }
      blocks.push({ kind: 'quote', lines: body })
      continue
    }

    paragraph.push(line)
  }
  flushParagraph()
  return blocks
}
