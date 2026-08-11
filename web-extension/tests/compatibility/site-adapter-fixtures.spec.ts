import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MediaAdapterRegistry } from '../../src/adapters/registry'
import { SITE_ADAPTER_DEFINITIONS } from '../../src/adapters/sites'
import type {
  MediaControllerContext,
  SiteAdapterDefinition,
  SiteAdapterSelectorMap
} from '../../src/domain/adapter'

const TIER_1_IDS = ['youtube', 'bilibili', 'tencent-video', 'iqiyi', 'youku']

function fixturePath(definition: SiteAdapterDefinition): string {
  return path.resolve('tests/fixtures/sites', definition.fixture)
}

function fixtureUrl(definition: SiteAdapterDefinition): string {
  const match = definition.matches[0]
  if (!match) throw new Error(`Missing fixture URL for ${definition.id}`)
  return `https://${match.hostname}${match.path ?? '/fixture'}`
}

function loadFixture(html: string): HTMLMediaElement {
  const parsed = new DOMParser().parseFromString(html, 'text/html')
  document.body.replaceChildren(
    ...[...parsed.body.childNodes].map((node) => document.importNode(node, true))
  )
  const media = document.querySelector('video, audio')
  if (!(media instanceof HTMLMediaElement)) throw new Error('Fixture has no media element')
  return media
}

function context(id: string): MediaControllerContext {
  return { mediaId: `fixture-${id}`, frameId: 0, now: () => 1 }
}

function firstPresent(selectors: readonly string[] | undefined): HTMLElement | null {
  if (!selectors) return null
  for (const selector of selectors) {
    const element = document.querySelector(selector)
    if (element instanceof HTMLElement) return element
  }
  return null
}

function declaredSelectorGroups(selectors: SiteAdapterSelectorMap): readonly (readonly string[])[] {
  return Object.values(selectors).filter((value): value is readonly string[] => value !== undefined)
}

afterEach(() => {
  document.body.replaceChildren()
  vi.restoreAllMocks()
})

describe('site adapter catalog', () => {
  it('has complete, unique, and current ownership metadata', () => {
    const ids = SITE_ADAPTER_DEFINITIONS.map((definition) => definition.id)
    expect(new Set(ids).size).toBe(ids.length)
    expect(ids.filter((id) => TIER_1_IDS.includes(id)).sort()).toEqual([...TIER_1_IDS].sort())
    expect(
      SITE_ADAPTER_DEFINITIONS.filter((definition) => definition.tier === 2).length
    ).toBeGreaterThanOrEqual(5)

    for (const rawDefinition of SITE_ADAPTER_DEFINITIONS) {
      const definition = rawDefinition as SiteAdapterDefinition
      expect(definition.owner.length).toBeGreaterThan(3)
      expect(definition.version).toMatch(/^\d+\.\d+\.\d+$/)
      expect(definition.lastVerified).toMatch(/^\d{4}-\d{2}-\d{2}$/)
      expect(definition.fixture).toBe(`${definition.id}.html`)
      expect(definition.matches.length).toBeGreaterThan(0)
      expect(definition.features.length).toBeGreaterThan(0)
      if (definition.features.includes('playback')) {
        expect(definition.selectors.play?.length).toBeGreaterThan(0)
        expect(definition.selectors.pause?.length).toBeGreaterThan(0)
      }
      if (definition.features.includes('fullscreen-native')) {
        expect(definition.selectors.fullscreenNative?.length).toBeGreaterThan(0)
      }
      if (definition.features.includes('fullscreen-web')) {
        expect(definition.selectors.fullscreenWeb?.length).toBeGreaterThan(0)
      }
    }
  })

  it.each(SITE_ADAPTER_DEFINITIONS)(
    '$id matches its sanitized fixture and executes declared selector actions',
    async (rawDefinition) => {
      const definition = rawDefinition as SiteAdapterDefinition
      const html = await readFile(fixturePath(definition), 'utf8')
      expect(html).not.toMatch(/(?:token|cookie|account|https?:\/\/)/i)
      const media = loadFixture(html)
      const registry = new MediaAdapterRegistry({
        definitions: SITE_ADAPTER_DEFINITIONS,
        url: () => fixtureUrl(definition)
      })
      const controller = registry.createController(media, context(definition.id))

      expect(controller.getSnapshot().adapterId).toBe(definition.id)
      expect(registry.getDiagnostics()).toContainEqual(
        expect.objectContaining({ id: definition.id, selected: true, status: 'selected' })
      )
      for (const selectors of declaredSelectorGroups(definition.selectors)) {
        expect(firstPresent(selectors)).not.toBeNull()
      }

      const play = firstPresent(definition.selectors.play)
      if (play) {
        const clicked = vi.fn()
        play.addEventListener('click', clicked)
        await controller.play()
        expect(clicked).toHaveBeenCalledOnce()
      }

      const pause = firstPresent(definition.selectors.pause)
      if (pause) {
        const clicked = vi.fn()
        pause.addEventListener('click', clicked)
        await controller.pause()
        expect(clicked).toHaveBeenCalledOnce()
      }

      const nativeFullscreen = firstPresent(definition.selectors.fullscreenNative)
      if (nativeFullscreen) {
        const clicked = vi.fn()
        nativeFullscreen.addEventListener('click', clicked)
        await controller.toggleFullscreen?.('native')
        expect(clicked).toHaveBeenCalledOnce()
      }

      const webFullscreen = firstPresent(definition.selectors.fullscreenWeb)
      if (webFullscreen) {
        const clicked = vi.fn()
        webFullscreen.addEventListener('click', clicked)
        await controller.toggleFullscreen?.('web')
        expect(clicked).toHaveBeenCalledOnce()
      }
      controller.teardown()
    }
  )

  it('retains the generic adapter for an unmatched host', () => {
    const media = loadFixture('<video width="640" height="360"></video>')
    const registry = new MediaAdapterRegistry({
      definitions: SITE_ADAPTER_DEFINITIONS,
      url: () => 'https://unmatched.invalid/video'
    })
    const controller = registry.createController(media, context('generic'))

    expect(controller.getSnapshot().adapterId).toBe('generic')
    expect(registry.getDiagnostics()).toEqual([])
    controller.teardown()
  })
})
