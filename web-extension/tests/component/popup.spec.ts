import { render, screen } from '@testing-library/vue'
import { describe, expect, it } from 'vitest'
import PopupApp from '../../src/ui/popup/PopupApp.vue'

describe('popup shell', () => {
  it('renders a user-readable runtime status', () => {
    render(PopupApp)

    expect(screen.getByRole('heading', { name: 'H5Player Web Extension' })).toBeTruthy()
    expect(screen.getByTestId('phase-status').textContent).toContain('连接中')
    expect(screen.getByText('版本 0.1.0')).toBeTruthy()
  })
})
