// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { messageIdOf, selectionOf, type TabRecordLike } from '../src/client/contract.ts'

describe('side-chat tab contract readers', () => {
  it('reads the message id an action put in the navigation params', () => {
    expect(messageIdOf({ messageId: 'msg-1' })).toBe('msg-1')
  })

  it('ignores a message id that is not a usable string', () => {
    expect(messageIdOf(undefined)).toBeUndefined()
    expect(messageIdOf(null)).toBeUndefined()
    expect(messageIdOf('msg-1')).toBeUndefined()
    expect(messageIdOf(42)).toBeUndefined()
    expect(messageIdOf({})).toBeUndefined()
    expect(messageIdOf({ messageId: '' })).toBeUndefined()
    expect(messageIdOf({ messageId: 7 })).toBeUndefined()
    expect(messageIdOf({ messageId: { toString: () => 'x' } })).toBeUndefined()
    expect(messageIdOf([])).toBeUndefined()
  })

  it('reads selected text and rejects a selection that says nothing', () => {
    expect(selectionOf({ selection: 'some text' })).toBe('some text')
    expect(selectionOf({ selection: '  padded  ' })).toBe('  padded  ')
    expect(selectionOf({ selection: '   ' })).toBeUndefined()
    expect(selectionOf({ selection: '\n\t' })).toBeUndefined()
    expect(selectionOf({ selection: '' })).toBeUndefined()
  })

  it('treats a malformed selection like an absent one', () => {
    expect(selectionOf(undefined)).toBeUndefined()
    expect(selectionOf(null)).toBeUndefined()
    expect(selectionOf('text')).toBeUndefined()
    expect(selectionOf({ selection: 12 })).toBeUndefined()
    expect(selectionOf({ selection: ['a'] })).toBeUndefined()
  })

  it('reads both values out of one params bag, and neither out of an empty one', () => {
    const params = { messageId: 'msg-9', selection: 'quoted' }
    expect(messageIdOf(params)).toBe('msg-9')
    expect(selectionOf(params)).toBe('quoted')
    expect(messageIdOf({})).toBeUndefined()
    expect(selectionOf({})).toBeUndefined()
  })

  it('accepts the tab record the tab kit actually hands a body', () => {
    // Structural check against the documented shape: params are untyped at this
    // boundary, visible is optional, and the close action is optional too.
    const record: TabRecordLike = {
      navigation: { params: { selection: 'picked' }, revision: 3 },
      visible: true,
      actions: { close: () => {} },
    }
    expect(selectionOf(record.navigation.params)).toBe('picked')
    expect(record.navigation.revision).toBe(3)
    expect(typeof record.actions?.close).toBe('function')
  })
})
