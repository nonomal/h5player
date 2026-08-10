import { chromium, type BrowserContext, type Page } from '@playwright/test'
import { expect, test } from '@playwright/test'
import path from 'node:path'
import {
  mediaCommandResultResponseSchema,
  mediaPageStateSchema,
  type MediaPageState
} from '../../src/application/media'
import type { MediaCommand } from '../../src/domain/command'
import { createRuntimeRequest, parseRuntimeResponse } from '../../src/shared/protocol'

const configuredChurnDurationMs = (() => {
  const parsed = Number(process.env['H5PLAYER_CHURN_DURATION_MS'] ?? 0)
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : 0
})()

async function launchExtension(): Promise<{
  context: BrowserContext
  extensionId: string
}> {
  const extensionPath = path.resolve('.output/chrome-mv3')
  const context = await chromium.launchPersistentContext('', {
    channel: 'chromium',
    headless: true,
    args: [`--disable-extensions-except=${extensionPath}`, `--load-extension=${extensionPath}`]
  })
  const serviceWorker = context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'))
  return { context, extensionId: new URL(serviceWorker.url()).host }
}

async function openPopup(
  context: BrowserContext,
  extensionId: string,
  targetPage: Page
): Promise<Page> {
  const popup = await context.newPage()
  await targetPage.bringToFront()
  await popup.goto(`chrome-extension://${extensionId}/popup.html`)
  await expect(popup.getByTestId('phase-status')).toContainText('平台内核已连接')
  return popup
}

async function clickPopupButton(popup: Page, targetPage: Page, name: string): Promise<void> {
  await targetPage.bringToFront()
  await popup
    .getByRole('button', { name, exact: true })
    .evaluate((button) => (button as HTMLButtonElement).click())
}

async function sendPopupRuntimeRequest(
  popup: Page,
  targetPage: Page,
  request: ReturnType<typeof createRuntimeRequest>
): Promise<unknown> {
  await targetPage.bringToFront()
  return popup.evaluate(async (message) => {
    const runtime = (
      globalThis as unknown as {
        chrome: { runtime: { sendMessage: (value: unknown) => Promise<unknown> } }
      }
    ).chrome.runtime
    return runtime.sendMessage(message)
  }, request)
}

async function getMediaStateFromPopup(popup: Page, targetPage: Page): Promise<MediaPageState> {
  const request = createRuntimeRequest('popup', 'media.get-state', {})
  const response = parseRuntimeResponse(await sendPopupRuntimeRequest(popup, targetPage, request))
  if (
    response?.type !== 'protocol.response' ||
    response.requestId !== request.requestId ||
    response.payload.requestType !== request.type
  ) {
    throw new Error('Media state request failed during churn test')
  }
  return mediaPageStateSchema.parse(response.payload.data)
}

async function executeMediaFromPopup(popup: Page, targetPage: Page, command: MediaCommand) {
  const request = createRuntimeRequest('popup', 'media.execute', { command })
  const response = parseRuntimeResponse(await sendPopupRuntimeRequest(popup, targetPage, request))
  if (
    response?.type !== 'protocol.response' ||
    response.requestId !== request.requestId ||
    response.payload.requestType !== request.type
  ) {
    throw new Error('Media command failed during churn test')
  }
  return mediaCommandResultResponseSchema.parse(response.payload.data)
}

async function pageRuntimeListenerCount(
  session: Awaited<ReturnType<BrowserContext['newCDPSession']>>
): Promise<number> {
  const evaluated = await session.send('Runtime.evaluate', { expression: 'window' })
  const objectId = evaluated.result.objectId
  if (!objectId) throw new Error('Unable to inspect page window listeners')
  try {
    const result = await session.send('DOMDebugger.getEventListeners', { objectId })
    const runtimeEvents = new Set(['message', 'pageshow', 'popstate', 'hashchange'])
    return result.listeners.filter((listener) => runtimeEvents.has(listener.type)).length
  } finally {
    await session.send('Runtime.releaseObject', { objectId })
  }
}

async function pageHeapSize(
  session: Awaited<ReturnType<BrowserContext['newCDPSession']>>
): Promise<number> {
  await session.send('HeapProfiler.collectGarbage')
  const result = await session.send('Performance.getMetrics')
  return result.metrics.find((metric) => metric.name === 'JSHeapUsedSize')?.value ?? 0
}

async function restartExtensionWorker(
  session: Awaited<ReturnType<BrowserContext['newCDPSession']>>,
  extensionId: string
): Promise<void> {
  const targets = await session.send('Target.getTargets')
  const worker = targets.targetInfos.find(
    (target) => target.type === 'service_worker' && target.url.includes(extensionId)
  )
  if (worker) await session.send('Target.closeTarget', { targetId: worker.targetId })
}

async function expectRuntimeReady(page: Page): Promise<void> {
  await expect(page.locator('html')).toHaveAttribute('data-h5player-webext-content', 'ready')
  await expect(page.locator('html')).toHaveAttribute('data-h5player-webext-main', 'ready')
  await expect(page.locator('html')).toHaveAttribute('data-h5player-webext-bridge', 'ready')
  await expect(page.locator('html')).toHaveAttribute('data-h5player-webext-background', 'ready')
  await expect(page.locator('html')).toHaveAttribute('data-h5player-webext-media', 'ready')
}

test('loads media controls and recovers after a real service-worker restart', async ({
  baseURL
}) => {
  const { context, extensionId } = await launchExtension()

  try {
    const page = await context.newPage()
    await page.goto(`${baseURL}/basic.html`)
    await expectRuntimeReady(page)
    await expect(page.locator('html')).not.toHaveAttribute('data-h5player-webext-session', /.+/)

    const popup = await openPopup(context, extensionId, page)
    await expect(popup.getByRole('heading', { name: 'H5Player Web Extension' })).toBeVisible()
    await expect(popup.getByTestId('active-media')).toContainText('视频 · 已暂停')
    await expect(popup.getByText('配置版本 0')).toBeVisible()

    await clickPopupButton(popup, page, '降低音量')
    await expect
      .poll(() => page.locator('video').evaluate((media) => (media as HTMLVideoElement).volume))
      .toBe(0.95)
    await clickPopupButton(popup, page, '加速')
    await expect
      .poll(() =>
        page.locator('video').evaluate((media) => (media as HTMLVideoElement).playbackRate)
      )
      .toBe(1.1)
    await clickPopupButton(popup, page, '静音')
    await expect
      .poll(() => page.locator('video').evaluate((media) => (media as HTMLVideoElement).muted))
      .toBe(true)

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

    const recoveredPopup = await openPopup(context, extensionId, page)
    await expect(recoveredPopup.getByText('配置版本 1')).toBeVisible()
    await expect(recoveredPopup.getByTestId('active-media')).toContainText('视频')
    await expect(recoveredPopup.getByText(/速度 1\.10×/)).toBeVisible()
    await expect(recoveredPopup.getByText(/已静音/)).toBeVisible()
  } finally {
    await context.close()
  }
})

test('tracks multi-player, SPA and open Shadow DOM lifecycles', async ({ baseURL }) => {
  const { context, extensionId } = await launchExtension()

  try {
    const page = await context.newPage()
    await page.goto(`${baseURL}/multi-player.html`)
    await expectRuntimeReady(page)
    let popup = await openPopup(context, extensionId, page)
    await clickPopupButton(popup, page, '降低音量')
    await expect
      .poll(() => page.locator('#primary').evaluate((media) => (media as HTMLVideoElement).volume))
      .toBe(0.95)
    await expect
      .poll(() =>
        page.locator('#secondary').evaluate((media) => (media as HTMLVideoElement).volume)
      )
      .toBe(1)
    await popup.close()

    await page.goto(`${baseURL}/spa.html`)
    await expectRuntimeReady(page)
    popup = await openPopup(context, extensionId, page)
    await expect(popup.getByRole('status')).toContainText('没有可控制媒体')
    await popup.close()
    await page.getByRole('button', { name: 'Add media' }).click()
    await expect(page.locator('video')).toHaveCount(1)
    popup = await openPopup(context, extensionId, page)
    await expect(popup.getByTestId('active-media')).toContainText('视频')
    await popup.close()
    await page.getByRole('button', { name: 'Remove media' }).click()
    await expect(page.locator('video')).toHaveCount(0)
    popup = await openPopup(context, extensionId, page)
    await expect(popup.getByRole('status')).toContainText('没有可控制媒体')
    await popup.close()

    await page.goto(`${baseURL}/shadow-dom.html`)
    await expectRuntimeReady(page)
    popup = await openPopup(context, extensionId, page)
    await expect(popup.getByTestId('active-media')).toContainText('视频')
    await clickPopupButton(popup, page, '静音')
    await expect
      .poll(() =>
        page.locator('media-shell').evaluate((host) => {
          const media = host.shadowRoot?.querySelector('video')
          return media?.muted ?? false
        })
      )
      .toBe(true)
  } finally {
    await context.close()
  }
})

test('survives hostile properties, strict CSP and independently initialized frames', async ({
  baseURL
}) => {
  const { context, extensionId } = await launchExtension()

  try {
    const page = await context.newPage()
    await page.goto(`${baseURL}/hostile-page.html`)
    await expectRuntimeReady(page)
    let popup = await openPopup(context, extensionId, page)
    await clickPopupButton(popup, page, '加速')
    await expect(popup.getByText(/速度 1\.10×/)).toBeVisible()
    await popup.close()

    await page.goto(`${baseURL}/strict-csp.html`)
    await expectRuntimeReady(page)
    popup = await openPopup(context, extensionId, page)
    await expect(popup.getByTestId('active-media')).toContainText('视频')
    await popup.close()

    await page.goto(`${baseURL}/iframe.html`)
    await expectRuntimeReady(page)
    await expect(page.locator('iframe')).toHaveCount(2)
    for (const frame of page.frames().filter((candidate) => candidate !== page.mainFrame())) {
      await expect
        .poll(() => frame.locator('html').getAttribute('data-h5player-webext-media'))
        .toBe('ready')
    }
    popup = await openPopup(context, extensionId, page)
    await clickPopupButton(popup, page, '静音')
    await expect
      .poll(() =>
        page.locator('body > video').evaluate((media) => (media as HTMLVideoElement).muted)
      )
      .toBe(true)
  } finally {
    await context.close()
  }
})

test('configured media churn remains bounded across worker restarts', async ({ baseURL }) => {
  test.skip(configuredChurnDurationMs === 0, 'Nightly churn duration is not configured')
  test.setTimeout(configuredChurnDurationMs + 60_000)
  const { context, extensionId } = await launchExtension()

  try {
    const page = await context.newPage()
    await page.goto(`${baseURL}/spa.html`)
    await expectRuntimeReady(page)
    const popup = await openPopup(context, extensionId, page)
    const cdp = await context.newCDPSession(page)
    await cdp.send('Performance.enable')

    const baselineListeners = await pageRuntimeListenerCount(cdp)
    const baselineHeap = await pageHeapSize(cdp)
    let maximumListeners = baselineListeners
    let cycles = 0
    let workerRestarts = 0
    const startedAt = Date.now()

    while (Date.now() - startedAt < configuredChurnDurationMs) {
      await page.evaluate((cycle) => {
        const mount = document.querySelector('#mount')
        if (!mount) throw new Error('SPA fixture mount is unavailable')
        for (let index = 0; index < 4; index += 1) {
          const media = document.createElement(index % 2 === 0 ? 'video' : 'audio')
          media.dataset['churn'] = `${cycle}-${index}`
          media.setAttribute('width', String(index === 0 ? 640 : 160 + index * 20))
          media.setAttribute('height', String(index === 0 ? 360 : 90 + index * 10))
          mount.append(media)
        }
      }, cycles)

      await expect
        .poll(async () => (await getMediaStateFromPopup(popup, page)).media.length)
        .toBe(4)
      const populated = await getMediaStateFromPopup(popup, page)
      if (!populated.activeMediaId) throw new Error('Churn fixture has no active media')
      const command: MediaCommand =
        cycles % 2 === 0
          ? {
              type: 'media.adjust-rate',
              mediaId: populated.activeMediaId,
              delta: 0.1
            }
          : { type: 'media.toggle-mute', mediaId: populated.activeMediaId }
      const commandResult = await executeMediaFromPopup(popup, page, command)
      expect(commandResult.result.ok).toBe(true)

      await page.evaluate(() => {
        for (const media of document.querySelectorAll('[data-churn]')) media.remove()
      })
      await expect
        .poll(async () => (await getMediaStateFromPopup(popup, page)).media.length)
        .toBe(0)

      const listenerCount = await pageRuntimeListenerCount(cdp)
      maximumListeners = Math.max(maximumListeners, listenerCount)
      expect(listenerCount).toBeLessThanOrEqual(baselineListeners + 1)
      cycles += 1

      if (cycles % 50 === 0) {
        await restartExtensionWorker(cdp, extensionId)
        workerRestarts += 1
        expect((await getMediaStateFromPopup(popup, page)).media).toHaveLength(0)
      }
    }

    const finalHeap = await pageHeapSize(cdp)
    const allowedHeap = Math.max(baselineHeap * 3, baselineHeap + 32 * 1024 * 1024)
    expect(cycles).toBeGreaterThan(0)
    expect(finalHeap).toBeLessThanOrEqual(allowedHeap)
    console.log(
      JSON.stringify({
        event: 'MEDIA_CHURN_RESULT',
        durationMs: Date.now() - startedAt,
        cycles,
        workerRestarts,
        baselineListeners,
        maximumListeners,
        baselineHeap,
        finalHeap
      })
    )
  } finally {
    await context.close()
  }
})
