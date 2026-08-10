import { failure, success, type Result } from '../../shared/result'

export type SiteIdentityError = 'INVALID_SCHEME' | 'INVALID_ORIGIN'

export function normalizeSiteOrigin(value: string): Result<string, SiteIdentityError> {
  try {
    const url = new URL(value)
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      return failure('INVALID_SCHEME')
    }
    if (url.username || url.password) return failure('INVALID_ORIGIN')
    return success(url.origin.toLowerCase())
  } catch {
    return failure('INVALID_ORIGIN')
  }
}

export function isNormalizedSiteOrigin(value: string): boolean {
  const normalized = normalizeSiteOrigin(value)
  return normalized.ok && normalized.value === value
}
