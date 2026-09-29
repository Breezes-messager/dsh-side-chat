import { describe, expect, it } from 'vitest'
import { decodeFrames, encodeFrame, type SideChatFrame } from '../src/protocol.ts'

describe('side-chat wire framing', () => {
  it('round-trips every frame kind', () => {
    const frames: SideChatFrame[] = [
      { type: 'text', text: 'héllo\nworld' },
      { type: 'notice', text: 'no text' },
      { type: 'error', message: 'boom' },
      { type: 'done' },
    ]
    const decoded = decodeFrames(frames.map(encodeFrame).join(''))
    expect(decoded.frames).toEqual(frames)
    expect(decoded.rest).toBe('')
  })

  it('keeps an unterminated frame in the buffer', () => {
    const decoded = decodeFrames(encodeFrame({ type: 'text', text: 'partial' }).trimEnd())
    expect(decoded.frames).toEqual([])
    expect(decoded.rest.length).toBeGreaterThan(0)
  })

  it('decodes only the frames a chunk completed', () => {
    const stream = `${encodeFrame({ type: 'text', text: 'a' })}${encodeFrame({ type: 'text', text: 'b' })}`
    const cut = stream.indexOf('\n\n') + 2
    const first = decodeFrames(stream.slice(0, cut))
    expect(first.frames).toEqual([{ type: 'text', text: 'a' }])
    const second = decodeFrames(first.rest + stream.slice(cut))
    expect(second.frames).toEqual([{ type: 'text', text: 'b' }])
  })

  it('drops a malformed frame instead of failing the stream', () => {
    const decoded = decodeFrames(`data: {not json}\n\n${encodeFrame({ type: 'done' })}`)
    expect(decoded.frames).toEqual([{ type: 'done' }])
  })
})
