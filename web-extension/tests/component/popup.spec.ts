import { render, screen } from '@testing-library/vue'
import { describe, expect, it, vi } from 'vitest'
import type { RuntimeApiPort } from '../../src/application/runtime/runtime-api-port'
import PopupApp from '../../src/ui/popup/PopupApp.vue'
import { createSettingsEnvelope } from '../test-support/settings-fixtures'

function createApi(): RuntimeApiPort {
  return {
    ping: vi.fn().mockResolvedValue({
      extensionVersion: '0.1.0',
      phase: 1,
      protocol: 1,
      settingsSchemaVersion: 1
    }),
    getSettings: vi.fn().mockResolvedValue({
      settings: createSettingsEnvelope(3),
      latestBackup: null
    }),
    updateSettings: vi.fn(),
    exportSettings: vi.fn(),
    importSettings: vi.fn(),
    restoreBackup: vi.fn()
  }
}

describe('PopupApp', () => {
  it('renders the platform status and settings revision from the application port', async () => {
    render(PopupApp, { props: { api: createApi() } })

    expect(screen.getByRole('heading', { name: 'H5Player Web Extension' })).toBeTruthy()
    expect(await screen.findByText(/平台内核已连接/)).toBeTruthy()
    expect(screen.getByText('配置版本 3')).toBeTruthy()
  })
})
