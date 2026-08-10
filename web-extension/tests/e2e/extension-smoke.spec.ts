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
    await expect(page.locator('html')).toHaveAttribute('data-h5player-webext-background', 'ready')
    await expect(page.locator('html')).not.toHaveAttribute('data-h5player-webext-session', /.+/)

    const serviceWorker =
      context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'))
    const extensionId = new URL(serviceWorker.url()).host
    const popup = await context.newPage()
    await popup.goto(`chrome-extension://${extensionId}/popup.html`)
    await expect(popup.getByRole('heading', { name: 'H5Player Web Extension' })).toBeVisible()
    await expect(popup.getByTestId('phase-status')).toContainText('平台内核已连接')
    await expect(popup.getByText('配置版本 0')).toBeVisible()

    const options = await context.newPage()
    await options.goto(`chrome-extension://${extensionId}/options.html`)
    const enabled = options.getByRole('checkbox', { name: '在获得站点权限后启用扩展' })
    await expect(enabled).toBeEnabled()
    await enabled.uncheck()
    await expect(options.getByRole('status')).toContainText('当前状态：停用')
    await expect(options.getByText('配置版本 1')).toBeVisible()

    const cdp = await context.newCDPSession(options)
    const targets = await cdp.send('Target.getTargets')
    const backgroundTarget = targets.targetInfos.find(
      (target) => target.type === 'service_worker' && target.url.includes(extensionId)
    )
    if (!backgroundTarget) throw new Error('Extension service worker target not found')
    await cdp.send('Target.closeTarget', { targetId: backgroundTarget.targetId })
    await popup.close()
    await options.close()

    const recoveredPopup = await context.newPage()
    await recoveredPopup.goto(`chrome-extension://${extensionId}/popup.html`)
    await expect(recoveredPopup.getByTestId('phase-status')).toContainText('平台内核已连接')
    await expect(recoveredPopup.getByText('配置版本 1')).toBeVisible()
  } finally {
    await context.close()
  }
})
