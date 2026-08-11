import { chromium, type BrowserContext, type CDPSession, type Page } from '@playwright/test'
import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

type ExtensionManifest = Readonly<Record<string, unknown>> & {
  optional_host_permissions?: readonly string[]
}

type TargetInfo = Readonly<{
  targetId: string
  type: string
  title: string
  url: string
  browserContextId?: string
  embedderData?: Readonly<{ tabActive?: boolean }>
}>

type ExtensionHarnessOptions = Readonly<{
  grantedOrigins?: readonly string[]
  denyPermissionRequests?: boolean
}>

export type ExtensionHarness = Readonly<{
  context: BrowserContext
  extensionId: string
  browserSession: CDPSession
  openPopup(targetPage: Page): Promise<Page>
  close(): Promise<void>
}>

const sourceExtensionPath = path.resolve('.output/chrome-mv3')

function launchArguments(extensionPath: string): readonly string[] {
  return [
    '--enable-unsafe-extension-debugging',
    '--deny-permission-prompts',
    `--disable-extensions-except=${extensionPath}`,
    `--load-extension=${extensionPath}`
  ]
}

async function waitForServiceWorker(context: BrowserContext) {
  return context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'))
}

async function seedGrantedOrigins(
  userDataDir: string,
  extensionPath: string,
  origins: readonly string[]
): Promise<void> {
  const manifestPath = path.join(extensionPath, 'manifest.json')
  const originalText = await readFile(manifestPath, 'utf8')
  const original = JSON.parse(originalText) as ExtensionManifest
  const seeded = {
    ...original,
    host_permissions: [...new Set(origins)]
  }
  await writeFile(manifestPath, JSON.stringify(seeded))

  let seedContext: BrowserContext | null = null
  try {
    seedContext = await chromium.launchPersistentContext(userDataDir, {
      channel: 'chromium',
      headless: true,
      args: [...launchArguments(extensionPath)]
    })
    const worker = await waitForServiceWorker(seedContext)
    const granted = await worker.evaluate(async () => {
      const api = (
        globalThis as unknown as {
          chrome: {
            permissions: {
              getAll(): Promise<{ origins?: string[]; permissions?: string[] }>
            }
          }
        }
      ).chrome
      return await api.permissions.getAll()
    })
    for (const origin of origins) {
      if (!granted.origins?.includes(origin)) {
        throw new Error(`Failed to seed extension host permission: ${origin}`)
      }
    }
  } finally {
    await seedContext?.close().catch(() => undefined)
    await writeFile(manifestPath, originalText)
  }
}

async function disableOptionalHostPermissions(extensionPath: string): Promise<void> {
  const manifestPath = path.join(extensionPath, 'manifest.json')
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8')) as ExtensionManifest
  await writeFile(
    manifestPath,
    JSON.stringify({
      ...manifest,
      optional_host_permissions: []
    })
  )
}

async function currentTargetIds(browserSession: CDPSession): Promise<ReadonlySet<string>> {
  const result = (await browserSession.send('Target.getTargets', {
    filter: [{ type: 'page' }]
  })) as { targetInfos: TargetInfo[] }
  return new Set(result.targetInfos.map((target) => target.targetId))
}

async function closeTriggeredPopup(
  browserSession: CDPSession,
  extensionId: string,
  previousTargetIds: ReadonlySet<string>
): Promise<void> {
  const popupUrl = `chrome-extension://${extensionId}/popup.html`
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const result = (await browserSession.send('Target.getTargets', {
      filter: [{ type: 'page' }]
    })) as { targetInfos: TargetInfo[] }
    const popupTarget = result.targetInfos.find(
      (target) => target.url === popupUrl && !previousTargetIds.has(target.targetId)
    )
    if (popupTarget) {
      await browserSession.send('Target.closeTarget', { targetId: popupTarget.targetId })
      return
    }
    await new Promise((resolve) => setTimeout(resolve, 25))
  }
}

async function tabTargetForPage(browserSession: CDPSession, page: Page): Promise<TargetInfo> {
  await page.bringToFront()
  const title = await page.title()
  const result = (await browserSession.send('Target.getTargets', {
    filter: [{ type: 'tab' }]
  })) as { targetInfos: TargetInfo[] }
  const matches = result.targetInfos.filter(
    (target) => target.url === page.url() && target.title === title
  )
  const active = matches.find((target) => target.embedderData?.tabActive)
  const target = active ?? matches[0]
  if (!target) throw new Error(`Unable to resolve Chromium tab target for ${page.url()}`)
  return target
}

export async function launchExtensionHarness(
  options: ExtensionHarnessOptions = {}
): Promise<ExtensionHarness> {
  const grantedOrigins = [...new Set(options.grantedOrigins ?? [])]
  const denyPermissionRequests = options.denyPermissionRequests ?? false
  let temporaryRoot: string | null = null
  let extensionPath = sourceExtensionPath
  let userDataDir = ''

  if (grantedOrigins.length > 0 || denyPermissionRequests) {
    temporaryRoot = await mkdtemp(path.join(os.tmpdir(), 'h5player-webext-e2e-'))
    extensionPath = path.join(temporaryRoot, 'extension')
    userDataDir = path.join(temporaryRoot, 'profile')
    await cp(sourceExtensionPath, extensionPath, { recursive: true })
    if (grantedOrigins.length > 0) {
      await seedGrantedOrigins(userDataDir, extensionPath, grantedOrigins)
    }
    if (denyPermissionRequests) await disableOptionalHostPermissions(extensionPath)
  }

  let context: BrowserContext | null = null
  try {
    context = await chromium.launchPersistentContext(userDataDir, {
      channel: 'chromium',
      headless: true,
      args: [...launchArguments(extensionPath)]
    })
    const activeContext = context
    const worker = await waitForServiceWorker(activeContext)
    const extensionId = new URL(worker.url()).host
    const browser = activeContext.browser()
    if (!browser) throw new Error('Chromium browser handle is unavailable')
    const browserSession = await browser.newBrowserCDPSession()

    if (grantedOrigins.length > 0) {
      const granted = await worker.evaluate(async () => {
        const api = (
          globalThis as unknown as {
            chrome: {
              permissions: {
                getAll(): Promise<{ origins?: string[]; permissions?: string[] }>
              }
            }
          }
        ).chrome
        return await api.permissions.getAll()
      })
      for (const origin of grantedOrigins) {
        if (!granted.origins?.includes(origin)) {
          throw new Error(`Seeded host permission did not survive manifest restore: ${origin}`)
        }
      }
    }

    return {
      context: activeContext,
      extensionId,
      browserSession,
      async openPopup(targetPage: Page): Promise<Page> {
        const target = await tabTargetForPage(browserSession, targetPage)
        const previousTargetIds = await currentTargetIds(browserSession)
        await browserSession.send('Extensions.triggerAction', {
          id: extensionId,
          targetId: target.targetId
        })
        await closeTriggeredPopup(browserSession, extensionId, previousTargetIds)

        const popup = await activeContext.newPage()
        await targetPage.bringToFront()
        await popup.goto(`chrome-extension://${extensionId}/popup.html`)
        await popup.getByRole('heading', { name: 'H5Player 控制台' }).waitFor()
        return popup
      },
      async close(): Promise<void> {
        await browserSession.detach().catch(() => undefined)
        await activeContext.close().catch(() => undefined)
        if (temporaryRoot) await rm(temporaryRoot, { recursive: true, force: true })
      }
    }
  } catch (error) {
    await context?.close().catch(() => undefined)
    if (temporaryRoot) await rm(temporaryRoot, { recursive: true, force: true })
    throw error
  }
}
