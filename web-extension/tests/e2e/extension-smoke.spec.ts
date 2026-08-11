import { expect, test, type CDPSession, type Page } from '@playwright/test'
import {
  mediaCommandResultResponseSchema,
  mediaPageStateSchema,
  type MediaPageState
} from '../../src/application/media'
import type { MediaCommand } from '../../src/domain/command'
import { createRuntimeRequest, parseRuntimeResponse } from '../../src/shared/protocol'
import { launchExtensionHarness, type ExtensionHarness } from './extension-harness'

const CURRENT_FIXTURE_PERMISSION = 'http://127.0.0.1:47173/*'

const configuredChurnDurationMs = (() => {
  const parsed = Number(process.env['H5PLAYER_CHURN_DURATION_MS'] ?? 0)
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : 0
})()

async function expectRuntimeAbsent(page: Page): Promise<void> {
  for (const attribute of [
    'data-h5player-webext-content',
    'data-h5player-webext-main',
    'data-h5player-webext-bridge',
    'data-h5player-webext-background',
    'data-h5player-webext-media'
  ]) {
    await expect(page.locator('html')).not.toHaveAttribute(attribute, /.+/)
  }
}

async function expectRuntimeReady(page: Page): Promise<void> {
  await expect(page.locator('html')).toHaveAttribute('data-h5player-webext-content', 'ready')
  await expect(page.locator('html')).toHaveAttribute('data-h5player-webext-main', 'ready')
  await expect(page.locator('html')).toHaveAttribute('data-h5player-webext-bridge', 'ready')
  await expect(page.locator('html')).toHaveAttribute('data-h5player-webext-background', 'ready')
  await expect(page.locator('html')).toHaveAttribute('data-h5player-webext-media', 'ready')
}

async function clickPopupButton(popup: Page, targetPage: Page, name: string): Promise<void> {
  await targetPage.bringToFront()
  await popup
    .getByRole('button', { name, exact: true })
    .evaluate((button) => (button as HTMLButtonElement).click())
}

async function setPopupToggle(
  popup: Page,
  targetPage: Page,
  name: string,
  checked: boolean
): Promise<void> {
  const checkbox = popup.getByRole('checkbox', { name, exact: true })
  if ((await checkbox.isChecked()) === checked) return
  await targetPage.bringToFront()
  await checkbox.evaluate((input) => (input as HTMLInputElement).click())
  if (checked) await expect(checkbox).toBeChecked()
  else await expect(checkbox).not.toBeChecked()
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
    throw new Error('Media state request failed during E2E')
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
    throw new Error('Media command failed during E2E')
  }
  return mediaCommandResultResponseSchema.parse(response.payload.data)
}

async function grantedOrigins(extensionPage: Page): Promise<readonly string[]> {
  return extensionPage.evaluate(async () => {
    const api = (
      globalThis as unknown as {
        chrome: { permissions: { getAll(): Promise<{ origins?: string[] }> } }
      }
    ).chrome
    return (await api.permissions.getAll()).origins ?? []
  })
}

async function registeredContentScriptIds(extensionPage: Page): Promise<readonly string[]> {
  return extensionPage.evaluate(async () => {
    const api = (
      globalThis as unknown as {
        chrome: {
          scripting: {
            getRegisteredContentScripts(): Promise<readonly { id: string }[]>
          }
        }
      }
    ).chrome
    return (await api.scripting.getRegisteredContentScripts()).map((script) => script.id).sort()
  })
}

async function pageRuntimeListenerCount(session: CDPSession): Promise<number> {
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

async function pageHeapSize(session: CDPSession): Promise<number> {
  await session.send('HeapProfiler.collectGarbage')
  const result = await session.send('Performance.getMetrics')
  return result.metrics.find((metric) => metric.name === 'JSHeapUsedSize')?.value ?? 0
}

async function restartExtensionWorker(harness: ExtensionHarness): Promise<void> {
  const targets = (await harness.browserSession.send('Target.getTargets', {
    filter: [{ type: 'service_worker' }]
  })) as {
    targetInfos: Array<{ targetId: string; url: string }>
  }
  const worker = targets.targetInfos.find((target) => target.url.includes(harness.extensionId))
  if (worker) {
    await harness.browserSession.send('Target.closeTarget', { targetId: worker.targetId })
  }
}

test('keeps pages untouched before authorization and reports denied or restricted access', async ({
  baseURL
}) => {
  const harness = await launchExtensionHarness({ denyPermissionRequests: true })
  try {
    const page = await harness.context.newPage()
    await page.goto(`${baseURL}/basic.html`)
    await expectRuntimeAbsent(page)

    const popup = await harness.openPopup(page)
    await expect(popup.getByTestId('phase-status')).toContainText('需要先授予当前站点权限')
    await expect(popup.getByRole('button', { name: '允许当前站点' })).toBeVisible()
    await page.bringToFront()
    await popup.getByRole('button', { name: '允许当前站点' }).click()
    await expect(popup.getByRole('alert')).toContainText('权限未授予')
    expect(await grantedOrigins(popup)).toEqual([])
    await expectRuntimeAbsent(page)
    await popup.close()

    const restricted = await harness.context.newPage()
    await restricted.goto('chrome://extensions/')
    const restrictedPopup = await harness.openPopup(restricted)
    await expect(restrictedPopup.getByTestId('phase-status')).toContainText(
      '浏览器保护页不允许扩展运行'
    )
  } finally {
    await harness.close()
  }
})

test('controls media, applies hotkey policies, recovers the worker and revokes current-site access', async ({
  baseURL
}) => {
  const harness = await launchExtensionHarness({
    grantedOrigins: [CURRENT_FIXTURE_PERMISSION]
  })
  try {
    const page = await harness.context.newPage()
    await page.goto(`${baseURL}/basic.html`)
    await expectRuntimeReady(page)

    let popup = await harness.openPopup(page)
    await expect(popup.getByTestId('phase-status')).toContainText('媒体控制已就绪')
    await expect(popup.getByTestId('active-media')).toContainText('视频 · 已暂停')
    await expect(popup.getByText('配置修订 0')).toBeVisible()

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

    await page.bringToFront()
    await page.keyboard.press('ArrowRight')
    await expect
      .poll(() =>
        page.locator('video').evaluate((media) => (media as HTMLVideoElement).currentTime)
      )
      .toBe(5)

    await page.evaluate(() => {
      const input = document.createElement('input')
      input.id = 'hotkey-editable-fixture'
      document.body.append(input)
    })
    await page.locator('#hotkey-editable-fixture').focus()
    await page.keyboard.press('ArrowRight')
    await expect
      .poll(() =>
        page.locator('video').evaluate((media) => (media as HTMLVideoElement).currentTime)
      )
      .toBe(5)
    await page.locator('#hotkey-editable-fixture').evaluate((input) => input.remove())

    await clickPopupButton(popup, page, '本页临时停用')
    await expect(popup.getByTestId('phase-status')).toContainText('当前页面已临时停用')
    await page.bringToFront()
    await page.keyboard.press('ArrowRight')
    await expect
      .poll(() =>
        page.locator('video').evaluate((media) => (media as HTMLVideoElement).currentTime)
      )
      .toBe(5)
    await clickPopupButton(popup, page, '恢复本页运行')
    await expect(popup.getByTestId('phase-status')).toContainText('媒体控制已就绪')

    await setPopupToggle(popup, page, '在此站点运行', false)
    await expect(popup.getByTestId('phase-status')).toContainText('当前站点已停用')
    await page.bringToFront()
    await page.keyboard.press('ArrowRight')
    await expect
      .poll(() =>
        page.locator('video').evaluate((media) => (media as HTMLVideoElement).currentTime)
      )
      .toBe(5)
    await setPopupToggle(popup, page, '在此站点运行', true)

    await restartExtensionWorker(harness)
    await popup.close()
    popup = await harness.openPopup(page)
    await expect(popup.getByTestId('phase-status')).toContainText('媒体控制已就绪')
    await expect(popup.getByText('配置修订 2')).toBeVisible()
    await expect(popup.getByText('速度', { exact: true }).locator('..')).toContainText('1.1×')
    await expect(popup.getByText('已静音')).toBeVisible()

    await clickPopupButton(popup, page, '撤销当前站点权限')
    await expect(popup.getByTestId('phase-status')).toContainText('需要先授予当前站点权限')
    expect(await grantedOrigins(popup)).toEqual([])
    expect(await registeredContentScriptIds(popup)).toEqual([])
    await page.reload()
    await expectRuntimeAbsent(page)
  } finally {
    await harness.close()
  }
})

test('runs across lifecycle fixtures with all-sites access and revokes it from Options', async ({
  baseURL
}) => {
  const harness = await launchExtensionHarness({ grantedOrigins: ['<all_urls>'] })
  try {
    const page = await harness.context.newPage()
    await page.goto(`${baseURL}/multi-player.html`)
    await expectRuntimeReady(page)
    let popup = await harness.openPopup(page)
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
    popup = await harness.openPopup(page)
    await expect(popup.getByTestId('phase-status')).toContainText('当前页面没有可控制媒体')
    await popup.close()
    await page.getByRole('button', { name: 'Add media' }).click()
    popup = await harness.openPopup(page)
    await expect(popup.getByTestId('active-media')).toContainText('视频')
    await popup.close()
    await page.getByRole('button', { name: 'Remove media' }).click()

    await page.goto(`${baseURL}/shadow-dom.html`)
    await expectRuntimeReady(page)
    popup = await harness.openPopup(page)
    await clickPopupButton(popup, page, '静音')
    await expect
      .poll(() =>
        page.locator('media-shell').evaluate((host) => {
          const media = host.shadowRoot?.querySelector('video')
          return media?.muted ?? false
        })
      )
      .toBe(true)
    await popup.close()

    await page.goto(`${baseURL}/hostile-page.html`)
    await expectRuntimeReady(page)
    await page.goto(`${baseURL}/strict-csp.html`)
    await expectRuntimeReady(page)
    await page.goto(`${baseURL}/iframe.html`)
    await expectRuntimeReady(page)
    for (const frame of page.frames().filter((candidate) => candidate !== page.mainFrame())) {
      await expect
        .poll(() => frame.locator('html').getAttribute('data-h5player-webext-media'))
        .toBe('ready')
    }

    const options = await harness.context.newPage()
    await options.goto(`chrome-extension://${harness.extensionId}/options.html#/sites`)
    await expect(options.getByRole('heading', { name: '站点规则' })).toBeVisible()
    await expect(options.getByText('<all_urls>')).toBeVisible()
    await options.getByRole('button', { name: '撤销所有站点权限' }).click()
    const dialog = options.getByRole('dialog')
    await expect(dialog).toBeVisible()
    await dialog.getByRole('button', { name: '撤销所有站点权限' }).click()
    await expect(options.getByText('尚未授予任何网页访问权限')).toBeVisible()
    expect(await grantedOrigins(options)).toEqual([])
    expect(await registeredContentScriptIds(options)).toEqual([])

    await page.reload()
    await expectRuntimeAbsent(page)
  } finally {
    await harness.close()
  }
})

test('configured media churn remains bounded across worker restarts', async ({ baseURL }) => {
  test.skip(configuredChurnDurationMs === 0, 'Nightly churn duration is not configured')
  test.setTimeout(configuredChurnDurationMs + 60_000)
  const harness = await launchExtensionHarness({
    grantedOrigins: [CURRENT_FIXTURE_PERMISSION]
  })

  try {
    const page = await harness.context.newPage()
    await page.goto(`${baseURL}/spa.html`)
    await expectRuntimeReady(page)
    const popup = await harness.openPopup(page)
    const cdp = await harness.context.newCDPSession(page)
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
        await restartExtensionWorker(harness)
        workerRestarts += 1
        expect((await getMediaStateFromPopup(popup, page)).media).toHaveLength(0)
      }
    }

    if (workerRestarts === 0) {
      await restartExtensionWorker(harness)
      workerRestarts += 1
      expect((await getMediaStateFromPopup(popup, page)).media).toHaveLength(0)
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
    await harness.close()
  }
})
