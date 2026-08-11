import { MediaAdapterRegistry, type AdapterRegistryOptions } from './registry'
import { SITE_ADAPTER_DEFINITIONS, SITE_ADAPTER_DISABLE_POLICY } from './sites'

export * from './generic'
export * from './registry'
export * from './sites'

export function createProductionAdapterRegistry(
  options: Omit<AdapterRegistryOptions, 'definitions'> = {}
): MediaAdapterRegistry {
  return new MediaAdapterRegistry({
    definitions: SITE_ADAPTER_DEFINITIONS,
    disablePolicy: SITE_ADAPTER_DISABLE_POLICY,
    ...options
  })
}
