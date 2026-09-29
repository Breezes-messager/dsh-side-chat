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
  | { readonly kind: 'list'; readonly ordered: boolean; readonly start: number; readonly items: readonly string[] }
  | { readonly kind: 'quote'; readonly lines: readonly string[] }
  | { readonly kind: 'rule' }

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
const BULLET = /^\s*[-*+]\s+(.*)$/
const ORDERED = /^\s*(\d{1,9})[.)]\s+(.*)$/
const QUOTE = /^\s*>\s?(.*)$/

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

    const bullet = BULLET.exec(line)
    const ordered = bullet === null ? ORDERED.exec(line) : null
    if (bullet !== null || ordered !== null) {
      flushParagraph()
      const isOrdered = ordered !== null
      const start = isOrdered ? Number((ordered as RegExpExecArray)[1]) : 1
      const items: string[] = [(bullet !== null ? bullet[1] : (ordered as RegExpExecArray)[2]) as string]
      while (index + 1 < lines.length) {
        const next = lines[index + 1] as string
        const nextBullet = BULLET.exec(next)
        const nextOrdered = isOrdered ? ORDERED.exec(next) : null
        if (isOrdered ? nextOrdered === null : nextBullet === null) break
        items.push((isOrdered ? (nextOrdered as RegExpExecArray)[2] : (nextBullet as RegExpExecArray)[1]) as string)
        index += 1
      }
      blocks.push({ kind: 'list', ordered: isOrdered, start, items })
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
