import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import {
  buildPrompt,
  clip,
  DEFAULT_CONTEXT_BUDGET,
  foldModelRoute,
  foldTranscript,
  messageOfEvent,
  SIDE_CHAT_SYSTEM,
  textOfContent,
  type SessionEventLike,
} from '../src/context.ts'

/** One logged user message. */
function userEvent(seq: number, text: string, id = `u${seq}`): SessionEventLike {
  return { type: 'user/message', seq, data: { message: { id, role: 'user', content: [{ type: 'text', text }] } } }
}

/** One logged assistant message. */
function assistantEvent(seq: number, text: string, id = `a${seq}`): SessionEventLike {
  return {
    type: 'assistant/message',
    seq,
    data: { message: { id, role: 'assistant', content: [{ type: 'text', text }] } },
  }
}

describe('content folding', () => {
  it('joins text blocks and ignores every other block kind', () => {
    expect(textOfContent([
      { type: 'text', text: 'first' },
      { type: 'tool-call', name: 'bash' },
      { type: 'text', text: 'second' },
    ])).toBe('first\nsecond')
  })

  it('reads identity and text off a logged message', () => {
    expect(messageOfEvent(userEvent(1, 'hello'))).toEqual({ role: 'user', text: 'hello', id: 'u1' })
  })

  it('ignores events that carry no message', () => {
    expect(messageOfEvent({ type: 'turn/start', seq: 1, data: { turn: 1 } })).toBeUndefined()
    expect(messageOfEvent({ type: 'user/message', seq: 2, data: { message: { role: 'user', content: [] } } }))
      .toBeUndefined()
  })

  it('marks what a clip removed', () => {
    expect(clip('abcdef', 3)).toContain('3 more characters omitted')
    expect(clip('abc', 3)).toBe('abc')
  })
})

describe('transcript folding', () => {
  const log: SessionEventLike[] = [
    userEvent(1, 'first'),
    assistantEvent(2, 'answer one'),
    { type: 'tool/call', seq: 3, data: {} },
    userEvent(4, 'second'),
    assistantEvent(5, 'answer two'),
  ]

  it('keeps the newest messages in log order', () => {
    const folded = foldTranscript(log, { budget: { ...DEFAULT_CONTEXT_BUDGET, recentMessages: 2 } })
    expect(folded.map(message => message.text)).toEqual(['second', 'answer two'])
  })

  it('selects exactly the named messages', () => {
    const folded = foldTranscript(log, { messageIds: ['a2', 'u4'] })
    expect(folded.map(message => message.id)).toEqual(['a2', 'u4'])
  })

  it('falls back to the recent window when no message is named', () => {
    const folded = foldTranscript(log, { messageIds: [] })
    expect(folded).toHaveLength(5 - 1)
  })

  it('keeps the newest context inside the whole-excerpt budget', () => {
    const folded = foldTranscript(log, {
      budget: { recentMessages: 10, maxMessageChars: 100, maxContextChars: 20 },
    })
    expect(folded.map(message => message.text)).toEqual(['answer two'])
  })
})

describe('model route folding', () => {
  it('reads the newest request header', () => {
    const route = foldModelRoute([
      { type: 'request/header', seq: 1, data: { header: { config: { provider: 'deepseek', model: 'old' } } } },
      userEvent(2, 'hi'),
      { type: 'request/header', seq: 3, data: { header: { config: { provider: 'deepseek', model: 'new' } } } },
    ])
    expect(route).toEqual({ provider: 'deepseek', model: 'new' })
  })

  it('reports nothing when the log carries no header', () => {
    expect(foldModelRoute([userEvent(1, 'hi')])).toBeUndefined()
  })
})

describe('prompt assembly', () => {
  it('carries the temporary history and the excerpt', () => {
    const prompt = buildPrompt({
      question: 'why?',
      history: [
        { role: 'user', text: 'what changed?' },
        { role: 'assistant', text: 'the parser' },
      ],
      context: [{ role: 'user', text: 'please fix the parser' }],
      userLabel: 'User',
    })
    expect(prompt.system).toBe(SIDE_CHAT_SYSTEM)
    expect(prompt.messages).toHaveLength(3)
    expect(prompt.messages[1]).toEqual({ role: 'assistant', content: 'the parser' })
    expect(prompt.messages[2]?.content).toContain('<main-conversation-context>')
    expect(prompt.messages[2]?.content).toContain('please fix the parser')
    expect(prompt.messages[2]?.content?.endsWith('why?')).toBe(true)
  })

  it('sends the bare question when there is no context', () => {
    const prompt = buildPrompt({ question: 'hello', history: [], context: [], userLabel: 'User' })
    expect(prompt.messages).toEqual([{ role: 'user', content: 'hello' }])
  })

  it('attaches text selected in the original conversation', () => {
    const prompt = buildPrompt({
      question: '这句什么意思？',
      history: [],
      context: [],
      selection: '安装 0.2.0-rc.2',
      userLabel: 'User',
    })
    const content = prompt.messages[0]?.content ?? ''
    expect(content).toContain('<selected-text>')
    expect(content).toContain('安装 0.2.0-rc.2')
    expect(content.endsWith('这句什么意思？')).toBe(true)
  })

  it('keeps the excerpt and the selection apart', () => {
    const prompt = buildPrompt({
      question: 'why?',
      history: [],
      context: [{ role: 'assistant', text: 'the answer' }],
      selection: 'picked words',
      userLabel: 'User',
    })
    const content = prompt.messages[0]?.content ?? ''
    expect(content.indexOf('<main-conversation-context>')).toBeLessThan(content.indexOf('<selected-text>'))
    expect(content.indexOf('<selected-text>')).toBeLessThan(content.indexOf('why?'))
  })

  it('ignores a whitespace-only selection', () => {
    const prompt = buildPrompt({
      question: 'hello',
      history: [],
      context: [],
      selection: '   ',
      userLabel: 'User',
    })
    expect(prompt.messages).toEqual([{ role: 'user', content: 'hello' }])
  })
})

describe('transcript folding at its edges', () => {
  /** The cost `foldTranscript` charges one context message. */
  const cost = (text: string): number => text.length + 16

  it('folds nothing out of an empty log', () => {
    expect(foldTranscript([])).toEqual([])
    expect(foldTranscript([], { messageIds: ['m-1'] })).toEqual([])
  })

  it('folds a log that only ever heard from the user', () => {
    const folded = foldTranscript([userEvent(1, 'only'), userEvent(2, 'question')])
    expect(folded).toEqual([
      { role: 'user', text: 'only', id: 'u1' },
      { role: 'user', text: 'question', id: 'u2' },
    ])
  })

  it('returns nothing when the named messages are not in the log', () => {
    const log = [userEvent(1, 'first'), assistantEvent(2, 'answer')]
    expect(foldTranscript(log, { messageIds: ['nope'] })).toEqual([])
    expect(foldTranscript(log, { messageIds: ['nope', 'u1'] }).map(message => message.id)).toEqual(['u1'])
  })

  it('keeps log order however the messages were named, without repeating one', () => {
    const log = [userEvent(1, 'first'), assistantEvent(2, 'answer'), userEvent(4, 'second')]
    expect(foldTranscript(log, { messageIds: ['u4', 'u1', 'u4'] }).map(message => message.id))
      .toEqual(['u1', 'u4'])
  })

  it('never matches a message that carries no id', () => {
    const anonymous: SessionEventLike = {
      type: 'user/message',
      seq: 1,
      data: { message: { role: 'user', content: [{ type: 'text', text: 'no id here' }] } },
    }
    expect(foldTranscript([anonymous], { messageIds: ['u1'] })).toEqual([])
    expect(foldTranscript([anonymous], { budget: { recentMessages: 1, maxMessageChars: 10, maxContextChars: 10 } }))
      .toEqual([{ role: 'user', text: 'no id here' }])
  })

  it('counts the recent window exactly', () => {
    const log = [userEvent(1, 'a'), userEvent(2, 'b'), userEvent(3, 'c'), userEvent(4, 'd')]
    const window = (recentMessages: number): string[] => foldTranscript(log, {
      budget: { recentMessages, maxMessageChars: 100, maxContextChars: 10_000 },
    }).map(message => message.text)
    expect(window(4)).toEqual(['a', 'b', 'c', 'd'])
    expect(window(3)).toEqual(['b', 'c', 'd'])
    expect(window(1)).toEqual(['d'])
    // Zero is a legitimate budget: the caller asked for no context at all.
    expect(window(0)).toEqual([])
    expect(window(99)).toEqual(['a', 'b', 'c', 'd'])
  })

  it('clips exactly at the per-message limit', () => {
    const atLimit = 'x'.repeat(10)
    const justOver = 'x'.repeat(11)
    const fold = (text: string): string => foldTranscript([userEvent(1, text)], {
      budget: { recentMessages: 1, maxMessageChars: 10, maxContextChars: 10_000 },
    })[0]?.text ?? ''
    expect(fold(atLimit)).toBe(atLimit)
    expect(fold(justOver)).toContain('(1 more characters omitted)')
    expect(fold(justOver).startsWith('x'.repeat(10))).toBe(true)
  })

  it('keeps the newest message whatever the whole-excerpt budget says', () => {
    // The newest turn is the reason the question was asked, so it survives even a
    // budget smaller than itself; the module documents that carve-out.
    const folded = foldTranscript([userEvent(1, 'a long enough message')], {
      budget: { recentMessages: 5, maxMessageChars: 100, maxContextChars: 0 },
    })
    expect(folded).toHaveLength(1)
  })

  it('drops the second-newest message exactly one character over budget', () => {
    const older = 'older'
    const newer = 'newer'
    const log = [userEvent(1, older), userEvent(2, newer)]
    const fits = cost(older) + cost(newer)
    const fold = (maxContextChars: number): string[] => foldTranscript(log, {
      budget: { recentMessages: 5, maxMessageChars: 100, maxContextChars },
    }).map(message => message.text)
    expect(fold(fits)).toEqual([older, newer])
    expect(fold(fits - 1)).toEqual([newer])
  })

  it('measures the whole-excerpt budget on clipped text, not the original', () => {
    const long = 'y'.repeat(500)
    const log = [userEvent(1, long), userEvent(2, 'short')]
    // Clipped to 100 characters, the first message costs cost(clip) instead of cost(500).
    const clipped = clip(long, 100)
    const fold = (maxContextChars: number): string[] => foldTranscript(log, {
      budget: { recentMessages: 5, maxMessageChars: 100, maxContextChars },
    }).map(message => message.text)
    expect(fold(cost(clipped) + cost('short'))).toHaveLength(2)
    expect(fold(cost(clipped) + cost('short') - 1)).toEqual(['short'])
  })

  it('applies the recent window before the whole-excerpt budget', () => {
    const log = [userEvent(1, 'dropped by the window'), userEvent(2, 'c'), userEvent(3, 'd')]
    const folded = foldTranscript(log, {
      budget: { recentMessages: 2, maxMessageChars: 100, maxContextChars: 10_000 },
    })
    expect(folded.map(message => message.text)).toEqual(['c', 'd'])
  })
})

describe('this module stays portable', () => {
  it('imports nothing but its sibling files', () => {
    // context.ts is the one module both halves could share: folding a log must
    // never drag a runtime along with it, so every import has to stay relative.
    const source = readFileSync(new URL('../src/context.ts', import.meta.url), 'utf8')
    const specifiers = [...source.matchAll(/^\s*import\s+(?:type\s+)?[^'\n]*from\s+'([^']+)'|^\s*import\s+'([^']+)'/gm)]
      .map(match => match[1] ?? match[2] ?? '')
    expect(specifiers.length).toBeGreaterThan(0)
    for (const specifier of specifiers) expect(specifier, specifier).toMatch(/^\.\//)
  })
})
