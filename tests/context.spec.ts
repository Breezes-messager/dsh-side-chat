import { describe, expect, it } from 'vitest'
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
})
