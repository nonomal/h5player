import { describe, expect, it } from 'vitest'
import { parsePhase0Message } from '../../src/shared/protocol'

describe('runtime contract boundary', () => {
  it('only allows known phase zero message types', () => {
    const valid = parsePhase0Message({ type: 'phase0.content-ready', sessionId: 'a'.repeat(16) })
    const invalid = parsePhase0Message({ type: 'phase0.content-ready', sessionId: 'short' })

    expect(valid?.type).toBe('phase0.content-ready')
    expect(invalid).toBeNull()
  })
})
