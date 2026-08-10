import { describe, expect, it } from 'vitest'
import { createSessionId } from '../../src/shared/ids'

describe('session IDs', () => {
  it('creates non-empty unique identifiers', () => {
    const ids = new Set(Array.from({ length: 100 }, () => createSessionId()))
    expect(ids.size).toBe(100)
    expect([...ids].every((id) => id.length >= 16)).toBe(true)
  })
})
