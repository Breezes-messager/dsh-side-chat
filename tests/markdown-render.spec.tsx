// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { Markdown } from '../src/client/Markdown.tsx'

/** Render one document the way the panel does. */
function render(text: string): string {
  return renderToStaticMarkup(<Markdown text={text} />)
}

describe('markdown rendering', () => {
  it('renders emphasis as elements instead of literal markers', () => {
    const html = render('说的是：**相对性**与*可变性*。')
    expect(html).toContain('<strong>相对性</strong>')
    expect(html).toContain('<em>可变性</em>')
    expect(html).not.toContain('**')
  })

  it('renders a list as a list', () => {
    const html = render('- **相对性**说的是身份变\n- **可变性**说的是数值变')
    expect(html).toContain('<ul')
    expect((html.match(/<li>/g) ?? []).length).toBe(2)
    expect(html).toContain('<strong>相对性</strong>')
  })

  it('renders a fenced block as preformatted text', () => {
    const html = render('```ts\nconst a = 1\n```')
    expect(html).toContain('<pre')
    expect(html).toContain('const a = 1')
  })

  it('renders a safe link and drops an unsafe one', () => {
    expect(render('[doc](https://example.com)')).toContain('href="https://example.com"')
    const unsafe = render('[x](javascript:alert(1))')
    expect(unsafe).not.toContain('<a')
    expect(unsafe).toContain('javascript:alert(1)')
  })

  it('escapes markup that arrives inside the answer', () => {
    const html = render('正常文字 <script>alert(1)</script> 结尾')
    expect(html).not.toContain('<script>')
    expect(html).toContain('&lt;script&gt;')
  })

  it('keeps an empty answer renderable', () => {
    expect(render('')).toBe('<div class="sc-md"></div>')
  })
})
