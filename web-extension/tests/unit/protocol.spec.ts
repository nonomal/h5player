import { describe, expect, it } from 'vitest'
import { parsePhase0Message } from '../../src/shared/protocol'

describe('phase 0 protocol', () => {
  it('accepts a typed ping', () => {
    expect(parsePhase0Message({ type: 'phase0.ping', requestId: 'request-1' })).toEqual({
      type: 'phase0.ping',
      requestId: 'request-1'
    })
  })

  it('rejects unknown fields and malformed payloads', () => {
    expect(
      parsePhase0Message({ type: 'phase0.ping', requestId: 'request-1', privileged: true })
    ).toBeNull()
    expect(parsePhase0Message({ type: 'phase0.ping', requestId: '' })).toBeNull()
    expect(parsePhase0Message({ type: 'phase0.set-value', key: 'secret', value: 'x' })).toBeNull()
  })
})
