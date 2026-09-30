/**
 * Render parsed Markdown as React elements.
 *
 * Every node is constructed by React, so model output can never become markup:
 * there is no innerHTML path in this plugin, not even for highlighted code —
 * highlight.js's spans are parsed into this tree rather than injected. Links are
 * emitted only for the schemes {@link parseInline} accepts, and always open in a
 * new tab without handing the opener over.
 */
import { memo, useMemo, type CSSProperties, type ReactNode } from 'react'
import { highlightCode, type HighlightNode } from './highlight.ts'
import { parseInline, parseMarkdown, type Block, type Inline, type TableAlign } from './markdown.ts'
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

/** Render one highlighted run. */
function renderHighlight(nodes: readonly HighlightNode[], keyPrefix: string): ReactNode[] {
  return nodes.map((node, index) => {
    const key = `${keyPrefix}.${index}`
    if (node.children !== undefined) {
      return <span key={key} className={node.className}>{renderHighlight(node.children, key)}</span>
    }
    return node.className === undefined ? (node.text ?? '') : <span key={key} className={node.className}>{node.text}</span>
  })
}

/** Column alignment as an inline style, absent when the table declares none. */
function alignStyle(align: TableAlign): CSSProperties | undefined {
  return align === undefined ? undefined : { textAlign: align }
}

/** Render one block. */
function renderBlock(block: Block, key: string): ReactNode {
  switch (block.kind) {
    case 'heading': {
      const level = Math.min(Math.max(block.level, 1), 6)
      const Tag = `h${level}` as 'h1'
      return <Tag key={key} className={CLASS.mdHeading}>{renderInline(parseInline(block.text), key)}</Tag>
    }
    case 'code': {
      const highlighted = highlightCode(block.text, block.language)
      return (
        <pre key={key} className={CLASS.mdPre}>
          <code>{highlighted === undefined ? block.text : renderHighlight(highlighted, key)}</code>
        </pre>
      )
    }
    case 'list': {
      const items = block.items.map((item, itemIndex) => (
        <li key={`${key}.${itemIndex}`}>
          {item.lines.map((line, lineIndex) => (
            <span key={`${key}.${itemIndex}.${lineIndex}`}>
              {lineIndex === 0 ? null : <br />}
              {renderInline(parseInline(line), `${key}.${itemIndex}.${lineIndex}`)}
            </span>
          ))}
          {item.children.map((child, childIndex) => renderBlock(child, `${key}.${itemIndex}.c${childIndex}`))}
        </li>
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
    case 'table': {
      const columns = Math.max(block.header.length, ...block.rows.map(row => row.length))
      const columnIndexes = Array.from({ length: columns }, (_, index) => index)
      return (
        <div key={key} className={CLASS.mdTableWrap}>
          <table className={CLASS.mdTable}>
            <thead>
              <tr>
                {columnIndexes.map(index => (
                  <th key={index} style={alignStyle(block.align[index])}>
                    {renderInline(parseInline(block.header[index] ?? ''), `${key}.h${index}`)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {block.rows.map((row, rowIndex) => (
                <tr key={rowIndex}>
                  {columnIndexes.map(index => (
                    <td key={index} style={alignStyle(block.align[index])}>
                      {renderInline(parseInline(row[index] ?? ''), `${key}.${rowIndex}.${index}`)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )
    }
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
 *
 * Memoized on the text: the composer keeps its state in the same component tree
 * as every answer, so without this a single keystroke would re-parse and
 * re-render the whole transcript — O(n²) work over a long answer, felt as a
 * lagging caret.
 * @param props - the raw text to render.
 * @returns the rendered blocks.
 */
export const Markdown = memo(function Markdown({ text }: { readonly text: string }) {
  const blocks = useMemo(() => parseMarkdown(text), [text])
  return <div className={CLASS.mdRoot}>{blocks.map((block, index) => renderBlock(block, `b${index}`))}</div>
})
