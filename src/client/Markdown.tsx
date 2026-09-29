/**
 * Render parsed Markdown as React elements.
 *
 * Every node is constructed by React, so model output can never become markup:
 * there is no innerHTML path in this plugin. Links are emitted only for the
 * schemes {@link parseInline} accepts, and always open in a new tab without
 * handing the opener over.
 */
import type { ReactNode } from 'react'
import { parseInline, parseMarkdown, type Block, type Inline } from './markdown.ts'
import { CLASS } from './styles.ts'

/** Render one inline run. Plain text stays a bare string, so emphasis does not
 * gain a wrapper element around its own words. */
function renderInline(nodes: readonly Inline[], keyPrefix: string): ReactNode[] {
  return nodes.map((node, index) => {
    const key = `${keyPrefix}.${index}`
    switch (node.kind) {
      case 'text':
        return node.text
      case 'code':
        return <code key={key} className={CLASS.mdCode}>{node.text}</code>
      case 'strong':
        return <strong key={key}>{renderInline(node.children, key)}</strong>
      case 'em':
        return <em key={key}>{renderInline(node.children, key)}</em>
      case 'link':
        return (
          <a key={key} className={CLASS.mdLink} href={node.href} target="_blank" rel="noreferrer noopener">
            {renderInline(node.children, key)}
          </a>
        )
      default:
        return null
    }
  })
}

/** Render one block. */
function renderBlock(block: Block, index: number): ReactNode {
  const key = `b${index}`
  switch (block.kind) {
    case 'heading': {
      const level = Math.min(Math.max(block.level, 1), 6)
      const Tag = `h${level}` as 'h1'
      return <Tag key={key} className={CLASS.mdHeading}>{renderInline(parseInline(block.text), key)}</Tag>
    }
    case 'code':
      return (
        <pre key={key} className={CLASS.mdPre}>
          <code>{block.text}</code>
        </pre>
      )
    case 'list': {
      const items = block.items.map((item, itemIndex) => (
        <li key={`${key}.${itemIndex}`}>{renderInline(parseInline(item), `${key}.${itemIndex}`)}</li>
      ))
      return block.ordered
        ? <ol key={key} className={CLASS.mdList} start={block.start === 1 ? undefined : block.start}>{items}</ol>
        : <ul key={key} className={CLASS.mdList}>{items}</ul>
    }
    case 'quote':
      return (
        <blockquote key={key} className={CLASS.mdQuote}>
          {block.lines.map((line, lineIndex) => (
            <p key={`${key}.${lineIndex}`}>{renderInline(parseInline(line), `${key}.${lineIndex}`)}</p>
          ))}
        </blockquote>
      )
    case 'rule':
      return <hr key={key} className={CLASS.mdRule} />
    case 'paragraph':
    default:
      return (
        <p key={key} className={CLASS.mdParagraph}>
          {block.lines.map((line, lineIndex) => (
            <span key={`${key}.${lineIndex}`}>
              {lineIndex === 0 ? null : <br />}
              {renderInline(parseInline(line), `${key}.${lineIndex}`)}
            </span>
          ))}
        </p>
      )
  }
}

/**
 * Draw one Markdown document.
 * @param props - the raw text to render.
 * @returns the rendered blocks.
 */
export function Markdown({ text }: { readonly text: string }) {
  const blocks = parseMarkdown(text)
  return <div className={CLASS.mdRoot}>{blocks.map((block, index) => renderBlock(block, index))}</div>
}
