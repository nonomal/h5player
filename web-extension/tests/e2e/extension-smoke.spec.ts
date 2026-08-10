import { chromium } from '@playwright/test'
import { expect, test } from '@playwright/test'
import path from 'node:path'

test('loads the packaged Chromium extension and its page contexts', async ({ baseURL }) => {
  const extensionPath = path.resolve('.output/chrome-mv3')
  const context = await chromium.launchPersistentContext('', {
    channel: 'chromium',
    headless: true,
    args: [`--disable-extensions-except=${extensionPath}`, `--load-extension=${extensionPath}`]
  })

  try {
    const page = await context.newPage()
    await page.goto(`${baseURL}/basic.html`)
    await expect(page.locator('html')).toHaveAttribute('data-h5player-webext-content', 'ready')
    await expect(page.locator('html')).toHaveAttribute('data-h5player-webext-main', 'ready')
    await expect(page.locator('html')).toHaveAttribute('data-h5player-webext-bridge', 'ready')

    const serviceWorker =
      context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'))
    const extensionId = new URL(serviceWorker.url()).host
    const popup = await context.newPage()
    await popup.goto(`chrome-extension://${extensionId}/popup.html`)
    await expect(popup.getByRole('heading', { name: 'H5Player Web Extension' })).toBeVisible()
    await expect(popup.getByTestId('phase-status')).toContainText('基础运行时已连接')
  } finally {
    await context.close()
  }
})
