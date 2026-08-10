export function clamp(value: number, minimum: number, maximum: number): number {
  if (!Number.isFinite(value)) return minimum
  if (minimum > maximum) throw new RangeError('minimum must not exceed maximum')
  return Math.min(Math.max(value, minimum), maximum)
}

export function clampUnit(value: number): number {
  return clamp(value, 0, 1)
}
