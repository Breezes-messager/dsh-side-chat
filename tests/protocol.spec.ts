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

  it('carries a translatable code beside the readable message', () => {
    const frame: SideChatFrame = {
      type: 'error',
      code: 'model-route-missing',
      message: 'Side chat cannot answer yet: no model is available.',
    }
    expect(decodeFrames(encodeFrame(frame)).frames).toEqual([frame])
  })

  it('still reads an error frame from a Host that carries no code', () => {
    // The browser half has to keep working against an older Host half, so `code`
    // stays optional and its absence is not a decode failure.
    const decoded = decodeFrames('data: {"type":"error","message":"boom"}\n\n')
    expect(decoded.frames).toEqual([{ type: 'error', message: 'boom' }])
  })
})
