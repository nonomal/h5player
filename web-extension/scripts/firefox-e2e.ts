import assert from 'node:assert/strict'
import { access } from 'node:fs/promises'
import path from 'node:path'
import { firefox as playwrightFirefox } from '@playwright/test'
import firefox from 'selenium-webdriver/firefox.js'
import { createServer, type ViteDevServer } from 'vite'
import {
  mediaCommandResultResponseSchema,
  mediaPageStateSchema,
  type MediaPageState
} from '../src/application/media'
import type { MediaCommand } from '../src/domain/command'
import {
  createRuntimeRequest,
  parseRuntimeResponse,
  type RuntimeRequestEnvelope
} from '../src/shared/protocol'

const FIREFOX_EXTENSION_ID = 'h5player-webext@example.invalid'
const FIREFOX_EXTENSION_UUID = '3b94c06a-3d88-4b51-a8c0-0d3e3d4f8be1'
const FIXTURE_HOST = '127.0.0.1'
const FIXTURE_PORT = 47_173
const DEFAULT_TIMEOUT_MS = 15_000
const POPUP_BACKGROUND_INITIALIZATION_MS = 1_500

type ScriptResult = Readonly<{
  ok: boolean
  value?: unknown
  error?: string
}>

type TargetMediaState = Readonly<{
  currentTime: number
  muted: boolean
  paused: boolean
  playbackRate: number
  volume: number
}>

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds))
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function assertString(value: unknown, label: string): asserts value is string {
  assert.equal(typeof value, 'string', `${label} must be a string`)
}

function assertNumber(value: unknown, label: string): asserts value is number {
  assert.equal(typeof value, 'number', `${label} must be a number`)
}

function assertBoolean(value: unknown, label: string): asserts value is boolean {
  assert.equal(typeof value, 'boolean', `${label} must be a boolean`)
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function unwrapScriptResult(value: unknown, label: string): unknown {
  const result = asRecord(value)
  assert(result, `${label}: Firefox returned a non-object script result`)
  const detail = typeof result['error'] === 'string' ? result['error'] : 'unknown error'
  assert.equal(result['ok'], true, `${label}: ${detail}`)
  return result['value']
}

async function waitFor<T>(
  read: () => Promise<T>,
  predicate: (value: T) => boolean,
  label: string,
  timeoutMs = DEFAULT_TIMEOUT_MS
): Promise<T> {
  const deadline = Date.now() + timeoutMs
  let lastValue: T | undefined
  let lastError: unknown

  while (Date.now() < deadline) {
    try {
      const value = await read()
      lastValue = value
      if (predicate(value)) return value
    } catch (error) {
      lastError = error
    }
    await delay(100)
  }

  const detail =
    lastError === undefined
      ? JSON.stringify(lastValue)
      : `${JSON.stringify(lastValue)}; last error: ${errorMessage(lastError)}`
  throw new Error(`${label} timed out after ${timeoutMs} ms (${detail})`)
}

async function openTrustedBackgroundTab(driver: firefox.Driver, url: string): Promise<string> {
  const existingHandles = new Set(await driver.getAllWindowHandles())
  await driver.setContext(firefox.Context.CHROME)
  try {
    const opened = await driver.executeScript<boolean>(
      `const tab = window.gBrowser.addTab(arguments[0], {
        inBackground: true,
        triggeringPrincipal: Services.scriptSecurityManager.getSystemPrincipal()
      });
      return Boolean(tab);`,
      url
    )
    assert.equal(opened, true, `Firefox failed to open trusted background tab: ${url}`)
  } finally {
    await driver.setContext(firefox.Context.CONTENT)
  }

  const popupHandle = await waitFor(
    async () => {
      const handles = await driver.getAllWindowHandles()
      return handles.find((handle) => !existingHandles.has(handle)) ?? null
    },
    (handle): handle is string => handle !== null,
    'Firefox extension popup handle'
  )
  assertString(popupHandle, 'Firefox extension popup handle')
  return popupHandle
}

async function waitForRuntimeReady(driver: firefox.Driver): Promise<void> {
  await waitFor(
    async () =>
      driver.executeScript<unknown>(
        `return {
          background: document.documentElement.dataset.h5playerWebextBackground,
          bridge: document.documentElement.dataset.h5playerWebextBridge,
          content: document.documentElement.dataset.h5playerWebextContent,
          main: document.documentElement.dataset.h5playerWebextMain,
          media: document.documentElement.dataset.h5playerWebextMedia
        };`
      ),
    (value) => {
      const state = asRecord(value)
      return (
        state?.['background'] === 'ready' &&
        state['bridge'] === 'ready' &&
        state['content'] === 'ready' &&
        state['main'] === 'ready' &&
        state['media'] === 'ready'
      )
    },
    'Firefox page runtime readiness'
  )
}

async function popupText(driver: firefox.Driver, selector: string): Promise<string | null> {
  return driver.executeScript<string | null>(
    `return document.querySelector(arguments[0])?.textContent?.trim() ?? null;`,
    selector
  )
}

async function waitForPopupText(
  driver: firefox.Driver,
  selector: string,
  expected: string
): Promise<string> {
  const value = await waitFor(
    () => popupText(driver, selector),
    (value): value is string => value?.includes(expected) ?? false,
    `Firefox popup text ${selector} containing ${expected}`
  )
  assertString(value, `Firefox popup text ${selector}`)
  return value
}

async function getTargetTabId(driver: firefox.Driver): Promise<number> {
  const rawResult = await driver.executeAsyncScript<unknown>(function (
    done: (value: ScriptResult) => void
  ): void {
    type ExtensionTab = Readonly<{ id?: number }>
    type ExtensionBrowser = Readonly<{
      tabs: Readonly<{
        getCurrent(): Promise<ExtensionTab | undefined>
        query(query: Readonly<{ currentWindow: boolean }>): Promise<readonly ExtensionTab[]>
      }>
    }>
    const browserApi = (globalThis as unknown as { browser?: ExtensionBrowser }).browser
    if (!browserApi) {
      done({ ok: false, error: 'browser API is unavailable in Firefox popup' })
      return
    }
    void (async () => {
      const current = await browserApi.tabs.getCurrent()
      const tabs = await browserApi.tabs.query({ currentWindow: true })
      const target = tabs.find((tab) => tab.id !== undefined && tab.id !== current?.id)
      if (target?.id === undefined) throw new Error('target fixture tab was not found')
      done({ ok: true, value: target.id })
    })().catch((error: unknown) => done({ ok: false, error: String(error) }))
  })
  const targetTabId = unwrapScriptResult(rawResult, 'Resolve Firefox target tab')
  assertNumber(targetTabId, 'Firefox target tab ID')
  return targetTabId
}

async function sendPopupRequest(
  driver: firefox.Driver,
  targetTabId: number,
  request: RuntimeRequestEnvelope
): Promise<unknown> {
  const rawResult = await driver.executeAsyncScript<unknown>(
    function (tabId: number, message: unknown, done: (value: ScriptResult) => void): void {
      type ExtensionBrowser = Readonly<{
        runtime: Readonly<{ sendMessage(value: unknown): Promise<unknown> }>
        tabs: Readonly<{
          update(tabId: number, update: Readonly<{ active: boolean }>): Promise<unknown>
        }>
      }>
      const browserApi = (globalThis as unknown as { browser?: ExtensionBrowser }).browser
      if (!browserApi) {
        done({ ok: false, error: 'browser API is unavailable in Firefox popup' })
        return
      }
      void (async () => {
        await browserApi.tabs.update(tabId, { active: true })
        const response = await browserApi.runtime.sendMessage(message)
        done({ ok: true, value: response })
      })().catch((error: unknown) => done({ ok: false, error: String(error) }))
    },
    targetTabId,
    request
  )
  return unwrapScriptResult(rawResult, `Firefox popup request ${request.type}`)
}

async function getMediaState(driver: firefox.Driver, targetTabId: number): Promise<MediaPageState> {
  const request = createRuntimeRequest('popup', 'media.get-state', {})
  const response = parseRuntimeResponse(await sendPopupRequest(driver, targetTabId, request))
  assert(response, 'Firefox media state response did not match protocol schema')
  assert.equal(response.type, 'protocol.response')
  assert.equal(response.requestId, request.requestId)
  assert.equal(response.payload.requestType, request.type)
  return mediaPageStateSchema.parse(response.payload.data)
}

async function executeMediaCommand(
  driver: firefox.Driver,
  targetTabId: number,
  command: MediaCommand
): Promise<void> {
  const request = createRuntimeRequest('popup', 'media.execute', { command })
  const response = parseRuntimeResponse(await sendPopupRequest(driver, targetTabId, request))
  assert(response, `Firefox ${command.type} response did not match protocol schema`)
  assert.equal(response.type, 'protocol.response')
  assert.equal(response.requestId, request.requestId)
  assert.equal(response.payload.requestType, request.type)
  const result = mediaCommandResultResponseSchema.parse(response.payload.data)
  assert.equal(result.result.ok, true, `Firefox ${command.type} command failed`)
}

async function clickPopupButton(
  driver: firefox.Driver,
  targetTabId: number,
  label: string
): Promise<void> {
  const rawResult = await driver.executeAsyncScript<unknown>(
    function (tabId: number, buttonLabel: string, done: (value: ScriptResult) => void): void {
      type ExtensionBrowser = Readonly<{
        tabs: Readonly<{
          update(tabId: number, update: Readonly<{ active: boolean }>): Promise<unknown>
        }>
      }>
      const browserApi = (globalThis as unknown as { browser?: ExtensionBrowser }).browser
      if (!browserApi) {
        done({ ok: false, error: 'browser API is unavailable in Firefox popup' })
        return
      }
      void (async () => {
        await browserApi.tabs.update(tabId, { active: true })
        const button = Array.from(document.querySelectorAll('button')).find(
          (candidate) => candidate.textContent?.trim() === buttonLabel
        )
        if (!(button instanceof HTMLButtonElement)) {
          throw new Error(`popup button was not found: ${buttonLabel}`)
        }
        if (button.disabled) throw new Error(`popup button is disabled: ${buttonLabel}`)
        button.click()
        done({ ok: true })
      })().catch((error: unknown) => done({ ok: false, error: String(error) }))
    },
    targetTabId,
    label
  )
  unwrapScriptResult(rawResult, `Click Firefox popup button ${label}`)
}

async function readTargetMediaState(driver: firefox.Driver): Promise<TargetMediaState> {
  const raw = await driver.executeScript<unknown>(
    `const media = document.querySelector('video');
    if (!(media instanceof HTMLVideoElement)) return null;
    return {
      currentTime: media.currentTime,
      muted: media.muted,
      paused: media.paused,
      playbackRate: media.playbackRate,
      volume: media.volume
    };`
  )
  const state = asRecord(raw)
  assert(state, 'Firefox target video was not found')
  assertNumber(state['currentTime'], 'Firefox currentTime')
  assertNumber(state['playbackRate'], 'Firefox playbackRate')
  assertNumber(state['volume'], 'Firefox volume')
  const muted = state['muted']
  const paused = state['paused']
  assertBoolean(muted, 'Firefox muted')
  assertBoolean(paused, 'Firefox paused')
  return {
    currentTime: state['currentTime'],
    muted,
    paused,
    playbackRate: state['playbackRate'],
    volume: state['volume']
  }
}

async function startTargetPlayback(driver: firefox.Driver): Promise<void> {
  const rawResult = await driver.executeAsyncScript<unknown>(function (
    done: (value: ScriptResult) => void
  ): void {
    void (async () => {
      const media = document.querySelector('video')
      if (!(media instanceof HTMLVideoElement)) throw new Error('target video was not found')
      const canvas = document.createElement('canvas')
      canvas.width = 8
      canvas.height = 8
      const context = canvas.getContext('2d')
      if (!context) throw new Error('2D canvas context is unavailable')
      context.fillStyle = '#000'
      context.fillRect(0, 0, canvas.width, canvas.height)
      const stream = canvas.captureStream(1)
      ;(
        globalThis as unknown as {
          __h5playerFirefoxE2E?: Readonly<{ canvas: HTMLCanvasElement; stream: MediaStream }>
        }
      ).__h5playerFirefoxE2E = { canvas, stream }
      media.srcObject = stream
      await media.play()
      done({ ok: true })
    })().catch((error: unknown) => done({ ok: false, error: String(error) }))
  })
  unwrapScriptResult(rawResult, 'Start Firefox target playback')
}

async function closeServer(server: ViteDevServer | null): Promise<void> {
  if (server) await server.close()
}

const extensionRoot = process.cwd()
const extensionPath = path.resolve(extensionRoot, '.output/firefox-mv3')
const fixtureRoot = path.resolve(extensionRoot, 'tests/fixtures/pages')
const fixtureUrl = `http://${FIXTURE_HOST}:${FIXTURE_PORT}/basic.html`
const popupUrl = `moz-extension://${FIREFOX_EXTENSION_UUID}/popup.html`
const firefoxBinary = process.env['H5PLAYER_FIREFOX_BINARY'] ?? playwrightFirefox.executablePath()

await access(firefoxBinary)
await access(path.join(extensionPath, 'manifest.json'))

let server: ViteDevServer | null = null
let driver: firefox.Driver | null = null

try {
  server = await createServer({
    configFile: false,
    logLevel: 'error',
    root: fixtureRoot,
    server: {
      host: FIXTURE_HOST,
      port: FIXTURE_PORT,
      strictPort: true
    }
  })
  await server.listen()

  const options = new firefox.Options()
    .setBinary(firefoxBinary)
    .addArguments('-headless')
    .setPreference(
      'extensions.webextensions.uuids',
      JSON.stringify({ [FIREFOX_EXTENSION_ID]: FIREFOX_EXTENSION_UUID })
    )
    .setPreference('media.autoplay.default', 0)
    .setPreference('media.autoplay.blocking_policy', 0)
  const service = new firefox.ServiceBuilder().addArguments('--allow-system-access').build()
  const session = firefox.Driver.createSession(options, service)
  driver = session
  await session.manage().setTimeouts({ script: DEFAULT_TIMEOUT_MS, pageLoad: 30_000 })

  const installedId = await session.installAddon(extensionPath, true)
  assert.equal(installedId, FIREFOX_EXTENSION_ID)

  await session.get(fixtureUrl)
  const targetHandle = await session.getWindowHandle()
  await waitForRuntimeReady(session)

  const popupHandle = await openTrustedBackgroundTab(session, popupUrl)
  await delay(POPUP_BACKGROUND_INITIALIZATION_MS)
  await session.switchTo().window(popupHandle)
  await waitForPopupText(session, '[data-testid="phase-status"]', '平台内核已连接')
  await waitForPopupText(session, '[data-testid="active-media"]', '视频 · 已暂停')

  const targetTabId = await getTargetTabId(session)
  const initialState = await getMediaState(session, targetTabId)
  assert(initialState.activeMediaId, 'Firefox fixture did not expose an active media ID')
  assert.equal(initialState.media.length, 1)

  await clickPopupButton(session, targetTabId, '前进 10 秒')
  await session.switchTo().window(targetHandle)
  await waitFor(
    () => readTargetMediaState(session),
    (state) => state.currentTime === 10,
    'Firefox seek forward command'
  )

  await session.switchTo().window(popupHandle)
  await clickPopupButton(session, targetTabId, '后退 10 秒')
  await session.switchTo().window(targetHandle)
  await waitFor(
    () => readTargetMediaState(session),
    (state) => state.currentTime === 0,
    'Firefox seek backward command'
  )

  await session.switchTo().window(popupHandle)
  await clickPopupButton(session, targetTabId, '加速')
  await session.switchTo().window(targetHandle)
  await waitFor(
    () => readTargetMediaState(session),
    (state) => state.playbackRate === 1.1,
    'Firefox playback-rate command'
  )

  await session.switchTo().window(popupHandle)
  await clickPopupButton(session, targetTabId, '降低音量')
  await session.switchTo().window(targetHandle)
  await waitFor(
    () => readTargetMediaState(session),
    (state) => state.volume === 0.95,
    'Firefox volume command'
  )

  await session.switchTo().window(popupHandle)
  await clickPopupButton(session, targetTabId, '静音')
  await session.switchTo().window(targetHandle)
  await waitFor(
    () => readTargetMediaState(session),
    (state) => state.muted,
    'Firefox mute command'
  )

  await session.switchTo().window(popupHandle)
  await clickPopupButton(session, targetTabId, '降低音量')
  await session.switchTo().window(targetHandle)
  await waitFor(
    () => readTargetMediaState(session),
    (state) => state.volume === 0.9 && !state.muted,
    'Firefox volume command unmute semantics'
  )

  await startTargetPlayback(session)
  await waitFor(
    () => readTargetMediaState(session),
    (state) => !state.paused,
    'Firefox fixture playback start'
  )

  await session.switchTo().window(popupHandle)
  await executeMediaCommand(session, targetTabId, {
    type: 'media.pause',
    mediaId: initialState.activeMediaId
  })
  await session.switchTo().window(targetHandle)
  await waitFor(
    () => readTargetMediaState(session),
    (state) => state.paused,
    'Firefox pause command'
  )

  await session.switchTo().window(popupHandle)
  await executeMediaCommand(session, targetTabId, {
    type: 'media.play',
    mediaId: initialState.activeMediaId
  })
  await session.switchTo().window(targetHandle)
  const finalMedia = await waitFor(
    () => readTargetMediaState(session),
    (state) => !state.paused,
    'Firefox play command'
  )

  const capabilities = await session.getCapabilities()
  console.log(
    JSON.stringify({
      event: 'FIREFOX_EXTENSION_E2E_RESULT',
      browserVersion: capabilities.getBrowserVersion(),
      extensionId: installedId,
      commands: ['seek', 'rate', 'volume', 'mute', 'pause', 'play'],
      finalMedia
    })
  )
} finally {
  if (driver) await driver.quit().catch(() => undefined)
  await closeServer(server)
}
